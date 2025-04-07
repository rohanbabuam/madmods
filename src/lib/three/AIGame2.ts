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

export const makeGame = async() => {
    // --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue background

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 10, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadows for more detail
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 15, 10);
directionalLight.castShadow = true;
// Configure shadow properties for better quality
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;
scene.add(directionalLight);
// Optional: Helper to visualize the shadow camera
// const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
// scene.add(shadowHelper);


// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 5, 0); // Target the approximate center of the windmill

// --- Materials ---
const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888, // Grey stone
    roughness: 0.8,
    map: createTexture('#A0A0A0', '#888888'), // Simple procedural texture
});
const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x8B4513, // SaddleBrown wood
    roughness: 0.7,
    map: createTexture('#A0522D', '#8B4513'), // Simple procedural texture
});
const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x696969, // DimGrey roof
    roughness: 0.9,
});
const sailMaterial = new THREE.MeshStandardMaterial({
    color: 0xFFFAF0, // FloralWhite sail cloth
    roughness: 0.9,
    side: THREE.DoubleSide, // Render both sides of the sail planes
});
const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x555555, // Dark grey metal
    roughness: 0.4,
    metalness: 0.5,
});


// --- Helper Function for Simple Procedural Texture ---
function createTexture(color1, color2) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');

    context.fillStyle = color1;
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = color2;
    for (let i = 0; i < 64; i += 4) {
        for (let j = 0; j < 64; j += 4) {
            if ((i + j) % 8 === 0) {
                context.fillRect(i, j, 2, 2);
            }
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4); // Adjust tiling
    return texture;
}


// --- Build the Windmill ---
const windmillGroup = new THREE.Group();
scene.add(windmillGroup);

// 1. Base/Tower
const towerHeight = 12;
const towerRadiusBottom = 3.5;
const towerRadiusTop = 2.5;
const towerGeometry = new THREE.CylinderGeometry(towerRadiusTop, towerRadiusBottom, towerHeight, 16); // 16 segments for roundness
const towerMesh = new THREE.Mesh(towerGeometry, stoneMaterial);
towerMesh.position.y = towerHeight / 2; // Raise base to ground level
towerMesh.castShadow = true;
towerMesh.receiveShadow = true;
windmillGroup.add(towerMesh);

// 2. Platform/Walkway (optional detail)
const platformRadius = towerRadiusTop + 0.5;
const platformHeight = 0.4;
const platformGeometry = new THREE.CylinderGeometry(platformRadius, platformRadius, platformHeight, 16);
const platformMesh = new THREE.Mesh(platformGeometry, woodMaterial);
platformMesh.position.y = towerHeight - platformHeight * 1.5; // Position just below the top
platformMesh.castShadow = true;
platformMesh.receiveShadow = true;
windmillGroup.add(platformMesh);

// Railing for platform
const railingRadius = platformRadius - 0.1;
const railingHeight = 0.8;
const railingPosts = 8;
const postGeometry = new THREE.CylinderGeometry(0.08, 0.08, railingHeight, 6);
for (let i = 0; i < railingPosts; i++) {
    const angle = (i / railingPosts) * Math.PI * 2;
    const post = new THREE.Mesh(postGeometry, woodMaterial);
    post.position.set(
        Math.cos(angle) * railingRadius,
        platformMesh.position.y + platformHeight / 2 + railingHeight / 2,
        Math.sin(angle) * railingRadius
    );
    post.castShadow = true;
    windmillGroup.add(post);
}
// Simple Torus for top rail (approximate) - could also use many small cylinders
const railGeometry = new THREE.TorusGeometry(railingRadius, 0.08, 8, railingPosts * 2);
const railMesh = new THREE.Mesh(railGeometry, woodMaterial);
railMesh.position.y = platformMesh.position.y + platformHeight / 2 + railingHeight;
railMesh.rotation.x = Math.PI / 2; // Rotate torus to be flat
railMesh.castShadow = true;
windmillGroup.add(railMesh);


// 3. Cap (Rotatable Part)
const capGroup = new THREE.Group();
capGroup.position.y = towerHeight; // Place cap on top of the tower
windmillGroup.add(capGroup);

const capBaseHeight = 0.5;
const capBaseRadius = towerRadiusTop + 0.2; // Slightly wider than tower top
const capBaseGeometry = new THREE.CylinderGeometry(capBaseRadius, capBaseRadius, capBaseHeight, 16);
const capBaseMesh = new THREE.Mesh(capBaseGeometry, woodMaterial);
capBaseMesh.position.y = capBaseHeight / 2;
capBaseMesh.castShadow = true;
capBaseMesh.receiveShadow = true;
capGroup.add(capBaseMesh);

const capRoofHeight = 2.5;
const capRoofRadius = capBaseRadius; // Same radius as base
const capRoofGeometry = new THREE.ConeGeometry(capRoofRadius, capRoofHeight, 16);
const capRoofMesh = new THREE.Mesh(capRoofGeometry, roofMaterial);
capRoofMesh.position.y = capBaseHeight + capRoofHeight / 2;
capRoofMesh.castShadow = true;
capRoofMesh.receiveShadow = true;
capGroup.add(capRoofMesh);

