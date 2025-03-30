import {
    DirectionalLight,
    Mesh,
    Vector3,
    Vector2,
    ACESFilmicToneMapping,
    PCFSoftShadowMap,
    PlaneGeometry,
    EquirectangularReflectionMapping,
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
    MeshStandardMaterial,
    Color,
    FogExp2
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { Water } from 'three/addons/objects/Water2.js';
import * as  TWEEN  from 'three/addons/libs/tween.module.js';
import("three-mesh-bvh");
import CustomShaderMaterial from "three-custom-shader-material/vanilla";
  //CONFIG
  let dev: boolean;

  export const init = async() => {
    if (window.location.port === "") {
        dev = false;
    } else {
        dev = true;
    }

    let customVertexShader = ` 
        uniform float translationX;
        uniform float translationY;
        uniform float translationZ;
        uniform float scaleX;
        uniform float scaleY;
        uniform float scaleZ;
        uniform float rotationX;
        uniform float rotationY;
        uniform float rotationZ;
        uniform float uTime;
        uniform float phase;
        

        varying vec2 vUv;
        varying mat4 vPosition;

        void main() {

            vUv = uv;
            float alpha = clamp((uTime - phase),0.0,1.0);
            
            // Translate
            mat4 tPos = mat4(vec4(1.0,0.0,0.0,0.0),
                            vec4(0.0,1.0,0.0,0.0),
                            vec4(0.0,0.0,1.0,0.0),
                            vec4(translationX,translationY,translationZ,1.0));
            
            // Rotate
            mat4 rXPos = mat4(vec4(1.0,0.0,0.0,0.0),
                                vec4(0.0,cos(rotationX),-sin(rotationX),0.0),
                                vec4(0.0,sin(rotationX),cos(rotationX),0.0),
                                vec4(0.0,0.0,0.0,1.0));
            
            mat4 rYPos = mat4(vec4(cos(rotationY),0.0,sin(rotationY),0.0),
                                vec4(0.0,1.0,0.0,0.0),
                                vec4(-sin(rotationY),0.0,cos(rotationY),0.0),
                                vec4(0.0,0.0,0.0,1.0));
            
            mat4 rZPos = mat4(vec4(cos(mix(2.0,rotationZ,alpha)),-sin(mix(2.0,rotationZ,alpha)),0.0,0.0),
                                vec4(sin(mix(2.0,rotationZ,alpha)),cos(mix(2.0,rotationZ,alpha)),0.0,0.0),
                                vec4(0.0,0.0,1.0,0.0),
                                vec4(0.0,0.0,0.0,1.0));
                                
            // Scale
            mat4 sPos = mat4(vec4(mix(0.0,scaleX,alpha),0.0,0.0,0.0),
                            vec4(0.0,mix(0.0,scaleZ,alpha),0.0,0.0),
                            vec4(0.0,0.0,mix(0.0,scaleY,alpha),0.0),
                            vec4(0.0,0.0,0.0,1.0));
            
            vPosition =  tPos * rXPos * rZPos * rYPos * sPos;

            csm_Position = (vPosition * vec4(position,1.0)).xyz;
        }
      `
    let customShaderUniforms =  {
        translationX:  { value: 0.0 },
        translationY:  {  value: 0.0 },
        translationZ:  { value: 0.0 },
        scaleX:  { value: 1.0 },
        scaleY:  { value: 1.0 },
        scaleZ:  { value: 1.0 },
        rotationX:  { value: 0.0 },
        rotationY:  { value: 0.0 },
        rotationZ:  { value: 0.0},
        uTime: { value: 0.0 },
        phase: {value : 0}
    }

    let water;
    // Scene setup
    const scene = new Scene();
    const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    //fog
    scene.fog = new FogExp2( 0xccdbdf, 0.0012 );

        // Add OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 10;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableRotate = false;
    controls.enableDamping = true; // Smooth damping effect
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1; // Minimum zoom distance
    controls.maxDistance = 500; // Maximum zoom distance
    controls.maxPolarAngle = Math.PI / 2; // Limit vertical rotation to horizon


    //HDRI Loader
    const HDRURL = dev? 'textures/equirectangular/sky.hdr' : 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/textures/equirectangular/sky.hdr'
    new RGBELoader()
        .load( HDRURL, function ( texture ) {

            texture.mapping = EquirectangularReflectionMapping;

            scene.background = texture;
            scene.backgroundBlurriness = 0.0;

            scene.environment = texture;
    });


    const CustomMaterial = new CustomShaderMaterial({
        baseMaterial: MeshStandardMaterial,
        // Your Uniforms
        uniforms: customShaderUniforms,
        vertexShader: /* glsl */ customVertexShader,
        //fragmentShader: /* glsl */ ` ... `, //
        // Base material properties
        flatShading: true,
        //color: 0xff00ff
    });
    let PhasingMats = [];
    for (let i=0;i<10;i++){
        const phaseMat = new CustomShaderMaterial({
            baseMaterial: MeshStandardMaterial,
            // Your Uniforms
            uniforms: {...customShaderUniforms, phase:{'value':i}},
            vertexShader: /* glsl */ customVertexShader,
            //fragmentShader: /* glsl */ ` ... `, //
            // Base material properties
            flatShading: true,
            //color: 0xff00ff
        });
        PhasingMats.push(phaseMat);
    }
    
    // Create GLTF loader
    const gltfLoader = new GLTFLoader();

    const dracoDecoderPath = dev? '/libs/draco/gltf/' : 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/libs/draco/gltf/'
    // Set up Draco loader
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(dracoDecoderPath);
    gltfLoader.setDRACOLoader(dracoLoader);

    // Load the compressed GLTF model
    const modelURL = dev? 'models/gltf/Village.glb' : 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/models/gltf/Village.glb'

    gltfLoader.load(
        modelURL, // Replace with your file path
        function (gltf) {
            const model = gltf.scene;
            scene.add(model);

            // Optional: Adjust position and scale
            model.position.set(0, 0, 0);
            model.scale.set(1, 1, 1);

            console.log(model)

            // Optional: Enable shadows
            model.traverse((obj) => {
                let child = (obj as Mesh)
                if (child.isMesh) {
                    //CustomMaterial.map = child.material.map
                    //child.material = CustomMaterial;

                    if(child.name.includes("hill") ||
                       child.name.includes("Road") || 
                       child.name.includes("stones") ||
                       child.name.includes("mountains") || 
                       child.name.includes("rock")){
                        child.receiveShadow = true;
                        child.castShadow = false;
                        //child.material.color = new Color( 0xff00ff );
                    }

                    //phase 0 animations
                    if(child.name.includes('hill') || child.name.includes('landscape')){
                        PhasingMats[0].map = child.material.map
                        child.material = PhasingMats[0];
                    }
                    //phase 1 animations
                    if(child.name.includes('mountains')){
                        PhasingMats[1].map = child.material.map
                        child.material = PhasingMats[1];
                    }
                    //phase 2 animations
                    if(child.name.includes('rock')){
                        PhasingMats[2].map = child.material.map
                        child.material = PhasingMats[2];
                    }
                    //phase 3 animations
                    if(child.name.includes('stones')){
                        PhasingMats[3].map = child.material.map
                        child.material = PhasingMats[3];
                    }
                    //phase 4 animations
                    if(child.name.includes('Road')){
                        PhasingMats[4].map = child.material.map
                        child.material = PhasingMats[4];
                    }
                    //phase 5 animations
                    if(child.name.includes('Tree')){
                        PhasingMats[5].map = child.material.map
                        child.material = PhasingMats[5];
                    }
                    //phase 6 animations
                    if(child.name.includes('animal')){
                        PhasingMats[6].map = child.material.map
                        child.material = PhasingMats[6];
                    }
                    //phase 4 animations
                    if(child.name.includes('props')){
                        PhasingMats[7].map = child.material.map
                        child.material = PhasingMats[7];
                    }
                    //phase 4 animations
                    if(child.name.includes('Building') || child.name.includes('building') || child.name.includes('Mesh') ||
                    child.name.includes('foundation') || child.name.includes('Flue')){
                        PhasingMats[8].map = child.material.map
                        child.material = PhasingMats[8];
                    }
                    //phase 4 animations
                    if(child.name.includes('dock')){
                        PhasingMats[9].map = child.material.map
                        child.material = PhasingMats[9];
                    }
                    else if(child.name.includes("water")){
                        child.visible = false;
                        const waterGeometry = new PlaneGeometry( 1000,1000 );
                        water = new Water( waterGeometry, {
                            color: 0x5cecff,
                            scale: 8,
                            flowDirection: new Vector2( 0.2, 0.2 ),
                            textureWidth: 1024,
                            textureHeight: 1024
                        } );

                        water.position.y = -11.6;
                        water.position.x = 0;
                        water.position.z = 0;


                        water.rotation.x = Math.PI * - 0.5;
                        scene.add( water );
                        console.log(scene)
                    }
                    else{
                        child.castShadow = true;
                    }
                   //const albedoMap = child.material.map || null;

                   //child.material = new THREE.MeshToonMaterial({
                    //map: albedoMap,
                   //});
                }
                new TWEEN.Tween(CustomMaterial.uniforms.uTime)
                .to( {value: 10.0} , 8000)
                .yoyo(false)
                .repeat(0)
                .easing(TWEEN.Easing.Cubic.InOut)
                .start()
                .onUpdate(function (time) {
                    if(time.value >= 7){
                        renderer.shadowMap.enabled = true;
                    }
                    controls.autoRotateSpeed = 10-time.value;
                  })
                  .onComplete(function () {
                    controls.autoRotate = false; 
                    controls.enablePan = true;
                    controls.enableZoom = true;
                    controls.enableRotate = true;           
                  })
            ; 
            });
        },
        function (xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function (error) {
            console.log('An error occurred:', error);
        }
        
    );



    // ☁️ Skybox (Gradient Background)
// const skyTexture = new THREE.CanvasTexture(createGradientSky());
// scene.background = skyTexture;

// function createGradientSky() {
//     const canvas = document.createElement('canvas');
//     const ctx = canvas.getContext('2d');
//     canvas.width = 512;
//     canvas.height = 512;
    
//     const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
//     gradient.addColorStop(0, '#87CEEB'); // Light Blue
//     gradient.addColorStop(1, '#FFFFFF'); // White

//     ctx.fillStyle = gradient;
//     ctx.fillRect(0, 0, canvas.width, canvas.height);

//     return canvas;
// }
    
    
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = PCFSoftShadowMap;

    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    // Lighting
    //const ambientLight = new AmbientLight(0x404040, 0);
    //scene.add(ambientLight);
    const directionalLight = new DirectionalLight(0xffffff, 0);
    directionalLight.position.set(50, 100, 75);
    directionalLight.castShadow = false;

    // const d = 500;
    // directionalLight.shadow.camera.left = - d;
    // directionalLight.shadow.camera.right = d;
    // directionalLight.shadow.camera.top = d;
    // directionalLight.shadow.camera.bottom = - d;

    // directionalLight.shadow.mapSize.width = 4096        
    // directionalLight.shadow.mapSize.height = 4096

    // directionalLight.shadow.camera.near = 0.5
    // directionalLight.shadow.camera.far = 300

    //CSM ShadowMap
    const csm = new CSM({
        fade: false,
        maxFar: 100,
        cascades: 4,
        shadowMapSize: 2048,
        lightDirection:  new Vector3(1, -1, 1).normalize(),
        camera: camera,
        parent: scene,
        lightIntensity: 1,
    });

    // const csmHelper = new CSMHelper(csm)
    // csmHelper.displayFrustum = true
    // csmHelper.displayPlanes = true
    // csmHelper.displayShadowBounds = true
    //scene.add(csmHelper);

    // const helper1 = new THREE.DirectionalLightHelper(directionalLight);
    // const helper = new THREE.CameraHelper(directionalLight.shadow.camera)
    // scene.add(helper)
    // scene.add(helper1)



    //scene.add(directionalLight);



    // Camera position
    camera.position.set(-50, 75, -150);

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        csm.update();
        controls.update(); // Required for damping to work
        TWEEN.update();
        renderer.render(scene, camera);
    }
    animate();

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}
  