import * as BABYLON from '@babylonjs/core/Legacy/legacy';

import { setMaterial } from "../materials";
import { convertToRadians } from "../utils";

// --- ADD THESE ---
import type { ModelUrlResolver } from '../../blockly'; // Adjust path if needed

// Module-level variable to store the resolver function passed from the frontend
let _modelUrlResolver: ModelUrlResolver | null = null;

/**
 * Sets the function used to resolve model IDs to their URLs.
 * This should be called during initialization.
 * @param resolver The function that takes an ID and returns a URL or null.
 */
export function setModelUrlResolver(resolver: ModelUrlResolver): void {
  console.log("Setting the model URL resolver function.");
  _modelUrlResolver = resolver;
}
// --- END ADDITIONS ---

const convertCoordsBlockToCoords = (coordsBlock: CoordsBlock) => {
  if (!coordsBlock) return null;
  if (!coordsBlock[0]) return null;
  let coords = coordsBlock[0];
  if (coords === null) return null;
  return coords;
};

const convertShapeBlockToShape = (shapeBlock: ShapeBlock) => {
  if (!shapeBlock) return null;
  if (!shapeBlock[0]) return null;
  let shape = shapeBlock[0];
  if (shape === null) return null;
  return shape;
};

// const convertShapeBlockToMesh = (shapeBlock: ShapeBlock, scene: BABYLON.Scene) => {
//   if (!shapeBlock) return null;
//   if (!shapeBlock[0]) return null;
//   let shape = shapeBlock[0];
//   if (shape === null) return null;
//   let mesh = scene.getMeshById(shape.id);
//   return mesh;
// };


// Function to get the node (Mesh or TransformNode placeholder) associated with shape data
const convertShapeBlockToMesh = (
  shapeBlockData: ShapeBlock, // Input is the shape data structure, e.g., [{ id: "...", ...}]
  scene: BABYLON.Scene
): BABYLON.AbstractMesh | BABYLON.TransformNode | null => { // Return type includes TransformNode

  // 1. Validate the input data structure
  if (!shapeBlockData || !Array.isArray(shapeBlockData) || shapeBlockData.length === 0) {
      console.warn("convertShapeBlockToMesh: Invalid or empty shapeBlockData received.");
      return null;
  }

  const shape = shapeBlockData[0]; // Get the first (presumably only) shape object

  if (!shape || typeof shape !== 'object' || !shape.id) {
      console.warn("convertShapeBlockToMesh: Invalid shape object or missing ID in shapeBlockData:", shape);
      return null;
  }

  const nodeName = shape.id; // Get the unique ID (should be the block ID)

  // 2. Try to find the fully loaded mesh directly by name (block ID).
  //    This mesh would be a child of the placeholder AFTER loading completes.
  //    Babylon's getMeshById/getMeshByName are often interchangeable if names/IDs are unique.
  //    Using getMeshByName might be slightly more robust if IDs aren't strictly enforced everywhere.
  const loadedMesh = scene.getMeshByName(nodeName);
  if (loadedMesh) {
      // console.log(`convertShapeBlockToMesh: Found loaded mesh ${nodeName}`);
      return loadedMesh;
  }

  // 3. If loaded mesh not found, try to find the placeholder TransformNode by name (block ID).
  const placeholderNode = scene.getTransformNodeByName(nodeName);
  if (placeholderNode) {
      // console.log(`convertShapeBlockToMesh: Found placeholder ${nodeName}`);
      return placeholderNode; // Return the placeholder if mesh isn't ready/parented yet
  }

  // 4. If neither is found, the shape likely doesn't exist or hasn't been created yet.
  //    This could happen if createShape failed or was never called for this ID.
  console.warn(`convertShapeBlockToMesh: Node (Mesh or Placeholder) not found in scene for ID: ${nodeName}`);
  return null;
};




