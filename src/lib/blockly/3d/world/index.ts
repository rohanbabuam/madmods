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



// Helper to dispose existing physics aggregate safely
const disposePhysicsAggregate = (node: BABYLON.Node) => {
  if (node instanceof BABYLON.AbstractMesh && node.physicsBody) {
      // Attempt to get the aggregate; this might vary slightly depending on how it was attached
      // Often the body itself IS the aggregate wrapper or provides access.
      // If using PhysicsAggregate directly, it might not be directly on physicsBody.
      // Let's assume direct dispose of the body handles the aggregate for simplicity with HavokPlugin usage.
      // If issues arise, a more robust method to track/retrieve the specific PhysicsAggregate instance might be needed.
      try {
          console.log(`Disposing existing physics body/aggregate for ${node.name}`);
          node.physicsBody.dispose();
          node.physicsBody = null; // Clear reference
      } catch (e) {
          console.warn(`Error disposing physics body for ${node.name}:`, e);
      }
  }
}

// Helper to add physics aggregate, disposing old one first
const applyPhysicsAggregate = (
  node: BABYLON.AbstractMesh,
  shapeType: BABYLON.PhysicsShapeType,
  options: { mass: number; restitution: number; friction: number },
  scene: BABYLON.Scene
) => {
  disposePhysicsAggregate(node); // Ensure old one is gone

  if (scene.isPhysicsEnabled()) {
      try {
          console.log(`Applying PhysicsAggregate (${BABYLON.PhysicsShapeType[shapeType]}) to ${node.name}`);
          new BABYLON.PhysicsAggregate(node, shapeType, options, scene);
      } catch (physicsError) {
          console.error(`Failed to create PhysicsAggregate for ${node.name}:`, physicsError);
      }
  }
}



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
        try {
          // No variable assignment needed
          new BABYLON.PhysicsAggregate(
              rootMesh,
              BABYLON.PhysicsShapeType.CONVEX_HULL,
              { mass: 1, restitution: 0.7, friction: 1.0 },
              scene
          );
          console.log(`Added PhysicsAggregate to custom object ${rootMesh.name}`);
      } catch (physicsError) {
          console.error(`Failed to create physics aggregate for ${rootMesh.name}:`, physicsError);
      }
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
): BABYLON.TransformNode | null => {

  const nodeName = shape.id;
  let placeholder = scene.getTransformNodeByName(nodeName);
  let nodeExists = !!placeholder;

  if (nodeExists && placeholder) {
      console.log(`Updating existing custom object placeholder: ${nodeName}`);
      // Update placeholder position
      placeholder.position.set(coords.x, coords.y, coords.z);

      // Attempt to find and update the already loaded mesh (if it exists)
      const loadedMesh = placeholder.getChildren(undefined, true)[0] as BABYLON.Mesh; // Assuming direct child is the mesh
      if (loadedMesh) {
           console.log(`Updating properties of loaded mesh for ${nodeName}`);
           // Update material
           setMaterial(loadedMesh, shape.material, scene);
           // Update scale relative to placeholder
           const scale = shape.scale || 1;
           loadedMesh.scaling.setAll(scale);
           // Re-apply physics (dispose old, add new) - applying to LOADED MESH
           applyPhysicsAggregate(
               loadedMesh,
               BABYLON.PhysicsShapeType.CONVEX_HULL, // Or MESH if more appropriate
               { mass: 1, restitution: 0.7, friction: 1.0 }, // Assuming these params, might need to be dynamic
               scene
            );
      } else {
          console.log(`Placeholder ${nodeName} exists, but loaded mesh not found (likely still loading or failed). Position updated.`);
          // If the mesh isn't loaded yet, the original loadAndParentCustomObject promise
          // might still be running or has failed. Re-triggering load here could be complex.
          // For now, we only update the placeholder transform and rely on the initial load
          // process to eventually parent the mesh with the correct initial properties.
          // A more robust solution might involve tracking load state.
      }
       return placeholder; // Return existing placeholder

  } else {
      console.log(`Creating new placeholder for custom object: ${shape.name} (ID: ${nodeName})`);
      // --- Creation Logic (Original) ---
      placeholder = new BABYLON.TransformNode(nodeName, scene);
      placeholder.position.set(coords.x, coords.y, coords.z);

      // Kick off the asynchronous loading process
      loadAndParentCustomObject(shape, placeholder, scene, actionManagers)
          .catch(err => {
              console.error(`Error initiating background load for ${shape.name}:`, err);
          });

      return placeholder; // Return the newly created placeholder
  }
};


