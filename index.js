var OMGGIF = require('omggif');

function GIFGenerator(renderer, opts) {
    
    opts = opts || {};

    this.renderer = renderer;
    this.generating = false;
    //this.current = 0;
    this.frames = 100 || opts.frames;
    this.delay = 5 || opts.delay;

}

GIFGenerator.prototype.init = function() {

    this.generating = true;

    var canvas = document.createElement('canvas');
    canvas.width = this.renderer.domElement.width;
    canvas.height = this.renderer.domElement.height;

    var context = canvas.getContext('2d');

    var buffer = new Uint8Array(canvas.width * canvas.height * this.frames * 5);
    var gif = new OMGGIF.GifWriter(buffer, canvas.width, canvas.height, {
        loop: 0
    });

    var pixels = new Uint8Array(canvas.width * canvas.height);

    this.canvas = canvas;
    this.context = context;
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

        var image = document.createElement('img');
        image.src = 'data:image/gif;base64,' + btoa(string);
        document.body.appendChild(image);

        this.generating = false;
};

GIFGenerator.prototype.addFrame = function() {

    this.context.drawImage(this.renderer.domElement, 0, 0);

    var data = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    var palette = [];

    for (var j = 0, k = 0, jl = data.length; j < jl; j += 4, k++) {

        var r = Math.floor(data[j + 0] * 0.1) * 10;
        var g = Math.floor(data[j + 1] * 0.1) * 10;
        var b = Math.floor(data[j + 2] * 0.1) * 10;
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
