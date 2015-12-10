THREE = require('three');
var GIFGenerator = require('./index');

var gifGenerator;

var camera, scene, renderer, mesh, pivot;

var width = height = 600;
var time = 0;
var frames = 68;

function startAnimation() {

    requestAnimationFrame(animate);
}

var current = -1;

function animate() {

    render();    

    if (current === -1) {
        requestAnimationFrame(animate);
        gifGenerator.buildPalette();
    }
    else if (current < frames)
    {
        requestAnimationFrame(animate);
        gifGenerator.buildPalette();
        gifGenerator.addFrame();
    }
    else if (current >= frames)
    {
        gifGenerator.finish();
    }
    current++;
}

function dispose() {
}

function render() {
    time = time + 0.01 % 1;

    meshGreen.position.x = Math.cos((time + 0.5) * Math.PI * 2) * 200;
    meshGreen.position.y = Math.sin((time + 0.5) * Math.PI * 2) * 200;

    meshBlue.position.x = Math.cos(time * Math.PI * 2) * 200;
    meshBlue.position.y = Math.sin(time * Math.PI * 2) * 200;

    pivot.rotation.y += 0.1;
    renderer.render(scene, camera, gifGenerator.renderTarget);
    renderer.render(scene, camera);
}

function init() {

    camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.set(0, -100, 600);
    camera.lookAt(new THREE.Vector3(0, 100, 0));

    scene = new THREE.Scene();

    var geometry = new THREE.SphereGeometry(10, 64, 32);
    var material = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide
    });

    var materialGreen = new THREE.MeshPhongMaterial({
        color: 0x00ff00,
        side: THREE.DoubleSide
    });

    var materialBlue = new THREE.MeshPhongMaterial({
        color: 0x1010ef,
        side: THREE.DoubleSide
    });

    var light = new THREE.AmbientLight( 0x444444 ); // soft white light
    scene.add( light );

    var light2 = new THREE.DirectionalLight( 0xffffff ); // soft white light
    scene.add( light2 );

    pivot = new THREE.Object3D();

    var step = 32;
    var distance = 5;
    for (var ix = 0; ix <= 256; ix+= step) {
        for (var iy = 0; iy <= 256; iy+= step) {
            for (var iz = 0; iz <= 256; iz+= step) {

                var material = new THREE.MeshBasicMaterial({
                    color: new THREE.Color( ix / 256, iy / 256, iz / 256),
                    side: THREE.DoubleSide
                });

                var mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(ix - 128, iy - 128, iz - 128);

                pivot.add(mesh);
            }
        }
    }
    scene.add(pivot);

    mesh = new THREE.Mesh(geometry, material);
    meshGreen = new THREE.Mesh(geometry, materialGreen);
    meshBlue = new THREE.Mesh(geometry, materialBlue);
    // scene.add(mesh);
    // scene.add(meshGreen);
    // scene.add(meshBlue);

    meshGreen.position.set(200, 0, 0);
    meshBlue.position.set(-200, 0, 0);

    renderer = new THREE.WebGLRenderer();
    renderer.setClearColor(0x7f7f7f, 1);
    renderer.setSize(width, height);

    var opts = {
        size: { width: width / 2, height: height / 2 },
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

        //dispose();
    }

    gifGenerator = new GIFGenerator(renderer, opts, startAnimation, receiveImageURI);
    document.body.appendChild(renderer.domElement);
}

init();

