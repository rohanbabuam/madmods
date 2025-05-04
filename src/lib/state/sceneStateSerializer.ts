// src/lib/blockly/sceneState.ts

import * as Blockly from 'blockly/core';
import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import { type CustomSceneState, METADATA_KEYS, type SavedCameraState, type SavedSceneObject, type SavedSkyboxState, type SavedGroundState, type SavedVector3, type SavedQuaternion } from '$lib/types/CustomeSceneState'; // Adjust path if needed
import type { ThreeD } from '../blockly/3d/index.ts'; // Adjust path if needed
import { setMaterial } from '../blockly/3d/materials/index'; // Function to apply material
import { loadAndPlaceModel } from '../blockly/3d/world/index.ts'; // Function to load dropped models

/**
 * Extracts the relevant state of the 3D scene for serialization.
 * Focuses on manually managed objects (drag-dropped, ground, skybox) and scene settings.
 * @param scene The BabylonJS scene instance.
 * @returns An object containing the serializable state (camera, skybox, ground, manual objects, ambient light).
 */
function extractSerializableSceneData(scene: BABYLON.Scene): {
    cameraState: SavedCameraState | null;
    skyboxState: SavedSkyboxState | null;
    groundState: SavedGroundState | null;
    sceneObjects: SavedSceneObject[];
    ambientLightIntensity: number | undefined;
} {
    if (!scene) {
        console.error("extractSerializableSceneData: Scene is null.");
        return { cameraState: null, skyboxState: null, groundState: null, sceneObjects: [], ambientLightIntensity: undefined };
    }

    let cameraState: SavedCameraState | null = null;
    let skyboxState: SavedSkyboxState | null = null;
    let groundState: SavedGroundState | null = null;
    const sceneObjects: SavedSceneObject[] = [];
    let ambientLightIntensity: number | undefined = undefined;

    // 1. Camera State
    const activeCamera = scene.activeCamera;
    if (activeCamera) {
        cameraState = {
            type: activeCamera.getClassName(),
            position: { x: activeCamera.position.x, y: activeCamera.position.y, z: activeCamera.position.z },
        };
        if (activeCamera instanceof BABYLON.ArcRotateCamera) {
            cameraState.target = { x: activeCamera.target.x, y: activeCamera.target.y, z: activeCamera.target.z };
            cameraState.radius = activeCamera.radius;
            cameraState.alpha = activeCamera.alpha;
            cameraState.beta = activeCamera.beta;
        } else if (activeCamera.rotationQuaternion) {
            // Use rotationQuaternion for FreeCamera and others
            cameraState.rotationQuaternion = {
                x: activeCamera.rotationQuaternion.x,
                y: activeCamera.rotationQuaternion.y,
                z: activeCamera.rotationQuaternion.z,
                w: activeCamera.rotationQuaternion.w,
            };
        }
        // Add other relevant camera props like fov if needed
    }

    // 2. Ambient Light
    // Assuming HemisphericLight named 'defaultAmbient' or similar might exist
    const ambientLight = scene.getLightByName("defaultAmbient") as BABYLON.HemisphericLight;
     if (ambientLight) {
        // Convert back from the internal multiplier if needed, or store the desired 0-100 value if available elsewhere
        // Let's assume we store the environmentIntensity (which seems to be 0-1 range based on your code)
        ambientLightIntensity = scene.environmentIntensity !== undefined ? scene.environmentIntensity * 100 : undefined; // Scale back to 0-100 range if needed
        if (ambientLightIntensity === undefined && ambientLight) {
            ambientLightIntensity = ambientLight.intensity * 1000 / lighting.BRIGHTNESS_MULTIPLIER; // Fallback using the multiplier logic
        }
     }


    // 3. Iterate through Meshes and TransformNodes to find manual objects, skybox, ground
    scene.meshes.forEach((mesh) => {
        // Check for Ground
        if (mesh.name === "ground" && mesh.metadata?.[METADATA_KEYS.IS_MANUAL_OBJECT]) { // Check if ground is marked manual
            groundState = {
                creationParams: mesh.metadata[METADATA_KEYS.CREATION_PARAMS] || {}, // Store creation params if available
                materialName: mesh.metadata[METADATA_KEYS.MATERIAL_NAME] || 'default',
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotationQuaternion: mesh.rotationQuaternion ? { x: mesh.rotationQuaternion.x, y: mesh.rotationQuaternion.y, z: mesh.rotationQuaternion.z, w: mesh.rotationQuaternion.w } : { x: 0, y: 0, z: 0, w: 1 },
                scaling: { x: mesh.scaling.x, y: mesh.scaling.y, z: mesh.scaling.z },
                isEnabled: mesh.isEnabled(),
            };
            console.log("Saving Ground State:", groundState);
            return; // Continue to next mesh
        }

        // Check for Skybox
        // Skybox might be harder to identify reliably just by name if user renames it.
        // Using metadata or a specific check is better. Assuming metadata for now.
        // The skybox mesh created by `createDefaultSkybox` might not have the metadata automatically.
        // We might need to rely on the texture name.
        if (mesh.name === "skybox" && scene.environmentTexture) { // Simplified check
             skyboxState = {
                 // Extract asset name from the URL in environmentTexture if possible
                 asset: scene.environmentTexture.name.replace(".env", "").split('/').pop() || "defaultEnvironment", // Example extraction
             };
             console.log("Saving Skybox State:", skyboxState);
             return; // Continue to next mesh
        }


        // Check for other Manual Objects (Meshes) based on metadata
        if (mesh.metadata?.[METADATA_KEYS.IS_MANUAL_OBJECT] === true) {
            const savedObject: SavedSceneObject = {
                babylonUniqueId: mesh.uniqueId,
                babylonClassName: mesh.getClassName(),
                name: mesh.name,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotationQuaternion: mesh.rotationQuaternion ? { x: mesh.rotationQuaternion.x, y: mesh.rotationQuaternion.y, z: mesh.rotationQuaternion.z, w: mesh.rotationQuaternion.w } : { x: 0, y: 0, z: 0, w: 1 },
                scaling: { x: mesh.scaling.x, y: mesh.scaling.y, z: mesh.scaling.z },
                isEnabled: mesh.isEnabled(),
                metadata: { // Only save necessary metadata
                    [METADATA_KEYS.IS_MANUAL_OBJECT]: true, // Mark as manual
                    [METADATA_KEYS.SOURCE_MODEL_URL]: mesh.metadata[METADATA_KEYS.SOURCE_MODEL_URL], // Crucial for reloading GLBs
                    [METADATA_KEYS.MATERIAL_NAME]: mesh.metadata[METADATA_KEYS.MATERIAL_NAME],
                    // Add CREATION_PARAMS if this object originated from a primitive block and was then marked manual
                    [METADATA_KEYS.CREATION_PARAMS]: mesh.metadata[METADATA_KEYS.CREATION_PARAMS],
                },
            };
            sceneObjects.push(savedObject);
            console.log(`Saving Manual Mesh: ${mesh.name} (ID: ${mesh.uniqueId}) URL: ${savedObject.metadata[METADATA_KEYS.SOURCE_MODEL_URL]}`);
        }
    });

    // Optional: Iterate through scene.transformNodes if manual objects could be just TransformNodes
    // scene.transformNodes.forEach(node => { ... });

    return { cameraState, skyboxState, groundState, sceneObjects, ambientLightIntensity };
}


