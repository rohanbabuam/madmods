// C:\Madmods\Platform\madmods\src\lib\state\meshRegistry.ts
// src/lib/blockly/3d/meshRegistry.ts
import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import { v4 as uuidv4 } from 'uuid'; // Make sure you have uuid installed: npm install uuid @types/uuid

export type MeshType = 'dynamic' | 'static' | 'placeholder'; // Dynamic: Blockly, Static: Drag-drop/manual

export interface MeshMetadata { // Exporting for use in other modules if needed
    customID: string;
    meshType: MeshType;
    blocklyBlockId?: string; // Optional: store the original blockly block id if applicable
    sourceModelUrl?: string; // Optional: for models loaded from URL
    [key: string]: any; // Allow other custom metadata
}

const registry = new Map<string, BABYLON.AbstractMesh>();

/**
 * Generates a new v4 UUID.
 * @returns A new UUID string.
 */
export function generateUUID(): string {
    return uuidv4();
}

/**
 * Registers a mesh with the registry.
 * - If `mesh.metadata.customID` is present:
 *   - If this ID is in the registry and points to a different mesh, it updates the reference.
 *   - If this ID is not in the registry, it uses this ID for the new registration.
 * - If `mesh.metadata.customID` is NOT present, it generates a new UUID.
 * Updates the mesh's metadata with the final customID and meshType.
 * @param mesh The Babylon.js AbstractMesh to register.
 * @param meshType The type of the mesh.
 * @param blocklyBlockId Optional Blockly block ID.
 * @returns The customID assigned to or confirmed for the mesh.
 */
// C:\Madmods\Platform\madmods\src\lib\state\meshRegistry.ts
export function registerMesh(
    mesh: BABYLON.AbstractMesh,
    meshType: MeshType,
    blocklyBlockId?: string
): string {
    let finalCustomID: string;
    let existingMetadata = mesh.metadata as MeshMetadata | undefined | null; // Could be null or undefined initially

    // Ensure metadata object exists. If it does, preserve what's there.
    // If not, create it.
    if (!existingMetadata) {
        mesh.metadata = {}; // Create fresh if null/undefined
        existingMetadata = mesh.metadata as MeshMetadata; // Re-assign to use the new empty object
    }

    const preExistingCustomIDOnMesh = existingMetadata.customID;

    if (preExistingCustomIDOnMesh) {
        finalCustomID = preExistingCustomIDOnMesh;
        if (registry.has(finalCustomID)) {
            if (registry.get(finalCustomID) !== mesh) {
                // console.warn(`MeshRegistry: Re-registering mesh for customID ${finalCustomID} with a new reference.`);
                registry.set(finalCustomID, mesh);
            }
        } else {
            registry.set(finalCustomID, mesh);
        }
    } else {
        finalCustomID = generateUUID();
        registry.set(finalCustomID, mesh);
    }

    // --- Update metadata on the mesh ---
    // This ensures these core fields are always set/updated by the registry.
    mesh.metadata.customID = finalCustomID;
    mesh.metadata.meshType = meshType;

    if (blocklyBlockId) {
        mesh.metadata.blocklyBlockId = blocklyBlockId;
    }

    // Preserve sourceModelUrl if it was on existingMetadata and not yet on the current mesh.metadata
    // (This handles the case where mesh.metadata was just created as {})
    if (existingMetadata.sourceModelUrl && !mesh.metadata.sourceModelUrl) {
        mesh.metadata.sourceModelUrl = existingMetadata.sourceModelUrl;
    }
    // Or, if `loadAndPlaceModel` sets it directly on mesh.metadata before calling this,
    // then `mesh.metadata.sourceModelUrl` would already have it.

    console.log(
        `MeshRegistry: Registered/Updated mesh "${mesh.name}" (ID: ${mesh.id}) ` +
        `with customID: ${mesh.metadata.customID}, Type: ${mesh.metadata.meshType}, ` +
        `SourceURL: ${mesh.metadata.sourceModelUrl}, BlocklyID: ${mesh.metadata.blocklyBlockId}`
    );
    return finalCustomID;
}
/**
 * Unregisters a mesh from the registry using its customID.
 * @param customID The customID of the mesh to unregister.
 */
export function unregisterMesh(customID: string): void {
    if (registry.has(customID)) {
        const mesh = registry.get(customID);
        registry.delete(customID);
        console.log(`MeshRegistry: Unregistered mesh "${mesh?.name}" with customID: ${customID}`);
    } else {
        // console.warn(`MeshRegistry: Attempted to unregister non-existent customID: ${customID}`);
    }
}

/**
 * Unregisters a mesh from the registry using its direct reference.
 * It will look up the customID from the mesh's metadata.
 * @param mesh The Babylon.js AbstractMesh to unregister.
 */
export function unregisterMeshByReference(mesh: BABYLON.AbstractMesh): void {
    const customID = (mesh.metadata as MeshMetadata)?.customID;
    if (customID) {
        unregisterMesh(customID);
    } else {
        console.warn(`MeshRegistry: Attempted to unregister mesh "${mesh.name}" (ID: ${mesh.id}) but it has no customID in metadata.`);
    }
}

/**
 * Retrieves a mesh from the registry by its customID.
 * @param customID The customID of the mesh.
 * @returns The BABYLON.AbstractMesh if found, otherwise undefined.
 */
export function getMeshByCustomID(customID: string): BABYLON.AbstractMesh | undefined {
    return registry.get(customID);
}

/**
 * Retrieves the customID from a mesh's metadata.
 * @param mesh The Babylon.js AbstractMesh.
 * @returns The customID string if found, otherwise undefined.
 */
export function getCustomID(mesh: BABYLON.AbstractMesh): string | undefined {
    return (mesh.metadata as MeshMetadata)?.customID;
}

/**
 * Retrieves the mesh type from a mesh's metadata.
 * @param mesh The Babylon.js AbstractMesh.
 * @returns The MeshType if found, otherwise undefined.
 */
export function getMeshType(mesh: BABYLON.AbstractMesh): MeshType | undefined {
    return (mesh.metadata as MeshMetadata)?.meshType;
}

/**
 * Retrieves the full metadata object from a mesh.
 * @param mesh The Babylon.js AbstractMesh.
 * @returns The MeshMetadata object if found, otherwise undefined.
 */

export function getMeshMetadata(mesh: BABYLON.AbstractMesh): MeshMetadata | undefined {
    // It's possible mesh.metadata itself is null or undefined, not just an empty object
    if (!mesh || !mesh.metadata) {
        return undefined;
    }
    return mesh.metadata as MeshMetadata; // The cast assumes it conforms if it exists
}


/**
 * Clears the entire mesh registry.
 * Useful for full scene resets.
 * Note: This does NOT dispose the meshes themselves.
 */
export function clearRegistry(): void {
    registry.clear();
    console.log("MeshRegistry: Cleared all entries.");
}

/**
 * Gets all registered meshes.
 * @returns An IterableIterator of all registered meshes.
 */
export function getAllRegisteredMeshes(): IterableIterator<BABYLON.AbstractMesh> {
    return registry.values();
}