// 4. Axle
const axleLength = 2.5;
const axleRadius = 0.3;
const axleGeometry = new THREE.CylinderGeometry(axleRadius, axleRadius, axleLength, 8);
const axleMesh = new THREE.Mesh(axleGeometry, metalMaterial);
axleMesh.rotation.x = Math.PI / 2; // Rotate horizontally
axleMesh.position.y = capBaseHeight + 0.6; // Position vertically within the cap
axleMesh.position.z = axleLength / 2 - 0.5; // Position protruding forward from cap center
axleMesh.castShadow = true;
capGroup.add(axleMesh);

// 5. Blades/Sails (Rotatable Part)
const bladesGroup = new THREE.Group();
bladesGroup.position.z = axleLength - 0.5; // Position at the end of the axle
bladesGroup.position.y = axleMesh.position.y; // Align vertically with axle
capGroup.add(bladesGroup); // Add blades to the cap so they rotate together

const bladeLength = 7;
const bladeWidth = 1.5;
const bladeDepth = 0.1; // Make blades thin boxes
const bladeOffset = axleRadius + 0.5; // How far from center the blade starts

function createBlade() {
    const bladeGroup = new THREE.Group();

    // Main sail part (slightly angled)
    const sailGeometry = new THREE.BoxGeometry(bladeWidth, bladeLength, bladeDepth);
    const sailMesh = new THREE.Mesh(sailGeometry, sailMaterial);
    sailMesh.position.y = bladeLength / 2 + bladeOffset; // Position up from the center
    sailMesh.castShadow = true;
    sailMesh.receiveShadow = true;
    // Give a slight angle/twist
    sailMesh.rotation.z = THREE.MathUtils.degToRad(5);
    bladeGroup.add(sailMesh);

    // Spar (wooden beam)
    const sparLength = bladeLength + bladeOffset;
    const sparGeometry = new THREE.CylinderGeometry(0.1, 0.12, sparLength, 6); // Slightly tapered
    const sparMesh = new THREE.Mesh(sparGeometry, woodMaterial);
    sparMesh.position.y = sparLength / 2; // Position along the blade axis
    sparMesh.castShadow = true;
    bladeGroup.add(sparMesh);

    return bladeGroup;
}

const blade1 = createBlade();
blade1.rotation.z = THREE.MathUtils.degToRad(0);

const blade2 = createBlade();
blade2.rotation.z = THREE.MathUtils.degToRad(90);

const blade3 = createBlade();
blade3.rotation.z = THREE.MathUtils.degToRad(180);

const blade4 = createBlade();
blade4.rotation.z = THREE.MathUtils.degToRad(270);

bladesGroup.add(blade1, blade2, blade3, blade4);

// 6. Door
const doorHeight = 2.5;
const doorWidth = 1.2;
const doorDepth = 0.2;
const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
const doorMesh = new THREE.Mesh(doorGeometry, woodMaterial);
// Position door on the surface of the tower base
doorMesh.position.y = doorHeight / 2;
doorMesh.position.z = towerRadiusBottom - doorDepth / 5; // Push slightly onto the surface
doorMesh.castShadow = true;
windmillGroup.add(doorMesh);

// 7. Windows (optional)
const windowSize = 0.8;
const windowDepth = 0.2;
const windowGeometry = new THREE.BoxGeometry(windowSize, windowSize, windowDepth);
const windowMesh1 = new THREE.Mesh(windowGeometry, woodMaterial);
windowMesh1.position.set(
    towerRadiusTop * 0.8, // Position x on the radius
    towerHeight * 0.6, // Position y up the tower
    towerRadiusTop * 0.6 // Position z on the radius (sqrt(1^2 - 0.8^2)) approx
);
windowMesh1.lookAt(0, windowMesh1.position.y, 0); // Make it face outwards
windowMesh1.castShadow = true;
windmillGroup.add(windowMesh1);

const windowMesh2 = windowMesh1.clone();
windowMesh2.position.set(
    -towerRadiusTop * 0.8, // Position x on the radius
    towerHeight * 0.6, // Position y up the tower
    towerRadiusTop * 0.6 // Position z on the radius (sqrt(1^2 - 0.8^2)) approx
);
windowMesh2.lookAt(0, windowMesh2.position.y, 0); // Make it face outwards
windmillGroup.add(windowMesh2);


// --- Ground Plane ---
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.9 }); // ForestGreen
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.rotation.x = -Math.PI / 2; // Rotate flat
groundMesh.receiveShadow = true; // Allow ground to receive shadows
scene.add(groundMesh);


// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Rotate the blades
    bladesGroup.rotation.z -= 0.5 * delta; // Adjust speed as needed

    // Optionally rotate the cap slowly (e.g., simulating wind direction change)
    // capGroup.rotation.y += 0.05 * delta;

    controls.update(); // Required if damping or auto-rotation is enabled
    renderer.render(scene, camera);
}

// --- Resize Handling ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

// --- Start Animation ---
animate();


    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
};