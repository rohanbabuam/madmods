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
camera.position.set(0, 30, 50); // Adjusted camera position

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent looking below ground
controls.minDistance = 5;
controls.maxDistance = 150;


// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Soft white light
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(10, 20, 5);
scene.add(directionalLight);

// --- Materials (Solid Colors) ---
const concreteMaterial = new THREE.MeshBasicMaterial({ color: 0x8c8c8c }); // Light grey concrete
const darkConcreteMaterial = new THREE.MeshBasicMaterial({ color: 0x6a6a6a }); // Darker grey
const metalMaterial = new THREE.MeshBasicMaterial({ color: 0xa0a0a0 }); // Metal grey
const darkMetalMaterial = new THREE.MeshBasicMaterial({ color: 0x505050 }); // Darker Metal
const woodMaterial = new THREE.MeshBasicMaterial({ color: 0x8b4513 }); // Brown wood
const greenMaterial = new THREE.MeshBasicMaterial({ color: 0x228B22 }); // Forest green
const redRampMaterial = new THREE.MeshBasicMaterial({ color: 0xcc4444 });
const blueRampMaterial = new THREE.MeshBasicMaterial({ color: 0x4444cc });


// --- Helper Functions for Prop Creation ---

// Creates a simple quarter pipe using an angled box and a top deck box
function createQuarterPipe(width, height, depth, position, rotationY = 0, material = concreteMaterial, deckMaterial = darkConcreteMaterial) {
    const group = new THREE.Group();

    const rampHeight = height * 0.9; // Height of the sloped part
    const deckDepth = depth * 0.3; // Depth of the top deck
    const rampDepth = depth - deckDepth; // Depth of the slope itself

    // Ramp Slope (approximated with a wedge/angled box)
    // We use a box and rotate it. Calculate angle needed.
    const angle = Math.atan2(rampHeight, rampDepth);
    const slopeLength = Math.sqrt(rampHeight*rampHeight + rampDepth*rampDepth);

    const slopeGeo = new THREE.BoxGeometry(width, slopeLength, 1); // Thickness is 1 for example
    const slopeMesh = new THREE.Mesh(slopeGeo, material);
    slopeMesh.rotation.x = -angle;
    // Position the slope so its back top edge is at (0, rampHeight, -rampDepth/2) relative to group center
    slopeMesh.position.set(0, rampHeight / 2, -deckDepth/2 - rampDepth / 2 );
     slopeMesh.position.y -= (slopeLength/2 - slopeLength/2 * Math.cos(angle)); // Adjust vertical position due to rotation
     slopeMesh.position.z += (slopeLength/2 * Math.sin(angle)); // Adjust depth position due to rotation


    // Top Deck
    const deckGeo = new THREE.BoxGeometry(width, 0.5, deckDepth); // Deck is flat
    const deckMesh = new THREE.Mesh(deckGeo, deckMaterial);
    // Position deck at the top back
    deckMesh.position.set(0, rampHeight - 0.25 , -rampDepth ); // y slightly lower than rampHeight
    group.add(deckMesh);

    // Side Walls (optional, for looks) - thin boxes
    const wallGeo = new THREE.BoxGeometry(0.5, height, depth);
    const leftWall = new THREE.Mesh(wallGeo, darkConcreteMaterial);
    leftWall.position.set(-width/2 + 0.25, height/2, -depth/2);
    group.add(leftWall);
    const rightWall = new THREE.Mesh(wallGeo, darkConcreteMaterial);
    rightWall.position.set(width/2 - 0.25, height/2, -depth/2);
    group.add(rightWall);


    // --- Angled Box Approximation ---
    // A simpler approach using one rotated box for the slope + deck box
    group.remove(slopeMesh); // Remove the previous attempt if it was added

    const simplerSlopeGeo = new THREE.BoxGeometry(width, rampHeight, rampDepth);
    const simplerSlopeMesh = new THREE.Mesh(simplerSlopeGeo, material);

    // Position it so the back edge is where the deck starts
    simplerSlopeMesh.position.set(0, rampHeight / 2, -deckDepth - rampDepth/2);

    // We need to rotate around the *bottom back edge*
    // Translate so the pivot is at origin, rotate, translate back
    const pivot = new THREE.Vector3(0, 0, -deckDepth - rampDepth); // Bottom back edge center Z
    simplerSlopeMesh.position.sub(pivot); // Translate to origin based on pivot
    simplerSlopeMesh.rotation.x = Math.PI / 4; // Example rotation (adjust angle as needed) - Let's try 30 deg = PI/6
    simplerSlopeMesh.rotation.x = Math.PI / 5; // ~36 degrees looks better for a ramp
    simplerSlopeMesh.position.add(pivot); // Translate back

     // Adjust Y pos after rotation (this is tricky without proper pivot rotation)
    // simplerSlopeMesh.position.y -= rampDepth * Math.sin(simplerSlopeMesh.rotation.x) / 2 ; // Rough adjustment

    // Reposition Deck based on the new slope position (needs careful calc)
    // Let's skip precise alignment for this example and place it visually
    deckMesh.position.set(0, rampHeight - 0.25 , -rampDepth - deckDepth / 2); // Position deck behind slope box


    // --- Using a slanted Box Directly (Best Primitive Approach) ---
    // Create a box, shear it? No shear in BoxGeometry.
    // Build custom geometry? No, stick to primitives.
    // **Final Primitive Approach: Use a rotated box for the slope, another for the deck.** This seems the most viable. Recalculating placement:

    group.remove(simplerSlopeMesh); // Remove previous
    group.remove(deckMesh); // Remove previous deck

    const slopeHeight = height; // Use full height for simplicity now
    const slopeAngle = Math.PI / 4.5; // Angle of the ramp face (adjust for steepness)
    const slopeHypotenuse = slopeHeight / Math.sin(slopeAngle); // Length of the ramp face
    const slopeBase = slopeHeight / Math.tan(slopeAngle); // How far it extends horizontally

    const finalSlopeGeo = new THREE.BoxGeometry(width, 0.5, slopeHypotenuse); // Thin sloping surface
    const finalSlopeMesh = new THREE.Mesh(finalSlopeGeo, material);
    finalSlopeMesh.rotation.x = slopeAngle - Math.PI / 2; // Rotate to make it a ramp
    // Position it: center x=0, center y = height/2, center z needs calculation
    finalSlopeMesh.position.set(0, slopeHeight / 2, -slopeBase / 2);
    group.add(finalSlopeMesh);

    // Final Deck
    const finalDeckGeo = new THREE.BoxGeometry(width, 0.5, deckDepth);
    const finalDeckMesh = new THREE.Mesh(finalDeckGeo, deckMaterial);
    finalDeckMesh.position.set(0, height - 0.25, -slopeBase - deckDepth / 2);
    group.add(finalDeckMesh);

    // Re-add side walls adjusted
     group.remove(leftWall, rightWall) // Remove old ones
     const finalWallGeo = new THREE.BoxGeometry(0.5, height, slopeBase + deckDepth);
     const finalLeftWall = new THREE.Mesh(finalWallGeo, darkConcreteMaterial);
     finalLeftWall.position.set(-width/2 + 0.25, height/2, -(slopeBase + deckDepth)/2);
     group.add(finalLeftWall);
     const finalRightWall = new THREE.Mesh(finalWallGeo, darkConcreteMaterial);
     finalRightWall.position.set(width/2 - 0.25, height/2, -(slopeBase + deckDepth)/2);
     group.add(finalRightWall);


    // Apply final transformations
    group.position.copy(position);
    group.rotation.y = rotationY;
    scene.add(group);
    return group;
}


