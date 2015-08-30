var OMGGIF = require('omggif');

var KMeans = require('cluster-kmeans');
var createKDTree = require("static-kdtree");
var defaults = require('lodash.defaults');

var PostProcessor = require('./PostProcessor');

var paletteMethods = {
    KMEANS: 0,
    VOTES: 1
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
            var arr = [r, g, b];
            // arr.color = color;
            arr.votes++;
            superPalette.push(arr);
            indexPalette.push(color);
        }
        else {
            superPalette[index].votes++;
        }
    }

    superPalette.sort(function(a, b) {
        return b.votes - a.votes;
    });

    var palette = superPalette.slice(0, 256);

    palette.forEach(function(paletteColor) {
        delete paletteColor.votes;
    })

    return palette;
};

GIFGenerator.prototype.buildPalette = function(data) {

    if (!data) {
        this.postProcessor.update();    

        this.renderer.setRenderTarget(this.postProcessor.renderTarget);
        this.context3d.readPixels(0, 0, this.size.width, this.size.height, this.context3d.RGBA, this.context3d.UNSIGNED_BYTE, this.imageDataArraySource);

        data = this.imageDataArraySource;
    }
    __markTime('build palette via clustering');
    this.palette = this.buildPaletteInternal(data);
    __markTime('build tonemap image');
    this.buildGlobalPaletteToneMap(this.palette);
    __markTime('tonemap image complete');
};

GIFGenerator.prototype.buildGlobalPaletteToneMap = function(palette) {   

    var tree = createKDTree(palette);
    __markTime('get tonemap default data.');
    var tonemapPixels = this.getImageData(this.tonemap.image);
    __markTime('start building tonemap');

    cursor = 0;
    var data = tonemapPixels.data;
    var rgb = [];
    for (var i = 0, l = data.length; i < l; i += 4) {
        
        rgb[0] = data[i];
        rgb[1] = data[i + 1];
        rgb[2] = data[i + 2];

        var index = tree.nn(rgb);
        data[i] = data[i + 1] = data[i + 2] = index;
    }
    __markTime('use tonemap');

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

    var kmeans = new KMeans();
    kmeans.cluster(superPalette, 256);

    return kmeans.centroids.map(function(rgb) { 

        rgb[0] = ~~rgb[0];
        rgb[1] = ~~rgb[1];
        rgb[2] = ~~rgb[2];

        // var color = rgb[0] << 16 | rgb[1] << 8 | rgb[2];
        var arr = [rgb[0], rgb[1], rgb[2]];
        // arr.color = color;
        return arr;
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

GIFGenerator.prototype.addFrame = function(delay) {

    delay = delay || this.delay;

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
        palette: new Uint32Array(this.palette.map(function(rgb) { 
            return rgb[0] << 16 | rgb[1] << 8 | rgb[2];
        })),
        delay: delay
    });
};

module.exports = GIFGenerator;
