import * as BABYLON from '@babylonjs/core/Legacy/legacy';

import { setMaterial } from "../materials";
import { convertToRadians } from "../utils";

// --- ADD THESE ---
import type { ModelUrlResolver } from '../../blockly'; // Adjust path if needed

// --- IMPORT MESH REGISTRY ---
// --- Mesh Registry Imports ---
import * as MeshRegistry from '../../../state/meshRegistry'; // Adjust path as necessary
import type { SavedTransform } from '../../../state/saveload'; // Import the transform type

// Module-level variable to store the resolver function passed from the frontend
let _modelUrlResolver: ModelUrlResolver | null = null;

/**
 * Sets the function used to resolve model IDs to their URLs.
 * This should be called during initialization.
 * @param resolver The function that takes an ID and returns a URL or null.
 */
function setModelUrlResolver(resolver: ModelUrlResolver): void {
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


const convertShapeBlockToMesh = (
  shapeBlockData: ShapeBlock, 
  scene: BABYLON.Scene
): BABYLON.AbstractMesh | BABYLON.TransformNode | null => { 
  if (!shapeBlockData || !Array.isArray(shapeBlockData) || shapeBlockData.length === 0) {
      console.warn("convertShapeBlockToMesh: Invalid or empty shapeBlockData received.");
      return null;
  }
  const shape = shapeBlockData[0]; 
  if (!shape || typeof shape !== 'object' || !shape.id) { // shape.id is the Blockly Block ID
      console.warn("convertShapeBlockToMesh: Invalid shape object or missing ID in shapeBlockData:", shape);
      return null;
  }
  const nodeNameOrId = shape.id; // This is the Blockly Block ID

  // Try finding by ID first (more specific) then by name
  const meshById = scene.getMeshById(nodeNameOrId);
  if (meshById) return meshById;

  const transformNodeById = scene.getTransformNodeById(nodeNameOrId);
  if (transformNodeById) return transformNodeById;
  
  // Fallback to checking by name if ID didn't yield results
  const meshByName = scene.getMeshByName(nodeNameOrId);
  if (meshByName) return meshByName;

  const transformNodeByName = scene.getTransformNodeByName(nodeNameOrId);
  if (transformNodeByName) return transformNodeByName;

  console.warn(`convertShapeBlockToMesh: Node (Mesh or Placeholder) not found in scene for Blockly Block ID: ${nodeNameOrId}`);
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



// Async loading logic for custom objects
const loadAndParentCustomObject = async (
  shape: Shape & { id: string; name: string; scale: number; material: any }, // Ensure 'id' (Blockly Block ID) is present
  placeholder: BABYLON.TransformNode | any,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
): Promise<void> => {
  const meshUrl = getMeshURL(shape.name); // shape.name is the model type, e.g., "alien"
  if (!meshUrl) {
      console.error(`No URL for model type ${shape.name}. Cannot load mesh. Disposing placeholder ${placeholder.name}.`);
      MeshRegistry.unregisterMeshByReference(placeholder); // Unregister if placeholder was registered
      placeholder.dispose();
      return;
  }

  try {
      console.log(`Starting async load for ${shape.name} from ${meshUrl} for placeholder ${placeholder.name}`);
      const result = await BABYLON.SceneLoader.ImportMeshAsync("", meshUrl, "", scene, undefined, ".glb");

      if (!result.meshes || result.meshes.length === 0) {
          console.error(`No meshes found in file from ${meshUrl} for ${placeholder.name}. Disposing placeholder.`);
          MeshRegistry.unregisterMeshByReference(placeholder); // Unregister if placeholder was registered
          placeholder.dispose();
          return;
      }

      const rootMesh = result.meshes[0] as BABYLON.Mesh;
      rootMesh.position = BABYLON.Vector3.Zero();
      rootMesh.rotation = BABYLON.Vector3.Zero();
      rootMesh.scaling = new BABYLON.Vector3(1, 1, 1);

      // Use the placeholder's name/id (Blockly Block ID) for the loaded mesh's name AND id
      rootMesh.name = placeholder.name; // placeholder.name is shape.id (Blockly Block ID)
      rootMesh.id = placeholder.id;     // placeholder.id is shape.id (Blockly Block ID)

      rootMesh.parent = placeholder;
      const scale = shape.scale || 1;
      rootMesh.scaling.setAll(scale);
      setMaterial(rootMesh, shape.material, scene);
      rootMesh.actionManager = new BABYLON.ActionManager(scene);
      actionManagers.push(rootMesh.actionManager);

      if (scene.isPhysicsEnabled() === true) {
        try {
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

      // --- MESH REGISTRY: Unregister placeholder, register the actual loaded mesh ---
      // The placeholder itself isn't a "final" mesh, so we might not register it,
      // or register it as 'placeholder' and then update.
      // Simpler: The placeholder doesn't get registered directly by createCustomObject.
      // The final rootMesh gets registered here.
      // The customID was generated by createCustomObject and stored on placeholder.metadata.
      // We transfer this customID to the rootMesh.
      const customUUID = MeshRegistry.getCustomID(placeholder);
      if (customUUID) {
          // Unregister placeholder if it was (it shouldn't be based on current flow)
          // MeshRegistry.unregisterMesh(customUUID);
          
          // Register the actual loaded mesh with the same customUUID
          rootMesh.metadata = { ...placeholder.metadata }; // Copy metadata, including customID
          MeshRegistry.registerMesh(rootMesh, 'dynamic', shape.id); // shape.id is blocklyBlockId
          console.log(`MeshRegistry: Transferred customID ${customUUID} from placeholder to loaded mesh ${rootMesh.name}`);
      } else {
          // This case should ideally not happen if createCustomObject always sets a customID on placeholder meta
          console.warn(`MeshRegistry: Placeholder ${placeholder.name} did not have a customID. Registering loaded mesh ${rootMesh.name} with a new UUID.`);
          MeshRegistry.registerMesh(rootMesh, 'dynamic', shape.id);
      }
      // Once the mesh is loaded and parented, the placeholder might not need to be in the registry itself.
      // Or if the placeholder *was* registered, update the registry entry to point to rootMesh.
      // For now, assuming placeholder wasn't registered, and rootMesh is.

      console.log(`Successfully loaded and attached mesh for ${shape.name} to placeholder ${placeholder.name}`);

  } catch (error) {
      console.error(`Error loading mesh ${shape.name} for placeholder ${placeholder.name}:`, error);
      const customUUID = MeshRegistry.getCustomID(placeholder);
      if (customUUID) MeshRegistry.unregisterMesh(customUUID); // Unregister if placeholder was registered and load failed
      placeholder.dispose();
  }
};

const getMeshURL = (meshModelName: string): string | null => { // meshModelName is like "alien", "robot"
  console.log(`Requesting URL for mesh model: ${meshModelName} using resolver...`);
  if (!_modelUrlResolver) {
      console.error(`Model URL resolver function has not been set! Cannot resolve model: ${meshModelName}.`);
      return null;
  }
  try {
      const url = _modelUrlResolver(meshModelName); // Resolver uses the model name
      if (!url) return null;
      console.log(`Resolver successfully returned URL for ${meshModelName}.`);
      return url;
  } catch (error) {
      console.error(`Error executing model URL resolver for model ${meshModelName}:`, error);
      return null;
  }
};

// Creates a Custom Object (placeholder first, then async loads)
const createCustomObject = (
  shape: Shape & { id: string; name: string; scale: number; material: any }, // id = Blockly Block ID, name = model type like "alien"
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
): BABYLON.TransformNode | null => {
  const blocklyBlockId = shape.id; // This is the Blockly Block ID
  let placeholder = scene.getTransformNodeById(blocklyBlockId) as BABYLON.TransformNode; // Look for existing placeholder by Blockly Block ID

  if (placeholder) {
      console.log(`Updating existing custom object placeholder: ${blocklyBlockId}`);
      placeholder.position.set(coords.x, coords.y, coords.z);

      // The actual mesh update (material, scale, physics) happens in loadAndParentCustomObject
      // if the mesh is reloaded or if we decide to find and update the child mesh here.
      // For now, focusing on placeholder transform. The async load handles child props.
      // If the mesh is already loaded, its properties are part of it.
      // We need to ensure that if shape.material or shape.scale changes for an *existing* custom object,
      // the loaded child mesh gets updated.
      const loadedMesh = placeholder.getChildren(undefined, true)[0] as BABYLON.Mesh;
      if (loadedMesh) {
          console.log(`Updating properties of already loaded mesh for ${blocklyBlockId}`);
          setMaterial(loadedMesh, shape.material, scene);
          const scale = shape.scale || 1;
          loadedMesh.scaling.setAll(scale);
          applyPhysicsAggregate(
              loadedMesh,
              BABYLON.PhysicsShapeType.CONVEX_HULL,
              { mass: 1, restitution: 0.7, friction: 1.0 },
              scene
          );
          // Ensure it's correctly registered / metadata is up-to-date
          MeshRegistry.registerMesh(loadedMesh, 'dynamic', blocklyBlockId);
      } else {
          console.log(`Placeholder ${blocklyBlockId} exists, but mesh not yet loaded. Load process will handle properties.`);
          // If loadAndParentCustomObject was already kicked off and is pending, it will use the new shape properties.
          // If it failed, re-kicking it off might be needed.
          // For simplicity, assume original load will complete or new one kicks if no child.
          // Re-trigger loading if necessary, ensure no duplicate loads
          if (!placeholder.metadata?.isLoading) { // Add a flag to prevent re-triggering if already loading
                placeholder.metadata = { ...placeholder.metadata, isLoading: true };
                loadAndParentCustomObject(shape, placeholder, scene, actionManagers)
                    .finally(() => {
                        if (placeholder.metadata) placeholder.metadata.isLoading = false;
                    })
                    .catch(err => console.error(`Error in re-triggered background load for ${shape.name}:`, err));
          }
      }
      return placeholder;

  } else {
      console.log(`Creating new placeholder for custom object: ${shape.name} (Blockly ID: ${blocklyBlockId})`);
      placeholder = new BABYLON.TransformNode(blocklyBlockId, scene); // Name placeholder with Blockly Block ID
      placeholder.id = blocklyBlockId; // Also set id to Blockly Block ID
      placeholder.position.set(coords.x, coords.y, coords.z);

      // --- MESH REGISTRY: Generate customID and store it on placeholder metadata ---
      // This customID will be transferred to the actual mesh when loaded.
      // The placeholder itself is not the "final" registered entity unless loading fails permanently.
      const customUUID = MeshRegistry.generateUUID();
      placeholder.metadata = { 
          customID: customUUID, 
          meshType: 'placeholder', // Special type for placeholder
          blocklyBlockId: blocklyBlockId,
          isLoading: true
      }; 
      // console.log(`MeshRegistry: Placeholder ${blocklyBlockId} assigned customID ${customUUID}`); // Placeholder not directly registered

      loadAndParentCustomObject(shape, placeholder, scene, actionManagers)
          .finally(() => {
              if(placeholder.metadata) placeholder.metadata.isLoading = false;
          })
          .catch(err => {
              console.error(`Error initiating background load for ${shape.name}:`, err);
              // If load fails, the placeholder might be left. Clean it up or unregister its customID.
              MeshRegistry.unregisterMesh(customUUID);
          });
      return placeholder;
  }
};

// Generic function for creating/updating primitive shapes
const createOrUpdatePrimitive = (
  shape: Shape & {id: string, type: string, size?: any, material?: any}, // id is Blockly Block ID
  coords: Coords,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[],
  createFn: (name: string, options: any, scene: BABYLON.Scene) => BABYLON.Mesh,
  updateFn: (mesh: BABYLON.Mesh, shape: any, coords: Coords, scene: BABYLON.Scene) => void,
  physicsShapeType: BABYLON.PhysicsShapeType,
  physicsOptions: { mass: number; restitution: number; friction: number }
) => {
  const blocklyBlockId = shape.id;
  let mesh = scene.getMeshById(blocklyBlockId) as BABYLON.Mesh;

  if (mesh) {
      console.log(`Updating existing ${shape.type}: ${blocklyBlockId}`);
      updateFn(mesh, shape, coords, scene); // Position, material
      applyPhysicsAggregate(mesh, physicsShapeType, physicsOptions, scene);
      // Ensure it's registered and metadata is correct
      MeshRegistry.registerMesh(mesh, 'dynamic', blocklyBlockId);
  } else {
      console.log(`Creating new ${shape.type}: ${blocklyBlockId}`);
      // Builder functions usually take 'name' as the first arg, which we use for blocklyBlockId
      mesh = createFn(blocklyBlockId, shape.size, scene); 
      mesh.id = blocklyBlockId; // Ensure ID is also set
      mesh.position.set(coords.x, coords.y, coords.z);
      setMaterial(mesh, shape.material, scene);
      mesh.actionManager = new BABYLON.ActionManager(scene);
      actionManagers.push(mesh.actionManager);
      applyPhysicsAggregate(mesh, physicsShapeType, physicsOptions, scene);
      // Register with custom UUID
      MeshRegistry.registerMesh(mesh, 'dynamic', blocklyBlockId);
  }
  return mesh; // Return for consistency, though not always used by caller
};

//Create functions for torus, ramp, capsule, cone, cylinder, box, wall, sphere


const createTorus = (shape: Shape, coords: Coords, scene: BABYLON.Scene, actionManagers: BABYLON.AbstractActionManager[]) => {
  createOrUpdatePrimitive(shape, coords, scene, actionManagers,
      (name, size) => BABYLON.MeshBuilder.CreateTorus(name, { diameter: size.d, thickness: size.t, tessellation: size.s }, scene),
      (mesh, s, c) => { mesh.position.set(c.x, c.y, c.z); setMaterial(mesh, s.material, scene); },
      BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.7, friction: 1.0 }
  );
};

const createRamp = (shape: Shape, coords: Coords, scene: BABYLON.Scene, actionManagers: BABYLON.AbstractActionManager[]) => {
  const blocklyBlockId = shape.id;
  let ramp = scene.getMeshById(blocklyBlockId) as BABYLON.Mesh;
  // Note: ExtrudeShape has a different signature, handle separately or adapt createOrUpdatePrimitive
  // For now, keeping original structure for ramp
  let recreateNeeded = false;
  if (ramp) {
      console.log(`Updating existing Ramp: ${blocklyBlockId}`);
      ramp.position.set(coords.x, coords.y, coords.z);
      setMaterial(ramp, shape.material, scene);
      applyPhysicsAggregate(ramp, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
      MeshRegistry.registerMesh(ramp, 'dynamic', blocklyBlockId);
  } else {
      console.log(`Creating new Ramp: ${blocklyBlockId}`);
      let width = shape.size.w / 2; let height = shape.size.h / 2; let length = shape.size.l / 2;
      var triangle = [new BABYLON.Vector3(-width, -height, 0), new BABYLON.Vector3(width, -height, 0), new BABYLON.Vector3(-width, height, 0)];
      triangle.push(triangle[0]);
      let extrudePath = [new BABYLON.Vector3(0, 0, -length), new BABYLON.Vector3(0, 0, length)];
      ramp = BABYLON.MeshBuilder.ExtrudeShape(blocklyBlockId, { shape: triangle, path: extrudePath, cap: BABYLON.Mesh.CAP_ALL }, scene);
      ramp.id = blocklyBlockId;
      ramp.position.set(coords.x, coords.y, coords.z);
      setMaterial(ramp, shape.material, scene);
      ramp.actionManager = new BABYLON.ActionManager(scene); actionManagers.push(ramp.actionManager);
      applyPhysicsAggregate(ramp, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.7, friction: 1.0 }, scene);
      MeshRegistry.registerMesh(ramp, 'dynamic', blocklyBlockId);
  }
};

const createCapsule = (shape: Shape, coords: Coords, scene: BABYLON.Scene, actionManagers: BABYLON.AbstractActionManager[]) => {
    createOrUpdatePrimitive(shape, coords, scene, actionManagers,
        (name, size) => BABYLON.MeshBuilder.CreateCapsule(name, { height: size.h, radius: size.d / 2 }, scene),
        (mesh, s, c) => { mesh.position.set(c.x, c.y, c.z); setMaterial(mesh, s.material, scene); },
        BABYLON.PhysicsShapeType.CAPSULE, { mass: 1, restitution: 0.7, friction: 1.0 }
    );
};

const createCone = (shape: Shape, coords: Coords, scene: BABYLON.Scene, actionManagers: BABYLON.AbstractActionManager[]) => {
    createOrUpdatePrimitive(shape, coords, scene, actionManagers,
        (name, size) => BABYLON.MeshBuilder.CreateCylinder(name, { height: size.h, diameterTop: size.t, diameterBottom: size.b }, scene),
        (mesh, s, c) => { mesh.position.set(c.x, c.y, c.z); setMaterial(mesh, s.material, scene); },
        BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.7, friction: 1.0 }
    );
};

const createCylinder = (shape: Shape, coords: Coords, scene: BABYLON.Scene, actionManagers: BABYLON.AbstractActionManager[]) => {
    createOrUpdatePrimitive(shape, coords, scene, actionManagers,
        (name, size) => BABYLON.MeshBuilder.CreateCylinder(name, { height: size.h, diameter: size.d }, scene),
        (mesh, s, c) => { mesh.position.set(c.x, c.y, c.z); setMaterial(mesh, s.material, scene); },
        BABYLON.PhysicsShapeType.CYLINDER, { mass: 1, restitution: 0.7, friction: 1.0 }
    );
};

const createBox = (shape: Shape, coords: Coords, scene: BABYLON.Scene, actionManagers: BABYLON.AbstractActionManager[]) => {
    createOrUpdatePrimitive(shape, coords, scene, actionManagers,
        (name, size) => BABYLON.MeshBuilder.CreateBox(name, { height: size.h, width: size.w, depth: size.l }, scene),
        (mesh, s, c) => { mesh.position.set(c.x, c.y, c.z); setMaterial(mesh, s.material, scene); },
        BABYLON.PhysicsShapeType.BOX, { mass: 1, restitution: 0.7, friction: 1.0 }
    );
};

const createWall = (shape: Shape, coords: Coords, scene: BABYLON.Scene, actionManagers: BABYLON.AbstractActionManager[]) => {
    const blocklyBlockId = shape.id;
    let wall = scene.getMeshById(blocklyBlockId) as BABYLON.Mesh;
    if (wall) {
        console.log(`Updating existing Wall: ${blocklyBlockId}`);
        wall.position.set(coords.x, coords.y, coords.z);
        if (shape.size.r < 0) shape.size.r = 0; if (shape.size.r > 360) shape.size.r = 360;
        wall.rotation.y = convertToRadians(shape.size.r);
        setMaterial(wall, shape.material, scene);
        applyPhysicsAggregate(wall, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 1.0 }, scene);
        MeshRegistry.registerMesh(wall, 'dynamic', blocklyBlockId);
    } else {
        console.log(`Creating new Wall: ${blocklyBlockId}`);
        wall = BABYLON.MeshBuilder.CreateTiledPlane(blocklyBlockId, { height: shape.size.h, width: shape.size.w, tileSize: shape.size.s || 1 }, scene);
        wall.id = blocklyBlockId;
        wall.position.set(coords.x, coords.y, coords.z);
        if (shape.size.r < 0) shape.size.r = 0; if (shape.size.r > 360) shape.size.r = 360;
        wall.rotation.y = convertToRadians(shape.size.r);
        setMaterial(wall, shape.material, scene);
        wall.actionManager = new BABYLON.ActionManager(scene); actionManagers.push(wall.actionManager);
        applyPhysicsAggregate(wall, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 1.0 }, scene);
        MeshRegistry.registerMesh(wall, 'dynamic', blocklyBlockId);
    }
};

