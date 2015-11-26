THREE = require('three');
var GIFGenerator = require('./index');

var gifGenerator;

var camera, scene, renderer, mesh;

var width = height = 600;
var time = 0;
var frames = 68;

function animate() {

    for (var current = -1; current <= frames; current++) {

        render();    

        if (current === -1) {
            gifGenerator.buildPalette();
        }
        else if (current < frames)
        {
            gifGenerator.addFrame();
        }
        else if (current >= frames)
        {
            gifGenerator.finish();
        }
    }
}

function dispose() {
}

function render() {
    time = time + 0.01 % 1;

    meshGreen.position.x = Math.cos((time + 0.5) * Math.PI * 2) * 200;
    meshGreen.position.y = Math.sin((time + 0.5) * Math.PI * 2) * 200;

    meshBlue.position.x = Math.cos(time * Math.PI * 2) * 200;
    meshBlue.position.y = Math.sin(time * Math.PI * 2) * 200;

    renderer.render(scene, camera, gifGenerator.renderTarget);
}

function init() {

    camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.z = 800;

    scene = new THREE.Scene();

    var geometry = new THREE.SphereGeometry(200, 64, 32);
    var material = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide
    });

    var materialGreen = new THREE.MeshPhongMaterial({
        color: 0x00ff00,
        side: THREE.DoubleSide
    });

    var materialBlue = new THREE.MeshPhongMaterial({
        color: 0x0000ff,
        side: THREE.DoubleSide
    });

    var light = new THREE.AmbientLight( 0x444444 ); // soft white light
    scene.add( light );

    var light2 = new THREE.DirectionalLight( 0xffffff ); // soft white light
    scene.add( light2 );

    mesh = new THREE.Mesh(geometry, material);
    meshGreen = new THREE.Mesh(geometry, materialGreen);
    meshBlue = new THREE.Mesh(geometry, materialBlue);
    scene.add(mesh);
    scene.add(meshGreen);
    scene.add(meshBlue);

    meshGreen.position.set(200, 0, 0);
    meshBlue.position.set(-200, 0, 0);

    renderer = new THREE.WebGLRenderer();
    renderer.setClearColor(0x7f7f7f, 1);
    renderer.setSize(width, height);

    var opts = {
        size: { width: 300, height: 300 },
        paletteMethod: GIFGenerator.paletteMethods.NEUQUANT,
        superSample: true,
        dither: true,
        denominator: 8,
        mobile: false,
        lutImagePath: './original.png',               
        // Decorator Params
        fps: 15
    };

    function receiveImageURI(str) {
        var image = document.createElement('img');
        image.src = str;
        document.body.appendChild(image);

        dispose();
    }

    gifGenerator = new GIFGenerator(renderer, opts, animate, receiveImageURI);
    document.body.appendChild(renderer.domElement);
}

init();

