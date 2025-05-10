// File: lib/creatorPageTools/CloneTool.ts
import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import type { ThreeD } from '$lib/blockly/3d';
import * as MeshRegistry from '$lib/state/meshRegistry';
import type { MeshMetadata } from '$lib/state/meshRegistry';

const GIZMO_IGNORE_MESH_NAMES = ['ground', 'skybox', 'BackgroundPlane', 'BackgroundSkybox'];
const POINTER_RIGHT_CLICK_BUTTON = 2;

export class CloneTool {
    private threeDInstance: ThreeD;
    private scene: BABYLON.Scene;
    private camera: BABYLON.Camera;

    public isEnabled: boolean = false;
    private pointerObserver: BABYLON.Observer<BABYLON.PointerInfo> | null = null;
    private keyboardObserver: BABYLON.Observer<BABYLON.KeyboardInfo> | null = null;

    private activeClonedMeshRoot: BABYLON.AbstractMesh | null = null; // Renamed for clarity
    private isCloning: boolean = false;
    private originalMeshSourceUrl: string | undefined = undefined;
    private originalMeshName: string = "clonedObject";
    private originalMeshToCloneActualRef: BABYLON.AbstractMesh | null = null; // Keep a ref to the actual original
    private justPlacedClone: boolean = false;

    constructor(threeD: ThreeD, scene: BABYLON.Scene, camera: BABYLON.Camera) {
        this.threeDInstance = threeD;
        this.scene = scene;
        this.camera = camera;
    }

    public enable(): void {
        if (this.isEnabled) return;
        this.isEnabled = true;
        this.justPlacedClone = false; // Reset this flag
        this.activeClonedMeshRoot = null; // <<<< ENSURE THIS IS PRESENT AND CORRECT
        this.isCloning = false;          // <<<< ENSURE THIS IS PRESENT AND CORRECT
        this.originalMeshToCloneActualRef = null; // Also reset this
        this.registerObservers();
        this.camera?.detachControl();
        console.log("[CloneTool.enable] CloneTool IS NOW ENABLED (state reset).");
    }

    public disable(): void {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        this.unregisterObservers();
        this.cancelCloneOperation(); // This will dispose activeClonedMeshRoot if it exists
        const canvas = this.scene?.getEngine().getRenderingCanvas();
        if (canvas && this.camera) this.camera.attachControl(canvas, true);
        console.log("[CloneTool.disable] CloneTool IS NOW DISABLED.");
    }

    private registerObservers(): void {
        if (!this.scene || this.scene.isDisposed) return;
        this.unregisterObservers();
        this.pointerObserver = this.scene.onPointerObservable.add(this.unifiedPointerHandler);
        this.keyboardObserver = this.scene.onKeyboardObservable.add(this.keyboardHandler);
    }

    private unregisterObservers(): void {
        if (this.pointerObserver) this.scene.onPointerObservable.remove(this.pointerObserver); this.pointerObserver = null;
        if (this.keyboardObserver) this.scene.onKeyboardObservable.remove(this.keyboardObserver); this.keyboardObserver = null;
    }

