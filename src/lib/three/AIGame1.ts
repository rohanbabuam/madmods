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
    const scene = new THREE.Scene();
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    
    // Controls (for debugging, will be replaced with plane controls)
    // const controls = new OrbitControls(camera, renderer.domElement);
    // controls.enableDamping = true;
    // controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x3a5f0b,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create simple trees
    const createTree = (x:any, z:any) => {
        // Trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.3, 2, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(x, 1, z);
        trunk.castShadow = true;
        scene.add(trunk);
        
        // Leaves
        const leavesGeometry = new THREE.ConeGeometry(1.5, 3, 8);
        const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.set(x, 3.5, z);
        leaves.castShadow = true;
        scene.add(leaves);
    };

    // Create a forest
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * 80 - 40;
        const z = Math.random() * 80 - 40;
        createTree(x, z);
    }

    // Create simple houses
    const createHouse = (x:any, z:any) => {
        // Base
        const baseGeometry = new THREE.BoxGeometry(3, 2, 3);
        const baseMaterial = new THREE.MeshStandardMaterial({ color: 0xC0C0C0 });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.set(x, 1, z);
        base.castShadow = true;
        scene.add(base);
        
        // Roof
        const roofGeometry = new THREE.ConeGeometry(2.5, 2, 4);
        const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8B0000 });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(x, 3, z);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        scene.add(roof);
    };

    // Create a village
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * 60 - 30;
        const z = Math.random() * 60 - 30;
        createHouse(x, z);
    }

    // Create a simple plane
    const createPlane = () => {
        const group = new THREE.Group();
        
        // Fuselage (longer and more plane-like)
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.1, 4, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4682B4 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.rotation.z = Math.PI / 2; // Rotate to make it horizontal
        body.castShadow = true;
        group.add(body);
        
        // Wings (positioned correctly)
        const wingGeometry = new THREE.BoxGeometry(5, 0.1, 1.5);
        const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x4682B4 });
        const wing = new THREE.Mesh(wingGeometry, wingMaterial);
        wing.position.set(0, 0, 0);
        wing.castShadow = true;
        group.add(wing);
        
        // Tail (smaller and at the back)
        const tailGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.1);
        const tailMaterial = new THREE.MeshStandardMaterial({ color: 0x4682B4 });
        const tail = new THREE.Mesh(tailGeometry, tailMaterial);
        tail.position.set(-1.8, 0.2, 0);
        tail.castShadow = true;
        group.add(tail);
        
        // Vertical stabilizer
        const stabilizerGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.1);
        const stabilizerMaterial = new THREE.MeshStandardMaterial({ color: 0x4682B4 });
        const stabilizer = new THREE.Mesh(stabilizerGeometry, stabilizerMaterial);
        stabilizer.position.set(-1.8, 0.6, 0);
        stabilizer.rotation.z = Math.PI / 2;
        stabilizer.castShadow = true;
        group.add(stabilizer);
        
        // Propeller at the FRONT of the plane
        const propellerGeometry = new THREE.BoxGeometry(0.1, 1.5, 0.05);
        const propellerMaterial = new THREE.MeshStandardMaterial({ color: 0x696969 });
        const propeller = new THREE.Mesh(propellerGeometry, propellerMaterial);
        propeller.position.set(2.2, 0, 0); // Positioned at the front
        group.add(propeller);
        
        group.propeller = propeller;
        
        // Rotate the entire group 180 degrees so it faces the correct direction
        group.rotation.y = Math.PI; // This makes it face forward along Z-axis
        
        return group;
    };

    // Create the plane (same as before)
    const plane = createPlane();
    plane.position.set(0, 5, 0);
    scene.add(plane);

    // Game state (same as before)
    const gameState = {
        speed: 0,
        maxSpeed: 0.2,
        rotationSpeed: 0.02,
        pitch: 0,
        roll: 0,
        yaw: 0,
        keys: {
            up: false,
            down: false,
            left: false,
            right: false,
            throttleUp: false,
            throttleDown: false
        }
    };

    // Handle keyboard input
    const onKeyDown = (event:any) => {
        switch(event.key) {
            case 'ArrowUp': gameState.keys.up = true; break;
            case 'ArrowDown': gameState.keys.down = true; break;
            case 'ArrowLeft': gameState.keys.left = true; break;
            case 'ArrowRight': gameState.keys.right = true; break;
            case 'w': gameState.keys.throttleUp = true; break;
            case 's': gameState.keys.throttleDown = true; break;
        }
    };

    const onKeyUp = (event:any) => {
        switch(event.key) {
            case 'ArrowUp': gameState.keys.up = false; break;
            case 'ArrowDown': gameState.keys.down = false; break;
            case 'ArrowLeft': gameState.keys.left = false; break;
            case 'ArrowRight': gameState.keys.right = false; break;
            case 'w': gameState.keys.throttleUp = false; break;
            case 's': gameState.keys.throttleDown = false; break;
        }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Animation loop
    const animate = () => {
        requestAnimationFrame(animate);
        
        // Update controls
        if (gameState.keys.throttleUp) gameState.speed = Math.min(gameState.speed + 0.001, gameState.maxSpeed);
        if (gameState.keys.throttleDown) gameState.speed = Math.max(gameState.speed - 0.001, 0);
        
        if (gameState.keys.up) gameState.pitch = Math.min(gameState.pitch + gameState.rotationSpeed, Math.PI/4);
        if (gameState.keys.down) gameState.pitch = Math.max(gameState.pitch - gameState.rotationSpeed, -Math.PI/4);
        if (gameState.keys.left) gameState.roll = Math.min(gameState.roll + gameState.rotationSpeed, Math.PI/4);
        if (gameState.keys.right) gameState.roll = Math.max(gameState.roll - gameState.rotationSpeed, -Math.PI/4);
        
        // Apply some auto-leveling
        gameState.pitch *= 0.98;
        gameState.roll *= 0.98;
        
        // Move plane (same as before)
        plane.rotation.x =huyh   gameState.pitch;
        plane.rotation.z = gameState.roll;
        plane.rotation.y += gameState.roll * 0.1; // Yaw from roll


            // Move plane FORWARD (positive Z direction in world space)
    // Since we rotated the plane 180 degrees, forward is now correct
    const forward = new THREE.Vector3(0, 0, 1); // Now using positive Z
    forward.applyQuaternion(plane.quaternion);
    plane.position.add(forward.multiplyScalar(gameState.speed));

    
        
        // const forward = new THREE.Vector3(0, 0, -1);
        // forward.applyQuaternion(plane.quaternion);
        // plane.position.add(forward.multiplyScalar(gameState.speed));
        
        if (plane.position.y < 2) {
            plane.position.y = 2;
            gameState.pitch = Math.max(0, gameState.pitch);
        }
        
        if (plane.propeller) {
            plane.propeller.rotation.x += gameState.speed * 50;
        }
        
        // Improved chase camera logic
        // const cameraOffset = new THREE.Vector3(0, 2, 5); // Behind and above the plane
        // cameraOffset.applyQuaternion(plane.quaternion);
        
        // Calculate desired camera position
        // const desiredPosition = new THREE.Vector3();
        // desiredPosition.copy(plane.position).add(cameraOffset);

            // Chase camera - position it behind the plane (which now faces correct direction)
    const cameraOffset = new THREE.Vector3(0, 2, -5); // Negative Z for behind
    cameraOffset.applyQuaternion(plane.quaternion);
    const desiredPosition = new THREE.Vector3();
    desiredPosition.copy(plane.position).add(cameraOffset);
        
        // Smooth camera movement
        camera.position.lerp(desiredPosition, 0.1);
        
        // Make camera look slightly ahead of the plane for better view
        const lookAtPosition = new THREE.Vector3();
        const lookAtOffset = new THREE.Vector3(0, 0, -10); // Look 10 units ahead
        lookAtOffset.applyQuaternion(plane.quaternion);
        lookAtPosition.copy(plane.position).add(lookAtOffset);
        
        camera.lookAt(lookAtPosition);
        
        renderer.render(scene, camera);
    };

    animate();

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
};