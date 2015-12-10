function PostProcessor(renderer, oldRenderTarget, size, tonemap, opts) {
   
    opts = opts || {};
	this.superSample = opts.superSample;    
	this.dither = opts.dither;    

    this.renderer = renderer;
    this.oldRenderTarget = oldRenderTarget;

	this.size = size;

	var renderTarget = new THREE.WebGLRenderTarget(size.width, size.height);
    renderTarget.flipY = false;
    renderTarget.generateMipMaps = false;
    renderTarget.minFilter = THREE.NearestFilter;
    renderTarget.magFilter = THREE.NearestFilter;

    this.renderTarget = renderTarget;

    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera( -1, 1, -1, 1, -1, 1 );

    this.scene = scene;
    this.camera = camera;

    this.tonemap = tonemap;

	this.material = new THREE.ShaderMaterial({
    	side: THREE.DoubleSide,
		uniforms: {
			pixelSize: { type: 'v2', value: new THREE.Vector2(1.0 / oldRenderTarget.width, 1.0 / oldRenderTarget.height) },
			time: {type: 'f', value: 0.0},
			ditherStrength: {type: 'f', value: 0.007},
			texture1: {type: 't', value: oldRenderTarget}, 
			tonemap: {type: 't', value: tonemap},
			renderOriginal: {type: 'i', value: 0}
		},
		vertexShader: 
		[
		'varying vec2 vUv;',
		'void main() {',
		'	vUv = uv;',
		'	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); ',
		'}'
		].join('\n'),
		fragmentShader: 
		[
		'uniform sampler2D texture1;',
		'uniform sampler2D tonemap;',
		'uniform vec2 pixelSize; ',
		'uniform float time;',
		'uniform float ditherStrength;',
		'uniform int renderOriginal;',

		'varying vec2 vUv; ',

		'#define LUT_FLIP_Y',

		'vec4 lookup(in vec4 textureColor, in sampler2D lookupTable1) {',
        '	textureColor = clamp(textureColor, 0.0, 1.0);',  
      
        '	float blueColor = floor(textureColor.b * 64.0);',
    
        '	vec2 quad1;',
        '	quad1.y = floor(blueColor / 8.0) / 8.0;',
        '	quad1.x = mod(blueColor, 8.0) / 8.0;',
                
        '	vec2 texPos1;',
        '	texPos1.x = quad1.x + textureColor.r * (1.0 / 8.0 - 1.0 / 512.0) ;',
        '	texPos1.y = quad1.y + textureColor.g * (1.0 / 8.0 - 1.0 / 512.0) ;',
    
        '	#ifdef LUT_FLIP_Y',
        '		texPos1.y = 1.0-texPos1.y;',
        '	#endif',
                    
        '	mediump vec4 newColor1 = texture2D(lookupTable1, texPos1);',
        '	return newColor1;',
        '}',

		'  void main() {',

		'    vec4 color;',
		'    color = texture2D(texture1, vUv); ',

		this.superSample ? 
		[
		'    color += texture2D(texture1, vUv + vec2(pixelSize.x, 0.0) ); ', 
		'    color += texture2D(texture1, vUv + vec2(0.0, pixelSize.y) ); ', 
		'    color += texture2D(texture1, vUv + vec2(pixelSize.x, pixelSize.y) ); ',
		'    color *= 0.25; '
		].join('\n') : '',

		this.dither ? 
		[
		'	float gridX = mod(gl_FragCoord.x - 0.5, 2.0); ',
		'	float gridY = mod(gl_FragCoord.y - 0.5, 2.0); ',
		'   color.rgb += vec3(abs(gridX - gridY)) * ditherStrength; ',

		].join('\n') : '',

		'    color = clamp(color, ' + (0.5/256.0) + ', ' + (255.5/256.0) + ');',

		'    gl_FragColor = lookup(color, tonemap);',

		'    if (renderOriginal != 0)',
		'    	gl_FragColor = color;',
		'  }'
		].join('\n')
	});

	var quad = new THREE.Mesh(
		new THREE.PlaneBufferGeometry( 2, 2 ),
		this.material
	);
	this.quad = quad;
	scene.add(quad);	
}

PostProcessor.prototype.setTonemap = function(tonemap) {
	
	// if (this.material.uniforms.tonemap.value) {
	//     this.material.uniforms.tonemap.value.dispose();
	//     delete this.material.uniforms.tonemap.value;            
	// }

	if (this.tonemap) {
		this.tonemap.dispose();
		delete this.tonemap;		
	}

	this.material.uniforms.tonemap.value = tonemap;
	this.tonemap = tonemap;
};

PostProcessor.prototype.update = function(renderOriginal, dontIncreaseTime) {

	if (!dontIncreaseTime) {		
		this.material.uniforms.time.value += 0.025;
	}
	this.material.uniforms.renderOriginal.value = renderOriginal;
	this.renderer.render(this.scene, this.camera, this.renderTarget);
};

PostProcessor.prototype.dispose = function() {

	this.renderTarget.dispose();
	delete this.renderTarget;

	this.oldRenderTarget.dispose();
	delete this.oldRenderTarget;

	if (this.tonemap) {
	    this.tonemap.dispose();
		delete this.tonemap;
	}
	
	if (this.material.uniforms.tonemap.value) {
	    this.material.uniforms.tonemap.value.dispose();
	    delete this.material.uniforms.tonemap.value;            
	}

	if (this.material.uniforms.texture1.value) {
	    this.material.uniforms.texture1.value.dispose();
	    delete this.material.uniforms.texture1.value;
	}

	this.scene.remove(this.quad);
	this.quad.geometry.dispose();
	this.quad.material.dispose();
	delete this.quad.geometry;
	delete this.quad.material;
	delete this.quad;

	delete this.scene;
	delete this.camera;

	delete this.material;
};
module.exports = PostProcessor;
