var THREE = require('three');
var GIFGenerator = require('./index');

var gifGenerator;

var camera, scene, renderer, mesh;

var width = height = 500;
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
}

function render() {
    time = time + 0.01 % 1;

    mesh.rotation.x = time * 360 * (Math.PI / 180);
    mesh.rotation.y = -time * 360 * (Math.PI / 180);

    renderer.render(scene, camera);
}

function init() {

    camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.z = 800;

    scene = new THREE.Scene();

    var geometry = new THREE.BoxGeometry(200, 200, 200);
    var material = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide,
    });

    var light = new THREE.AmbientLight( 0x444444 ); // soft white light
    scene.add( light );

    var light2 = new THREE.DirectionalLight( 0xffffff ); // soft white light
    scene.add( light2 );

    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    renderer = new THREE.WebGLRenderer();
    renderer.setClearColor(0xffffff, 1);
    renderer.setSize(width, height);

    var opts = {
        frames: frames
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