// Creates a torus
const createTorus = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
  let torus:any = scene.getMeshById(shape.id);
  let nodeExists = !!torus;
  // Primitives are harder to "update" parameters like diameter/thickness without dispose/recreate.
  // We will primarily update position, material, physics. If size MUST change, dispose/recreate is needed.
  let recreateNeeded = false;

  if (nodeExists && torus) {
       if (!(torus instanceof BABYLON.Mesh)) { // Basic type check
           console.warn(`ID ${shape.id} exists but is not a Torus. Disposing and recreating.`);
           disposePhysicsAggregate(torus); // Dispose physics before mesh
           torus.dispose();
           torus = null;
           nodeExists = false;
           recreateNeeded = true;
       } else {
            // Check if size params changed (requires storing original params or approximation)
            // For simplicity, let's assume size doesn't change or accept that only transform/material updates.
            console.log(`Updating existing Torus: ${shape.id}`);
            torus.position.set(coords.x, coords.y, coords.z);
            setMaterial(torus, shape.material, scene);
            // Re-apply physics
            applyPhysicsAggregate(torus, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
       }
  }

  if (!nodeExists || recreateNeeded) {
      console.log(`Creating new Torus: ${shape.id}`);
      torus = BABYLON.MeshBuilder.CreateTorus(shape.id, {
        diameter: shape.size.d,
        thickness: shape.size.t,
        tessellation: shape.size.s,
      });
      torus.position.set(coords.x, coords.y, coords.z);
      setMaterial(torus, shape.material, scene);
      // Add action manager only on creation
      torus.actionManager = new BABYLON.ActionManager(scene);
      actionManagers.push(torus.actionManager);
      // Apply physics on creation
      applyPhysicsAggregate(torus, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
  }
};

// Creates a ramp from a triangle shape
const createRamp = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
    let ramp:any = scene.getMeshById(shape.id);
    let nodeExists = !!ramp;
    let recreateNeeded = false; // Extruded shapes are hard to resize

    if (nodeExists && ramp) {
        // Crude check: Extruded shapes often don't have a simple geometry class name readily available
        // We might skip type checking or rely on the fact it's a Mesh.
        if (!(ramp instanceof BABYLON.Mesh)) {
             console.warn(`ID ${shape.id} exists but is not a Mesh. Disposing and recreating.`);
             disposePhysicsAggregate(ramp);
             ramp.dispose();
             ramp = null;
             nodeExists = false;
             recreateNeeded = true;
        } else {
            console.log(`Updating existing Ramp (ExtrudedShape): ${shape.id}`);
            ramp.position.set(coords.x, coords.y, coords.z);
            // Rotation isn't stored in shape for ramp, assume it doesn't change or handle separately if needed
            setMaterial(ramp, shape.material, scene);
            applyPhysicsAggregate(ramp, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
        }
    }

    if (!nodeExists || recreateNeeded) {
        console.log(`Creating new Ramp (ExtrudedShape): ${shape.id}`);
        let width = shape.size.w / 2;
        let height = shape.size.h / 2;
        let length = shape.size.l / 2;
        var triangle = [ /* ... triangle points ... */ ];
        triangle.push(triangle[0]);
        let extrudePath = [ /* ... path points ... */ ];
        ramp = BABYLON.MeshBuilder.ExtrudeShape(
            shape.id,
            { shape: triangle, path: extrudePath, cap: BABYLON.Mesh.CAP_ALL },
            scene
        );
        ramp.position.set(coords.x, coords.y, coords.z);
        setMaterial(ramp, shape.material, scene);
        // Add action manager only on creation
        ramp.actionManager = new BABYLON.ActionManager(scene);
        actionManagers.push(ramp.actionManager);
        // Apply physics on creation
        applyPhysicsAggregate(ramp, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
    }
};

// Creates a capsule shape
const createCapsule = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
    let capsule:any = scene.getMeshById(shape.id);
    let nodeExists = !!capsule;
    let recreateNeeded = false; // Capsule resizing needs recreate

    if (nodeExists && capsule) {
         if (!(capsule instanceof BABYLON.Mesh)) { // Check if capsule geo exists
            console.warn(`ID ${shape.id} exists but is not a Capsule. Disposing and recreating.`);
            disposePhysicsAggregate(capsule);
            capsule.dispose();
            capsule = null;
            nodeExists = false;
            recreateNeeded = true;
        } else {
            console.log(`Updating existing Capsule: ${shape.id}`);
            capsule.position.set(coords.x, coords.y, coords.z);
            setMaterial(capsule, shape.material, scene);
            applyPhysicsAggregate(capsule, BABYLON.PhysicsShapeType.CAPSULE, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
        }
    }

    if (!nodeExists || recreateNeeded) {
        console.log(`Creating new Capsule: ${shape.id}`);
        capsule = BABYLON.MeshBuilder.CreateCapsule(shape.id, {
            height: shape.size.h,
            radius: shape.size.d / 2,
        });
        capsule.position.set(coords.x, coords.y, coords.z);
        setMaterial(capsule, shape.material, scene);
        // Add action manager only on creation
        capsule.actionManager = new BABYLON.ActionManager(scene);
        actionManagers.push(capsule.actionManager);
        // Apply physics on creation
        applyPhysicsAggregate(capsule, BABYLON.PhysicsShapeType.CAPSULE, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
    }
};

// Creates a cone with a base and a top
const createCone = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
    let cone:any = scene.getMeshById(shape.id);
    let nodeExists = !!cone;
    let recreateNeeded = false; // Cylinder resizing needs recreate

     if (nodeExists && cone) {
         // Cone uses CylinderGeometry
         if (!(cone instanceof BABYLON.Mesh)) {
            console.warn(`ID ${shape.id} exists but is not a Cone/Cylinder. Disposing and recreating.`);
            disposePhysicsAggregate(cone);
            cone.dispose();
            cone = null;
            nodeExists = false;
            recreateNeeded = true;
        } else {
            console.log(`Updating existing Cone: ${shape.id}`);
            cone.position.set(coords.x, coords.y, coords.z);
            setMaterial(cone, shape.material, scene);
            applyPhysicsAggregate(cone, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.7, friction: 1.0 }, scene); // Use Convex Hull for cones
        }
    }

    if (!nodeExists || recreateNeeded) {
        console.log(`Creating new Cone: ${shape.id}`);
        cone = BABYLON.MeshBuilder.CreateCylinder(shape.id, { // Cones are created using CreateCylinder
            height: shape.size.h,
            diameterTop: shape.size.t,
            diameterBottom: shape.size.b,
        });
        cone.position.set(coords.x, coords.y, coords.z);
        setMaterial(cone, shape.material, scene);
        // Add action manager only on creation
        cone.actionManager = new BABYLON.ActionManager(scene);
        actionManagers.push(cone.actionManager);
        // Apply physics on creation
        applyPhysicsAggregate(cone, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
    }
};

// Creates a cylinder
const createCylinder = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
    let cylinder:any = scene.getMeshById(shape.id);
    let nodeExists = !!cylinder;
    let recreateNeeded = false;

    if (nodeExists && cylinder) {
         if (!(cylinder instanceof BABYLON.Mesh)) {
            console.warn(`ID ${shape.id} exists but is not a Cylinder. Disposing and recreating.`);
            disposePhysicsAggregate(cylinder);
            cylinder.dispose();
            cylinder = null;
            nodeExists = false;
            recreateNeeded = true;
        } else {
            console.log(`Updating existing Cylinder: ${shape.id}`);
            cylinder.position.set(coords.x, coords.y, coords.z);
            setMaterial(cylinder, shape.material, scene);
            applyPhysicsAggregate(cylinder, BABYLON.PhysicsShapeType.CYLINDER, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
        }
    }

    if (!nodeExists || recreateNeeded) {
        console.log(`Creating new Cylinder: ${shape.id}`);
        cylinder = BABYLON.MeshBuilder.CreateCylinder(shape.id, {
            height: shape.size.h,
            diameter: shape.size.d,
        });
        cylinder.position.set(coords.x, coords.y, coords.z);
        setMaterial(cylinder, shape.material, scene);
        // Add action manager only on creation
        cylinder.actionManager = new BABYLON.ActionManager(scene);
        actionManagers.push(cylinder.actionManager);
        // Apply physics on creation
        applyPhysicsAggregate(cylinder, BABYLON.PhysicsShapeType.CYLINDER, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
    }
};

// Creates a box
const createBox = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
    let box:any = scene.getMeshById(shape.id);
    let nodeExists = !!box;
    let recreateNeeded = false; // Box resizing needs recreate

    if (nodeExists && box) {
         if (!(box instanceof BABYLON.Mesh)) {
            console.warn(`ID ${shape.id} exists but is not a Box. Disposing and recreating.`);
            disposePhysicsAggregate(box);
            box.dispose();
            box = null;
            nodeExists = false;
            recreateNeeded = true;
        } else {
            console.log(`Updating existing Box: ${shape.id}`);
            box.position.set(coords.x, coords.y, coords.z);
            setMaterial(box, shape.material, scene);
            // Optionally update scaling if dimensions change instead of recreating
            // box.scaling.set(shape.size.w / currentWidth, shape.size.h / currentHeight, shape.size.l / currentDepth);
            // For simplicity with physics, let's stick to recreate if size changes, or just update pos/mat if not.
            applyPhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
        }
    }

    if (!nodeExists || recreateNeeded) {
        console.log(`Creating new Box: ${shape.id}`);
        box = BABYLON.MeshBuilder.CreateBox(shape.id, {
            height: shape.size.h,
            width: shape.size.w,
            depth: shape.size.l,
        });
        box.position.set(coords.x, coords.y, coords.z);
        setMaterial(box, shape.material, scene);
        // Add action manager only on creation
        box.actionManager = new BABYLON.ActionManager(scene);
        actionManagers.push(box.actionManager);
        // Apply physics on creation
        applyPhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
    }
};
// Creates a wall
const createWall = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
    let wall:any = scene.getMeshById(shape.id);
    let nodeExists = !!wall;
    let recreateNeeded = false; // Plane resizing needs recreate

    if (nodeExists && wall) {
        // PlaneGeometry might be less specific, check if it's a Mesh
         if (!(wall instanceof BABYLON.Mesh)) {
            console.warn(`ID ${shape.id} exists but is not a Plane/Wall. Disposing and recreating.`);
            disposePhysicsAggregate(wall);
            wall.dispose();
            wall = null;
            nodeExists = false;
            recreateNeeded = true;
        } else {
            console.log(`Updating existing Wall: ${shape.id}`);
            wall.position.set(coords.x, coords.y, coords.z);
            // Update rotation
            if (shape.size.r < 0) shape.size.r = 0;
            if (shape.size.r > 360) shape.size.r = 360;
            wall.rotation.y = convertToRadians(shape.size.r);
            setMaterial(wall, shape.material, scene);
            // Walls are static (mass 0)
            applyPhysicsAggregate(wall, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 1.0 }, scene);
        }
    }

    if (!nodeExists || recreateNeeded) {
        console.log(`Creating new Wall: ${shape.id}`);
        wall = BABYLON.MeshBuilder.CreateTiledPlane(shape.id, { // Or CreatePlane if tiling not needed
            height: shape.size.h,
            width: shape.size.w,
            tileSize: shape.size.s, // Only for TiledPlane
        });
        wall.position.set(coords.x, coords.y, coords.z);
        if (shape.size.r < 0) shape.size.r = 0;
        if (shape.size.r > 360) shape.size.r = 360;
        wall.rotation.y = convertToRadians(shape.size.r);
        setMaterial(wall, shape.material, scene);
        // Add action manager only on creation
        wall.actionManager = new BABYLON.ActionManager(scene);
        actionManagers.push(wall.actionManager);
        // Apply physics on creation
        applyPhysicsAggregate(wall, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 1.0 }, scene);
    }
};

