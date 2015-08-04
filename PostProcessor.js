function PostProcessor(renderer, oldRenderTarget, size, tonemap) {

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
			noise: {type: 'f', value: 0.0},
			texture1: {type: 't', value: oldRenderTarget}, 
			tonemap: {type: 't', value: tonemap} 
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
		'uniform vec2 pixelSize; ',
		'uniform float time;',
		'uniform float noise;',

		'varying vec2 vUv; ',

		'  vec3 mod289(vec3 x) {',
		'    return x - floor(x * 0.00346020761246) * 289.0;',
		'  }',
		
		'  vec4 mod289(vec4 x) {',
		'    return x - floor(x * 0.00346020761246) * 289.0;',
		'  }',
		
		'  vec4 permute(vec4 x) {',
		'       return mod289(((x*34.0)+1.0)*x);',
		'  }',
		
		'  vec4 taylorInvSqrt(vec4 r)',
		'  {',
		'    return 1.79284291400159 - 0.85373472095314 * r;',
		'  }',
		
		'  float snoise(vec3 v)',
		'    { ',
		'    const vec2  C = vec2(0.16666666666667, 0.33333333333333) ;',
		'    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);',
		
		'    vec3 i  = floor(v + dot(v, C.yyy) );',
		'    vec3 x0 =   v - i + dot(i, C.xxx) ;',
		
		'    vec3 g = step(x0.yzx, x0.xyz);',
		'    vec3 l = 1.0 - g;',
		'    vec3 i1 = min( g.xyz, l.zxy );',
		'    vec3 i2 = max( g.xyz, l.zxy );',
		
		'    vec3 x1 = x0 - i1 + C.xxx;',
		'    vec3 x2 = x0 - i2 + C.yyy;', // 2.0*C.x = 1/3 = C.y
		'    vec3 x3 = x0 - D.yyy;',      // -1.0+3.0*C.x = -0.5 = -D.y

		'    i = mod289(i); ',
		'    vec4 p = permute( permute( permute( ',
		'               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))',
		'             + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) ',
		'             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));',
		
		'    float n_ = 0.142857142857;', // 1.0/7.0
		'    vec3  ns = n_ * D.wyz - D.xzx;',
		'    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);',  //  mod(p,7*7)
		
		
		'    vec4 x_ = floor(j * ns.z);',
		'    vec4 y_ = floor(j - 7.0 * x_ );',    // mod(j,N)
		
		'    vec4 x = x_ *ns.x + ns.yyyy;',
		'    vec4 y = y_ *ns.x + ns.yyyy;',
		'    vec4 h = 1.0 - abs(x) - abs(y);',
		
		'    vec4 b0 = vec4( x.xy, y.xy );',
		'    vec4 b1 = vec4( x.zw, y.zw );',
		
		'    vec4 s0 = floor(b0)*2.0 + 1.0;',
		'    vec4 s1 = floor(b1)*2.0 + 1.0;',
		'    vec4 sh = -step(h, vec4(0.0));',
		
		'    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;',
		'    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;',
		
		'    vec3 p0 = vec3(a0.xy,h.x);',
		'    vec3 p1 = vec3(a0.zw,h.y);',
		'    vec3 p2 = vec3(a1.xy,h.z);',
		'    vec3 p3 = vec3(a1.zw,h.w);',
		
		'    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));',
		'    p0 *= norm.x;',
		'    p1 *= norm.y;',
		'    p2 *= norm.z;',
		'    p3 *= norm.w;',
		
		'    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);',
		'    m = m * m;',
		'    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), ',
		'                                  dot(p2,x2), dot(p3,x3) ) );',
		'  }',
		'void main() {',

		'	gl_FragColor = texture2D(texture1, vUv); ',
		'	gl_FragColor += texture2D(texture1, vUv + vec2(pixelSize.x, 0.0) ); ', 
		'	gl_FragColor += texture2D(texture1, vUv + vec2(0.0, pixelSize.y) ); ', 
		'	gl_FragColor += texture2D(texture1, vUv + vec2(pixelSize.x, pixelSize.y) ); ',
		'	gl_FragColor *= 0.25; ', 
		'	gl_FragColor += snoise(vec3(vUv.xy / pixelSize.xy * noise, time)) * 0.025; ',
		//'	gl_FragColor += (mod(vUv.x, pixelSize.x * 4.0) - mod(vUv.y, pixelSize.y * 4.0)) * 3.0 ; ' + 

		'}'
		].join('\n')
	});

	var quad = new THREE.Mesh(
		new THREE.PlaneBufferGeometry( 2, 2 ),
		this.material
	);
	scene.add(quad);	
}

PostProcessor.prototype.setTonemap = function(tonemap) {
	this.material.uniforms.tonemap.value = tonemap;
};

PostProcessor.prototype.update = function() {

	//this.material.uniforms.time.value += 0.025;
	this.material.uniforms.noise.value += 0.38;
	this.renderer.render(this.scene, this.camera, this.renderTarget);
};

module.exports = PostProcessor;
