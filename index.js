var OMGGIF = require('omggif');

var KMeans = require('cluster-kmeans');
var defaults = require('lodash.defaults');

var PostProcessor = require('./PostProcessor');
var NeuQuant = require('./TypedNeuQuant');

var base64 = require('base-64');

var TonemapGeneratorHelper = require('threejs-generate-tonemap');

var paletteMethods = {
    KMEANS: 0,
    VOTES: 1,
    NEUQUANT: 2
};

var __debugLevel = 2;

var lastTime;
function __markTime(label) {
    if(__debugLevel == 0) return;
    var time = (new Date()).getTime() * 0.001;
    if(lastTime !== undefined) console.log('DURATION: ' + (time - lastTime) + 's');
    console.log('MARK: ' + label);
    lastTime = time;
}

// Adapted from base-64 npm module to use less memory
function btoa2(input) {
    var TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    input = String(input);
    if (/[^\0-\xFF]/.test(input)) {
        // Note: no need to special-case astral symbols here, as surrogates are
        // matched, and the input is supposed to only contain ASCII anyway.
        error(
            'The string to be encoded contains characters outside of the ' +
            'Latin1 range.'
        );
    }
    var padding = input.length % 3;
    var output = '';
    var position = -1;
    var a, b, c;
    var buffer;
    // Make sure any padding is handled outside of the loop.
    var length = input.length - padding;
    var outputBuffer = new Uint8Array(input.length * 1.5);

    var k = 0;

    while (++position < length) {
        // Read three bytes, i.e. 24 bits.
        a = input.charCodeAt(position) << 16;
        b = input.charCodeAt(++position) << 8;
        c = input.charCodeAt(++position);
        buffer = a + b + c;
        // Turn the 24 bits into four chunks of 6 bits each, and append the
        // matching character for each of them to the output.
        outputBuffer[k++] = TABLE.charAt(buffer >> 18 & 0x3F).charCodeAt(0);
        outputBuffer[k++] = TABLE.charAt(buffer >> 12 & 0x3F).charCodeAt(0);
        outputBuffer[k++] = TABLE.charAt(buffer >> 6 & 0x3F).charCodeAt(0);
        outputBuffer[k++] = TABLE.charAt(buffer & 0x3F).charCodeAt(0);
    }

    if (padding == 2) {
        a = input.charCodeAt(position) << 8;
        b = input.charCodeAt(++position);
        buffer = a + b;

        outputBuffer[k++] = TABLE.charAt(buffer >> 10).charCodeAt(0);
        outputBuffer[k++] = TABLE.charAt((buffer >> 4) & 0x3F).charCodeAt(0);
        outputBuffer[k++] = TABLE.charAt((buffer << 2) & 0x3F).charCodeAt(0);
        outputBuffer[k++] = '='.charCodeAt(0);
    } else if (padding == 1) {
        buffer = input.charCodeAt(position);

        outputBuffer[k++] = TABLE.charAt(buffer >> 2).charCodeAt(0);
        outputBuffer[k++] = TABLE.charAt((buffer << 4) & 0x3F).charCodeAt(0);
        outputBuffer[k++] = '='.charCodeAt(0);
        outputBuffer[k++] = '='.charCodeAt(0);
    }

    var CHUNK_SZ = 0x10000;
    var string = [];
    for (var i = 0, l = outputBuffer.length; i < l; i+=CHUNK_SZ) {
        string.push(String.fromCharCode.apply(null, outputBuffer.subarray(i, i+CHUNK_SZ)));
    }
    output = string.join('');
    return output;
}

