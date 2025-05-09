import * as MeshRegistryService from './meshRegistryService';
import * as BABYLON from '@babylonjs/core/Legacy/legacy';

export interface SavedTransform {
    position: { x: number; y: number; z: number };
    rotationQuaternion: { x: number; y: number; z: number; w: number };
    scaling: { x: number; y: number; z: number };
}

export interface SavedSceneObject {
    customID: string;
    sourceModelUrl: string;
    transforms: SavedTransform[];
}

export interface SavedSceneData {
    scene: SavedSceneObject[];
}

const SESSION_STORAGE_KEY = "madmodsCreatorSceneData";

function getCurrentSceneDataForSave(): SavedSceneObject[] {
    const sceneObjects: SavedSceneObject[] = [];
    for (const mesh of MeshRegistryService.getAllRegisteredMeshes()) {
        const metadata = MeshRegistryService.getMeshMetadata(mesh);
        if (metadata && metadata.meshType === 'static' && metadata.customID && metadata.sourceModelUrl) {
            let rotQuaternion: BABYLON.Quaternion;
            if (mesh.rotationQuaternion) {
                rotQuaternion = mesh.rotationQuaternion;
            } else {
                rotQuaternion = BABYLON.Quaternion.FromEulerVector(mesh.rotation);
            }

            const transform: SavedTransform = {
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotationQuaternion: {
                    x: rotQuaternion.x,
                    y: rotQuaternion.y,
                    z: rotQuaternion.z,
                    w: rotQuaternion.w
                },
                scaling: { x: mesh.scaling.x, y: mesh.scaling.y, z: mesh.scaling.z },
            };

            sceneObjects.push({
                customID: metadata.customID,
                sourceModelUrl: metadata.sourceModelUrl,
                transforms: [transform],
            });
        }
    }
    return sceneObjects;
}

export function saveProjectDataToSession(): void {
    try {
        console.log("Saving scene to session storage (creator mode)...");
        const sceneJson = getCurrentSceneDataForSave();

        const projectData: SavedSceneData = {
            scene: sceneJson,
        };
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(projectData));
        console.log("Scene saved to session storage (creator mode).");
    } catch (error) {
        console.error("Error saving scene to session storage (creator mode):", error);
    }
}

export function loadProjectDataFromSession(): SavedSceneData | null {
    const projectDataStr = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (projectDataStr) {
        try {
            console.log("Attempting to load scene data from session storage (creator mode)...");
            const projectData: SavedSceneData = JSON.parse(projectDataStr);

            projectData.scene = projectData.scene || [];
            console.log("Scene data loaded successfully from session storage (creator mode).");
            return projectData;
        } catch (e) {
            console.error("Failed to load scene from session storage (creator mode, invalid JSON or load error):", e);
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            return null;
        }
    } else {
        console.log("No scene data found in session storage (creator mode).");
        return null;
    }
}

export function clearSessionData(): void {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    console.log("Creator scene data cleared from session storage.");
}