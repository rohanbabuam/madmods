import { ThreeD, type ToolName } from '$lib/blockly/3d/index';
import { setModelUrlResolver as setWorldModelUrlResolver } from '$lib/blockly/3d/world/index';
import HavokPhysics from '@babylonjs/havok';
import type { GeneratedObject } from '$lib/types/GeneratedObject';
import { objectStore } from '$lib/stores/objectStore';
import * as SaveLoad from '$lib/state/saveload';
import type * as BABYLON from '@babylonjs/core/Legacy/legacy';

import * as saveloadService from '$lib/state/saveload';
import * as MeshRegistry from '$lib/state/meshRegistry';

import { activeThreeDToolStore } from '$lib/stores/ToolStore';


let threeDInstance: ThreeD | null = null;
let globalHavokInstance: any = null;
let isInitialized = false;

export type ModelUrlResolver = (name: string) => string | null;

function handleInternalToolChange(toolName: ToolName) {
    console.log(`[threeDService.handleInternalToolChange] Tool changed internally to: ${toolName}`);
    activeThreeDToolStore.set(toolName);
}

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
    savedSceneData?: SaveLoad.SavedSceneObject[] // Make sure this type matches your saveload structure
): Promise<ThreeD> {
    console.log("[ThreeDService.initializeThreeD] Attempting initialization...");

    if (isInitialized && threeDInstance) {
        const existingScene = threeDInstance.getScene();
        if (existingScene && !existingScene.isDisposed) {
            console.warn("[ThreeDService.initializeThreeD] Already initialized. Resizing.");
            threeDInstance.engine?.resize();
            return threeDInstance;
        } else {
            console.warn("[ThreeDService.initializeThreeD] Re-initializing.");
            if (threeDInstance.engine && !threeDInstance.engine.isDisposed) {
                threeDInstance.engine.dispose();
            }
            threeDInstance = null;
            isInitialized = false; // Reset this flag
        }
    }

    console.log("[ThreeDService.initializeThreeD] Starting new full initialization.");

    if (!globalHavokInstance) {
        try {
            globalHavokInstance = await HavokPhysics();
            if (!globalHavokInstance) throw new Error("HavokPhysics() returned null/undefined.");
        } catch (havokError) {
            console.error("[ThreeDService.initializeThreeD] Havok init failed:", havokError);
            throw havokError; // Re-throw to be caught by the page
        }
    }

    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
        console.error(`[ThreeDService.initializeThreeD] Canvas "${canvasId}" not found.`);
        throw new Error(`Canvas element with ID "${canvasId}" not found.`); // Re-throw
    }

    console.log("[ThreeDService.initializeThreeD] Creating ThreeD instance...");
    // The third argument is the onToolChanged callback
    threeDInstance = new ThreeD(canvas, globalHavokInstance, handleInternalToolChange);
    console.log("[ThreeDService.initializeThreeD] ThreeD instance created.");

    threeDInstance.runRenderLoop();
    window.removeEventListener('resize', resizeEngine); // Ensure no duplicates
    window.addEventListener('resize', resizeEngine);

    setWorldModelUrlResolver(sceneModelUrlResolver);

    console.log("[ThreeDService.initializeThreeD] Creating initial scene...");
    const mainScene = await threeDInstance.createScene(true, false); // Physics off by default

    if (!mainScene || mainScene.isDisposed) {
        console.error("[ThreeDService.initializeThreeD] CRITICAL: createScene() failed.");
        throw new Error("Core scene creation failed."); // Re-throw
    }
    const mainCamera = threeDInstance.getCamera();
    if (!mainCamera || mainCamera.isDisposed()) {
        console.error("[ThreeDService.initializeThreeD] CRITICAL: Camera init failed.");
        throw new Error("Core camera creation failed."); // Re-throw
    }
    console.log(`[ThreeDService.initializeThreeD] Scene (ID: ${mainScene.getUniqueId()}) and Camera (Name: ${mainCamera.name}) ready.`);

    if (savedSceneData && savedSceneData.length > 0) {
        console.log(`[ThreeDService.initializeThreeD] Loading ${savedSceneData.length} static meshes...`);
        await threeDInstance.loadStaticMeshes(savedSceneData);
    }

    isInitialized = true;
    console.log("[ThreeDService.initializeThreeD] Initialization successful.");
    return threeDInstance;
}
// Ensure cleanupThreeDService also uses property access if it checks isDisposed
export function cleanupThreeDService() {
    if (threeDInstance) {
        const scene = threeDInstance.getScene();
        if (scene && !scene.isDisposed) { // CORRECTED CHECK
            // Scene dispose should handle camera and engine parts if ThreeD.dispose is thorough
        }
        threeDInstance.engine?.stopRenderLoop(); // Stop loop before disposing engine
        threeDInstance.engine?.dispose();
        // threeDInstance.dispose(); // If ThreeD class has its own dispose method for internal cleanup
    }
    MeshRegistry.clearRegistry();
    threeDInstance = null;
    globalHavokInstance = null;
    isInitialized = false;
    window.removeEventListener('resize', resizeEngine);
    console.log("ThreeDService cleaned up.");
}

export function getThreeDInstance(): ThreeD | null {
    return threeDInstance;
}

export function setActiveTool(toolName: ToolName): void { // Use ToolName type
    console.log(`[threeDService.setActiveTool] Received toolName: ${toolName}`);
    if (threeDInstance) {
        threeDInstance.setTool(toolName); // This will trigger the callback if the tool actually changes
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