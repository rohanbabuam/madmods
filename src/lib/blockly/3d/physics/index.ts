import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import { convertShapeBlockToMesh } from "../world";

// Sets overall gravity for the scene
const setGravity = (units: number, scene: BABYLON.Scene) => {
  if (scene.isPhysicsEnabled() && scene.getPhysicsEngine()) {
    // Gravity is set on the physics engine plugin instance
    scene.getPhysicsEngine()?.setGravity(new BABYLON.Vector3(0, 0 - units, 0));
    console.log(`Gravity set to: ${0 - units}`);
  } else {
    console.warn("Attempted to set gravity, but physics is not enabled or engine not available.");
  }
};
// Apply a force to a shape
const applyForce = (shapeBlock: ShapeBlock, axis: string, units: number, scene: BABYLON.Scene) => {
  let mesh = convertShapeBlockToMesh(shapeBlock, scene);
  if (mesh && scene.isPhysicsEnabled()) {
    // Get the physics body associated with the mesh
    const body = mesh.getPhysicsBody(); // V2 Physics API

    if (body) {
      let forceVector = BABYLON.Vector3.Zero();
      // Use a temporary vector to avoid modifying a shared static instance if Vector3.Zero() is static
      if (axis === 'x') forceVector.x = units;
      else if (axis === 'y') forceVector.y = units;
      else if (axis === 'z') forceVector.z = units;

      // Apply force at the center of the mesh
      const scaledForce = forceVector.scale(20); // Adjust multiplier as needed
      body.applyForce(scaledForce, mesh.getAbsolutePosition());
       console.log(`Applied force (${axis}: ${units}) to ${mesh.name}`);
    } else {
      console.warn(`Attempted to apply force to ${mesh.name}, but it has no physics body.`);
    }
  } else {
     if(!mesh) console.warn("ApplyForce: Could not find mesh.");
     if(!scene.isPhysicsEnabled()) console.warn("ApplyForce: Physics not enabled.");
  }
};

// Set the mass of a shape
const setMass = (shapeBlock: ShapeBlock, mass: number, scene: BABYLON.Scene) => {
  let mesh = convertShapeBlockToMesh(shapeBlock, scene);
  if (mesh && scene.isPhysicsEnabled()) {
     // Get the physics body associated with the mesh
    const body = mesh.getPhysicsBody(); // V2 Physics API

    if (body) {
      // Mass is set via mass properties. Ensure mass is non-negative.
      body.setMassProperties({ mass: Math.max(0, mass) }); // Use Math.max to prevent negative mass
      console.log(`Set mass of ${mesh.name} to ${Math.max(0, mass)}`);
    } else {
       console.warn(`Attempted to set mass on ${mesh.name}, but it has no physics body.`);
    }
  } else {
     if(!mesh) console.warn("SetMass: Could not find mesh.");
     if(!scene.isPhysicsEnabled()) console.warn("SetMass: Physics not enabled.");
  }
};

export { setGravity, applyForce, setMass };