const createSphere = (shape: Shape, coords: Coords, scene: BABYLON.Scene, actionManagers: BABYLON.AbstractActionManager[]) => {
    createOrUpdatePrimitive(shape, coords, scene, actionManagers,
        (name, size) => BABYLON.MeshBuilder.CreateSphere(name, { segments: 16, diameterX: size.w, diameterY: size.h, diameterZ: size.l }, scene),
        (mesh, s, c) => { mesh.position.set(c.x, c.y, c.z); setMaterial(mesh, s.material, scene); },
        BABYLON.PhysicsShapeType.SPHERE, { mass: 1, restitution: 0.7, friction: 0.5 }
    );
};

const createShape = async (
  shapeBlock: ShapeBlock,
  coordsBlock: CoordsBlock,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
): Promise<void> => {
  let shape = convertShapeBlockToShape(shapeBlock);
  let coords = convertCoordsBlockToCoords(coordsBlock);

  if (shape && coords) {
    // Ensure shape.id (Blockly Block ID) is present
    if (!shape.id) {
        console.error("Shape data from block is missing 'id' property. Cannot create shape.", shape);
        return;
    }
    switch (shape.type) {
      case 'customObject':
        // createCustomObject returns the placeholder TransformNode
        const placeholder = createCustomObject(shape as any, coords, scene, actionManagers);
        // The actual mesh registration happens inside loadAndParentCustomObject after load.
        // Placeholder itself is not the final registered mesh unless load fails and it's cleaned up.
        break;
      case "sphere": createSphere(shape, coords, scene, actionManagers); break;
      case "box": createBox(shape, coords, scene, actionManagers); break;
      case "wall": createWall(shape, coords, scene, actionManagers); break;
      case "cylinder": createCylinder(shape, coords, scene, actionManagers); break;
      case "cone": createCone(shape, coords, scene, actionManagers); break;
      case "torus": createTorus(shape, coords, scene, actionManagers); break;
      case "capsule": createCapsule(shape, coords, scene, actionManagers); break;
      case "ramp": createRamp(shape, coords, scene, actionManagers); break;
      default: console.warn(`Unknown shape type: ${shape.type}`);
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
  let childNode = convertShapeBlockToMesh(childBlock, scene); // Could be TransformNode for custom obj
  let parentNode = convertShapeBlockToMesh(parentBlock, scene); // Could be TransformNode

  // Ensure they are AbstractMesh instances for merging and physics
  if (!(childNode instanceof BABYLON.AbstractMesh) || !(parentNode instanceof BABYLON.AbstractMesh)) {
      console.error("Cannot 'addTo' (merge): One or both nodes are not AbstractMesh (e.g. still loading). Child:", childNode?.getClassName(), "Parent:", parentNode?.getClassName());
      return;
  }
  
  let childMesh = childNode as BABYLON.Mesh; // Cast after check
  let parentMesh = parentNode as BABYLON.Mesh; // Cast after check

  if (childMesh && parentMesh) {
    // Unregister original meshes before merging
    MeshRegistry.unregisterMeshByReference(childMesh);
    MeshRegistry.unregisterMeshByReference(parentMesh);

    // Original merging logic...
    let parentAABB = parentMesh.getBoundingInfo(); // Use existing BoundingInfo
    let childAABB = childMesh.getBoundingInfo();   // Use existing BoundingInfo

    // Transform min/max to world coordinates
    const parentMinWorld = BABYLON.Vector3.TransformCoordinates(parentAABB.minimum, parentMesh.getWorldMatrix());
    const parentMaxWorld = BABYLON.Vector3.TransformCoordinates(parentAABB.maximum, parentMesh.getWorldMatrix());
    const childMinWorld = BABYLON.Vector3.TransformCoordinates(childAABB.minimum, childMesh.getWorldMatrix());
    const childMaxWorld = BABYLON.Vector3.TransformCoordinates(childAABB.maximum, childMesh.getWorldMatrix());
    
    let aggMaxX = Math.max(parentMaxWorld.x, childMaxWorld.x);
    let aggMaxY = Math.max(parentMaxWorld.y, childMaxWorld.y);
    let aggMaxZ = Math.max(parentMaxWorld.z, childMaxWorld.z);
    let aggMinX = Math.min(parentMinWorld.x, childMinWorld.x);
    let aggMinY = Math.min(parentMinWorld.y, childMinWorld.y);
    let aggMinZ = Math.min(parentMinWorld.z, childMinWorld.z);

    let deltaPosition = new BABYLON.Vector3((aggMinX + aggMaxX) / 2, (aggMinY + aggMaxY) / 2, (aggMinZ + aggMaxZ) / 2);

    let newParentPosition = parentMesh.position.subtract(deltaPosition);
    let newChildPosition = childMesh.position.subtract(deltaPosition);

    parentMesh.position = newParentPosition;
    childMesh.position = newChildPosition;
    
    let mergedMesh = BABYLON.Mesh.MergeMeshes([parentMesh, childMesh], true, true, undefined, false, true) as BABYLON.Mesh;
    
    if (!mergedMesh) {
        console.error("Mesh.MergeMeshes returned null or undefined.");
        // Re-register original meshes if merge failed? Or restore their positions.
        // For now, just log and exit.
        return;
    }

    // The new merged mesh should get the parent's Blockly Block ID for identification
    mergedMesh.id = parentMesh.id; // parentMesh.id is parentBlock's Blockly Block ID
    mergedMesh.name = parentMesh.name; // parentMesh.name is parentBlock's Blockly Block ID
    mergedMesh.position = mergedMesh.position.add(deltaPosition);
    mergedMesh.actionManager = new BABYLON.ActionManager(scene);
    actionManagers.push(mergedMesh.actionManager);

    if (scene.isPhysicsEnabled() === true) {
      try {
          new BABYLON.PhysicsAggregate(mergedMesh, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.1, friction: 1.0 }, scene);
      } catch (physicsError) { console.error("Physics error on merged mesh:", physicsError); }
    }
    // Register the new merged mesh
    MeshRegistry.registerMesh(mergedMesh, 'dynamic', parentMesh.id); // Use parent's blockly ID
  }
};


const createShapeAndAddTo = async (
  shapeBlock: ShapeBlock,
  parentBlock: ShapeBlock,
  coordsBlock: CoordsBlock,
  scene: BABYLON.Scene,
  actionManagers: BABYLON.AbstractActionManager[]
): Promise<void> => {
  await createShape(shapeBlock, coordsBlock, scene, actionManagers); // Creates child
  // Delay slightly to allow custom objects to potentially load their mesh before merging
  // This is a bit of a hack. A better solution would involve explicit ready state.
  await new Promise(resolve => setTimeout(resolve, 100)); // e.g., 100ms delay
  addTo(shapeBlock, parentBlock, scene, actionManagers);
};

// Clone a shape into a new mesh and set the position
const clone = (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock, scene: BABYLON.Scene) => {
  let meshToClone = convertShapeBlockToMesh(shapeBlock, scene);
  let coords = convertCoordsBlockToCoords(coordsBlock);

  if (meshToClone instanceof BABYLON.AbstractMesh && coords) {
    // Cloned mesh needs a NEW Blockly Block ID if it's to be manipulated by other blocks.
    // This is tricky as `clone` block doesn't generate a new block.
    // For now, it gets a Babylon-generated ID/name for the clone.
    // And a NEW custom UUID from the registry.
    let clonedMesh = meshToClone.clone(`${meshToClone.name}-clone`, null, true, false) as BABYLON.Mesh; // Make sure it's a Mesh for physics
    if(clonedMesh){
        clonedMesh.position.set(coords.x, coords.y, coords.z);
        // Cloned mesh should be registered as a new entity
        const newCustomId = MeshRegistry.registerMesh(clonedMesh, 'dynamic'); // No blocklyBlockId unless we invent one
        console.log(`Cloned mesh ${clonedMesh.name} registered with new customID: ${newCustomId}`);

        // If original had physics, clone might need new physics body
        if (scene.isPhysicsEnabled() && meshToClone.physicsBody) {
            const originalMetadata = (meshToClone.metadata || {}) as any;
            const physicsOptions = originalMetadata.physicsOptions || { mass: 1, restitution: 0.7, friction: 0.5 }; // Default or from original
            const physicsShape = originalMetadata.physicsShapeType || BABYLON.PhysicsShapeType.CONVEX_HULL; // Default or from original
            applyPhysicsAggregate(clonedMesh, physicsShape, physicsOptions, scene);
        }
    }
  } else {
      console.warn("Clone failed: Original mesh not found or not an AbstractMesh.");
  }
};

// Remove a shape from the scene
const remove = (shapeBlock: ShapeBlock, scene: BABYLON.Scene) => {
  let mesh:any = convertShapeBlockToMesh(shapeBlock, scene); // Gets mesh by Blockly Block ID
  if (mesh) {
    MeshRegistry.unregisterMeshByReference(mesh); // Unregister using its metadata.customID
    if (mesh.physicsBody) { // Check AbstractMesh for physicsBody
      mesh.physicsBody.dispose();
    }
    // If it's a placeholder for a custom object, it might have children (the actual model)
    if (mesh instanceof BABYLON.TransformNode) {
        // Dispose children first if they aren't disposed with parent
        mesh.getChildMeshes(true).forEach(child => child.dispose());
    }
    mesh.dispose(); // Dispose the mesh/transformNode itself
    console.log(`Removed mesh: ${mesh.name} (Blockly ID: ${shapeBlock[0]?.id})`);
  } else {
    console.warn(`Remove: Mesh not found for shapeBlock:`, shapeBlock);
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
const createGround = (shape: Shape & {id: string, material: any, size: any, tileSize: number}, scene: BABYLON.Scene) => {
  const groundBlocklyId = shape.id || 'ground001'; // Default if no ID from block
  let ground = scene.getMeshById(groundBlocklyId) as BABYLON.Mesh;

  if (ground) {
      console.log(`Updating existing Ground: ${groundBlocklyId}`);
      setMaterial(ground, shape.material, scene);
      applyPhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 1.0 }, scene);
      MeshRegistry.registerMesh(ground, 'dynamic', groundBlocklyId); // Ground is dynamic if from block
  } else {
      console.log(`Creating new Ground: ${groundBlocklyId}`);
      let width = shape.size.w; let length = shape.size.l;
      let tileSize = shape.tileSize || 1; if (tileSize <= 0) tileSize = 1;
      let grid = { h: Math.max(1, Math.round(length / tileSize)), w: Math.max(1, Math.round(width / tileSize)) };
      ground = BABYLON.MeshBuilder.CreateTiledGround(groundBlocklyId, {
          xmin: -width / 2, zmin: -length / 2, xmax: width / 2, zmax: length / 2,
          subdivisions: grid,
      }, scene);
      ground.id = groundBlocklyId; // Ensure ID is set
      ground.name = "ground"; // Keep a generic name for easy finding if needed outside blockly id
      setMaterial(ground, shape.material, scene);
      applyPhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 1.0 }, scene);
      MeshRegistry.registerMesh(ground, 'dynamic', groundBlocklyId);
  }
  return ground; // Return ground reference
};
// Creates the skybox
const createSkybox = (skyboxData: {asset: string}, scene: BABYLON.Scene) => {
  // Skybox is usually not registered as a manipulable mesh in the same way
  if (scene.environmentTexture) {
      scene.environmentTexture.dispose();
  }
  scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(`./assets/env/${skyboxData.asset}.env`, scene);
  
  let existingSkybox = scene.getMeshByName("skybox");
  if (existingSkybox) existingSkybox.dispose();

  let sky = scene.createDefaultSkybox(scene.environmentTexture, true, 1000, 0.0, false); // Added parameters
  if (sky) { // createDefaultSkybox can return null
    sky.name = "skybox";
    sky.id = "skybox_mesh"; // Give it a unique ID
    // Optionally register if you want to track it, though usually not needed for skybox
    // MeshRegistry.registerMesh(sky, 'static', 'skybox_internal'); 
  }
  return sky;
};