// Creates a sphere
const createSphere = (
  shape: Shape,
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
) => {
    let sphere:any = scene.getMeshById(shape.id);
    let nodeExists = !!sphere;
    let recreateNeeded = false; // Sphere resizing needs recreate or scaling

    if (nodeExists && sphere) {
         if (!(sphere instanceof BABYLON.Mesh)) {
            console.warn(`ID ${shape.id} exists but is not a Sphere. Disposing and recreating.`);
            disposePhysicsAggregate(sphere);
            sphere.dispose();
            sphere = null;
            nodeExists = false;
            recreateNeeded = true;
        } else {
            console.log(`Updating existing Sphere: ${shape.id}`);
            sphere.position.set(coords.x, coords.y, coords.z);
            setMaterial(sphere, shape.material, scene);
            // Sphere scaling for size changes (simpler than recreate)
            // sphere.scaling.set(shape.size.w / currentDiameterX, shape.size.h / currentDiameterY, shape.size.l / currentDiameterZ);
            applyPhysicsAggregate(sphere, BABYLON.PhysicsShapeType.SPHERE, { mass: 1, restitution: 0.7, friction: 0.5 }, scene);
        }
    }

    if (!nodeExists || recreateNeeded) {
        console.log(`Creating new Sphere: ${shape.id}`);
        sphere = BABYLON.MeshBuilder.CreateSphere(shape.id, {
            segments: 16,
            diameterX: shape.size.w,
            diameterY: shape.size.h,
            diameterZ: shape.size.l,
        });
        sphere.position.set(coords.x, coords.y, coords.z);
        setMaterial(sphere, shape.material, scene);
        // Add action manager only on creation
        sphere.actionManager = new BABYLON.ActionManager(scene);
        actionManagers.push(sphere.actionManager);
        // Apply physics on creation
        applyPhysicsAggregate(sphere, BABYLON.PhysicsShapeType.SPHERE, { mass: 1, restitution: 0.7, friction: 0.5 }, scene);
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
    let mergedMesh:any = BABYLON.Mesh.MergeMeshes(
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
      // mergedMesh.physicsImpostor = new BABYLON.PhysicsImpostor(
      //   mergedMesh,
      //   BABYLON.PhysicsImpostor.ConvexHullImpostor,
      //   { mass: 1, restitution: 0.1, friction: 1.0 },
      //   scene
      // );
      // --- HAVOK PHYSICS for Merged Mesh ---
    if (scene.isPhysicsEnabled() === true) {
      try {
          // No variable assignment needed
          new BABYLON.PhysicsAggregate(
              mergedMesh,
              BABYLON.PhysicsShapeType.CONVEX_HULL,
              { mass: 1, restitution: 0.1, friction: 1.0 },
              scene
          );
      } catch (physicsError) { /* ... error handling ... */ }
   }
   // --- END HAVOK PHYSICS ---

    }
  }
};


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
  let mesh:any = convertShapeBlockToMesh(shapeBlock, scene);
  if (mesh) {
    return mesh.position[axis];
  }
};