/**
 * Saves the current state of the Blockly workspace and the relevant 3D scene parts.
 * @param workspace The Blockly workspace instance.
 * @param threeD The ThreeD engine instance.
 * @param physicsEnabled The current global physics setting.
 * @returns A CustomSceneState object ready for serialization (e.g., to JSON).
 */
export function saveSceneState(
    workspace: Blockly.WorkspaceSvg,
    threeD: ThreeD | null,
    physicsEnabled: boolean
): CustomSceneState | null {
    console.log("Attempting to save scene state...");
    if (!workspace) {
        console.error("Save failed: Blockly workspace is not available.");
        return null;
    }
    if (!threeD || !threeD.scene) {
        console.error("Save failed: 3D scene is not available.");
        return null;
    }

    try {
        // 1. Get Blockly workspace state
        const blocklyJson = Blockly.serialization.workspaces.save(workspace);

        // 2. Extract relevant 3D scene state
        const { cameraState, skyboxState, groundState, sceneObjects, ambientLightIntensity } = extractSerializableSceneData(threeD.scene);

        // 3. Combine into the final state object
        const state: CustomSceneState = {
            version: 1, // Start with version 1
            blocklyWorkspace: blocklyJson,
            physicsEnabled: physicsEnabled,
            cameraState: cameraState,
            skyboxState: skyboxState,
            groundState: groundState,
            sceneObjects: sceneObjects,
            ambientLightIntensity: ambientLightIntensity,
        };

        console.log("Scene state saved successfully.");
        // console.log("Saved State Object:", JSON.stringify(state, null, 2)); // Log for debugging
        return state;

    } catch (error) {
        console.error("Error during saveSceneState:", error);
        return null;
    }
}