// --- Helper function for the async loading logic ---
const loadAndParentCustomObject = async (
  shape: Shape & { name: string; scale: number },
  placeholder: BABYLON.TransformNode, // Receive the placeholder
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
): Promise<void> => { // Doesn't need to return the mesh anymore
  const meshUrl = getMeshURL(shape.name);
  if (!meshUrl) {
      console.error(`No URL for ${shape.name}. Cannot load mesh. Disposing placeholder.`);
      placeholder.dispose(); // Clean up if URL fails
      return;
  }

  try {
      console.log(`Starting async load for ${shape.name} from ${meshUrl}`);
      const result = await BABYLON.SceneLoader.ImportMeshAsync("", meshUrl, "", scene, undefined, ".glb"); // Specify extension if known

      if (!result.meshes || result.meshes.length === 0) {
          console.error(`No meshes found in the file loaded from: ${meshUrl}. Disposing placeholder.`);
          placeholder.dispose(); // Clean up if loading returns nothing
          return;
      }

      const rootMesh = result.meshes[0] as BABYLON.Mesh; // Assume first is the one we want
      // VERY IMPORTANT: Clear the loaded mesh's position/rotation/scaling if parenting
      rootMesh.position = BABYLON.Vector3.Zero();
      rootMesh.rotation = BABYLON.Vector3.Zero(); // Or rotationQuaternion = Identity
      rootMesh.scaling = new BABYLON.Vector3(1, 1, 1);

      // Use the placeholder's name (which should be unique block ID) for the loaded mesh too
      rootMesh.name = placeholder.name;

      // Parent the loaded mesh to the placeholder
      rootMesh.parent = placeholder;

      // Apply scale RELATIVE to the parent (placeholder)
      const scale = shape.scale || 1;
      // If placeholder already handles scale, set mesh scale to 1. If not:
      rootMesh.scaling.setAll(scale); // Or adjust based on how you want scale applied

      // Apply material to the loaded mesh(es)
      setMaterial(rootMesh, shape.material, scene); // Might need to loop result.meshes

      // Add Action Manager TO THE LOADED MESH
      rootMesh.actionManager = new BABYLON.ActionManager(scene);
      actionManagers.push(rootMesh.actionManager);

      // Add Physics TO THE LOADED MESH
      if (scene.isPhysicsEnabled() === true) {
          //  try {
          //     rootMesh.physicsImpostor = new BABYLON.PhysicsImpostor(
          //         rootMesh,
          //         BABYLON.PhysicsImpostor.ConvexHullImpostor, // Adjust impostor type if needed
          //         { mass: 1, restitution: 0.7, friction: 1.0 },
          //         scene
          //     );
          //  } catch (physicsError) {
          //      console.error(`Failed to create physics impostor for ${rootMesh.name}:`, physicsError);
          //      // Decide if you want to dispose the mesh/placeholder on physics failure
          //  }
      }

      console.log(`Successfully loaded and attached mesh for ${shape.name} to placeholder ${placeholder.name}`);

  } catch (error) {
      console.error(`Error loading mesh ${shape.name} for placeholder ${placeholder.name}:`, error);
      placeholder.dispose(); // Clean up placeholder on loading failure
  }
};



// Placeholder function to get the mesh URL based on the ID/name
// NOW uses the resolver function passed from the Svelte component
export const getMeshURL = (meshId: string): string | null => {
  console.log(`Requesting URL for mesh ID: ${meshId} using resolver...`);

  // --- MODIFY THIS PART ---
  if (!_modelUrlResolver) {
      console.error(`Model URL resolver function has not been set! Cannot resolve ID: ${meshId}. Make sure setModelUrlResolver was called during initialization.`);
      return null; // Or throw an error, depending on desired behavior
  }

  try {
      // Call the function that was originally defined in the Svelte component
      const url = _modelUrlResolver(meshId);

      if (!url) {
          // The resolver function handles logging warnings if not found/ready
          // console.warn(`Resolver returned no URL for mesh ID: ${meshId}`);
          return null;
      }

      console.log(`Resolver successfully returned URL for ${meshId}.`); // Removed URL logging here for potential security/cleanliness, resolver logs it.
      return url;
  } catch (error) {
      console.error(`Error occurred while executing the model URL resolver for ID ${meshId}:`, error);
      return null;
  }
  // --- END MODIFICATION ---
};