function createGrindLedge(width, height, depth, position, rotationY = 0, material = darkConcreteMaterial) {
    const ledgeGeo = new THREE.BoxGeometry(width, height, depth);
    const ledgeMesh = new THREE.Mesh(ledgeGeo, material);
    ledgeMesh.position.copy(position);
    ledgeMesh.position.y += height / 2; // Place it on top of the ground
    ledgeMesh.rotation.y = rotationY;
    scene.add(ledgeMesh);
    return ledgeMesh;
}

function createHandrail(length, radius, height, position, rotationY = 0, material = metalMaterial) {
    const group = new THREE.Group();

    // Rail
    const railGeo = new THREE.CylinderGeometry(radius, radius, length, 12);
    const railMesh = new THREE.Mesh(railGeo, material);
    railMesh.rotation.z = Math.PI / 2; // Make it horizontal
    railMesh.position.y = height;
    group.add(railMesh);

    // Support Posts (simple boxes)
    const postHeight = height - radius;
    const postGeo = new THREE.BoxGeometry(radius * 1.5, postHeight, radius * 1.5);
    const numPosts = Math.max(2, Math.floor(length / 4) + 1); // At least 2 posts, more for longer rails

    for (let i = 0; i < numPosts; i++) {
        const post = new THREE.Mesh(postGeo, darkMetalMaterial);
        let postX = -length / 2 + (i / (numPosts - 1)) * length;
         if (numPosts === 1) {
             postX = 0; // Center if only one post (unlikely for rail)
         }

        post.position.set(postX, postHeight / 2, 0);
        group.add(post);
    }

    group.position.copy(position);
    group.rotation.y = rotationY;
    scene.add(group);
    return group;
}

