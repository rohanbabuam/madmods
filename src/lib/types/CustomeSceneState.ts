// src/lib/types/CustomSceneState.ts

// Define metadata keys as constants for consistency
export const METADATA_KEYS = {
    BLOCKLY_ID: 'blocklyId',             // The ID of the block that created this object
    BLOCKLY_TYPE: 'blocklyType',         // e.g., 'box', 'sphere', 'customObject', 'ground', 'skybox'
    CREATION_PARAMS: 'blocklyCreationParams', // Params used for primitives (size, etc.)
    MATERIAL_NAME: 'blocklyMaterialName',   // Name/type of the material block used
    SOURCE_MODEL_URL: 'blocklySourceModelUrl'  // URL for loaded meshes (.glb)
};

// Simple interfaces for Babylon object types for serialization
export interface SavedVector3 { x: number; y: number; z: number; }
export interface SavedQuaternion { x: number; y: number; z: number; w: number; }

export interface SavedCameraState {
    type: string; // Class name like "ArcRotateCamera", "FreeCamera"
    position: SavedVector3;
    // ArcRotateCamera specific
    target?: SavedVector3;
    radius?: number;
    alpha?: number;
    beta?: number;
    // FreeCamera / other camera specific
    rotationQuaternion?: SavedQuaternion;
    // Add other important camera properties if needed (e.g., fov)
}

export interface SavedSkyboxState {
    asset: string; // The asset name used in CreateFromPrefilteredData (e.g., "environment")
    // Store other relevant properties if they can be changed by blocks (e.g., intensity)
}

export interface SavedGroundState {
    // Store parameters used to create the ground (retrieved from metadata)
    creationParams: any; // e.g., { width: number, length: number, tileSize: number }
    materialName: string; // Name/type of the material block used
    position: SavedVector3;
    rotationQuaternion: SavedQuaternion;
    scaling: SavedVector3; // Ground usually isn't scaled, but good practice
    isEnabled: boolean;
    blocklyId: string; // Usually 'ground'
}

export interface SavedSceneObject {
    blocklyId: string;         // Corresponds to METADATA_KEYS.BLOCKLY_ID
    blocklyType: string;       // Corresponds to METADATA_KEYS.BLOCKLY_TYPE
    babylonUniqueId: number;   // Babylon's internal unique ID (for debugging)
    babylonClassName: string;  // e.g., "Mesh", "TransformNode"
    name: string;              // Babylon's name (often same as blocklyId)
    position: SavedVector3;
    rotationQuaternion: SavedQuaternion;
    scaling: SavedVector3;
    isEnabled: boolean;
    metadata: { // Store only OUR specific metadata for recreation
        [METADATA_KEYS.BLOCKLY_ID]?: string;
        [METADATA_KEYS.BLOCKLY_TYPE]?: string;
        [METADATA_KEYS.CREATION_PARAMS]?: any;
        [METADATA_KEYS.MATERIAL_NAME]?: string;
        [METADATA_KEYS.SOURCE_MODEL_URL]?: string;
    };
    // Removed sourceModelUrl and creationParams from top level, keep in metadata
}

// The main structure holding everything
export interface CustomSceneState {
    version: number; // Start with 1, increment if structure changes
    blocklyWorkspace: object; // Blockly JSON state (output of Blockly.serialization.workspaces.save)
    physicsEnabled: boolean;
    cameraState: SavedCameraState | null;
    skyboxState: SavedSkyboxState | null;
    groundState: SavedGroundState | null;
    sceneObjects: SavedSceneObject[]; // List of meshes/nodes created by blocks
    // Add ambient light intensity? Other global scene settings?
    ambientLightIntensity?: number;
}