// Creates a Custom Object by loading from URL
// NOTE: This function is ASYNCHRONOUS because of mesh loading
// --- Modify createCustomObject to be SYNCHRONOUS ---
// It now creates the placeholder and starts the background loading
const createCustomObject = (
  shape: Shape & { name: string; scale: number },
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
): BABYLON.TransformNode | null => { // Return the placeholder (or null on initial error)

  console.log(`Creating placeholder for custom object: ${shape.name} (ID: ${shape.id})`);

  // Create the placeholder TransformNode
  const placeholder = new BABYLON.TransformNode(shape.id, scene); // Use block ID as name

  // Set placeholder's initial position, rotation, scaling
  placeholder.position.set(coords.x, coords.y, coords.z);
  // placeholder.rotationQuaternion = BABYLON.Quaternion.Identity(); // Optional: Initialize rotation
  // placeholder.scaling.setAll(1); // Base scaling is 1

  // Kick off the asynchronous loading process - DO NOT AWAIT HERE
  loadAndParentCustomObject(shape, placeholder, scene, actionManagers)
      .catch(err => {
          // Catch potential errors from the async function initiation itself (unlikely)
          console.error(`Error initiating background load for ${shape.name}:`, err);
          // Placeholder might already be disposed inside the async func on error
      });

  // Return the placeholder SYNCHRONOUSLY
  return placeholder;
};


// Creates a torus
const createTorus = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
  let torus = BABYLON.MeshBuilder.CreateTorus(shape.id, {
    diameter: shape.size.d,
    thickness: shape.size.t,
    tessellation: shape.size.s,
  });
  torus.position.x = coords.x;
  torus.position.y = coords.y;
  torus.position.z = coords.z;
  setMaterial(torus, shape.material, scene);
  torus.actionManager = new BABYLON.ActionManager(scene);
  actionManagers.push(torus.actionManager);
  if (scene.isPhysicsEnabled() === true) {
    torus.physicsImpostor = new BABYLON.PhysicsImpostor(
      torus,
      BABYLON.PhysicsImpostor.ConvexHullImpostor,
      { mass: 1, restitution: 0.7, friction: 1.0 },
      scene
    );
  }
};

// Creates a ramp from a triangle shape
const createRamp = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
  // Halve the w, h, and l to position the triangle in the middle prior to extrusion
  let width = shape.size.w / 2;
  let height = shape.size.h / 2;
  let length = shape.size.l / 2;
  var triangle = [
    new BABYLON.Vector3(0 - width, 0 - height, 0),
    new BABYLON.Vector3(width, 0 - height, 0),
    new BABYLON.Vector3(width, height, 0),
  ];
  triangle.push(triangle[0]);
  let extrudePath = [new BABYLON.Vector3(0, 0, 0 - length), new BABYLON.Vector3(0, 0, length)];
  let ramp = BABYLON.MeshBuilder.ExtrudeShape(
    shape.id,
    { shape: triangle, path: extrudePath, cap: BABYLON.Mesh.CAP_ALL },
    scene
  );
  ramp.position.x = coords.x;
  ramp.position.y = coords.y;
  ramp.position.z = coords.z;
  setMaterial(ramp, shape.material, scene);
  ramp.actionManager = new BABYLON.ActionManager(scene);
  actionManagers.push(ramp.actionManager);
  if (scene.isPhysicsEnabled() === true) {
    ramp.physicsImpostor = new BABYLON.PhysicsImpostor(ramp, BABYLON.PhysicsImpostor.ConvexHullImpostor, {
      mass: 1,
      restitution: 0.7,
      friction: 1.0,
    });
  }
};