    private keyboardHandler = (kbInfo: BABYLON.KeyboardInfo) => {
        if (!this.isEnabled || !this.isCloning) return;
        if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN && kbInfo.event.key === "Escape") this.cancelCloneOperation();
    };

    private unifiedPointerHandler = (pointerInfo: BABYLON.PointerInfo) => {
        if (!this.isEnabled) return;
        switch (pointerInfo.type) {
            case BABYLON.PointerEventTypes.POINTERDOWN:
                if (this.isCloning && pointerInfo.event.button === POINTER_RIGHT_CLICK_BUTTON) { pointerInfo.event.preventDefault(); this.cancelCloneOperation(); return; }
                if (pointerInfo.event.button !== 0) return;
                if (this.justPlacedClone) { this.justPlacedClone = false; return; }
                if (!this.isCloning) { // This is the first click to pick an object
                    console.log("[CloneTool.unifiedPointerHandler] POINTERDOWN: Calling handleFirstClick. isCloning is false.");
                    this.handleFirstClick(pointerInfo);
                } else { // This is the second click to place the object
                    console.log("[CloneTool.unifiedPointerHandler] POINTERDOWN: Calling handleSecondClick. isCloning is true.");
                    this.handleSecondClick(pointerInfo);
                    this.justPlacedClone = true; // Set flag after successful placement
                }
                break;
            case BABYLON.PointerEventTypes.POINTERMOVE:
                if (this.isCloning && this.activeClonedMeshRoot) this.updateClonedMeshPosition(pointerInfo.event.clientX, pointerInfo.event.clientY);
                break;
            case BABYLON.PointerEventTypes.POINTERUP:
                if (this.isCloning && pointerInfo.event.button === POINTER_RIGHT_CLICK_BUTTON) { pointerInfo.event.preventDefault(); this.cancelCloneOperation(); }
                break;
        }
    };

    private handleFirstClick(pointerInfo: BABYLON.PointerInfo): void {
        const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY,
            (mesh) => mesh.isPickable && mesh.isEnabled() && !GIZMO_IGNORE_MESH_NAMES.some(ignoreName => mesh.name.startsWith(ignoreName)) && mesh !== this.activeClonedMeshRoot
        );
        if (!pickInfo?.hit || !pickInfo.pickedMesh) { console.log("[CloneTool.handleFirstClick] No valid mesh picked."); return; }

        this.originalMeshToCloneActualRef = pickInfo.pickedMesh; // Store reference to the actual picked mesh
        let meshToCloneRoot = this.originalMeshToCloneActualRef;
        const metadataOriginal = MeshRegistry.getMeshMetadata(meshToCloneRoot);

        if (metadataOriginal?.isChildOfStaticAsset && metadataOriginal?.rootAssetCustomID) {
            const rootMesh = MeshRegistry.getMeshByCustomID(metadataOriginal.rootAssetCustomID);
            if (rootMesh) {
                meshToCloneRoot = rootMesh;
                console.log(`[CloneTool.handleFirstClick] Picked child, cloning root asset: ${meshToCloneRoot.name}`);
            }
        }
        this.originalMeshToCloneActualRef = meshToCloneRoot; // Update if root was found

        const sourceMetadata = MeshRegistry.getMeshMetadata(meshToCloneRoot);
        if (!sourceMetadata || (sourceMetadata.meshType !== 'static' && sourceMetadata.meshType !== 'dynamic') || !sourceMetadata.customID) {
            console.log("[CloneTool.handleFirstClick] Target mesh for cloning is not static/dynamic or lacks valid metadata/customID.", meshToCloneRoot.name, sourceMetadata); return;
        }

        this.originalMeshSourceUrl = sourceMetadata.sourceModelUrl;
        this.originalMeshName = meshToCloneRoot.name;

        this.activeClonedMeshRoot = meshToCloneRoot.clone(`${this.originalMeshName}_clone_${Date.now()}`, null, false);
        if (!this.activeClonedMeshRoot) { console.error("[CloneTool.handleFirstClick] Cloning failed."); return; }

        this.activeClonedMeshRoot.metadata = {}; // Fresh metadata object for the clone root

        console.log(`[CloneTool.handleFirstClick] Cloned "${meshToCloneRoot.name}" to "${this.activeClonedMeshRoot.name}".`);
        this.activeClonedMeshRoot.isPickable = false; this.activeClonedMeshRoot.setEnabled(true); this.activeClonedMeshRoot.visibility = 0.7;
        this.activeClonedMeshRoot.setParent(null);
        this.activeClonedMeshRoot.position = meshToCloneRoot.getAbsolutePosition().clone();
        this.activeClonedMeshRoot.rotationQuaternion = (meshToCloneRoot.rotationQuaternion ? meshToCloneRoot.rotationQuaternion.clone() : BABYLON.Quaternion.FromEulerVector(meshToCloneRoot.rotation.clone()));
        this.activeClonedMeshRoot.scaling = meshToCloneRoot.scaling.clone();
        this.isCloning = true;
        this.updateClonedMeshPosition(pointerInfo.event.clientX, pointerInfo.event.clientY);
    }

    private handleSecondClick(pointerInfo: BABYLON.PointerInfo): void {
        if (!this.activeClonedMeshRoot || !this.originalMeshToCloneActualRef) {
            this.cancelCloneOperation(); // This cleans up activeClonedMeshRoot
            return;
        }

        // At this point, activeClonedMeshRoot is the mesh we intend to place permanently.
        // Let's call it `meshToPlace` to avoid confusion after we null out `activeClonedMeshRoot`.
        const meshToPlace = this.activeClonedMeshRoot;

        console.log("[CloneTool.handleSecondClick] Placing cloned mesh:", meshToPlace.name);
        this.updateClonedMeshPosition(pointerInfo.event.clientX, pointerInfo.event.clientY, meshToPlace); // Pass the mesh explicitly
        meshToPlace.visibility = 1.0;
        meshToPlace.isPickable = true;

        const cloneMaterialsRecursive = (originalNode: BABYLON.AbstractMesh, clonedNode: BABYLON.AbstractMesh) => {
            if (originalNode.material && originalNode.material instanceof BABYLON.Material) {
                clonedNode.material = originalNode.material.clone(originalNode.material.name + "_cloneInstance_" + BABYLON.Tools.RandomId());
            }
            const originalChildren = originalNode.getChildMeshes(false);
            const clonedChildren = clonedNode.getChildMeshes(false);
            if (originalChildren.length === clonedChildren.length) {
                for (let i = 0; i < originalChildren.length; i++) {
                    cloneMaterialsRecursive(originalChildren[i], clonedChildren[i]);
                }
            }
        };
        cloneMaterialsRecursive(this.originalMeshToCloneActualRef, meshToPlace);
        console.log(`[CloneTool.handleSecondClick] Materials cloned for ${meshToPlace.name}.`);

        const originalRootMeta = MeshRegistry.getMeshMetadata(this.originalMeshToCloneActualRef);
        meshToPlace.metadata = {
            meshType: 'static',
            sourceModelUrl: this.originalMeshSourceUrl,
            isAssetRoot: true,
            clonedFromCustomID: originalRootMeta?.customID,
        };

        const newClonedRootCustomID = MeshRegistry.registerMesh(meshToPlace, 'static');
        console.log(`[CloneTool.handleSecondClick] Registered placed mesh ${meshToPlace.name} with customID: ${newClonedRootCustomID}`);

        const finalPlacedMeta = MeshRegistry.getMeshMetadata(meshToPlace);
        if (finalPlacedMeta) {
            finalPlacedMeta.customID = newClonedRootCustomID;
            finalPlacedMeta.meshType = 'static';
            finalPlacedMeta.sourceModelUrl = this.originalMeshSourceUrl;
            finalPlacedMeta.isAssetRoot = true;
            finalPlacedMeta.clonedFromCustomID = originalRootMeta?.customID;
            delete finalPlacedMeta.isChildOfStaticAsset;
            delete finalPlacedMeta.rootAssetCustomID;
        }

        const updateChildrenMetadataRecursive = (meshNode: BABYLON.AbstractMesh, newRootID: string) => {
            meshNode.getChildMeshes(false).forEach(child => {
                child.metadata = {};
                child.metadata.isChildOfStaticAsset = true;
                child.metadata.rootAssetCustomID = newRootID;
                child.metadata.sourceModelUrl = this.originalMeshSourceUrl;
                delete child.metadata.customID; delete child.metadata.meshType; delete child.metadata.isAssetRoot;
                updateChildrenMetadataRecursive(child, newRootID);
            });
        };
        updateChildrenMetadataRecursive(meshToPlace, newClonedRootCustomID);
        console.log(`[CloneTool.handleSecondClick] Updated metadata for children of ${meshToPlace.name}.`);


        // Important: Reset tool's active manipulation state BEFORE switching tools.
        // The `meshToPlace` is now a permanent scene object.
        this.activeClonedMeshRoot = null; // Tool is no longer actively manipulating this mesh.
        this.isCloning = false;
        this.originalMeshSourceUrl = undefined;
        this.originalMeshName = "clonedObject";
        this.originalMeshToCloneActualRef = null;
        // this.justPlacedClone = true; // This is set by the unifiedPointerHandler after this function completes.

        console.log("[CloneTool.handleSecondClick] Clone (mesh:", meshToPlace.name, ") placed. Requesting SelectTool activation.");

        if (this.threeDInstance) {
            if (typeof (this.threeDInstance as any).triggerSaveProject === 'function') {
                (this.threeDInstance as any).triggerSaveProject();
            }
            this.threeDInstance.setTool('select'); // This will trigger disable() on this CloneTool instance.
        }
    }

    private updateClonedMeshPosition(screenX: number, screenY: number, meshToUpdate?: BABYLON.AbstractMesh | null): void {
        const targetMesh = meshToUpdate || this.activeClonedMeshRoot;
        if (!targetMesh || !this.scene || this.scene.isDisposed || !this.camera) return;

        const pickInfo = this.scene.pick(screenX, screenY, (mesh) => mesh.name === "ground");
        if (pickInfo?.hit && pickInfo.pickedPoint) {
            targetMesh.position.copyFrom(pickInfo.pickedPoint);
        } else {
            const ray = this.scene.createPickingRay(screenX, screenY, null, this.camera, false);
            let focalPointDepth: BABYLON.Vector3;
            if (this.camera instanceof BABYLON.ArcRotateCamera && this.camera.target instanceof BABYLON.AbstractMesh) {
                focalPointDepth = this.camera.target.getAbsolutePosition();
            } else if (this.camera instanceof BABYLON.ArcRotateCamera) {
                focalPointDepth = this.camera.target.clone();
            } else {
                 focalPointDepth = this.camera.position.add(ray.direction.scale(10));
            }
            const plane = BABYLON.Plane.FromPositionAndNormal(focalPointDepth, this.camera.getForwardRay(1).direction);
            const distance = ray.intersectsPlane(plane);
            if (distance !== null && distance > 0) {
                targetMesh.position.copyFrom(ray.origin.add(ray.direction.scale(distance)));
            }
        }
    }

    public cancelCloneOperation(): void {
        // This method should ONLY dispose of a mesh if it's currently being actively manipulated
        // (i.e., this.activeClonedMeshRoot is not null and this.isCloning was true).
        if (this.activeClonedMeshRoot) {
            console.log("[CloneTool.cancelCloneOperation] Disposing actively manipulated cloned mesh:", this.activeClonedMeshRoot.name);
            this.activeClonedMeshRoot.dispose(false, true); // Dispose hierarchy and materials
            this.activeClonedMeshRoot = null;
        }
        this.isCloning = false; // Always reset cloning state
        this.justPlacedClone = false; // Reset this flag
        this.originalMeshSourceUrl = undefined;
        this.originalMeshName = "clonedObject";
        this.originalMeshToCloneActualRef = null;
        console.log("[CloneTool.cancelCloneOperation] Clone operation state reset.");
    }

    public dispose(): void {
        this.disable();
    }
}