// Creates the ground
const createGround = (shape: Shape, scene: BABYLON.Scene) => {
  const groundId = shape.id || 'ground'; // Use shape ID or default
  let ground = scene.getMeshById(groundId);
  let nodeExists = !!ground;
  let recreateNeeded = false; // Ground resizing needs recreate

  if (nodeExists && ground) {
    console.log(ground.getClassName())
      // --- CORRECTED TYPE CHECK ---
      // Check if the existing node is specifically a GroundMesh
      if (!(ground instanceof BABYLON.Mesh)) {
      // --- END CORRECTION ---
          console.warn(`ID ${groundId} exists but is not a GroundMesh. Disposing and recreating.`);
          disposePhysicsAggregate(ground); // Dispose physics before mesh
          ground.dispose();
          ground = null;
          nodeExists = false;
          recreateNeeded = true;
       } else {
          // Existing node is a GroundMesh, proceed with update
          console.log(`Updating existing Ground: ${groundId}`);
          // Update material
          setMaterial(ground, shape.material, scene);
          // Ground position is usually fixed at 0,0,0, but could be updated if needed
          // ground.position = ...;

          // Check if size needs updating (this requires recreation for GroundMesh)
          // We need to compare current dimensions with shape dimensions.
          // Getting exact original dimensions from a GroundMesh can be tricky.
          // For simplicity, we'll assume size doesn't change, or we always recreate if size matters.
          // If size updates ARE needed, set recreateNeeded = true here based on comparison.
          // Example (conceptual - getting current size might need _worldExtent):
          // const currentWidth = /* logic to get current ground width */;
          // const currentLength = /* logic to get current ground length */;
          // if (currentWidth !== shape.size.w || currentLength !== shape.size.l) {
          //    console.warn(`Ground ${groundId} size changed. Recreating.`);
          //    disposePhysicsAggregate(ground);
          //    ground.dispose();
          //    ground = null;
          //    nodeExists = false;
          //    recreateNeeded = true;
          // }

          if (!recreateNeeded) {
               // Update physics (static) only if not recreating
              applyPhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 1.0 }, scene);
          }
       }
  }

  // Create new ground if it didn't exist or needs recreation
  if (!nodeExists || recreateNeeded) {
      console.log(`Creating new Ground: ${groundId}`);
      if (shape.tileSize <= 0) shape.tileSize = 1;
      let width = shape.size.w;
      let length = shape.size.l;
      let tileSize = shape.tileSize;
      let grid = { h: length / tileSize, w: width / tileSize };

      // Create the TiledGround
      ground = BABYLON.MeshBuilder.CreateTiledGround(groundId, {
          xmin: 0 - width / 2, zmin: 0 - length / 2,
          xmax: width / 2, zmax: length / 2,
          subdivisions: grid,
          // updatable: true // Consider setting true if you might change subdivisions later, though often requires dispose/recreate anyway
      }, scene); // Pass scene here

      ground.name = "ground";

      setMaterial(ground, shape.material, scene);
      // Apply physics on creation
      applyPhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 1.0 }, scene);
  }
};