// Creates a capsule shape
const createCapsule = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
  let capsule = BABYLON.MeshBuilder.CreateCapsule(shape.id, {
    height: shape.size.h,
    radius: shape.size.d / 2,
  });
  capsule.position.x = coords.x;
  capsule.position.y = coords.y;
  capsule.position.z = coords.z;
  setMaterial(capsule, shape.material, scene);
  capsule.actionManager = new BABYLON.ActionManager(scene);
  actionManagers.push(capsule.actionManager);
  if (scene.isPhysicsEnabled() === true) {
    capsule.physicsImpostor = new BABYLON.PhysicsImpostor(
      capsule,
      BABYLON.PhysicsImpostor.CapsuleImpostor,
      { mass: 1, restitution: 0.7, friction: 1.0 },
      scene
    );
  }
};

// Creates a cone with a base and a top
const createCone = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
  let cone = BABYLON.MeshBuilder.CreateCylinder(shape.id, {
    height: shape.size.h,
    diameterTop: shape.size.t,
    diameterBottom: shape.size.b,
  });
  cone.position.x = coords.x;
  cone.position.y = coords.y;
  cone.position.z = coords.z;
  setMaterial(cone, shape.material, scene);
  cone.actionManager = new BABYLON.ActionManager(scene);
  actionManagers.push(cone.actionManager);
  if (scene.isPhysicsEnabled() === true) {
    cone.physicsImpostor = new BABYLON.PhysicsImpostor(
      cone,
      BABYLON.PhysicsImpostor.ConvexHullImpostor,
      { mass: 1, restitution: 0.7, friction: 1.0 },
      scene
    );
  }
};

// Creates a cylinder
const createCylinder = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
  let cylinder = BABYLON.MeshBuilder.CreateCylinder(shape.id, {
    height: shape.size.h,
    diameter: shape.size.d,
  });
  cylinder.position.x = coords.x;
  cylinder.position.y = coords.y;
  cylinder.position.z = coords.z;
  setMaterial(cylinder, shape.material, scene);
  cylinder.actionManager = new BABYLON.ActionManager(scene);
  actionManagers.push(cylinder.actionManager);
  if (scene.isPhysicsEnabled() === true) {
    cylinder.physicsImpostor = new BABYLON.PhysicsImpostor(
      cylinder,
      BABYLON.PhysicsImpostor.CylinderImpostor,
      { mass: 1, restitution: 0.7, friction: 1.0 },
      scene
    );
  }
};

// Creates a box
const createBox = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
  let box = BABYLON.MeshBuilder.CreateBox(shape.id, {
    height: shape.size.h,
    width: shape.size.w,
    depth: shape.size.l,
  });
  box.position.x = coords.x;
  box.position.y = coords.y;
  box.position.z = coords.z;
  setMaterial(box, shape.material, scene);
  box.actionManager = new BABYLON.ActionManager(scene);
  actionManagers.push(box.actionManager);
  if (scene.isPhysicsEnabled() === true) {
    box.physicsImpostor = new BABYLON.PhysicsImpostor(
      box,
      BABYLON.PhysicsImpostor.BoxImpostor,
      { mass: 1, restitution: 0.7, friction: 1.0 },
      scene
    );
  }
};

// Creates a wall
const createWall = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
  let wall = BABYLON.MeshBuilder.CreateTiledPlane(shape.id, {
    height: shape.size.h,
    width: shape.size.w,
    tileSize: shape.size.s,
  });
  wall.position.x = coords.x;
  wall.position.y = coords.y;
  wall.position.z = coords.z;
  if (shape.size.r < 0) shape.size.r = 0;
  if (shape.size.r > 360) shape.size.r = 360;
  wall.rotation.y = convertToRadians(shape.size.r);
  setMaterial(wall, shape.material, scene);
  wall.actionManager = new BABYLON.ActionManager(scene);
  actionManagers.push(wall.actionManager);
  if (scene.isPhysicsEnabled() === true) {
    wall.physicsImpostor = new BABYLON.PhysicsImpostor(
      wall,
      BABYLON.PhysicsImpostor.BoxImpostor,
      { mass: 0, restitution: 0.7, friction: 1.0 },
      scene
    );
  }
};

