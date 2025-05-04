 // src/lib/types/CustomeSceneState.ts

 // Define metadata keys as constants for consistency
 export const METADATA_KEYS = {
    BLOCKLY_ID: 'blocklyId',             // The ID of the block that created this object (if code-created)
    BLOCKLY_TYPE: 'blocklyType',         // e.g., 'box', 'sphere', 'customObject', 'ground', 'skybox'
    CREATION_PARAMS: 'blocklyCreationParams', // Params used for primitives (size, etc.)
    MATERIAL_NAME: 'blocklyMaterialName',   // Name/type of the material block used
    SOURCE_MODEL_URL: 'blocklySourceModelUrl', // URL for loaded meshes (.glb)
    IS_MANUAL_OBJECT: 'isManualObject'      // *** ADDED: Flag (true) for objects managed manually (drag-drop, gizmo), part of the saved scene state ***
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
    creationParams?: any; // Make optional, might not always be available/needed
    materialName: string; // Name/type of the material block used
    position: SavedVector3;
    rotationQuaternion: SavedQuaternion;
    scaling: SavedVector3; // Ground usually isn't scaled, but good practice
    isEnabled: boolean;
    // Ground is considered manual, no blocklyId needed here in the same way
}

export interface SavedSceneObject {
    // blocklyId removed - manual objects might not have a direct blockly counterpart ID
    babylonUniqueId: number;   // Babylon's internal unique ID (for debugging/identification)
    babylonClassName: string;  // e.g., "Mesh", "TransformNode"
    name: string;              // Babylon's name (This becomes the primary identifier for manual objects)
    position: SavedVector3;
    rotationQuaternion: SavedQuaternion;
    scaling: SavedVector3;
    isEnabled: boolean;
    metadata: { // Store only OUR specific metadata needed for recreation/identification
        // blocklyId and blocklyType removed from mandatory metadata for manual objects
        [METADATA_KEYS.CREATION_PARAMS]?: any;        // Needed if it was a primitive modified manually
        [METADATA_KEYS.MATERIAL_NAME]?: string;       // Material applied manually or during creation
        [METADATA_KEYS.SOURCE_MODEL_URL]?: string;    // Crucial for drag-dropped objects
        [METADATA_KEYS.IS_MANUAL_OBJECT]: true; // Should always be true for objects in this list
        // blocklyId might still exist if a code-created object was *then* modified and marked manual
        [METADATA_KEYS.BLOCKLY_TYPE]?: string;        // Original block type if it was a primitive
    };
}

// The main structure holding everything
export interface CustomSceneState {
    version: number; // Start with 1, increment if structure changes
    blocklyWorkspace: object; // Blockly JSON state (output of Blockly.serialization.workspaces.save)
    physicsEnabled: boolean; // Global physics setting for the scene
    cameraState: SavedCameraState | null;
    skyboxState: SavedSkyboxState | null; // Assumed manual/base scene element
    groundState: SavedGroundState | null; // Assumed manual/base scene element
    sceneObjects: SavedSceneObject[]; // List of ONLY manually managed meshes/nodes (marked with metadata)
    ambientLightIntensity?: number; // Optional: Store ambient light setting
}