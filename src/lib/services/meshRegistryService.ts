import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import { v4 as uuidv4 } from 'uuid';

export type MeshType = 'dynamic' | 'static' | 'placeholder';

export interface MeshMetadata {
    customID: string;
    meshType: MeshType;
    blocklyBlockId?: string;
    sourceModelUrl?: string;
    [key: string]: any;
}

const registry = new Map<string, BABYLON.AbstractMesh>();


export function generateUUID(): string {
    return uuidv4();
}


export function registerMesh(
    mesh: BABYLON.AbstractMesh,
    meshType: MeshType,
    blocklyBlockId?: string
): string {
    let finalCustomID: string;
    let existingMetadata = mesh.metadata as MeshMetadata | undefined | null;



    if (!existingMetadata) {
        mesh.metadata = {};
        existingMetadata = mesh.metadata as MeshMetadata;
    }

    const preExistingCustomIDOnMesh = existingMetadata.customID;

    if (preExistingCustomIDOnMesh) {
        finalCustomID = preExistingCustomIDOnMesh;
        if (registry.has(finalCustomID)) {
            if (registry.get(finalCustomID) !== mesh) {

                registry.set(finalCustomID, mesh);
            }
        } else {
            registry.set(finalCustomID, mesh);
        }
    } else {
        finalCustomID = generateUUID();
        registry.set(finalCustomID, mesh);
    }



    mesh.metadata.customID = finalCustomID;
    mesh.metadata.meshType = meshType;

    if (blocklyBlockId) {
        mesh.metadata.blocklyBlockId = blocklyBlockId;
    }



    if (existingMetadata.sourceModelUrl && !mesh.metadata.sourceModelUrl) {
        mesh.metadata.sourceModelUrl = existingMetadata.sourceModelUrl;
    }



    console.log(
        `MeshRegistry: Registered/Updated mesh "${mesh.name}" (ID: ${mesh.id}) ` +
        `with customID: ${mesh.metadata.customID}, Type: ${mesh.metadata.meshType}, ` +
        `SourceURL: ${mesh.metadata.sourceModelUrl}, BlocklyID: ${mesh.metadata.blocklyBlockId}`
    );
    return finalCustomID;
}

export function unregisterMesh(customID: string): void {
    if (registry.has(customID)) {
        const mesh = registry.get(customID);
        registry.delete(customID);
        console.log(`MeshRegistry: Unregistered mesh "${mesh?.name}" with customID: ${customID}`);
    } else {

    }
}


export function unregisterMeshByReference(mesh: BABYLON.AbstractMesh): void {
    const customID = (mesh.metadata as MeshMetadata)?.customID;
    if (customID) {
        unregisterMesh(customID);
    } else {
        console.warn(`MeshRegistry: Attempted to unregister mesh "${mesh.name}" (ID: ${mesh.id}) but it has no customID in metadata.`);
    }
}


export function getMeshByCustomID(customID: string): BABYLON.AbstractMesh | undefined {
    return registry.get(customID);
}


export function getCustomID(mesh: BABYLON.AbstractMesh): string | undefined {
    return (mesh.metadata as MeshMetadata)?.customID;
}


export function getMeshType(mesh: BABYLON.AbstractMesh): MeshType | undefined {
    return (mesh.metadata as MeshMetadata)?.meshType;
}



export function getMeshMetadata(mesh: BABYLON.AbstractMesh): MeshMetadata | undefined {

    if (!mesh || !mesh.metadata) {
        return undefined;
    }
    return mesh.metadata as MeshMetadata;
}



export function clearRegistry(): void {
    registry.clear();
    console.log("MeshRegistry: Cleared all entries.");
}


export function getAllRegisteredMeshes(): IterableIterator<BABYLON.AbstractMesh> {
    return registry.values();
}