function GIFGenerator(renderer, opts, initCallback, onCompleteCallback) {
    
    opts = opts || {};

    defaults(opts, { 
        frames: 50,
        size: {width: 300, height: 300},
        paletteMethod: paletteMethods.KMEANS,
        superSample: true,
        dither: true,
        denominator: 8,
        delay: 5,
        mobile: false,
        lutImagePath: 'assets/tonemaps/original.png'
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

    this.tonemap = THREE.ImageUtils.loadTexture( this.lutImagePath, THREE.UVMapping, 
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
        case paletteMethods.NEUQUANT:
            this.buildPaletteInternal = this.buildPaletteNeuQuant;
            break;
        default:
            throw new Error('Unknown Palette method.');
    }

    var buffer = new Uint8Array(this.size.width * this.size.height * this.frames);
    var gif = new OMGGIF.GifWriter(buffer, this.size.width, this.size.height, {
        loop: 0
    });

    var context3d = this.renderer.getContext();
    var imageDataArraySource = new Uint8Array(this.size.width * this.size.height * 4);

    this.context3d = context3d;
    this.imageDataArraySource = imageDataArraySource;

    this.buffer = buffer;

    this.gif = gif;
}

GIFGenerator.prototype.getImageData = function(image) {
    var canvas = document.createElement( 'canvas' );
    canvas.width = image.width;
    canvas.height = image.height;

    var context = canvas.getContext( '2d' );

    context.translate(0, canvas.height)
    context.scale(1, -1);

    context.drawImage( image, 0, 0 );
    return context.getImageData( 0, 0, image.width, image.height );
};

GIFGenerator.paletteMethods = paletteMethods;

GIFGenerator.prototype.buildPaletteNeuQuant = function(data) {
    
    var skip = Math.ceil((data.length / 4) / 10000);
    var step = 4 * skip;

    var superPalette = [];

    var denominator = this.denominator;

    for (var j = 0, jl = data.length; j < jl; j += step) {
        
        var r = Math.floor(data[j + 0] / denominator) * denominator;
        var g = Math.floor(data[j + 1] / denominator) * denominator;
        var b = Math.floor(data[j + 2] / denominator) * denominator;
        
        superPalette.push(r);
        superPalette.push(g);
        superPalette.push(b);
    }

    var imgq = new NeuQuant(superPalette, 1);
    imgq.buildColormap(); // create reduced palette
    var palette = imgq.getColormap();

    var finalPalette = [];

    for (var i = 0, l = palette.length; i < l; i += 3) {
        var r = palette[i];
        var g = palette[i+1];
        var b = palette[i+2];

        var color = r << 16 | g << 8 | b;
        finalPalette.push([color, 1, r, g, b]);
    }
    return finalPalette;
};

GIFGenerator.prototype.buildPaletteVotes = function(data) {

    var skip = Math.ceil((data.length / 4) / 10000);
    var step = 4 * skip;

    var superPalette = [];
    var indexPalette = [];

    var denominator = this.denominator;

    for (var j = 0, jl = data.length; j < jl; j += step) {
        
        var r = Math.floor(data[j + 0] / denominator) * denominator;
        var g = Math.floor(data[j + 1] / denominator) * denominator;
        var b = Math.floor(data[j + 2] / denominator) * denominator;
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
        this.postProcessor.update(true);    

        this.renderer.setRenderTarget(this.postProcessor.renderTarget);
        this.context3d.readPixels(0, 0, this.size.width, this.size.height, this.context3d.RGBA, this.context3d.UNSIGNED_BYTE, this.imageDataArraySource);

        data = this.imageDataArraySource;
    }
    __markTime('build pallete via clustering');
    this.palette = this.buildPaletteInternal(data);
    __markTime('build tonemap image');
    this.buildGlobalPaletteToneMap(this.palette);
    __markTime('tonemap image complete');

    var powof2 = 1;
    while (powof2 < this.palette.length) {
        powof2 <<= 1;
    }
    this.palette.length = powof2;

    this.palette32 = new Uint32Array(this.palette.map(function(element) { 
        return element ? element[0] : 0;
    }));
};

GIFGenerator.prototype.buildGlobalPaletteToneMap = function(palette) {   

    // function findClosestIndex(r, g, b) {

    //     var color0 = palette[0];

    //     var closestIndex = 0;
    //     var distance = Math.pow(r - color0[2], 2) + Math.pow(g - color0[3], 2) + Math.pow(b - color0[4], 2);

    //     for (var i = 1, len = palette.length; i < len; i++) {
    //         var color = palette[i];
    //         var tempDistance = Math.pow(r - color[2], 2) + Math.pow(g - color[3], 2) + Math.pow(b - color[4], 2);

    //         if (tempDistance < distance) {
    //             distance = tempDistance;
    //             closestIndex = i;
    //         }
    //     }
    //     return closestIndex;
    // }
    __markTime('get tonemap default data.');
    // var tonemapPixels = this.getImageData(this.tonemap.image);
    __markTime('start building tonemap');

    // cursor = 0;
    // var data = tonemapPixels.data;
    // for (var i = 0, l = data.length; i < l; i += 4) {
        
    //     var r = data[i];
    //     var g = data[i + 1];
    //     var b = data[i + 2];

    //     var index = findClosestIndex(r, g, b);
    //     data[i] = data[i + 1] = data[i + 2] = index;
    // }

    // var newTonemap = new THREE.DataTexture(new Uint8Array(tonemapPixels.data), tonemapPixels.width, tonemapPixels.height, THREE.RGBAFormat );
    // newTonemap.minFilter = THREE.NearestFilter;
    // newTonemap.magFilter = THREE.NearestFilter;
    // newTonemap.generateMipMaps = false;
    // newTonemap.flipY = false;
    // newTonemap.needsUpdate = true;

    var tonemapGeneratorHelper = new TonemapGeneratorHelper(this.renderer, this.tonemap, palette);
    var newTonemap = this.mobile ? tonemapGeneratorHelper.finalRenderTarget : tonemapGeneratorHelper.finalRenderTargetFlipped;
    newTonemap.minFilter = THREE.NearestFilter;
    newTonemap.magFilter = THREE.NearestFilter;
    newTonemap.generateMipMaps = false;
    newTonemap.flipY = false;
    this.tonemapGeneratorHelper = tonemapGeneratorHelper;

    if (this.tonemap) {
        this.tonemap.dispose();
        delete this.tonemap;
    }
    __markTime('use tonemap');

    this.postProcessor.setTonemap(newTonemap);
    this.globalPaletteToneMapBuilt = true;
};

GIFGenerator.prototype.buildPaletteKMeans = function(data) {
    
    var skip = Math.ceil((data.length / 4) / 10000);
    var step = 4 * skip;

    var superPalette = [];

    var denominator = this.denominator;

    for (var j = 0, jl = data.length; j < jl; j += step) {
        
        var r = Math.floor(data[j + 0] / denominator) * denominator;
        var g = Math.floor(data[j + 1] / denominator) * denominator;
        var b = Math.floor(data[j + 2] / denominator) * denominator;
        
        superPalette.push([r, g, b]);
    }

    var kmeans = new KMeans();
    kmeans.cluster(superPalette, 256);

    return kmeans.centroids.map(function(rgb) { 

        rgb = [~~rgb[0], ~~rgb[1], ~~rgb[2]];
        
        var color = rgb[0] << 16 | rgb[1] << 8 | rgb[2];
        return [color, 1, rgb[0], rgb[1], rgb[2]];
    });
};

GIFGenerator.prototype.finish = function() {

        this.renderTarget.dispose();
        delete this.renderTarget;

        this.postProcessor.dispose();
        delete this.postProcessor;

        if (this.tonemapGeneratorHelper) {
            this.tonemapGeneratorHelper.dispose();
            delete this.tonemapGeneratorHelper;           
        }
        
        delete this.pixels;
        delete this.imageDataArraySource;
        delete this.palette;
        delete this.palette32;

        var length = this.gif.end();
        this.buffer = this.buffer.subarray(0, length);

        var CHUNK_SZ = 0x10000;
        var string = [];
        for (var i = 0, l = length; i < l; i+=CHUNK_SZ) {
            string.push(String.fromCharCode.apply(null, this.buffer.subarray(i, i+CHUNK_SZ)));
        }
        string = string.join('');
     
        delete this.buffer;
        delete this.gif;

        this.onCompleteCallback('data:image/gif;base64,' + btoa2(string));
};

GIFGenerator.prototype.addFrame = function(delay) {

    delay = delay || this.delay;

    this.postProcessor.update();    

    this.renderer.setRenderTarget(this.postProcessor.renderTarget);
    this.context3d.readPixels(0, 0, this.size.width, this.size.height, this.context3d.RGBA, this.context3d.UNSIGNED_BYTE, this.imageDataArraySource);

    if (!this.pixels) {
        this.pixels = new Uint8Array(this.size.width * this.size.height);
    }
    for (var i = 0, k = 0, l = this.imageDataArraySource.length; i < l; i += 4, k++) {
        this.pixels[k] = this.imageDataArraySource[i];
    }
    
    this.gif.addFrame(0, 0, this.size.width, this.size.height, this.pixels, {
        palette: this.palette32,
        delay: delay
    });
};

module.exports = GIFGenerator;