// Creates the skybox
const createSkybox = (skybox: Skybox, scene: BABYLON.Scene) => {
  scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(`./assets/env/${skybox.asset}.env`, scene);
  let sky:any = scene.createDefaultSkybox(scene.environmentTexture);
  console.log(sky)
  sky.name = "skybox";
};

// Set the sky/background color
const setSkyColor = (color: string, scene: BABYLON.Scene) => {
  scene.clearColor = BABYLON.Color4.FromHexString(color);
};

// --- NEW: Function to load a model by URL and place it ---
async function loadAndPlaceModel(
  name: string,
  modelUrl: string,
  position: BABYLON.Vector3,
  scene: BABYLON.Scene
): Promise<BABYLON.AbstractMesh | null> { // Return the root mesh or null on failure
  console.log(`Loading model "${name}" from URL: ${modelUrl}`);
  try {
      // Ensure the URL is valid (basic check)
      if (!modelUrl || !modelUrl.toLowerCase().endsWith('.glb')) {
           throw new Error(`Invalid or non-GLB model URL provided: ${modelUrl}`);
      }

      // Import the mesh. Use "" for root URL, "" for scene filename, modelUrl for the file to load.
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
          "", // Load all meshes from the file
          "", // Root URL (not needed when loading a single file directly)
          modelUrl, // The actual URL of the .glb file
          scene,
          (event:any) => {
              // Optional: Progress tracking
              // let loadedPercent = event.lengthComputable ? ' ' + Math.round((event.loaded * 100 / event.total)) + '%' : '';
              // console.log(`Loading progress: ${loadedPercent}`);
          },
          ".glb" // Specify the file extension hint
      );

      if (!result.meshes || result.meshes.length === 0) {
          throw new Error("SceneLoader did not return any meshes.");
      }

      // Find the root mesh. Often '__root__', but sometimes the first mesh if simple.
      let rootMesh = result.meshes.find(m => m.name === "__root__") || result.meshes[0];

      if (!rootMesh) {
          // Should not happen if result.meshes has items, but safety check
          throw new Error("Could not identify a root mesh in the loaded model.");
      }

      // Assign the desired name (ensure it's unique if necessary, Babylon handles duplicates gracefully usually)
      rootMesh.name = name;

      // Set the position
      rootMesh.position = position;

      // Make all children pickable as well (often desired)
      rootMesh.getChildMeshes().forEach(child => {
          child.isPickable = true;
      });
      rootMesh.isPickable = true; // Ensure root is pickable

      // Add metadata for potential tracking
      rootMesh.metadata = {
          ...rootMesh.metadata, // Preserve existing metadata if any
          createdBy: 'drag-drop',
          sourceModelUrl: modelUrl
      };

      // --- Add Physics Impostor if physics is enabled ---
      if (scene.isPhysicsEnabled() && scene.getPhysicsEngine()?.getPhysicsPlugin()) {
          console.log(`Physics enabled. Adding impostor to ${name}`);
          // Use a bounding box impostor for simplicity. Adjust mass as needed.
          // Use ConvexHullImpostor for better fit on complex shapes if needed, but slower.
          // rootMesh.physicsImpostor = new PhysicsImpostor(
          //     rootMesh,
          //     PhysicsImpostor.BoxImpostor, // Or ConvexHullImpostor, SphereImpostor etc.
          //     { mass: 1, restitution: 0.4, friction: 0.5 }, // Adjust physics properties
          //     scene
          // );
          console.log(`Physics impostor added to ${name}.`);
      } else {
           console.log(`Physics not enabled or plugin missing. Skipping impostor for ${name}.`);
      }

      console.log(`Model "${name}" loaded and placed successfully at ${position.x}, ${position.y}, ${position.z}.`);
      return rootMesh;

  } catch (error) {
      console.error(`Failed to load or place model "${name}" from ${modelUrl}:`, error);
      // Clean up potentially partially loaded assets if necessary (SceneLoader usually handles this)
      // Re-throw or handle the error as appropriate for the calling context
      throw error; // Propagate the error
      // return null; // Or return null if you want to handle it silently in the caller
  }
}

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
  loadAndPlaceModel
};