// Creates a sphere
const createSphere = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
  let sphere = BABYLON.MeshBuilder.CreateSphere(shape.id, {
    segments: 16,
    diameterX: shape.size.w,
    diameterY: shape.size.h,
    diameterZ: shape.size.l,
  });
  sphere.position.x = coords.x;
  sphere.position.y = coords.y;
  sphere.position.z = coords.z;
  setMaterial(sphere, shape.material, scene);
  sphere.actionManager = new BABYLON.ActionManager(scene);
  actionManagers.push(sphere.actionManager);
  if (scene.isPhysicsEnabled() === true) {
    sphere.physicsImpostor = new BABYLON.PhysicsImpostor(
      sphere,
      BABYLON.PhysicsImpostor.SphereImpostor,
      { mass: 1, restitution: 0.7, friction: 3 },
      scene
    );
    sphere.physicsImpostor.physicsBody.angularDamping = 0.4;
    sphere.physicsImpostor.physicsBody.linearDamping = 0.4;
  }
};

// Creates a shape
const createShape = async (
  shapeBlock: ShapeBlock,
  coordsBlock: CoordsBlock,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
): Promise<void> => {
  let shape = convertShapeBlockToShape(shapeBlock);
  let coords = convertCoordsBlockToCoords(coordsBlock);

  if (shape && coords) {
    switch (shape.type) {
      case 'customObject':
        // Call the *synchronous* createCustomObject.
        // It returns the placeholder immediately.
        const placeholder = createCustomObject(shape as any, coords, scene, actionManagers);
        if (!placeholder) {
            console.error("Failed to create placeholder for custom object.");
        }
        // No 'await' needed here for the creation itself.
        // The outer 'await' in the generated code waits for createShape to finish,
        // ensuring the placeholder exists before the next block runs.
        break; // <<< Ensure break statement is here
        break;
      case "sphere":
        createSphere(shape, coords, scene, actionManagers);
        break;
      case "box":
        createBox(shape, coords, scene, actionManagers);
        break;
      case "wall":
        createWall(shape, coords, scene, actionManagers);
        break;
      case "cylinder":
        createCylinder(shape, coords, scene, actionManagers);
        break;
      case "cone":
        createCone(shape, coords, scene, actionManagers);
        break;
      case "torus":
        createTorus(shape, coords, scene, actionManagers);
        break;
      case "capsule":
        createCapsule(shape, coords, scene, actionManagers);
        break;
      case "ramp":
        createRamp(shape, coords, scene, actionManagers);
        break;
    }
  }
};

// Returns the bounding box of a complex mesh
const getAxisAlignedBoundingInfo = (mesh: BABYLON.AbstractMesh, scene: BABYLON.Scene) => {
  let clone = mesh.clone("mesh", null);
  let vertices = clone.getVerticesData("position");
  let min = new BABYLON.Vector3(1e10, 1e10, 1e10),
    max = new BABYLON.Vector3(-1e10, -1e10, -1e10),
    m = clone.getWorldMatrix();

  let v = new BABYLON.Vector3();
  for (let i = 0; i < vertices.length / 3; ++i) {
    v.copyFromFloats(vertices[i * 3 + 0], vertices[i * 3 + 1], vertices[i * 3 + 2]);
    BABYLON.Vector3.TransformCoordinatesToRef(v, m, v);
    min.minimizeInPlace(v);
    max.maximizeInPlace(v);
  }
  let parent = new BABYLON.Mesh("parent", scene);
  parent.setBoundingInfo(new BABYLON.BoundingInfo(min, max));
  // DEBUG parent.showBoundingBox = true;
  clone.dispose();

  return new BABYLON.BoundingInfo(min, max);
};