/**
 * Loads the application state from a CustomSceneState object.
 * Resets the current scene, loads Blockly, recreates manual objects, and then runs Blockly code.
 * @param state The CustomSceneState object to load.
 * @param workspace The Blockly workspace instance to load into.
 * @param threeD The ThreeD engine instance.
 * @param setPhysicsEnabled Callback function to update the global physics state variable in blockly.ts.
 * @param runBlocklyCode Callback function (likely `run(false, state.physicsEnabled)`) to execute the loaded blocks.
 */
export async function loadSceneState(
    state: CustomSceneState,
    workspace: Blockly.WorkspaceSvg,
    threeD: ThreeD | null,
    setPhysicsEnabled: (enabled: boolean) => void,
    runBlocklyCode: () => Promise<void>
): Promise<void> {
    console.log("Attempting to load scene state...");
    if (!state || typeof state !== 'object' || !state.version) {
        throw new Error("Load failed: Invalid or missing scene state object.");
    }
    if (!workspace) {
        throw new Error("Load failed: Blockly workspace is not available.");
    }
    if (!threeD) {
        throw new Error("Load failed: 3D engine instance is not available.");
    }
     if (state.version !== 1) {
        // Handle version mismatch if necessary (e.g., migration logic or error)
        console.warn(`Loading state version ${state.version}, expected version 1. Compatibility issues may arise.`);
    }

    try {
        console.log("Loading State - Step 1: Resetting environment...");
        // 1. Reset Blockly Workspace
        workspace.clear();

        // 2. Set Physics State Globally (using the callback)
        setPhysicsEnabled(state.physicsEnabled);

        // 3. Reset 3D Scene using the loaded physics state
        // This creates a new empty scene with correct physics settings
        await threeD.createScene(true, state.physicsEnabled); // true = init environment

        console.log("Loading State - Step 2: Loading Blockly Workspace...");
        // 4. Load Blockly Workspace JSON
        if (state.blocklyWorkspace) {
            Blockly.serialization.workspaces.load(state.blocklyWorkspace, workspace);
        } else {
            console.warn("Loaded state is missing Blockly workspace data.");
        }

        console.log("Loading State - Step 3: Loading Scene Settings (Skybox, Ground, Light, Camera)...");
        // 5. Load Scene Settings (before objects that might depend on them)

        // Load Ambient Light
        if (state.ambientLightIntensity !== undefined) {
             threeD.setAmbientLightIntensity(state.ambientLightIntensity);
        }

        // Load Skybox (assuming threeD has a method or uses createSkybox from world)
        if (state.skyboxState && state.skyboxState.asset) {
            // Need a way to recreate skybox from state - adjust if threeD.createSkybox needs refinement
            // This might need direct access to the world module's createSkybox
             try {
                 // world.createSkybox({ asset: state.skyboxState.asset }, threeD.scene); // Example direct call
                 threeD.createSkybox({ asset: state.skyboxState.asset }); // Assuming ThreeD has this wrapper
             } catch (e) { console.error("Failed to load skybox:", e); }
        }

        // Load Ground (assuming threeD has a method or uses createGround from world)
        if (state.groundState) {
             try {
                 // Create a mock 'Shape' object for createGround
                 const groundShapeData: any = {
                    id: 'ground', // Ensure consistent ID
                    type: 'ground', // Not strictly needed by createGround but good practice
                    size: state.groundState.creationParams, // Use saved params
                    material: { type: state.groundState.materialName || 'default' },
                    // tileSize might be inside creationParams or needs separate saving/loading
                    tileSize: state.groundState.creationParams?.tileSize || 1
                 };
                 // world.createGround(groundShapeData, threeD.scene); // Example direct call
                 threeD.createGround(groundShapeData); // Assuming ThreeD has this wrapper
                 // Apply saved transforms AFTER creation
                 const groundMesh = threeD.scene?.getMeshByName("ground");
                 if (groundMesh) {
                     groundMesh.position = new BABYLON.Vector3(state.groundState.position.x, state.groundState.position.y, state.groundState.position.z);
                     groundMesh.rotationQuaternion = new BABYLON.Quaternion(state.groundState.rotationQuaternion.x, state.groundState.rotationQuaternion.y, state.groundState.rotationQuaternion.z, state.groundState.rotationQuaternion.w);
                     groundMesh.scaling = new BABYLON.Vector3(state.groundState.scaling.x, state.groundState.scaling.y, state.groundState.scaling.z);
                     groundMesh.setEnabled(state.groundState.isEnabled);
                     // IMPORTANT: Mark the loaded ground as manual
                     if (!groundMesh.metadata) groundMesh.metadata = {};
                     groundMesh.metadata[METADATA_KEYS.IS_MANUAL_OBJECT] = true;
                     groundMesh.metadata[METADATA_KEYS.CREATION_PARAMS] = state.groundState.creationParams;
                     groundMesh.metadata[METADATA_KEYS.MATERIAL_NAME] = state.groundState.materialName;
                 }

             } catch (e) { console.error("Failed to load ground:", e); }
        }


        console.log("Loading State - Step 4: Loading Manual Scene Objects...");
        // 6. Load Manual Scene Objects
        const objectLoadPromises: Promise<any>[] = [];
        if (state.sceneObjects && state.sceneObjects.length > 0) {
            for (const savedObj of state.sceneObjects) {
                // Primarily handle objects loaded via GLB URL
                if (savedObj.metadata?.[METADATA_KEYS.SOURCE_MODEL_URL]) {
                    const modelUrl = savedObj.metadata[METADATA_KEYS.SOURCE_MODEL_URL];
                    const position = new BABYLON.Vector3(savedObj.position.x, savedObj.position.y, savedObj.position.z);
                    const rotation = new BABYLON.Quaternion(savedObj.rotationQuaternion.x, savedObj.rotationQuaternion.y, savedObj.rotationQuaternion.z, savedObj.rotationQuaternion.w);
                    const scaling = new BABYLON.Vector3(savedObj.scaling.x, savedObj.scaling.y, savedObj.scaling.z);
                    const materialName = savedObj.metadata[METADATA_KEYS.MATERIAL_NAME];

                    console.log(`Queueing load for: ${savedObj.name} from ${modelUrl}`);
                    // Use loadAndPlaceModel (ensure it exists and is imported)
                    const loadPromise = loadAndPlaceModel(savedObj.name, modelUrl, position, threeD.scene!)
                        .then(loadedMesh => {
                            if (loadedMesh) {
                                console.log(`Applying transforms and metadata to loaded: ${savedObj.name}`);
                                loadedMesh.rotationQuaternion = rotation;
                                loadedMesh.scaling = scaling;
                                loadedMesh.setEnabled(savedObj.isEnabled);

                                // Apply material
                                if (materialName) {
                                     setMaterial(loadedMesh, { type: materialName }, threeD.scene!); // Assuming setMaterial takes a simple {type: name} object
                                }

                                // IMPORTANT: Mark as manual and add metadata back
                                if (!loadedMesh.metadata) loadedMesh.metadata = {};
                                loadedMesh.metadata[METADATA_KEYS.IS_MANUAL_OBJECT] = true;
                                loadedMesh.metadata[METADATA_KEYS.SOURCE_MODEL_URL] = modelUrl;
                                loadedMesh.metadata[METADATA_KEYS.MATERIAL_NAME] = materialName;

                            } else {
                                console.warn(`Failed to load mesh during state load: ${savedObj.name}`);
                            }
                        })
                        .catch(error => {
                            console.error(`Error loading object ${savedObj.name} from state:`, error);
                            // Decide how to handle failures - skip object, show error, etc.
                        });
                    objectLoadPromises.push(loadPromise);
                } else if (savedObj.metadata?.[METADATA_KEYS.CREATION_PARAMS]) {
                    // **Placeholder for loading manually modified primitives**
                    // This is more complex. Would require:
                    // 1. Calling the correct `create[ShapeType]` function from world/index.ts
                    //    using `savedObj.metadata[METADATA_KEYS.CREATION_PARAMS]`.
                    // 2. Applying the saved position, rotation, scaling, material AFTER creation.
                    // 3. Marking it as manual.
                    console.warn(`Loading manually modified primitive "${savedObj.name}" is not fully implemented yet. Skipping.`);
                    // Example (Conceptual - Requires significant changes to createShape etc.):
                    // const createParams = savedObj.metadata[METADATA_KEYS.CREATION_PARAMS];
                    // const shapeType = savedObj.metadata[METADATA_KEYS.BLOCKLY_TYPE]; // Need to save this too!
                    // if (shapeType && createParams) {
                    //    // Call a modified createShape or specific create function...
                    //    const mockShapeBlock = [{ id: savedObj.name, type: shapeType, size: createParams, material: {type: savedObj.metadata[METADATA_KEYS.MATERIAL_NAME]} }];
                    //    const mockCoordsBlock = [[{x:0, y:0, z:0}]]; // Create at origin first
                    //    await world.createShape(mockShapeBlock, mockCoordsBlock, threeD.scene, threeD.actionManagers); // Assuming actionManagers accessible
                    //    const createdMesh = threeD.scene.getMeshByName(savedObj.name);
                    //    if (createdMesh) {
                    //       // Apply transforms, enabled state, mark as manual...
                    //    }
                    // }
                } else {
                    console.warn(`Cannot load object "${savedObj.name}" from state: Missing source URL or creation params.`);
                }
            }

            // Wait for all manual objects to finish loading
            await Promise.all(objectLoadPromises);
            console.log("Loading State - Manual objects loaded (or attempted).");

        } else {
             console.log("Loading State - No manual scene objects found in state.");
        }

        console.log("Loading State - Step 5: Loading Camera State...");
        // 7. Load Camera State (AFTER scene potentially recreated objects)
        // Create the camera first based on type, then apply state
        if (state.cameraState) {
            threeD.setCameraType(state.cameraState.type); // Set type hint
            await threeD.createCamera(); // Create/recreate the camera instance
            const loadedCam = threeD.scene?.activeCamera;
            if (loadedCam) {
                loadedCam.position = new BABYLON.Vector3(state.cameraState.position.x, state.cameraState.position.y, state.cameraState.position.z);
                if (loadedCam instanceof BABYLON.ArcRotateCamera && state.cameraState.target && state.cameraState.radius !== undefined) {
                    loadedCam.target = new BABYLON.Vector3(state.cameraState.target.x, state.cameraState.target.y, state.cameraState.target.z);
                    loadedCam.radius = state.cameraState.radius;
                    if (state.cameraState.alpha !== undefined) loadedCam.alpha = state.cameraState.alpha;
                    if (state.cameraState.beta !== undefined) loadedCam.beta = state.cameraState.beta;
                } else if (state.cameraState.rotationQuaternion) {
                    loadedCam.rotationQuaternion = new BABYLON.Quaternion(
                        state.cameraState.rotationQuaternion.x,
                        state.cameraState.rotationQuaternion.y,
                        state.cameraState.rotationQuaternion.z,
                        state.cameraState.rotationQuaternion.w
                    );
                }
                // Apply other camera props if saved (fov, etc.)
            } else {
                 console.error("Failed to get active camera after creation during load.");
            }
        } else {
             // If no saved state, ensure a default camera exists
             await threeD.createCamera();
        }


        console.log("Loading State - Step 6: Running Blockly Code...");
        // 8. Run the loaded Blockly code
        // Run WITHOUT resetting the scene, adding blockly objects alongside manual ones
        await runBlocklyCode();

        console.log("Scene state loaded and Blockly code executed successfully.");

    } catch (error) {
        console.error("Error during loadSceneState:", error);
        alert(`Failed to load scene state. Check console. Error: ${error.message}`);
        // Optionally reset to a known good state (e.g., empty workspace, default scene)
        workspace.clear();
        setPhysicsEnabled(false); // Default physics off
        await threeD?.createScene(true, false);
        await threeD?.createCamera();
        // Maybe run empty workspace?
        // await runBlocklyCode();
    }
}