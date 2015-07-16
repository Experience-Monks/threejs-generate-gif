var THREE = require('three');
var GIFGenerator = require('./index');

var gifGenerator;

var camera, scene, renderer, mesh;

var width = height = 300;
var time = 0;
var frames = 100;
var current = 0;

// Main function
init();

function animate() {

    requestAnimationFrame(animate);
    render();    

    if (current < frames)
    {
        gifGenerator.addFrame();
    }
    else if (current === frames)
    {
        gifGenerator.finish();
    }
    current++;
    console.log(current);
}

function render() {
    time = time + 0.01 % 1;

    meshGreen.position.x = Math.cos((time + 0.5) * Math.PI * 2) * 200;
    meshGreen.position.y = Math.sin((time + 0.5) * Math.PI * 2) * 200;

    meshBlue.position.x = Math.cos(time * Math.PI * 2) * 200;
    meshBlue.position.y = Math.sin(time * Math.PI * 2) * 200;

    renderer.render(scene, camera);
}

function init() {

    camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.z = 800;

    scene = new THREE.Scene();

    var geometry = new THREE.SphereGeometry(200, 64, 32);
    var material = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide,
    });

    var materialGreen = new THREE.MeshPhongMaterial({
        color: 0x00ff00,
        side: THREE.DoubleSide,
    });

    var materialBlue = new THREE.MeshPhongMaterial({
        color: 0x0000ff,
        side: THREE.DoubleSide,
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
        frames: frames,
        size: {width: width, height: height},
        recalculatePalettePerFrame: false
    };

    function receiveImageURI(str) {
        var image = document.createElement('img');
        image.src = str;
        document.body.appendChild(image);
    }

    gifGenerator = new GIFGenerator(renderer, opts, receiveImageURI);

    gifGenerator.init();
    animate();

    document.body.appendChild(renderer.domElement);
}



