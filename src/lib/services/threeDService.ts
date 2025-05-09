import { ThreeD } from '$lib/blockly/3d/index';
import { setModelUrlResolver as setWorldModelUrlResolver } from '$lib/blockly/3d/world/index';
import HavokPhysics from '@babylonjs/havok';
import type { GeneratedObject } from '$lib/types/GeneratedObject';
import { objectStore } from '$lib/stores/objectStore';
import * as SaveLoad from '$lib/state/saveload';
import type * as BABYLON from '@babylonjs/core/Legacy/legacy';

import * as saveloadService from '$lib/state/saveload';
import * as MeshRegistry from '$lib/state/meshRegistry';

let threeDInstance: ThreeD | null = null;
let globalHavokInstance: any = null;
let isInitialized = false;

export type ModelUrlResolver = (name: string) => string | null;

function sceneModelUrlResolver(name: string): string | null {
    const objects = objectStore.getObjects();
    const liveObject = objects.find(obj => obj.objectName === name);
    if (liveObject && liveObject.modelStatus === 'success' && liveObject.modelUrl) {
        return liveObject.modelUrl;
    }
    return null;
}

export async function initializeThreeD(
    canvasId: string,
    savedSceneData?: SaveLoad.SavedSceneObject[]
): Promise<ThreeD> {
    if (isInitialized && threeDInstance) {
        console.warn("ThreeDService already initialized. Returning existing instance.");

        threeDInstance.engine?.resize();
        return threeDInstance;
    }

    try {
        console.log("Initializing Havok physics engine (WASM)...");
        globalHavokInstance = await HavokPhysics();
        if (!globalHavokInstance) throw new Error("HavokPhysics() function returned null or undefined.");
        console.log("Havok WASM engine initialized successfully.");
    } catch (havokError) {
        console.error("Failed to initialize Havok physics:", havokError);
        throw havokError;
    }

    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(`Canvas element with ID "${canvasId}" not found.`);
    }

    threeDInstance = new ThreeD(canvas, globalHavokInstance);
    threeDInstance.runRenderLoop();


    window.removeEventListener('resize', resizeEngine);
    window.addEventListener('resize', resizeEngine);

    setWorldModelUrlResolver(sceneModelUrlResolver);


    await threeDInstance.createScene(true, false);
    await threeDInstance.createCamera();

    if (!threeDInstance.scene) {
        throw new Error("Scene creation failed to set threeDInstance.scene.");
    }


    if (savedSceneData && savedSceneData.length > 0 && threeDInstance.scene) {
        console.log("ThreeDService: Loading static meshes from provided saved data...");
        await threeDInstance.loadStaticMeshes(savedSceneData);
        console.log("ThreeDService: Static meshes loaded.");
    }

    isInitialized = true;
    console.log("ThreeDService initialized successfully.");
    return threeDInstance;
}

export function getThreeDInstance(): ThreeD | null {
    return threeDInstance;
}

export function setActiveTool(toolName: string): void {
    if (threeDInstance) {
        threeDInstance.setTool(toolName);
    } else {
        console.warn("Cannot set active tool: ThreeD instance not available.");
    }
}

export async function spawnObjectInScene(
    object: GeneratedObject,
    screenX?: number,
    screenY?: number
) {
    if (!threeDInstance) {
        console.error("3D instance not initialized. Cannot spawn object.");
        return;
    }
    if (object.modelStatus !== 'success' || !object.modelUrl) {
        alert(`Object "${object.objectName}" doesn't have a ready 3D model.`);
        return;
    }

    try {
        let spawnedMeshRoot: BABYLON.AbstractMesh | null = null;
        if (screenX !== undefined && screenY !== undefined) {
            // Called for actual drag-and-drop events
            spawnedMeshRoot = await threeDInstance.spawnObjectFromDragDrop(object, screenX, screenY);
        } else {
            // Called for programmatic spawn (e.g., button click, defaults to center of canvas)
            const canvas = threeDInstance.engine?.getRenderingCanvas();
            if (canvas) {
                 spawnedMeshRoot = await threeDInstance.spawnObjectFromDragDrop(object, canvas.width / 2, canvas.height / 2);
            } else {
                 console.warn("Canvas not found for default spawn position for object:", object.objectName);
                 // Fallback if canvas isn't available for some reason
                 spawnedMeshRoot = await threeDInstance.spawnObjectFromDragDrop(object, 0, 0); // Or handle error
            }
        }

        console.log(`Object "${object.objectName}" spawn request processed.`);
    } catch (error) {
        console.error('Error spawning object in scene:', error);
        alert('Failed to place the object. Check console for details.');
    }
}

