var OMGGIF = require('omggif');

function GIFGenerator(renderer, opts, callback) {
    
    opts = opts || {};

    this.renderer = renderer;
    this.generating = false;
    //this.current = 0;
    this.frames = 100 || opts.frames;
    this.delay = 5 || opts.delay;

    this.renderTarget = opts.renderTarget;

    this.size = opts.size || {width: 500, height: 500};

    this.callback = callback;
}

GIFGenerator.prototype.init = function() {

    this.generating = true;

    var canvas = document.createElement('canvas');
    canvas.width =  this.size.width; //this.renderer.domElement.width;
    canvas.height =  this.size.height; //this.renderer.domElement.height;

    var context2d = canvas.getContext('2d');

    var buffer = new Uint8Array(canvas.width * canvas.height * this.frames * 5);
    var gif = new OMGGIF.GifWriter(buffer, canvas.width, canvas.height, {
        loop: 0
    });

    var pixels = new Uint8Array(canvas.width * canvas.height);

    if (this.renderTarget)
    {

        var context3d = this.renderer.getContext();
        var imageDataArray = new Uint8Array(this.size.width * this.size.height * 4);
        var imageData = context2d.createImageData(this.size.width, this.size.height);

        this.context3d = context3d;
        this.imageDataArray = imageDataArray;
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

GIFGenerator.prototype.addFrame = function() {

    if (this.renderTarget) {

        this.renderer.setRenderTarget(this.renderTarget);
        this.context3d.readPixels(0, 0, this.size.width, this.size.height, this.context3d.RGBA, this.context3d.UNSIGNED_BYTE, this.imageDataArray);

        this.imageData.data.set(this.imageDataArray);
        this.context2d.putImageData(this.imageData, 0, 0);

    } else {

        this.context2d.drawImage(this.renderer.domElement, 0, 0);
    }  

    var data = this.context2d.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    var palette = [];

    var denominator = 30;

    for (var j = 0, k = 0, jl = data.length; j < jl; j += 4, k++) {

        var r = Math.floor(data[j + 0] / denominator) * denominator;
        var g = Math.floor(data[j + 1] / denominator) * denominator;
        var b = Math.floor(data[j + 2] / denominator) * denominator;
        var color = r << 16 | g << 8 | b << 0;

        var index = palette.indexOf(color);

        if (index === -1) {
            this.pixels[k] = palette.length;
            palette.push(color);
        } else {
            this.pixels[k] = index;
        }
    }
    // force palette to be power of 2

    var powof2 = 1;
    while (powof2 < palette.length) powof2 <<= 1;
    palette.length = powof2;

    this.gif.addFrame(0, 0, this.canvas.width, this.canvas.height, this.pixels, {
        palette: new Uint32Array(palette),
        delay: this.delay
    });
};

module.exports = GIFGenerator;