// Adds a shape to a parent
const addTo = (
  childBlock: ShapeBlock,
  parentBlock: ShapeBlock,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
  let child = convertShapeBlockToMesh(childBlock, scene);
  let parent = convertShapeBlockToMesh(parentBlock, scene);
  if (child && parent) {
    let parentAABB = getAxisAlignedBoundingInfo(parent, scene);
    let childAABB = getAxisAlignedBoundingInfo(child, scene);

    let aggMaxX = Math.max(parentAABB.maximum.x, childAABB.maximum.x);
    let aggMaxY = Math.max(parentAABB.maximum.y, childAABB.maximum.y);
    let aggMaxZ = Math.max(parentAABB.maximum.z, childAABB.maximum.z);
    let aggMinX = Math.min(parentAABB.minimum.x, childAABB.minimum.x);
    let aggMinY = Math.min(parentAABB.minimum.y, childAABB.minimum.y);
    let aggMinZ = Math.min(parentAABB.minimum.z, childAABB.minimum.z);
    let deltaX = (aggMinX + aggMaxX) / 2;
    let deltaY = (aggMinY + aggMaxY) / 2;
    let deltaZ = (aggMinZ + aggMaxZ) / 2;
    let deltaPosition = new BABYLON.Vector3(deltaX, deltaY, deltaZ);

    let newParentPosition = parent.position.subtract(deltaPosition);
    let newChildPosition = child.position.subtract(deltaPosition);

    parent.position = newParentPosition;
    child.position = newChildPosition;
    let mergedMesh = BABYLON.Mesh.MergeMeshes(
      [parent as BABYLON.Mesh, child as BABYLON.Mesh],
      true,
      true,
      undefined,
      false,
      true
    );
    mergedMesh.id = parent.id;
    mergedMesh.position = mergedMesh.position.add(deltaPosition);

    mergedMesh.actionManager = new BABYLON.ActionManager(scene);
    actionManagers.push(mergedMesh.actionManager);

    if (scene.isPhysicsEnabled() === true) {
      mergedMesh.physicsImpostor = new BABYLON.PhysicsImpostor(
        mergedMesh,
        BABYLON.PhysicsImpostor.ConvexHullImpostor,
        { mass: 1, restitution: 0.1, friction: 1.0 },
        scene
      );
    }
  }
};

// --- BEFORE ---
/*
const createShapeAndAddTo = (
  // ... params ...
) => {
  createShape(shapeBlock, coordsBlock, scene, actionManagers); // No await
  addTo(shapeBlock, parent, scene, actionManagers);
};
*/

// --- AFTER ---
// Mark as async, add Promise<void> return type
const createShapeAndAddTo = async (
  shapeBlock: ShapeBlock,
  parent: ShapeBlock,
  coordsBlock: CoordsBlock,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
): Promise<void> => {
  // Await the call to the now async createShape
  await createShape(shapeBlock, coordsBlock, scene, actionManagers);
  // addTo likely remains synchronous, if not, it would need await too
  addTo(shapeBlock, parent, scene, actionManagers);
};

// Clone a shape into a new mesh and set the position
const clone = (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock, scene: BABYLON.Scene) => {
  let mesh = convertShapeBlockToMesh(shapeBlock, scene);
  let coords = convertCoordsBlockToCoords(coordsBlock);
  if (mesh && coords) {
    let clonedMesh = mesh.clone(`${mesh.id}-clone`, null, null);
    clonedMesh.position.x = coords.x;
    clonedMesh.position.y = coords.y;
    clonedMesh.position.z = coords.z;
  }
};

// Remove a shape from the scene
const remove = (shapeBlock: ShapeBlock, scene: BABYLON.Scene) => {
  let mesh = convertShapeBlockToMesh(shapeBlock, scene);
  if (mesh) {
    // remove any physics imposters first
    if (mesh.physicsImpostor) {
      mesh.physicsImpostor.dispose();
    }
    scene.removeMesh(mesh);
  }
};

// Move a shape to a new position
const moveShape = (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock, scene: BABYLON.Scene) => {
  let mesh = convertShapeBlockToMesh(shapeBlock, scene);
  let coords = convertCoordsBlockToCoords(coordsBlock);
  if (mesh && coords) {
    mesh.position.x = coords.x;
    mesh.position.y = coords.y;
    mesh.position.z = coords.z;
  }
};