function createBank(width, length, height, position, rotationY = 0, material = concreteMaterial) {
     // Similar to quarter pipe slope, but simpler - just one angled box
    const angle = Math.atan2(height, length);
    const slopeHypotenuse = Math.sqrt(height*height + length*length);

    const bankGeo = new THREE.BoxGeometry(width, 0.5, slopeHypotenuse); // Thin slope surface
    const bankMesh = new THREE.Mesh(bankGeo, material);

    bankMesh.rotation.x = angle - Math.PI / 2;
    // Position based on center of the hypotenuse
    bankMesh.position.set(position.x, position.y + height / 2, position.z + length / 2);
    bankMesh.rotation.y = rotationY;

    scene.add(bankMesh);
    return bankMesh;
}

 function createStairs(stepCount, stepWidth, stepHeight, stepDepth, position, rotationY = 0, material = darkConcreteMaterial) {
    const group = new THREE.Group();
    const totalHeight = stepCount * stepHeight;
    const totalDepth = stepCount * stepDepth;

    for (let i = 0; i < stepCount; i++) {
        const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
        const stepMesh = new THREE.Mesh(stepGeo, material);

        // Position each step higher and further back than the last
        const yPos = stepHeight / 2 + i * stepHeight;
        const zPos = totalDepth / 2 - stepDepth / 2 - i * stepDepth;

        stepMesh.position.set(0, yPos, zPos);
        group.add(stepMesh);
    }

    group.position.copy(position);
    // Adjust group position so the base is at y=0 and front is at z=0 relative to the input position
     group.position.y += position.y; // Already handled by input pos? No, adjust based on calc height
     group.position.z += position.z - totalDepth / 2; // Move forward to align front


    group.rotation.y = rotationY;
    scene.add(group);
    return group;
}

function createFunbox(position, rotationY = 0) {
    const group = new THREE.Group();

    const boxWidth = 15;
    const boxDepth = 8;
    const boxHeight = 3;
    const bankLength = 8;
    const bankHeight = boxHeight;

    // Central Platform
    const platformGeo = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
    const platformMesh = new THREE.Mesh(platformGeo, blueRampMaterial);
    platformMesh.position.y = boxHeight / 2;
    group.add(platformMesh);

    // Two Banks on the sides
    const bankGeo = new THREE.BoxGeometry(boxWidth, 0.5, Math.sqrt(bankHeight*bankHeight + bankLength*bankLength));
    const bankMat = blueRampMaterial; // Or concreteMaterial

    // Bank 1 (Positive Z)
    const bank1 = new THREE.Mesh(bankGeo, bankMat);
    const angle1 = Math.atan2(bankHeight, bankLength);
    bank1.rotation.x = angle1 - Math.PI / 2;
    bank1.position.set(0, bankHeight / 2, boxDepth / 2 + bankLength / 2);
    group.add(bank1);

     // Bank 2 (Negative Z)
    const bank2 = new THREE.Mesh(bankGeo, bankMat);
    const angle2 = Math.atan2(bankHeight, bankLength);
    bank2.rotation.x = -(angle2 - Math.PI / 2); // Opposite angle
    bank2.position.set(0, bankHeight / 2, -(boxDepth / 2 + bankLength / 2));
    group.add(bank2);

     // Add a small ledge on top
    const ledge = createGrindLedge(boxWidth * 0.6, 0.5, 1, new THREE.Vector3(0, boxHeight + 0.25, 0), 0, metalMaterial);
    group.add(ledge); // Add the mesh, not the function result if it adds to scene

    group.position.copy(position);
    group.rotation.y = rotationY;
    scene.add(group);
    return group;
}

