var OMGGIF = require('omggif');
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
        frames: 50,
        size: {width: 300, height: 300},
        paletteMethod: paletteMethods.KMEANS,
        superSample: true,
        dither: true,
        denominator: 8,
        delay: 5
    });

    defaults(this, opts);
   
    this.renderer = renderer;

    this.globalPaletteToneMapBuilt = false;
    this.renderSize = { width: this.size.width * 2, height: this.size.height * 2 };

    var renderTarget = new THREE.WebGLRenderTarget(this.renderSize.width, this.renderSize.height);
    renderTarget.flipY = true;
    renderTarget.generateMipMaps = false;
    renderTarget.minFilter = THREE.NearestFilter;
    renderTarget.magFilter = THREE.NearestFilter;

    this.renderTarget = renderTarget;

    var _this = this;

    this.tonemap = THREE.ImageUtils.loadTexture( "assets/tonemaps/original.png", THREE.UVMapping, 
    function() {
        _this.postProcessor = new PostProcessor(renderer, _this.renderTarget, _this.size, undefined, opts);
        
        initCallback();
    });

    this.onCompleteCallback = onCompleteCallback;

    switch(this.paletteMethod) {
        case paletteMethods.KMEANS:
            this.buildPaletteInternal = this.buildPaletteKMeans;        
            break;
        case paletteMethods.VOTES:
            this.buildPaletteInternal = this.buildPaletteVotes;
            break;
        default:
            throw new Error('Unknown Palette method.');
    }

    var buffer = new Uint8Array(this.size.width * this.size.height * this.frames * 5);
    var gif = new OMGGIF.GifWriter(buffer, this.size.width, this.size.height, {
        loop: 0
    });

    var pixels = new Uint8Array(this.size.width * this.size.height);

    var context3d = this.renderer.getContext();
    var imageDataArraySource = new Uint8Array(this.size.width * this.size.height * 4);

    this.context3d = context3d;
    this.imageDataArraySource = imageDataArraySource;

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

GIFGenerator.prototype.buildPalette = function(data) {

    if (!data) {
        this.postProcessor.update();    

        this.renderer.setRenderTarget(this.postProcessor.renderTarget);
        this.context3d.readPixels(0, 0, this.size.width, this.size.height, this.context3d.RGBA, this.context3d.UNSIGNED_BYTE, this.imageDataArraySource);

        data = this.imageDataArraySource;
    }    
    this.palette = this.buildPaletteInternal(data);
    this.buildGlobalPaletteToneMap(this.palette);
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

    var tonemapPixels = this.getImageData(this.tonemap.image);

    cursor = 0;
    var data = tonemapPixels.data;
    for (var i = 0, l = data.length; i < l; i += 4) {
        
        var r = data[i];
        var g = data[i + 1];
        var b = data[i + 2];

        var index = findClosestIndex(r, g, b);
        data[i] = data[i + 1] = data[i + 2] = index;
    }

    var newTonemap = new THREE.DataTexture(new Uint8Array(tonemapPixels.data), tonemapPixels.width, tonemapPixels.height, THREE.RGBAFormat );

    newTonemap.minFilter = THREE.NearestFilter;
    newTonemap.magFilter = THREE.NearestFilter;
    newTonemap.generateMipMaps = false;
    newTonemap.flipY = true;

    newTonemap.needsUpdate = true;
    this.renderer.setTexture(newTonemap, 0);
        
    this.postProcessor.setTonemap(newTonemap);

    this.globalPaletteToneMapBuilt = true;
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
};

GIFGenerator.prototype.addFrame = function() {

    this.postProcessor.update();    

    this.renderer.setRenderTarget(this.postProcessor.renderTarget);
    this.context3d.readPixels(0, 0, this.size.width, this.size.height, this.context3d.RGBA, this.context3d.UNSIGNED_BYTE, this.imageDataArraySource);

    var data = this.imageDataArraySource;

    for (var i = 0, k = 0, l = data.length; i < l; i += 4, k++) {
        this.pixels[k] = data[i];
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