// Move a shape along an axis
const moveShapeAlong = (shapeBlock: ShapeBlock, axis: string, steps: number, scene: BABYLON.Scene) => {
  let mesh = convertShapeBlockToMesh(shapeBlock, scene);
  if (mesh) {
    mesh.position[axis] += steps;
  }
};

// Move a shape towards another shape
const moveShapeTowardsShape = (
  shapeBlockA: ShapeBlock,
  shapeBlockB: ShapeBlock,
  steps: number,
  ignoreY: boolean,
  scene: BABYLON.Scene
) => {
  const meshA = convertShapeBlockToMesh(shapeBlockA, scene);
  const meshB = convertShapeBlockToMesh(shapeBlockB, scene);

  if (meshA && meshB && meshA !== meshB) { // Ensure both meshes exist and are different
      const posA = meshA.position;
      const posB = meshB.position;

      // Calculate direction vector
      let direction = posB.subtract(posA);

      // Optionally ignore the Y component for ground movement
      if (ignoreY) {
          direction.y = 0;
      }

      // Normalize the direction vector to get a unit vector
      // Check for zero length vector to avoid NaN issues (if shapes are at same spot and y is ignored)
      if (direction.lengthSquared() < BABYLON.Epsilon) {
           console.warn("Cannot move shape towards itself or identical position (after ignoring Y).");
           return; // Avoid division by zero / NaN
      }
      direction.normalize();

      // Calculate the movement vector
      const movement = direction.scale(steps);

      // Apply the movement to meshA's position
      meshA.position.addInPlace(movement);
  } else {
      if (meshA === meshB) console.warn("Cannot move a shape towards itself.");
      if (!meshA) console.warn("Could not find mesh for the first shape.");
      if (!meshB) console.warn("Could not find mesh for the target shape.");
  }
};


// Rotate a shape
const rotate = (shapeBlock: ShapeBlock, axis: string, degrees: number, scene: BABYLON.Scene) => {
  let mesh = convertShapeBlockToMesh(shapeBlock, scene);
  if (mesh) {
    mesh.rotate(BABYLON.Axis[axis], convertToRadians(degrees));
  }
};

// Get the position of a shape
const getPosition = (shapeBlock: ShapeBlock, axis: string, scene: BABYLON.Scene) => {
  let mesh = convertShapeBlockToMesh(shapeBlock, scene);
  if (mesh) {
    return mesh.position[axis];
  }
};

// Creates the ground
const createGround = (shape: Shape, scene: BABYLON.Scene) => {
  // if (this.ground) this.ground.dispose();
  if (shape.tileSize <= 0) shape.tileSize = 1;
  let width = shape.size.w;
  let length = shape.size.l;
  let tileSize = shape.tileSize;

  let grid = {
    h: length / tileSize,
    w: width / tileSize,
  };

  let ground = BABYLON.MeshBuilder.CreateTiledGround(shape.id, {
    xmin: 0 - width / 2,
    zmin: 0 - length / 2,
    xmax: width / 2,
    zmax: length / 2,
    subdivisions: grid,
  });

  setMaterial(ground, shape.material, scene);
  if (scene.isPhysicsEnabled() === true) {
    ground.physicsImpostor = new BABYLON.PhysicsImpostor(
      ground,
      BABYLON.PhysicsImpostor.BoxImpostor,
      { mass: 0, restitution: 0.7, friction: 1.0 },
      scene
    );
  }
};

// Creates the skybox
const createSkybox = (skybox: Skybox, scene: BABYLON.Scene) => {
  scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(`./assets/env/${skybox.asset}.env`, scene);
  scene.createDefaultSkybox(scene.environmentTexture);
};

// Set the sky/background color
const setSkyColor = (color: string, scene: BABYLON.Scene) => {
  scene.clearColor = BABYLON.Color4.FromHexString(color);
};

export {
  createShape,
  createShapeAndAddTo,
  clone,
  remove,
  moveShape,
  moveShapeAlong,
  moveShapeTowardsShape,
  rotate,
  getPosition,
  createGround,
  createSkybox,
  setSkyColor,
  convertCoordsBlockToCoords,
  convertShapeBlockToMesh,
};
