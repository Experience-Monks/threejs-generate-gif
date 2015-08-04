var OMGGIF = require('omggif');
var clamp = require('clamp');
var clusterfck = require("clusterfck");

var defaults = require('lodash.defaults');

var PostProcessor = require('./PostProcessor');

var paletteMethods = {
    KMEANS: 0,
    VOTES: 1
};
function GIFGenerator(renderer, opts, initCallback, onCompleteCallback) {
    
    opts = opts || {};

    defaults(opts, { 
        useGPU: true,
        recalculatePalettePerFrame: false,
        dither: true,
        ditherStrength: 8,
        superSample: true,
        denominator: 8,
        frames: 100,
        delay: 5,
        size: {width: 300, height: 200},
        paletteMethod: paletteMethods.KMEANS
    });

    defaults(this, opts);
   
    this.renderer = renderer;
    this.generating = false;

    this.renderSize = this.superSample ? {width: this.size.width * 2, height: this.size.height * 2} : this.size;

    this.arraySize = (this.superSample && !this.useGPU) ? this.renderSize : this.size;

    var renderTarget = new THREE.WebGLRenderTarget(this.renderSize.width, this.renderSize.height);
    renderTarget.flipY = true;
    renderTarget.generateMipMaps = false;
    renderTarget.minFilter = THREE.NearestFilter;
    renderTarget.magFilter = THREE.NearestFilter;

    this.renderTarget = renderTarget;

    var _this = this;

    this.tonemap = THREE.ImageUtils.loadTexture( "assets/tonemaps/original.png", THREE.UVMapping, 
    function() {
        _this.postProcessor = new PostProcessor(renderer, _this.renderTarget, _this.size);
        
        initCallback();
    });

    this.onCompleteCallback = onCompleteCallback;

    this.quantizedLevels = 256 / this.denominator;

    switch(this.paletteMethod) {
        case paletteMethods.KMEANS:
            this.buildPalette = this.buildPaletteKMeans;        
            break;
        case paletteMethods.VOTES:
            this.buildPalette = this.buildPaletteVotes;
            break;
        default:
            throw new Error('Unknown Palette method.');
    }

    this.generating = true;

    var buffer = new Uint8Array(this.size.width * this.size.height * this.frames * 5);
    var gif = new OMGGIF.GifWriter(buffer, this.size.width, this.size.height, {
        loop: 0
    });

    var pixels = new Uint8Array(this.size.width * this.size.height);

    var context3d = this.renderer.getContext();
    var imageDataArraySource = new Uint8Array(this.arraySize.width * this.arraySize.height * 4);
    var imageDataArrayDest = new Uint8Array(this.size.width * this.size.height * 4);

    this.context3d = context3d;
    this.imageDataArraySource = imageDataArraySource;
    this.imageDataArrayDest = imageDataArrayDest;

    this.buffer = buffer;
    this.pixels = pixels;

    this.gif = gif;
}

GIFGenerator.prototype.getImageData = function(image) {
    var canvas = document.createElement( 'canvas' );
    canvas.width = image.width;
    canvas.height = image.height;

    var context = canvas.getContext( '2d' );
    context.drawImage( image, 0, 0 );
    return context.getImageData( 0, 0, image.width, image.height );
};

GIFGenerator.paletteMethods = paletteMethods;

GIFGenerator.prototype.buildPaletteVotes = function(data) {

    var skip = Math.ceil((data.length / 4) / 10000);
    var step = 4 * skip;

    var superPalette = [];
    var indexPalette = [];

    for (var j = 0, jl = data.length; j < jl; j += step) {
        
        var r = Math.floor(data[j + 0] / this.denominator) * this.denominator;
        var g = Math.floor(data[j + 1] / this.denominator) * this.denominator;
        var b = Math.floor(data[j + 2] / this.denominator) * this.denominator;
        var color = r << 16 | g << 8 | b << 0;

        var index = indexPalette.indexOf(color);

       if (index === -1) {
            superPalette.push([color, 1, r, g, b]);
            indexPalette.push(color);
        }
        else {
            superPalette[index][1]++;
        }
    }

    superPalette.sort(function(a, b) {
        return b[1] - a[1];
    });

    var palette = superPalette.slice(0, 256);

    return palette;
};