function createFence(length, height, position, rotationY = 0) {
    const group = new THREE.Group();
    const postRadius = 0.15;
    const postHeight = height;
    const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8);
    const railGeo = new THREE.CylinderGeometry(postRadius * 0.6, postRadius * 0.6, length, 8);
    const panelThickness = 0.1;
    // Simple panel approx - chain link is too complex for primitives
    const panelGeo = new THREE.BoxGeometry(length, height - postRadius*2, panelThickness );
    const panelMat = new THREE.MeshBasicMaterial({ color: 0x606060, transparent: true, opacity: 0.5 }); // Semi-transparent grey

    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    panelMesh.position.y = height / 2;
    group.add(panelMesh);

    // Add posts at ends
    const postMat = darkMetalMaterial;
    const post1 = new THREE.Mesh(postGeo, postMat);
    post1.position.set(-length/2, height/2, 0);
    group.add(post1);
    const post2 = new THREE.Mesh(postGeo, postMat);
    post2.position.set(length/2, height/2, 0);
    group.add(post2);

    // Optional Top Rail
    const topRail = new THREE.Mesh(railGeo, postMat);
    topRail.rotation.z = Math.PI/2;
    topRail.position.y = height - postRadius;
    group.add(topRail);


    group.position.copy(position);
    group.rotation.y = rotationY;
    scene.add(group);
    return group;
}

function createBench(position, rotationY = 0) {
    const group = new THREE.Group();
    const seatHeight = 1.5;
    const seatWidth = 6;
    const seatDepth = 1.5;
    const legSize = 0.3;
    const backHeight = 1.8;

    // Seat
    const seatGeo = new THREE.BoxGeometry(seatWidth, 0.3, seatDepth);
    const seatMesh = new THREE.Mesh(seatGeo, woodMaterial);
    seatMesh.position.y = seatHeight;
    group.add(seatMesh);

    // Legs (simple boxes)
    const legGeo = new THREE.BoxGeometry(legSize, seatHeight, legSize);
    const legMat = darkMetalMaterial;
    const leg1 = new THREE.Mesh(legGeo, legMat);
    leg1.position.set(-seatWidth/2 + seatDepth/2, seatHeight/2, -seatDepth/2 + legSize/2);
    group.add(leg1);
    const leg2 = new THREE.Mesh(legGeo, legMat);
    leg2.position.set(seatWidth/2 - seatDepth/2, seatHeight/2, -seatDepth/2 + legSize/2);
    group.add(leg2);
     const leg3 = new THREE.Mesh(legGeo, legMat);
    leg3.position.set(-seatWidth/2 + seatDepth/2, seatHeight/2, seatDepth/2 - legSize/2);
    group.add(leg3);
     const leg4 = new THREE.Mesh(legGeo, legMat);
    leg4.position.set(seatWidth/2 - seatDepth/2, seatHeight/2, seatDepth/2 - legSize/2);
    group.add(leg4);

    // Back Rest (optional)
    const backGeo = new THREE.BoxGeometry(seatWidth, backHeight, 0.3);
     const backMesh = new THREE.Mesh(backGeo, woodMaterial);
     backMesh.position.set(0, seatHeight + backHeight/2, -seatDepth/2 + 0.15); // Position behind seat
     backMesh.rotation.x = Math.PI / 12; // Slight tilt
     group.add(backMesh);


    group.position.copy(position);
    group.rotation.y = rotationY;
    scene.add(group);
    return group;
}