export function saveCurrentSceneStateToSession() {
    if (!threeDInstance || !MeshRegistry) {
        console.warn("Cannot save scene state: 3D instance or MeshRegistry not available.");
        return;
    }
    try {
        console.log("Saving current 3D scene (static objects) to session storage for /create page...");
        const sceneJson = SaveLoad.getCurrentSceneDataForSave();

        const projectData: Pick<SaveLoad.SavedProjectData, 'scene'> = {
            scene: sceneJson,
        };

        sessionStorage.setItem("madmodsCreatePageSceneData", JSON.stringify(projectData));
        console.log(`Current 3D scene saved to session storage (madmodsCreatePageSceneData). Contains ${sceneJson.length} static objects.`);
    } catch (error) {
        console.error("Error saving 3D scene to session storage for /create page:", error);
    }
}

export function loadSceneStateFromSession(): SaveLoad.SavedSceneObject[] | null {
    const projectDataStr = sessionStorage.getItem("madmodsCreatePageSceneData");
    if (projectDataStr) {
        try {
            console.log("Attempting to load 3D scene data from session storage (madmodsCreatePageSceneData)...");
            const projectData: Partial<SaveLoad.SavedProjectData> = JSON.parse(projectDataStr);

            if (projectData.scene && Array.isArray(projectData.scene)) {
                console.log(`3D scene data loaded successfully from session. Found ${projectData.scene.length} static objects.`);
                return projectData.scene;
            } else {
                console.log("No valid 'scene' array found in madmodsCreatePageSceneData.");
                return null;
            }
        } catch (e) {
            console.error("Failed to load 3D scene from session storage (madmodsCreatePageSceneData - invalid JSON or load error):", e);
            sessionStorage.removeItem("madmodsCreatePageSceneData");
            return null;
        }
    } else {
        console.log("No 3D scene data (madmodsCreatePageSceneData) found in session storage.");
        return null;
    }
}

async function resetSceneAndPreserveStatics(enablePhysics: boolean) {
    if (!threeDInstance || !threeDInstance.scene) {
        console.warn("Cannot reset scene: 3D instance or scene not available.");
        return;
    }

    console.log("Resetting scene: Preserving static objects, setting physics to:", enablePhysics);


    const staticObjectsToPreserve = SaveLoad.getCurrentSceneDataForSave();
    console.log(`Found ${staticObjectsToPreserve.length} static objects to preserve.`);





    MeshRegistry.clearRegistry();


    await threeDInstance.createScene(true, enablePhysics);
    await threeDInstance.createCamera();



    if (staticObjectsToPreserve.length > 0) {
        console.log("Restoring preserved static objects into the new scene...");
        await threeDInstance.loadStaticMeshes(staticObjectsToPreserve);
    }
    console.log("Scene reset (preserving statics) complete.");
}

export async function loadStaticMeshesFromSessionData(sceneData: SaveLoad.SavedSceneObject[] | null) {
    if (!threeDInstance) {
        console.error("ThreeD instance not available. Cannot load static meshes from provided scene data.");
        return;
    }
    
    if (sceneData && sceneData.length > 0) {
        console.log(`ThreeDService: Loading ${sceneData.length} static objects from provided data into scene...`);
        // Ensure MeshRegistry is cleared before loading new static meshes if this is a full scene reload
        // MeshRegistry.clearRegistry(); // Handled by threeDInstance.createScene generally.
                                       // If loadStaticMeshes is additive, don't clear.
                                       // For a page refresh load, createScene should have run first.
        await threeDInstance.loadStaticMeshes(sceneData);
        console.log("ThreeDService: Finished loading static meshes from provided data.");
    } else {
        console.log("ThreeDService: No static scene data provided, or scene data array is empty. Nothing to load.");
    }
}


export async function togglePhysicsInScene(enable: boolean) {
    if (!threeDInstance) return;

    console.log(`Toggling physics to: ${enable}. This will reset the dynamic parts of the scene.`);

    const currentSceneData = saveloadService.getCurrentSceneDataForSave();

    await threeDInstance.createScene(true, enable);
    await threeDInstance.createCamera();


    if (currentSceneData.length > 0) {
        console.log(`Re-loading ${currentSceneData.length} static objects after physics toggle.`);
        await threeDInstance.loadStaticMeshes(currentSceneData);
    }

    saveloadService.saveProjectToSession(null);
}



export function toggleInspector(enable?: boolean) {
    if (!threeDInstance || !threeDInstance.scene) return;
    const currentlyEnabled = threeDInstance.scene.debugLayer.isVisible();
    const targetState = enable === undefined ? !currentlyEnabled : enable;

    if (targetState) {
        threeDInstance.enableInspector();
    } else {
        threeDInstance.disableInspector();
    }
}

export function resizeEngine() {
    threeDInstance?.engine?.resize();
}

export function cleanupThreeDService() {
    if (threeDInstance) {
        threeDInstance.engine?.stopRenderLoop();
        threeDInstance.engine?.dispose();
    }
    MeshRegistry.clearRegistry();
    threeDInstance = null;
    globalHavokInstance = null;
    isInitialized = false;
    window.removeEventListener('resize', resizeEngine);
    console.log("ThreeDService cleaned up.");
}