GIFGenerator.prototype.buildGlobalPaletteToneMap = function(palette) {   

    function findClosestIndex(r, g, b) {
        var distance = Infinity;
        var closestIndex = -1;

        var tempDistance;
        for (var i = 0; i < palette.length; i++) {
            tempDistance = Math.abs(r - palette[i][2]) + Math.abs(g - palette[i][3]) + Math.abs(b - palette[i][4]);
            if (tempDistance < distance) {
                distance = tempDistance;
                closestIndex = i;
            }
        }
        return closestIndex;
    }

    var globalPaletteToneMap = new Uint8Array(Math.pow(this.quantizedLevels, 3));

    var cursor = 0; 
    for (var ir = 0; ir < 256; ir += this.denominator) {
        for (var ig = 0; ig < 256; ig += this.denominator) {
            for (var ib = 0; ib < 256; ib += this.denominator) {
                
                globalPaletteToneMap[cursor++] = findClosestIndex(ir, ig, ib);
            }
        }
    }

    var tonemapPixels = this.getImageData(this.tonemap.image);

    cursor = 0;
    for (var i = 0, l = tonemapPixels.data.length; i < l; i += 4) {
        var data = tonemapPixels.data;

        var r = data[i];
        var g = data[i + 1];
        var b = data[i + 2];

        data[i] = findClosestIndex(r, g, b);
        data[i + 1] = findClosestIndex(r, g, b);
        data[i + 2] = findClosestIndex(r, g, b);
    }

    var newTonemap = new THREE.DataTexture(new Uint8Array(tonemapPixels.data), tonemapPixels.width, tonemapPixels.height, THREE.RGBAFormat );
    newTonemap.needsUpdate = true;
        
    this.postProcessor.setTonemap(newTonemap);

    return globalPaletteToneMap;
};

GIFGenerator.prototype.buildPaletteKMeans = function(data) {
    
    var skip = Math.ceil((data.length / 4) / 10000);
    var step = 4 * skip;

    var superPalette = [];

    for (var j = 0, jl = data.length; j < jl; j += step) {
        
        var r = Math.floor(data[j + 0] / this.denominator) * this.denominator;
        var g = Math.floor(data[j + 1] / this.denominator) * this.denominator;
        var b = Math.floor(data[j + 2] / this.denominator) * this.denominator;
        
        superPalette.push([r, g, b]);
    }

    var distances = {
      euclidean: function(v1, v2) {
          var total = 0;
          for (var i = 0; i < v1.length; i++) {
             total += Math.pow(v2[i] - v1[i], 2);      
          }
          return Math.sqrt(total);
       },
       manhattan: function(v1, v2) {
         var total = 0;
         for (var i = 0; i < v1.length; i++) {
            total += Math.abs(v2[i] - v1[i]);      
         }
         return total;
       },
       max: function(v1, v2) {
         var max = 0;
         for (var i = 0; i < v1.length; i++) {
            max = Math.max(max, Math.abs(v2[i] - v1[i]));      
         }
         return max;
       }
    };
    var distance = distances.euclidean;

    var kmeans = new clusterfck.Kmeans();
    kmeans.cluster(superPalette, 256, distance);

    return kmeans.centroids.map(function(rgb) { 

        rgb = [~~rgb[0], ~~rgb[1], ~~rgb[2]];
        
        var color = rgb[0] << 16 | rgb[1] << 8 | rgb[2];
        return [color, 1, rgb[0], rgb[1], rgb[2]];
    });
};

