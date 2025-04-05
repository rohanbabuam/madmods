import {
    DirectionalLight,
    Mesh,
    Vector3,
    Vector2,
    ACESFilmicToneMapping,
    PCFSoftShadowMap,
    PlaneGeometry,
    CircleGeometry,
    EquirectangularReflectionMapping,
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
    MeshStandardMaterial,
    Color,
    FogExp2,
    Fog,
    BufferGeometry,
    CatmullRomCurve3,
    LineBasicMaterial,
    Line,
    TextureLoader,
    SRGBColorSpace,
    LinearMipMapLinearFilter,
    ShaderMaterial,
    Object3D,
} from 'three';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { Water } from 'three/addons/objects/Water2.js';
import * as  TWEEN  from 'three/addons/libs/tween.module.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import("three-mesh-bvh");
import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import AutoTyping from '$lib/typewriter/auto.js';
  //CONFIG
  let dev: boolean;
  let camPath:any;
  let planesMeshA:any;
  let animatingText:boolean = false, animatingCamera:boolean = false, animatingMesh:boolean = false; 
  let water:any;
  let cameraAnimated = false;
  let CloudMaterial:any;

  export const init = async() => {
    if (window.location.port === "") {
        dev = false;
    } else {
        dev = true;
    }

    const cloudShader = {
        vertexShader:
        `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          }
        `,
        fragmentShader:
        `
          uniform sampler2D map;
          uniform vec3 fogColor;
          uniform float fogNear;
          uniform float fogFar;
          uniform float opacity;
          varying vec2 vUv;
      
          void main() {
      
            float depth = gl_FragCoord.z / gl_FragCoord.w;
            float fogFactor = smoothstep( fogNear, fogFar, depth );
      
            gl_FragColor = texture2D( map, vUv );
            gl_FragColor.w *= pow( gl_FragCoord.z, 20.0 );
            gl_FragColor = mix( gl_FragColor, vec4( fogColor , gl_FragColor.w ), fogFactor );
            gl_FragColor = vec4(gl_FragColor.rgb, gl_FragColor.a*opacity);
      
          }
        `
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
            
            mat4 rZPos = mat4(vec4(cos(mix(0.0,rotationZ,alpha)),-sin(mix(0.0,rotationZ,alpha)),0.0,0.0),
                                vec4(sin(mix(0.0,rotationZ,alpha)),cos(mix(0.0,rotationZ,alpha)),0.0,0.0),
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

    
    // Scene setup
    const scene = new Scene();
    const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100000);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    //fog
    //scene.fog = new FogExp2( 0xccdbdf, 0.00 );

    var fog = new Fog( 0x6ba4b6, - 100, 2000 );
    scene.fog = fog

    //clouds
    var tLoader = new TextureLoader()
    let cloudTexture:any;
    tLoader.load('https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/textures/clouds/cloud10.png', (t)=> {
    t.colorSpace = SRGBColorSpace;
    cloudTexture = t;
    //cloudTexture.magFilter = LinearMipMapLinearFilter;
    //cloudTexture.minFilter = LinearMipMapLinearFilter;

    CloudMaterial = new ShaderMaterial( {

        uniforms: {
          "map": {value: cloudTexture },
          "fogColor" : {value: fog.color },
          "fogNear" : {value: fog.near },
          "fogFar" : {value: fog.far },
          "opacity": {value : 1.0}
    
        },
        vertexShader: cloudShader.vertexShader,
        fragmentShader: cloudShader.fragmentShader,
        depthWrite: false,
        depthTest: false,
        transparent: true,
      } );


      const planeGeo = new THREE.PlaneGeometry( 64, 64 )
      var planeObj = new THREE.Object3D()
      const geometries = []
    
      for ( var i = 0; i < 8000; i++ ) {
    
        planeObj.position.x = Math.random() * 8000 - 500;
        planeObj.position.y = - Math.random() * Math.random() * 300 - 15;
        planeObj.position.z = i;
        planeObj.rotation.z = Math.random() * Math.PI;
        planeObj.rotation.x = -1.8;
        planeObj.scale.x = planeObj.scale.y = Math.random() * Math.random() * 10 + 0.5;
        planeObj.updateMatrix()
        
        const clonedPlaneGeo = planeGeo.clone();
        clonedPlaneGeo.applyMatrix4(planeObj.matrix);
    
        geometries.push(clonedPlaneGeo)
    
      }
      
      const planeGeos = BufferGeometryUtils.mergeGeometries(geometries)
      const planesMesh = new THREE.Mesh(planeGeos, CloudMaterial)
      planesMesh.renderOrder = 2
      
      planesMeshA = planesMesh.clone();

      //planesMeshA.rotation.x = .1;
      
      planesMeshA.position.z = -4000;
      planesMeshA.position.x = -2000;
      planesMeshA.position.y = 400;


    //   planesMesh.position.z = -4000;
    //   planesMesh.position.x = -2000;
    //   planesMesh.position.y = 300;

      planesMeshA.renderOrder = 1

      
      //scene.add( planesMesh );
      scene.add( planesMeshA );

      const axesHelper = new THREE.AxesHelper( 5000 );
        //scene.add( axesHelper );
    });
      


        // Add OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.autoRotate = false;
    controls.autoRotateSpeed = 10;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableRotate = false;
    controls.enableDamping = true; // Smooth damping effect
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1; // Minimum zoom distance
    controls.maxDistance = 5000; // Maximum zoom distance
    controls.maxPolarAngle = Math.PI / 2; // Limit vertical rotation to horizon


    //HDRI Loader
    const HDRURL = dev? 'textures/equirectangular/sky.hdr' : 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/textures/equirectangular/sky.hdr'
    new RGBELoader().load( HDRURL, function ( texture ) {

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
            roughness: 0.8,
            metalness: 0.2
        });
        PhasingMats.push(phaseMat);
    }
    
    //path
    const points = [new Vector3(-91.31397341831075, 500, -806.5606133954795),
        new Vector3(-124.96847121756495, 149.62598767485653, -492.4503208179119),
        new Vector3(-58.98197834822154, 111.04870404530332, -271.29202456297173),
        new Vector3(-112.36151992286854, 34.59938306184129, -168.59959839408194),
        new Vector3(-163.1728876749247, 6.187934658870702, -98.61409495498195),
        new Vector3(-151.14042420369032, 2.332787826021395, -21.274821562941852),
        //new Vector3(-64.49169292296621, -0.41024873091703284, 56.14474189000002)
    ];
        
      
      camPath = new CatmullRomCurve3(points, false);
      
      const pathGeometry = new BufferGeometry().setFromPoints(
        camPath.getPoints(50)
      );
      const pathMaterial = new LineBasicMaterial({ color: 0xff0000 });
      const pathObject = new Line(pathGeometry, pathMaterial);
      //scene.add(pathObject);


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
                        //const waterGeometry = new PlaneGeometry( 1000,1000 );
                        const waterGeometry = new CircleGeometry( 400, 32 );
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
                        water.visible = false;
                    }
                    else{
                        child.castShadow = true;
                    }
                   //const albedoMap = child.material.map || null;

                   //child.material = new THREE.MeshToonMaterial({
                    //map: albedoMap,
                   //});
                }

                // new TWEEN.Tween(CustomMaterial.uniforms.uTime)
                // .to( {value: 10.0} , 12000)
                // .yoyo(false)
                // .repeat(0)
                // .easing(TWEEN.Easing.Cubic.InOut)
                // .onUpdate(function (time) {
                //     if(time.value >= 7){
                //         renderer.shadowMap.enabled = true;
                //     }
                //     controls.autoRotateSpeed = 12-(time.value/12*10);
                //   })
                //   .onComplete(function () {
                             
                //   })
                //   .start(); 
            });
        },
        function (xhr) {
           // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
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
    camera.position.set(-90, 500, -800);

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        if(planesMeshA){
            planesMeshA.rotation.y += 0.00004
        }
            
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

    let scrollTickCounter = 0;
    let scrollCounter = 0;
    let scrollStep = 0.0, scrollPercent = 0.0;
    let phases = new Array(10).fill(0);



    let typedText =  ['create a village surrounded by mountains and a lake in the middle. The village has a dock, cottages, trees & cattle. \n\nlow-poly game world style'];
    const typing = new AutoTyping('#dummy-text', typedText, {
        keepText: true,
        typeSpeed: 50,
        onComplete: () => {
            animatingText = false;            
        }
    });

    //elements animating on scroll
    // Configuration
    const STAGE_MULTIPLIER = 5; // Each stage triggers every 25% scroll
    const MAX_SCROLL = 100;

    // Get all elements with 'aos' class
    const aosElements = document.getElementsByClassName('aos');
    const elements = Array.from(aosElements).map(element => {
        // Get all data-AnimStage-* attributes
        const stages:any = {};
        for (const attr of element.attributes) {
        if (attr.name.startsWith('data-animstage-')) {
            const stageNum = parseInt(attr.name.replace('data-animstage-', ''));
            const triggerAt = stageNum * STAGE_MULTIPLIER;
            stages[triggerAt] = attr.value;
        }
        }
        
        // Convert to sorted array
        const animations:any = Object.entries(stages)
        .sort((a:any, b:any) => a[0] - b[0])
        .map(([triggerAt, classes]) => ({
            triggerAt: parseInt(triggerAt),
            classes
        }));

        return {
        element,
        animations,
        currentStage: -1
        };
    });

    let currentScroll = 0;

    // Array.from(aosElements).forEach(e => {
    //     let item = {
    //         "element":e, 
    //         "triggerAt":Number(e.getAttribute("data-animate-at"))*5,
    //         shown:false,
    //         showClasses: e.getAttribute("data-show-classes")?.split(' '),
    //         hideClasses: e.getAttribute("data-hide-classes")?.split(' ')
    //     }
    //     aosItems.push(item);
    // });

    // Clamp number between two values with the following line:
    const clamp = (num:number, min:number, max:number) => Math.min(Math.max(num, min), max)
    addEventListener("wheel", (event) => {

        // Prevent default scrolling
        //event.preventDefault();
        
      // Process each element's animations
      // Update scroll position (0-MAX_SCROLL)
      const scrollDelta = event.deltaY * 0.01;
      currentScroll = Math.max(0, Math.min(MAX_SCROLL, currentScroll + scrollDelta));


      if(animatingText && currentScroll>10){
        //console.log(currentScroll,newStage,item.currentStage)
        console.log('finish')
        typing.finish();
        animatingText = false;
    }

      //console.log(currentScroll)
      // Process each element's animations
      if(!cameraAnimated){
          elements.forEach(item => {
            const { element, animations } = item;
            let newStage = -1;
            
            // Determine current stage based on scroll position
            for (let i = animations.length - 1; i >= 0; i--) {
              if (currentScroll >= animations[i].triggerAt) {
                newStage = i;
                break;
              }
            }
            
            // Only update if stage changed
            console.log(currentScroll,newStage,item.currentStage)
            if (newStage !== item.currentStage) {
                if(newStage == 0 && item.element.id == "dummy-promptbox"){
                    //console.log("change-1")
                    //console.log(currentScroll,newStage,item.currentStage)
                    typing.stop(true);
                    typing.start();
                    animatingText = true;
                }
                if(newStage == 1 && item.element.id == "dummy-promptbox"){
                    scrollCounter=1500;
                    if(!cameraAnimated)
                    tweenCameraAuto();
                }
              // First remove all animation classes from previous stages
              animations.forEach((anim:any) => {
                anim.classes.split(' ').forEach((className:any) => {
                  element.classList.remove(className);
                });
              });
    
              // Then add classes up to current stage
              for (let i = 0; i <= newStage; i++) {
                animations[i].classes.split(' ').forEach((className:any) => {
                  element.classList.add(className);
                });
              }
    
              item.currentStage = newStage;
            }
          });
      }




        scrollCounter += event.deltaY;
        scrollStep = scrollCounter/400;
        scrollPercent = scrollStep/20; //clamp(scrollStep/20,0,1.0);
        console.log('counter, step , percent = ', scrollCounter, scrollStep, scrollPercent);
        //phase-1 

        // if((scrollStep > 3.5) && (phases[0]!=1) ){
        //     phases[0] = 1;
        //     tweenTimeTo(1,2000);
        // }
        // //phase-2
        // if((scrollStep > 5.5) && (phases[1]!=1) ){
        //     phases[1] = 1;
        //     tweenTimeTo(2,2000);
        // }
        // //phase-3
        // if((scrollStep > 8) && (phases[2]!=1) ){
        //     phases[2] = 1;
        //     tweenTimeTo(3,2000);
        //     //remove clouds
        //     planesMeshA.geometry.dispose();
        //     planesMeshA.material.dispose();
        //     scene.remove( planesMeshA );
            
        // }
        // //phase-4
        // if((scrollStep > 9) && (phases[3]!=1) ){
        //     phases[3] = 1;
        //     tweenTimeTo(4,2000);
        //     water.visible=true;
        // }
        // //phase-5
        // if((scrollStep > 10) && (phases[4]!=1) ){
        //     phases[4] = 1;
        //     tweenTimeTo(5,2000);
        // }
        // //phase-6
        // if((scrollStep > 11) && (phases[5]!=1) ){
        //     phases[5] = 1;
        //     tweenTimeTo(6,2000);
        // }
        // //phase-7
        // if((scrollStep > 13) && (phases[6]!=1) ){
        //     phases[6] = 1;
        //     tweenTimeTo(7,2000);
        // }
        // //phase-8
        // if((scrollStep > 14) && (phases[7]!=1) ){
        //     phases[7] = 1;
        //     tweenTimeTo(8,2000);
        // }
        // //phase-9
        // if((scrollStep > 15) && (phases[8]!=1) ){
        //     phases[8] = 1;
        //     tweenTimeTo(9,2000);
        // }
        // //phase-10
        // if((scrollStep > 16) && (phases[9]!=1) ){
        //     phases[9] = 1;
        //     tweenTimeTo(10,2000);
            

        //     document.getElementById('scroll-indicator').style.visibility = "hidden";
        // }
        if(scrollPercent<=1.0 && scrollPercent>=0.25 && !controls.enableZoom){
            console.log('tweening camera')
            //tweenCameraTo(camPath.getPointAt(scrollPercent), 2000)
        }
    });

    //Touch support for mobile
    let touchStartY = 0;
    window.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    });
    window.addEventListener('touchmove', (e) => {
        const touchY = e.touches[0].clientY;
        const deltaY = touchStartY - touchY; // Inverted for natural scrolling
        window.dispatchEvent(new WheelEvent('wheel', { deltaY }));
        e.preventDefault();
    }, { passive: false });

    function tweenTimeTo(targetTime:number, duration:number){
        new TWEEN.Tween(CustomMaterial.uniforms.uTime)
        .to( {value: targetTime} , duration)
        .yoyo(false)
        .repeat(0)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(function (time:any) {
            if(time.value == 7){
                
            }
            //controls.autoRotateSpeed = 12-(time.value/12*10);
          })
          .onComplete(function () {      
          })
          .start();
    }
    function tweenCameraTo(targetPos:Vector3, duration:number){
        new TWEEN.Tween(camera.position)
        .to( {x:targetPos.x, y:targetPos.y, z:targetPos.z} , duration)
        .yoyo(false)
        .repeat(0)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate(function (pos) {
            //controls.autoRotateSpeed = 12-(time.value/12*10);
          })
          .onComplete(function () {           
          })
          .start();
    }

    function tweenCameraAuto(){
        document.getElementById('scroll-indicator').style.visibility = "hidden";
        let t = {camTime: 0.0}
        new TWEEN.Tween(t)
        .to( {camTime: 1.0} , 10000)
        .yoyo(false)
        .repeat(0)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onStart(()=>{
            cameraAnimated = true;
        })
        .onUpdate(function (t) {
            //controls.autoRotateSpeed = 12-(time.value/12*10);
            //console.log(t);
            //console.log(camPath.getPointAt(Number(t.camTime)))
            let time = Number(t.camTime);

            CloudMaterial.uniforms.opacity.value -= time/10;
            let pos = camPath.getPointAt(time)
            //console.log(pos)
            camera.position.copy(pos);

            if((time > 0.0) && (phases[0]!=1) ){
                phases[0] = 1;
                tweenTimeTo(1,2000);
            }
            //phase-2
            if((time > 0.1) && (phases[1]!=1) ){
                phases[1] = 1;
                tweenTimeTo(2,2000);
            }
            //phase-3
            if((time > 0.2) && (phases[2]!=1) ){
                phases[2] = 1;
                tweenTimeTo(3,2000);
                
                
            }
            //phase-4
            if((time > 0.3) && (phases[3]!=1) ){
                phases[3] = 1;
                tweenTimeTo(4,2000);
                water.visible=true;
            }
            //phase-5
            if((time > 0.4) && (phases[4]!=1) ){
                phases[4] = 1;
                tweenTimeTo(5,2000);

                //remove clouds
                planesMeshA.geometry.dispose();
                planesMeshA.material.dispose();
                scene.remove( planesMeshA );
            }
            //phase-6
            if((time > 0.5) && (phases[5]!=1) ){
                phases[5] = 1;
                tweenTimeTo(6,2000);
            }
            //phase-7
            if((time > 0.6) && (phases[6]!=1) ){
                phases[6] = 1;
                tweenTimeTo(7,2000);
            }
            //phase-8
            if((time > 0.7) && (phases[7]!=1) ){
                phases[7] = 1;
                tweenTimeTo(8,2000);
            }
            //phase-9
            if((time > 0.8) && (phases[8]!=1) ){
                phases[8] = 1;
                tweenTimeTo(9,2000);
            }
            //phase-10
            if((time > 0.9) && (phases[9]!=1) ){
                phases[9] = 1;
                tweenTimeTo(10,2000);
            }
          })
          .onComplete(function () {                
            controls.enablePan = true;
            controls.enableZoom = true;
            controls.enableRotate = true;     
            renderer.shadowMap.enabled = true;   
            document.getElementById('waitlist-container').classList.remove('collapse')
          })
          .start();
    }
}



  