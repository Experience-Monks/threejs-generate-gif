var OMGGIF = require('omggif');
var clamp = require('clamp');

function GIFGenerator(renderer, opts, callback) {
    
    opts = opts || {};
    this.recalculatePalettePerFrame = opts.recalculatePalettePerFrame;
    this.dither = opts.dither;
    this.superSample = opts.superSample;

    this.renderer = renderer;
    this.generating = false;
    //this.current = 0;
    this.frames = opts.frame || 100;
    this.delay = opts.delay || 5;

    this.renderTarget = opts.renderTarget;

    this.size = opts.size || {width: 500, height: 500};
    this.doubleSize = this.superSample ? {width: this.size.width * 2, height: this.size.height * 2} : this.size;

    this.callback = callback;

    this.denominator = 16;
    this.quantizedLevels = 256 / this.denominator;
}

GIFGenerator.prototype.buildPalette = function(data) {

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

    this.globalPaletteMap = new Uint8Array(Math.pow(this.quantizedLevels, 3));

    var cursor = 0; 
    for (var ir = 0; ir < 256; ir += this.denominator) {
        for (var ig = 0; ig < 256; ig += this.denominator) {
            for (var ib = 0; ib < 256; ib += this.denominator) {
                
                this.globalPaletteMap[cursor] = this.findClosestIndex(ir, ig, ib, palette);
                cursor++;                
            }
        }
    }
    this.palette = palette;
};

GIFGenerator.prototype.init = function() {

    this.generating = true;

    var canvas = document.createElement('canvas');
    canvas.width = this.size.width; //this.renderer.domElement.width;
    canvas.height = this.size.height; //this.renderer.domElement.height;

    var context2d = canvas.getContext('2d');

    var buffer = new Uint8Array(this.size.width * this.size.height * this.frames * 5);
    var gif = new OMGGIF.GifWriter(buffer, this.size.width, this.size.height, {
        loop: 0
    });

    var pixels = new Uint8Array(this.size.width * this.size.height);

    if (this.renderTarget)
    {
        var context3d = this.renderer.getContext();
        var imageDataArraySource = new Uint8Array(this.doubleSize.width * this.doubleSize.height * 4);
        var imageDataArrayDest = new Uint8Array(this.size.width * this.size.height * 4);

        var imageData = context2d.createImageData(this.size.width, this.size.height);

        this.context3d = context3d;
        this.imageDataArraySource = imageDataArraySource;
        this.imageDataArrayDest = imageDataArrayDest;
        this.imageData = imageData;
    }

    this.canvas = canvas;
    this.context2d = context2d;
    this.buffer = buffer;
    this.pixels = pixels;

    this.gif = gif;
};

GIFGenerator.prototype.finish = function() {

        // return buffer.slice( 0, gif.end() );
        var string = '';

        for (var i = 0, l = this.gif.end(); i < l; i++) {
            string += String.fromCharCode(this.buffer[i]);
        }
        this.callback('data:image/gif;base64,' + btoa(string));

        this.generating = false;
};

GIFGenerator.prototype.findClosestIndex = function(r, g, b, palette) {
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

    if (this.renderTarget) {

        this.renderer.setRenderTarget(this.renderTarget);
        this.context3d.readPixels(0, 0, this.doubleSize.width, this.doubleSize.height, this.context3d.RGBA, this.context3d.UNSIGNED_BYTE, this.imageDataArraySource);

        if (this.superSample) {
            this.srcWidth = this.doubleSize.width;
            this.destWidth = this.size.width;           

            for (var i = 0, l = this.imageDataArrayDest.length; i < l; i++) {
                this.imageDataArrayDest[i] = ~~((this.imageDataArraySource[this.getSrcIndex(i, 0, 0)] +
                this.imageDataArraySource[this.getSrcIndex(i, 1, 0)] +
                this.imageDataArraySource[this.getSrcIndex(i, 0, 1)] +
                this.imageDataArraySource[this.getSrcIndex(i, 1, 1)]) / 4);
            }

            this.imageData.data.set(this.imageDataArrayDest);
        } else {
            this.imageData.data.set(this.imageDataArraySource);
        }
        
        this.context2d.putImageData(this.imageData, 0, 0);

    } else {

        this.context2d.drawImage(this.renderer.domElement, 0, 0);
    }  

    var data = this.context2d.getImageData(0, 0, this.size.width, this.size.height).data;

    if (!this.globalPaletteMap || this.recalculatePalettePerFrame || recalculatePalette) {
        this.buildPalette(data);
    } 

    var ditherStrength = this.dither ? 8 : 0;
    var width = this.size.width;

    for (var i = 0, k = 0, l = data.length; i < l; i += 4, k++) {
        var index = ~~(k + k / width);

        //var r = Math.floor(clamp(data[i + 0] + ditherStrength * ((index % 2) - 1), 0, 255) / this.denominator) * this.denominator;
        //var g = Math.floor(clamp(data[i + 1] + ditherStrength * (((index + 1) % 2) - 1), 0, 255) / this.denominator) * this.denominator;
        //var b = Math.floor(clamp(data[i + 2] + ditherStrength * (((index + 2) % 2) - 1), 0, 255) / this.denominator) * this.denominator;

        var r = Math.floor(data[i + 0] / this.denominator) * this.denominator;
        var g = Math.floor(data[i + 1] / this.denominator) * this.denominator;
        var b = Math.floor(data[i + 2] / this.denominator) * this.denominator;

        this.pixels[k] = this.globalPaletteMap[this.rgb2index(r, g, b)];
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