GIFGenerator.prototype.finish = function() {

        // return buffer.slice( 0, gif.end() );
        var string = '';

        for (var i = 0, l = this.gif.end(); i < l; i++) {
            string += String.fromCharCode(this.buffer[i]);
        }
        this.onCompleteCallback('data:image/gif;base64,' + btoa(string));

        this.generating = false;
};

GIFGenerator.prototype.rgb2index = function(r, g, b) {
    r = Math.floor(r / this.denominator);
    g = Math.floor(g / this.denominator);
    b = Math.floor(b / this.denominator);

    return r * this.quantizedLevels * this.quantizedLevels + g * this.quantizedLevels + b;
};

GIFGenerator.prototype.getSrcIndex = function(destIndex, offsetX, offsetY) {
    var destPixelIndex = ~~(destIndex / 4);
    var destX = destPixelIndex % this.destWidth;
    var destY = ~~(destPixelIndex / this.destWidth);

    var srcX = destX * 2 + offsetX;
    var srcY = destY * 2 + offsetY;
    var srcPixelIndex = srcY * this.srcWidth + srcX;

    var srcIndex = srcPixelIndex * 4 + (destIndex % 4);
    return srcIndex;
};

GIFGenerator.prototype.addFrame = function(recalculatePalette) {

    if (this.useGPU) {
        this.postProcessor.update();    
    }    

    this.renderer.setRenderTarget(this.useGPU ? this.postProcessor.renderTarget : this.renderTarget);
    this.context3d.readPixels(0, 0, this.arraySize.width, this.arraySize.height, this.context3d.RGBA, this.context3d.UNSIGNED_BYTE, this.imageDataArraySource);

    var data;

    if (this.superSample && !this.useGPU) {
        this.srcWidth = this.renderSize.width;
        this.destWidth = this.size.width;           

        for (var i = 0, l = this.imageDataArrayDest.length; i < l; i++) {
            this.imageDataArrayDest[i] = ~~((this.imageDataArraySource[this.getSrcIndex(i, 0, 0)] +
            this.imageDataArraySource[this.getSrcIndex(i, 1, 0)] +
            this.imageDataArraySource[this.getSrcIndex(i, 0, 1)] +
            this.imageDataArraySource[this.getSrcIndex(i, 1, 1)]) / 4);
        }
        data = this.imageDataArrayDest;
    } else {
        data = this.imageDataArraySource;
    }

    if (!this.globalPaletteToneMap || this.recalculatePalettePerFrame || recalculatePalette) {
        this.palette = this.buildPalette(data);
        this.globalPaletteToneMap = this.buildGlobalPaletteToneMap(this.palette);
    } 

    var width = this.size.width;

    for (var i = 0, k = 0, l = data.length; i < l; i += 4, k++) {
        var index = ~~(k + k / width);

        var r, g, b;

        if (this.dither) {
            r = Math.floor(clamp(data[i + 0] + this.ditherStrength * ((index % 2) - 1), 0, 255) / this.denominator) * this.denominator;
            g = Math.floor(clamp(data[i + 1] + this.ditherStrength * (((index + 1) % 2) - 1), 0, 255) / this.denominator) * this.denominator;
            b = Math.floor(clamp(data[i + 2] + this.ditherStrength * (((index + 2) % 2) - 1), 0, 255) / this.denominator) * this.denominator;
        } else {
            r = Math.floor(data[i + 0] / this.denominator) * this.denominator;
            g = Math.floor(data[i + 1] / this.denominator) * this.denominator;
            b = Math.floor(data[i + 2] / this.denominator) * this.denominator;
        }
        this.pixels[k] = this.globalPaletteToneMap[this.rgb2index(r, g, b)];
    }

    var powof2 = 1;
    while (powof2 < this.palette.length) {
        powof2 <<= 1;
    }
    this.palette.length = powof2;

    this.gif.addFrame(0, 0, this.size.width, this.size.height, this.pixels, {
        palette: new Uint32Array(this.palette.map(function(element) { 
            return element ? element[0] : 0;
        })),
        delay: this.delay
    });
};

module.exports = GIFGenerator;
