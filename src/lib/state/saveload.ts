import * as Blockly from 'blockly/core';
import * as MeshRegistry from './meshRegistry';
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

export interface SavedProjectData {
    code: any;
    scene: SavedSceneObject[];
}

function getCurrentSceneDataForSave(): SavedSceneObject[] {
    const sceneObjects: SavedSceneObject[] = [];
    for (const mesh of MeshRegistry.getAllRegisteredMeshes()) {
        const metadata = MeshRegistry.getMeshMetadata(mesh);
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

export function saveProjectToSession(workspace: Blockly.WorkspaceSvg | null): void {
    try {
        console.log("Saving project data to session storage...");
        let blocklyJson: any = null;
        if (workspace) {
            blocklyJson = Blockly.serialization.workspaces.save(workspace);
            console.log("Blockly workspace data captured.");
        } else {
            // This log indicates that only scene data will be saved with null for code
            console.log("No Blockly workspace provided, saving scene data with null for Blockly code.");
        }

        const sceneJson = getCurrentSceneDataForSave();
        console.log(`Scene data captured with ${sceneJson.length} static objects.`);

        const projectData: SavedProjectData = {
            code: blocklyJson, // Will be null if workspace was null
            scene: sceneJson,
        };
        sessionStorage.setItem("madmodsProjectData", JSON.stringify(projectData));
        console.log("Project data saved to session storage (madmodsProjectData).");
    } catch (error) {
        console.error("Error saving project data to session storage:", error);
    }
}

// In loadProjectFromSession function:
export function loadProjectFromSession(workspace: Blockly.WorkspaceSvg | null): SavedProjectData | null {
    const projectDataStr = sessionStorage.getItem("madmodsProjectData");
    if (projectDataStr) {
        try {
            console.log("Attempting to load project data from session storage (madmodsProjectData)...");
            const projectData: SavedProjectData = JSON.parse(projectDataStr);

            projectData.scene = projectData.scene || [];
            console.log(`Loaded ${projectData.scene.length} static objects from session scene data.`);

            if (workspace && projectData.code) {
                workspace.clear();
                Blockly.serialization.workspaces.load(projectData.code, workspace);
                console.log("Blockly workspace loaded successfully from session storage.");
            } else if (workspace && !projectData.code) {
                console.log("No Blockly code found in session data, but workspace was provided. Workspace cleared.");
                workspace.clear();
            } else if (!workspace && projectData.code) {
                // This case might happen if loading a full project on a page without a Blockly editor instance
                console.log("Blockly code found in session, but no workspace provided to load into. Scene data will still be used.");
            } else { // !workspace && !projectData.code (Typical for /create page)
                console.log("No Blockly workspace provided and no Blockly code in session. Scene data will be used if available.");
            }

            return projectData; // projectData.code will be null if not present in storage
        } catch (e) {
            console.error("Failed to load project from session storage (madmodsProjectData, invalid JSON or load error):", e);
            sessionStorage.removeItem("madmodsProjectData"); // Clear corrupted data
            return null;
        }
    } else {
        console.log("No project data (madmodsProjectData) found in session storage.");
        return null;
    }
}


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
            projectData.scene = projectData.scene || [];

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
        projectData.scene = projectData.scene || [];

        workspace.clear();
        Blockly.serialization.workspaces.load(projectData.code, workspace);
        console.log(`Blockly workspace loaded successfully from ${jsonFileUrl}.`);

        return projectData;
    } catch (error) {
        console.error(`Failed to load project from URL "${jsonFileUrl}":`, error);
        throw error;
    }
}