function createSimpleTree(position, trunkHeight = 5, foliageRadius = 3) {
    const group = new THREE.Group();

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, trunkHeight, 8);
    const trunkMesh = new THREE.Mesh(trunkGeo, woodMaterial);
    trunkMesh.position.y = trunkHeight / 2;
    group.add(trunkMesh);

    // Foliage (Sphere)
    const foliageGeo = new THREE.SphereGeometry(foliageRadius, 8, 6);
    const foliageMesh = new THREE.Mesh(foliageGeo, greenMaterial);
    foliageMesh.position.y = trunkHeight + foliageRadius * 0.8; // Slightly overlap trunk
    group.add(foliageMesh);

    group.position.copy(position);
    scene.add(group);
    return group;
}


// --- Ground ---
const groundGeo = new THREE.PlaneGeometry(150, 150); // Large ground plane
const groundMesh = new THREE.Mesh(groundGeo, concreteMaterial);
groundMesh.rotation.x = -Math.PI / 2; // Rotate flat
groundMesh.position.y = 0; // At the base level
scene.add(groundMesh);

// --- Populate the Park ---

// Quarter Pipes (Example Placement)
createQuarterPipe(15, 6, 10, new THREE.Vector3(-25, 0, -20), 0, redRampMaterial);
createQuarterPipe(15, 6, 10, new THREE.Vector3(25, 0, -20), 0, redRampMaterial); // Pair for a wide halfpipe feel

// Smaller Quarter Pipe on side
 createQuarterPipe(8, 4, 6, new THREE.Vector3(-35, 0, 10), Math.PI / 2, blueRampMaterial); // Rotated 90 deg


// Funbox in the middle
createFunbox(new THREE.Vector3(0, 0, 10), 0);

// Grind Ledges
createGrindLedge(10, 1.5, 2, new THREE.Vector3(15, 0, 25));
createGrindLedge(8, 1, 1.5, new THREE.Vector3(-15, 0, 30), Math.PI / 6); // Angled slightly

 // Manual Pad
createGrindLedge(12, 0.5, 5, new THREE.Vector3(0, 0, -5), 0, darkConcreteMaterial); // Low and wide


// Stairs and Handrail
const stairPos = new THREE.Vector3(30, 0, 15);
const stairs = createStairs(5, 8, 0.6, 1.2, stairPos);
// Calculate rail position based on stairs
const railHeight = 3.0;
const stairDepth = 5 * 1.2;
const stairHeight = 5 * 0.6;
const railLength = Math.sqrt(stairDepth*stairDepth + stairHeight*stairHeight) * 1.1; // Slightly longer than slope
const railAngleY = Math.atan2(stairHeight, stairDepth); // Angle relative to ground
// Position rail beside stairs - needs careful adjustment based on stair geometry center
createHandrail(railLength, 0.2, railHeight, new THREE.Vector3(stairPos.x - 4.5, stairPos.y, stairPos.z + stairDepth/2 ), 0);
// This handrail needs rotation on X or Z to match stair slope - more complex setup


// Basic Bank Ramp
createBank(10, 12, 4, new THREE.Vector3(-30, 0, 30));


// Decorative Elements
createBench(new THREE.Vector3(-20, 0, 45));
createBench(new THREE.Vector3(20, 0, 45), Math.PI); // Facing other way

createSimpleTree(new THREE.Vector3(-40, 0, -40));
createSimpleTree(new THREE.Vector3(40, 0, -40));
createSimpleTree(new THREE.Vector3(-45, 0, 0));
createSimpleTree(new THREE.Vector3(45, 0, 0));

// Perimeter Fence (Example Section)
 createFence(50, 4, new THREE.Vector3(0, 0, 55)); // Back fence
 createFence(60, 4, new THREE.Vector3(-50, 0, 25), Math.PI/2); // Left fence (adjust length/pos)
 createFence(60, 4, new THREE.Vector3(50, 0, 25), -Math.PI/2); // Right fence


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Only required if controls.enableDamping = true, or if controls.autoRotate = true
    renderer.render(scene, camera);
}

// --- Handle Window Resize ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

// --- Start Animation ---
animate();

}