// C:\Madmods\Platform\madmods\src\lib\state\saveload.ts
import * as Blockly from 'blockly/core';
import * as MeshRegistry from './meshRegistry';
import * as BABYLON from '@babylonjs/core/Legacy/legacy';

// --- Data Structures for Saved Project ---
export interface SavedTransform {
    position: { x: number; y: number; z: number };
    //rotation: { x: number; y: number; z: number }; // Euler angles in radians
    rotationQuaternion: { x: number; y: number; z: number; w: number }; // NEW
    scaling: { x: number; y: number; z: number };
}

export interface SavedSceneObject { // Exported for use by other modules like threeD.ts
    customID: string;
    sourceModelUrl: string;
    transforms: SavedTransform[]; // For non-instanced, this will have one element
}

export interface SavedProjectData { // This is what load functions will return/process
    code: any; // Blockly workspace JSON
    scene: SavedSceneObject[];
}

// --- Helper to get current scene data for saving ---
function getCurrentSceneDataForSave(): SavedSceneObject[] {
    const sceneObjects: SavedSceneObject[] = [];
    for (const mesh of MeshRegistry.getAllRegisteredMeshes()) {
        const metadata = MeshRegistry.getMeshMetadata(mesh);
        if (metadata && metadata.meshType === 'static' && metadata.customID && metadata.sourceModelUrl) {
            
            // --- USE ROTATION QUATERNION ---
            let rotQuaternion: BABYLON.Quaternion;
            if (mesh.rotationQuaternion) {
                rotQuaternion = mesh.rotationQuaternion;
            } else {
                // If no rotationQuaternion, create one from mesh.rotation (Euler)
                // This ensures we always save a quaternion.
                rotQuaternion = BABYLON.Quaternion.FromEulerVector(mesh.rotation);
            }
            // It's good to normalize the quaternion before saving, though Babylon usually keeps them normalized.
            // rotQuaternion.normalize(); // Optional, but good practice

            const transform: SavedTransform = {
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotationQuaternion: { // Save quaternion components
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


// --- Session Storage ---

/**
 * Saves the current Blockly workspace and static scene objects to session storage.
 * @param workspace The Blockly workspace instance to save.
 */
export function saveProjectToSession(workspace: Blockly.WorkspaceSvg): void {
    if (!workspace) {
        console.warn("Attempted to save to session, but workspace is null.");
        return;
    }
    try {
        console.log("Saving workspace and scene to session storage...");
        const blocklyJson = Blockly.serialization.workspaces.save(workspace);
        const sceneJson = getCurrentSceneDataForSave();

        const projectData: SavedProjectData = {
            code: blocklyJson,
            scene: sceneJson,
        };
        sessionStorage.setItem("madmodsProjectData", JSON.stringify(projectData)); // New key
        console.log("Workspace and scene saved to session storage.");
    } catch (error) {
        console.error("Error saving workspace and scene to session storage:", error);
    }
}

/**
 * Loads the project (Blockly workspace and scene data) from session storage.
 * Blockly code is loaded into the provided workspace. Scene data is returned.
 * @param workspace The Blockly workspace instance to load code into.
 * @returns The SavedProjectData object if loading was successful, null otherwise.
 */
export function loadProjectFromSession(workspace: Blockly.WorkspaceSvg): SavedProjectData | null {
    if (!workspace) {
        console.warn("Attempted to load from session, but workspace is null.");
        return null;
    }
    const projectDataStr = sessionStorage.getItem("madmodsProjectData"); // Use new key
    if (projectDataStr) {
        try {
            console.log("Attempting to load project data from session storage...");
            const projectData: SavedProjectData = JSON.parse(projectDataStr);

            if (!projectData.code) {
                console.error("Loaded project data from session is missing 'code' (Blockly data).");
                sessionStorage.removeItem("madmodsProjectData");
                return null;
            }
            // Ensure scene array exists, even if empty
            projectData.scene = projectData.scene || [];

            workspace.clear();
            Blockly.serialization.workspaces.load(projectData.code, workspace);
            console.log("Blockly workspace loaded successfully from session storage.");
            
            return projectData; // Return full data for caller to handle scene part
        } catch (e) {
            console.error("Failed to load project from session storage (invalid JSON or load error):", e);
            sessionStorage.removeItem("madmodsProjectData");
            return null;
        }
    } else {
        console.log("No project data found in session storage.");
        return null;
    }
}

// --- File Saving ---

/**
 * Saves the current Blockly workspace and static scene objects to a JSON file for download.
 * @param workspace The Blockly workspace instance.
 * @param filename The desired name for the downloaded file.
 */
export function saveProjectToFile(workspace: Blockly.WorkspaceSvg, filename: string = 'madmods-project.json'): void {
    if (!workspace) {
        console.warn("Attempted to save to file, but workspace is null.");
        alert("Cannot save: Workspace not available.");
        return;
    }
    console.log("Saving workspace and scene to file...");
    try {
        const blocklyJson = Blockly.serialization.workspaces.save(workspace);
        const sceneJson = getCurrentSceneDataForSave();
        
        const projectData: SavedProjectData = {
            code: blocklyJson,
            scene: sceneJson,
        };
        const projectJsonString = JSON.stringify(projectData, null, 2);
        const file = new Blob([projectJsonString], { type: "application/json" });
        const a = document.createElement("a");
        const url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            console.log("Workspace and scene save to file initiated.");
        }, 0);
    } catch (saveError) {
        console.error("Error saving workspace and scene to file:", saveError);
        alert("Failed to save project.");
    }
}

// --- File Loading ---

/**
 * Loads a project (Blockly workspace and scene data) from a user-selected JSON file.
 * Blockly code is loaded into the workspace. Scene data is returned via callback.
 * @param workspace The Blockly workspace instance to load code into.
 * @param file The file object selected by the user.
 * @param callback Function to call after load attempt. Passes `SavedProjectData | null`.
 */
export function loadProjectFromFile(
    workspace: Blockly.WorkspaceSvg,
    file: File,
    callback: (projectData: SavedProjectData | null) => void
): void {
    if (!workspace) {
        console.warn("Attempted to load from file, but workspace is null.");
        alert("Cannot load: Workspace not available.");
        callback(null);
        return;
    }
    if (!file) {
        console.warn("Load from file cancelled: No file provided.");
        callback(null);
        return;
    }

    console.log(`Loading project from file: ${file.name}...`);
    const reader = new FileReader();

    reader.onload = (event) => {
        try {
            const jsonString = event.target?.result as string;
            if (!jsonString) throw new Error("File content is empty or could not be read.");

            const projectData: SavedProjectData = JSON.parse(jsonString);

            if (!projectData.code) {
                throw new Error("Project file is missing 'code' (Blockly data).");
            }
            projectData.scene = projectData.scene || []; // Ensure scene array exists

            workspace.clear();
            Blockly.serialization.workspaces.load(projectData.code, workspace);
            console.log("Blockly workspace loaded successfully from file.");
            callback(projectData);

        } catch (loadError) {
            console.error("Error loading project from file:", loadError);
            alert(`Failed to load project from file "${file.name}". Ensure it's a valid JSON project file.`);
            callback(null);
        }
    };

    reader.onerror = (error) => {
        console.error("Error reading file for loading:", error);
        alert(`Failed to read the selected file "${file.name}".`);
        callback(null);
    };

    reader.readAsText(file);
}

/**
 * Loads a project (Blockly workspace and scene data) from a JSON file specified by a URL.
 * Blockly code is loaded into the workspace. Scene data is returned.
 * @param workspace The Blockly workspace instance to load code into.
 * @param jsonFileUrl The URL path to the JSON project file.
 * @returns A promise that resolves with `SavedProjectData` or rejects on error.
 */
export async function loadProjectFromUrl(workspace: Blockly.WorkspaceSvg, jsonFileUrl: string): Promise<SavedProjectData> {
    if (!workspace) {
        throw new Error("Cannot load project from URL: Workspace is null.");
    }
    if (!jsonFileUrl) {
        throw new Error("Cannot load project from URL: No URL provided.");
    }

    console.log(`Loading project from URL: ${jsonFileUrl}...`);
    try {
        const response = await fetch(jsonFileUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status} ${response.statusText} while fetching ${jsonFileUrl}`);
        }
        const projectData: SavedProjectData = await response.json();

        if (!projectData.code) {
            throw new Error(`Project file from URL ${jsonFileUrl} is missing 'code' (Blockly data).`);
        }
        projectData.scene = projectData.scene || []; // Ensure scene array exists

        workspace.clear();
        Blockly.serialization.workspaces.load(projectData.code, workspace);
        console.log(`Blockly workspace loaded successfully from ${jsonFileUrl}.`);
        
        return projectData; // Return full data for caller to handle scene part
    } catch (error) {
        console.error(`Failed to load project from URL "${jsonFileUrl}":`, error);
        throw error;
    }
}
