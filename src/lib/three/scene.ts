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
    WebGLRenderer
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { Water } from 'three/addons/objects/Water2.js';
import("three-mesh-bvh");
  
// let scene:Scene, camera:PerspectiveCamera, renderer:WebGLRenderer;
// let cube:Mesh;
  
//   const animate = () => {
//       requestAnimationFrame(animate);
//       cube.rotation.x += 0.01;
//       cube.rotation.y += 0.01;
//       renderer.render(scene, camera);
//   };
  
//   const resize = () => {
//       renderer.setSize(window.innerWidth, window.innerHeight);
//       camera.aspect = window.innerWidth / window.innerHeight;
//       camera.updateProjectionMatrix();
//   };
  
//   export const createScene = (el:HTMLCanvasElement) => {
//     scene = new Scene();
  
//     camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
//     camera.position.z = 5;
    
//     const geometry = new BoxGeometry();
    
//     const material = new MeshStandardMaterial({
//         color: 0x00ff00,
//         metalness: 0.13
//     });
    
//     cube = new Mesh(geometry, material);
//     scene.add(cube);
    
//     const directionalLight = new DirectionalLight(0x9090aa);
//     directionalLight.position.set(-10, 10, -10).normalize();
//     scene.add(directionalLight);
    
//     const hemisphereLight = new HemisphereLight(0xffffff, 0x444444);
//     hemisphereLight.position.set(1, 1, 1);
//     scene.add(hemisphereLight);
    
//     renderer = new WebGLRenderer({ antialias: true, canvas: el });
//     resize();
//     animate();
//   };
  //CONFIG
  let dev: boolean;

  export const init = async() => {
    if (window.location.port === "") {
        dev = false;
    } else {
        dev = true;
    }

    let water;
    // Scene setup
    const scene = new Scene();
    const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

        // Add OrbitControls
        const controls = new OrbitControls(camera, renderer.domElement);
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
            model.traverse((child) => {
                if ((child as Mesh).isMesh) {
                    if(child.name.includes("hill") ||
                       child.name.includes("Road") || 
                       child.name.includes("stones") ||
                       child.name.includes("mountains") || 
                       child.name.includes("rock")){
                        child.receiveShadow = true;
                        child.castShadow = false;
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
    
    
    renderer.shadowMap.enabled = true;
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
    camera.position.set(0, 5, 10);

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        csm.update();
        controls.update(); // Required for damping to work
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
  