// Set the sky/background color
const setSkyColor = (color: string, scene: BABYLON.Scene) => {
  scene.clearColor = BABYLON.Color4.FromHexString(color);
  // If using a skybox and want to remove it when setting color:
  const skyboxMesh = scene.getMeshByName("skybox");
  if (skyboxMesh) {
      // MeshRegistry.unregisterMeshByReference(skyboxMesh); // If it was registered
      skyboxMesh.dispose();
  }
  if (scene.environmentTexture) {
      scene.environmentTexture.dispose();
      scene.environmentTexture = null;
  }
};
// --- Function to load a model by URL and place it ---
async function loadAndPlaceModel(
  nameForBabylonAsset: string, // Name for the conceptual asset being loaded
  modelUrl: string,
  defaultPosition: BABYLON.Vector3,
  scene: BABYLON.Scene,
  existingAssetCustomID?: string, // The customID for the entire asset if reloading
  initialTransform?: SavedTransform
): Promise<BABYLON.AbstractMesh | null> { // Returns the main mesh registered
  // console.log(`Loading asset "${nameForBabylonAsset}" (Asset CustomID: ${existingAssetCustomID || 'new'}) from URL: ${modelUrl}`);
  let result:any;
  try {
      result = await BABYLON.SceneLoader.ImportMeshAsync(
          null, // meshNames to import - null for all
          "",   // rootURL - already part of modelUrl for GLB
          modelUrl,
          scene,
          undefined, // onProgress
          ".glb"
      );

      if (!result.meshes || result.meshes.length === 0) {
          console.warn(`SceneLoader returned no meshes for URL: ${modelUrl}`);
          return null;
      }

      // --- Determine the effective root/main mesh for the asset ---
      // This mesh will be registered and will "own" the asset's customID.
      let effectiveRootMesh: BABYLON.AbstractMesh | null = null;

      // Try to find a mesh named "__root__" that is an AbstractMesh and has no parent.
      // This is often the convention for GLTF exporters.
      let rootNode = result.meshes.find(m => m.name === "__root__" && m.parent === null && m instanceof BABYLON.AbstractMesh) as BABYLON.AbstractMesh;

      if (rootNode) {
          effectiveRootMesh = rootNode;
          // console.log(`Found conventional "__root__" mesh: ${effectiveRootMesh.name}`);
      } else {
          // If no "__root__", find the first AbstractMesh in the loaded meshes that has no parent.
          // This assumes the GLB might have one primary mesh at the top level.
          effectiveRootMesh = result.meshes.find(m => m.parent === null && m instanceof BABYLON.AbstractMesh) as BABYLON.AbstractMesh;
          if (effectiveRootMesh) {
            //   console.log(`Found first parentless AbstractMesh as effective root: ${effectiveRootMesh.name}`);
          }
      }
      
      // If still no clear effectiveRootMesh (e.g., all loaded nodes are parented to something already in scene,
      // or the first parentless node is just a TransformNode),
      // we might need a new parent TransformNode to group them.
      // For simplicity now, if no AbstractMesh root, we'll take the first AbstractMesh, even if it has a parent (less ideal).
      if (!effectiveRootMesh) {
          effectiveRootMesh = result.meshes.find(m => m instanceof BABYLON.AbstractMesh) as BABYLON.AbstractMesh;
          if (effectiveRootMesh) {
            //   console.warn(`No clear parentless root AbstractMesh found. Using first AbstractMesh: ${effectiveRootMesh.name}. This might not be the intended asset root.`);
          } else {
              console.error(`No AbstractMesh found in the loaded asset from URL: ${modelUrl}. Cannot proceed.`);
              result.meshes.forEach(m => m.dispose()); // Clean up loaded nodes
              return null;
          }
      }

      // Set the name and ID for the conceptual asset on this effectiveRootMesh
      effectiveRootMesh.name = nameForBabylonAsset;
      effectiveRootMesh.id = nameForBabylonAsset;

      // Apply transform (position, rotation, scaling) to the effectiveRootMesh
      // Apply transform (position, rotation, scaling) to the effectiveRootMesh
      if (initialTransform) {
        effectiveRootMesh.position = new BABYLON.Vector3(
            initialTransform.position.x,
            initialTransform.position.y,
            initialTransform.position.z
        );

        // --- APPLY ROTATION QUATERNION ---
        if (initialTransform.rotationQuaternion) {
            effectiveRootMesh.rotationQuaternion = new BABYLON.Quaternion(
                initialTransform.rotationQuaternion.x,
                initialTransform.rotationQuaternion.y,
                initialTransform.rotationQuaternion.z,
                initialTransform.rotationQuaternion.w
            );
        } else if ((initialTransform as any).rotation) { // Backwards compatibility for old save format with Euler
            console.warn(`Loading old save format with Euler rotation for mesh ${effectiveRootMesh.name}. Converting to Quaternion.`);
            const eulerRotation = (initialTransform as any).rotation;
            effectiveRootMesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                eulerRotation.x,
                eulerRotation.y,
                eulerRotation.z
            );
        } else {
            // No rotation specified, ensure quaternion is identity or default from model
            if (!effectiveRootMesh.rotationQuaternion) {
                effectiveRootMesh.rotationQuaternion = BABYLON.Quaternion.Identity();
            }
        }
        // After setting rotationQuaternion, mesh.rotation (Euler) will be updated automatically by Babylon.js

        effectiveRootMesh.scaling = new BABYLON.Vector3(
            initialTransform.scaling.x,
            initialTransform.scaling.y,
            initialTransform.scaling.z
        );
    } else {
        effectiveRootMesh.position = defaultPosition;
        // Ensure a default rotation quaternion if not set by the model
        if (!effectiveRootMesh.rotationQuaternion) {
            effectiveRootMesh.rotationQuaternion = BABYLON.Quaternion.Identity();
        }
    }


      // --- METADATA for the ASSET (on effectiveRootMesh) ---
      if (!effectiveRootMesh.metadata) effectiveRootMesh.metadata = {};
      effectiveRootMesh.metadata.sourceModelUrl = modelUrl;
      if (existingAssetCustomID) effectiveRootMesh.metadata.customID = existingAssetCustomID;
      
      const assetCustomID = MeshRegistry.registerMesh(effectiveRootMesh, 'static');
      effectiveRootMesh.metadata.customID = assetCustomID;
      effectiveRootMesh.metadata.isAssetRoot = true;

      // console.log(`>>> loadAndPlaceModel: Effective Root Asset "${effectiveRootMesh.name}" (CustomID: ${assetCustomID}) METADATA AFTER REGISTRATION:`, JSON.parse(JSON.stringify(effectiveRootMesh.metadata || {})));

      // --- METADATA FOR ALL VISIBLE MESHES PART OF THIS ASSET ---
      // This includes the effectiveRootMesh itself (if it's visual) and all its descendants.
      // Also, if the GLB had multiple top-level meshes, they are all part of this "asset".
      const childMetadataBase = {
          meshType: 'static' as MeshRegistry.MeshType,
          isChildOfStaticAsset: true, // Mark them as parts of a larger registered asset
          rootAssetCustomID: assetCustomID
      };

      // Iterate over ALL meshes loaded from the GLB result, not just children of effectiveRootMesh.
      // This handles cases where a GLB might have multiple roots or a flat structure.
      for (const loadedNode of result.meshes) {
          if (loadedNode instanceof BABYLON.AbstractMesh) { // Only care about actual meshes
              const mesh = loadedNode as BABYLON.AbstractMesh;
              mesh.isPickable = true; // Ensure all parts are pickable

              if (mesh !== effectiveRootMesh) { // If it's not the main registered root
                  if (!mesh.metadata) mesh.metadata = {};
                  mesh.metadata.meshType = childMetadataBase.meshType;
                  mesh.metadata.isChildOfStaticAsset = childMetadataBase.isChildOfStaticAsset;
                  mesh.metadata.rootAssetCustomID = childMetadataBase.rootAssetCustomID;
                  // console.log(`>>> loadAndPlaceModel: Mesh part "${mesh.name}" (of asset ${assetCustomID}) METADATA SET:`, JSON.parse(JSON.stringify(mesh.metadata || {})));
              }
          }
      }
      effectiveRootMesh.isPickable = true; // Ensure root is also pickable

      // Physics is typically applied to the main representative mesh (effectiveRootMesh)
      if (scene.isPhysicsEnabled() && scene.getPhysicsEngine()?.getPhysicsPlugin()) {
          new BABYLON.PhysicsAggregate(effectiveRootMesh, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.4, friction: 0.5 }, scene);
      }

      // console.log(`Asset "${nameForBabylonAsset}" (Effective Root: "${effectiveRootMesh.name}", CustomID: ${assetCustomID}) loaded.`);
      return effectiveRootMesh; // Return the mesh that was registered

  } catch (error) {
      console.error(`Failed to load or place model "${nameForBabylonAsset}" from ${modelUrl}:`, error);
      // Clean up any meshes that might have been partially loaded into the scene
      if (result && result.meshes) {
          result.meshes.forEach(m => {
              if (!m.isDisposed()) {
                  m.dispose();
              }
          });
      }
      // If an existingAssetCustomID was provided, it might have been registered if an error occurred after.
      // However, registerMesh should ideally be robust. For safety, one might unregister here on error.
      // if (existingAssetCustomID) MeshRegistry.unregisterMesh(existingAssetCustomID);
      throw error;
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
  loadAndPlaceModel,
  setModelUrlResolver,
  getMeshURL,
};
