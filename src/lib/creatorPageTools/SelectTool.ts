// lib/creatorPageTools/selectTool.ts
import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import type { ThreeD } from '$lib/blockly/3d';
import * as MeshRegistry from '$lib/state/meshRegistry';

const GIZMO_IGNORE_MESH_NAMES = ['ground', 'skybox'];
const DRAG_THRESHOLD_SQUARED = 25;

export class SelectTool {
    private threeDInstance: ThreeD;
    private scene: BABYLON.Scene;
    private utilityLayer: BABYLON.UtilityLayerRenderer;
    private boundingBoxGizmo: BABYLON.BoundingBoxGizmo | null;
    private positionGizmo: BABYLON.PositionGizmo | null;
    
    public isEnabled: boolean = false;
    private pointerObserver: BABYLON.Observer<BABYLON.PointerInfo> | null = null;
    private isPotentialDeselect: boolean = false;
    private pointerDownPosition: { x: number, y: number } | null = null; // To track drag start


    constructor(
        threeD: ThreeD,
        scene: BABYLON.Scene,
        utilityLayer: BABYLON.UtilityLayerRenderer,
        boundingBoxGizmo: BABYLON.BoundingBoxGizmo | null,
        positionGizmo: BABYLON.PositionGizmo | null
    ) {
         console.log("[SelectTool.constructor] Initializing SelectTool. Scene ID:", scene?.uniqueId);
        this.threeDInstance = threeD;
        this.scene = scene;
        this.utilityLayer = utilityLayer;
        this.boundingBoxGizmo = boundingBoxGizmo;
        this.positionGizmo = positionGizmo;
    }

     public enable(): void {
        console.log("[SelectTool.enable] Attempting to enable SelectTool. Current isEnabled state:", this.isEnabled);
        if (this.isEnabled) {
            console.log("[SelectTool.enable] Already enabled.");
            return;
        }
        this.isEnabled = true;
        console.log("[SelectTool.enable] SelectTool IS NOW ENABLED. Registering pointer observer.");
        this.registerPointerObserver();
    }

    public disable(): void {
        console.log("[SelectTool.disable] Attempting to disable SelectTool. Current isEnabled state:", this.isEnabled);
        if (!this.isEnabled) {
            console.log("[SelectTool.disable] Already disabled.");
            return;
        }
        this.isEnabled = false;
        console.log("[SelectTool.disable] SelectTool IS NOW DISABLED. Unregistering pointer observer and detaching gizmos.");
        this.unregisterPointerObserver();
        // Ensure threeDInstance and detachGizmosPublic are valid before calling
        if (this.threeDInstance && typeof this.threeDInstance.detachGizmosPublic === 'function') {
            this.threeDInstance.detachGizmosPublic();
        } else {
            console.error("[SelectTool.disable] Cannot detach gizmos: threeDInstance or detachGizmosPublic is invalid.");
        }
    }

  private registerPointerObserver(): void {
    console.log("[SelectTool.registerPointerObserver] Attempting to register pointer observer. Current observer:", !!this.pointerObserver);
        if (this.pointerObserver) {
            console.log("[SelectTool.registerPointerObserver] Pointer observer ALREADY REGISTERED on scene:", this.scene?.uniqueId);
            return;
        }
        if (!this.scene) {
            console.error("[SelectTool.registerPointerObserver] Cannot register: Scene is null.");
            return;
        }
        // Ensure the scene is the one associated with the active camera, if possible as a sanity check
        const activeCamera = this.threeDInstance?.getCamera();
        if (activeCamera && activeCamera.getScene() !== this.scene) {
            console.error("[SelectTool.registerPointerObserver] Mismatch: Tool's scene and Active Camera's scene are different!",
                          "Tool Scene ID:", this.scene.uniqueId, "Camera Scene ID:", activeCamera.getScene().uniqueId);
            // This is a critical issue if it happens.
        }

        console.log(`[SelectTool.registerPointerObserver] REGISTERING new pointer observer on scene ID: ${this.scene.uniqueId}`);

        this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo: BABYLON.PointerInfo) => {
            

            const currentAttachedMesh = this.threeDInstance.getAttachedGizmoMesh();

            switch (pointerInfo.type) {
                case BABYLON.PointerEventTypes.POINTERMOVE:
                    // Intentionally do nothing for POINTERMOVE related to selection/deselection
                    // Gizmos handle their own hover effects and drag behaviors based on POINTERMOVE.
                    // We don't want to log or process for selection here.
                    if (this.isPotentialDeselect || this.pointerDownPosition) {
                        // Check if it's a significant drag if a pointerdown started
                        if (this.pointerDownPosition) {
                            const dx = pointerInfo.event.clientX - this.pointerDownPosition.x;
                            const dy = pointerInfo.event.clientY - this.pointerDownPosition.y;
                            if ((dx * dx + dy * dy) > DRAG_THRESHOLD_SQUARED) {
                                // console.log("[SelectTool.PointerCallback] POINTERMOVE: Significant drag detected, clearing potential deselect and selection intent.");
                                this.isPotentialDeselect = false;
                                this.pointerDownPosition = null; // Clear drag start, it's now a drag
                            }
                        } else {
                             // this.isPotentialDeselect was true but no pointerDownPosition, indicates prior logic error, reset.
                             this.isPotentialDeselect = false;
                        }
                    }
                    break;

                case BABYLON.PointerEventTypes.POINTERDOWN:
                    const camera = this.threeDInstance ? this.threeDInstance.getCamera() : null;
                        if (!this.isEnabled || !camera) {
                            return;
                    }
                    // console.log(`[SelectTool.PointerCallback] POINTERDOWN. Button: ${pointerInfo.event.button}.`);
                    this.isPotentialDeselect = false;
                    this.pointerDownPosition = null;

                    if (pointerInfo.event.button !== 0) return;

                    // Record pointer down position for drag detection
                    this.pointerDownPosition = { x: pointerInfo.event.clientX, y: pointerInfo.event.clientY };
                    
                    const pickResultOnDown = this.scene.pick(
                        this.scene.pointerX, this.scene.pointerY, undefined, false, camera
                    );

                    let isInteractionWithGizmoOnDown = false;
                    if (pickResultOnDown?.pickedMesh && pickResultOnDown.pickedMesh.getScene() === this.utilityLayer.utilityLayerScene) {
                        isInteractionWithGizmoOnDown = true;
                    } else if (this.boundingBoxGizmo?.isDragging || this.positionGizmo?.isDragging || this.boundingBoxGizmo?.isHovered || this.positionGizmo?.isHovered) {
                        isInteractionWithGizmoOnDown = true;
                    }
                    
                    if (isInteractionWithGizmoOnDown) {
                        // console.log("[SelectTool.PointerCallback] POINTERDOWN on gizmo, allowing interaction.");
                        return; 
                    }

                    // If it's a left click, not on a gizmo, and something is attached, it's a *potential* deselect.
                    // The actual deselection will happen on POINTERUP (via POINTERTAP/PICK) if it wasn't a drag.
                    if (currentAttachedMesh) {
                        if (!pickResultOnDown?.pickedMesh) { // Clicked empty space
                            // console.log("[SelectTool.PointerCallback] POINTERDOWN on empty with left click, flagging for potential deselect.");
                            this.isPotentialDeselect = true;
                        } else { // Clicked on a mesh
                            const meshName = pickResultOnDown.pickedMesh.name || '';
                            const isIgnored = GIZMO_IGNORE_MESH_NAMES.some(ignoreName => meshName.startsWith(ignoreName));
                            if (isIgnored) {
                                // console.log("[SelectTool.PointerCallback] POINTERDOWN on ignored mesh with left click, flagging for potential deselect.");
                                this.isPotentialDeselect = true;
                            }
                            // If it's another selectable mesh, POINTERPICK/TAP will handle the switch.
                            // If it's a non-selectable mesh, POINTERPICK/TAP will handle deselection.
                        }
                    }
                    break;

                // POINTERUP is often more reliable for completing a "click" action after a POINTERDOWN
                // POINTERTAP and POINTERPICK are higher-level events that fire after POINTERUP
                // if no significant move occurred.
                case BABYLON.PointerEventTypes.POINTERUP: // Or POINTERTAP/POINTERPICK
                    const wasDragging = !this.pointerDownPosition; // If pointerDownPosition is null here, it means POINTERMOVE cleared it due to drag
                    this.pointerDownPosition = null; // Reset for next interaction cycle

                    if (pointerInfo.event.button !== 0) {
                        this.isPotentialDeselect = false;
                        return;
                    }

                    if (wasDragging) { // If a drag was detected by POINTERMOVE clearing pointerDownPosition
                        // console.log("[SelectTool.PointerCallback] POINTERUP after a drag, ignoring for selection/deselection.");
                        this.isPotentialDeselect = false;
                        return;
                    }
                    
                    if (this.boundingBoxGizmo?.isDragging || this.positionGizmo?.isDragging) {
                        this.isPotentialDeselect = false;
                        return;
                    }

                    const pickInfo = pointerInfo.pickInfo;
                    const pickedMesh = pickInfo?.pickedMesh;

                    if (this.isPotentialDeselect) {
                        if (!pickedMesh || GIZMO_IGNORE_MESH_NAMES.some(ignoreName => pickedMesh.name?.startsWith(ignoreName))) {
                            if (currentAttachedMesh) this.threeDInstance.detachGizmosPublic();
                        }
                        this.isPotentialDeselect = false;
                        return; 
                    }
                    
                    // If not a confirmed deselect from empty space, proceed with normal pick logic
                    if (pickedMesh) {
                        const meshName = pickedMesh.name || '';
                        const isGizmoElementItself = pickedMesh.getScene() === this.utilityLayer.utilityLayerScene;

                        if (isGizmoElementItself) {
                            // console.log("[SelectTool.PointerCallback] Clicked on gizmo element itself.");
                            return; 
                        }
                        // Ignored meshes (ground/sky) deselection is handled by the isPotentialDeselect path above.
                        // If somehow an ignored mesh is picked here and isPotentialDeselect was false,
                        // it implies a drag started on the ignored mesh, which shouldn't select/deselect.
                        if (GIZMO_IGNORE_MESH_NAMES.some(ignoreName => meshName.startsWith(ignoreName))) {
                            // console.log("[SelectTool.PointerCallback] Clicked on ignored mesh, but not a deselect intent, likely drag. Detaching.");
                            // This might still be too aggressive if a drag started on ground.
                            // The camera controller should typically take over.
                            // If a gizmo is attached AND we clicked ground, it should have been caught by isPotentialDeselect.
                            // If no gizmo is attached and we click ground, do nothing.
                            if(currentAttachedMesh) this.threeDInstance.detachGizmosPublic();
                            return;
                        }

                        let meshToAttachGizmoTo: BABYLON.AbstractMesh | null = null;
                        const pickedMeshMetadata = MeshRegistry.getMeshMetadata(pickedMesh);
                        if (pickedMeshMetadata) {
                            if (pickedMeshMetadata.isAssetRoot && pickedMeshMetadata.customID) {
                                meshToAttachGizmoTo = pickedMesh;
                            } else if (pickedMeshMetadata.isChildOfStaticAsset && pickedMeshMetadata.rootAssetCustomID) {
                                meshToAttachGizmoTo = MeshRegistry.getMeshByCustomID(pickedMeshMetadata.rootAssetCustomID);
                            }
                        }
                        if (!meshToAttachGizmoTo && pickedMesh instanceof BABYLON.AbstractMesh) {
                            const directMetadata = MeshRegistry.getMeshMetadata(pickedMesh);
                            if (directMetadata && directMetadata.customID && directMetadata.meshType) { 
                                meshToAttachGizmoTo = pickedMesh;
                            }
                        }
                        
                        if (meshToAttachGizmoTo) {
                            if (currentAttachedMesh !== meshToAttachGizmoTo) {
                                // console.log("[SelectTool.PointerCallback] Attaching to new mesh:", meshToAttachGizmoTo.name);
                                this.threeDInstance.attachGizmosPublic(meshToAttachGizmoTo);
                            } else {
                                // console.log("[SelectTool.PointerCallback] Clicked on already selected mesh.");
                            }
                        } else {
                            // Clicked on a non-selectable mesh (and not an ignored one that led to deselect)
                            // console.log("[SelectTool.PointerCallback] Clicked on non-selectable mesh, detaching.");
                            if (currentAttachedMesh) this.threeDInstance.detachGizmosPublic();
                        }
                    } else {
                        // This 'else' (no pickedMesh on POINTERUP/TAP/PICK) after isPotentialDeselect was false
                        // implies a drag that ended off-screen or in a way that didn't pick anything.
                        // Usually, no action is needed here if isPotentialDeselect handled the empty space click.
                        // However, if a drag *started* on an object and ended in empty space,
                        // the object should remain selected.
                        // console.log("[SelectTool.PointerCallback] POINTERUP/TAP/PICK on empty, but not a deselect intent (drag ended in empty?). No action.");
                    }
                    this.isPotentialDeselect = false; // Reset flag
                    break;
            }
        });
        // ... (logging for successful registration)
        if (this.pointerObserver) {
            console.log("[SelectTool.registerPointerObserver] Pointer observer registration SUCCESSFUL.");
        } else {
            console.error("[SelectTool.registerPointerObserver] FAILED to register pointer observer (scene.onPointerObservable.add returned null).");
        }
    }

    private unregisterPointerObserver(): void {
        if (this.pointerObserver && this.scene) {
            // console.log("SelectTool: Unregistering pointer observer.");
            this.scene.onPointerObservable.remove(this.pointerObserver);
            this.pointerObserver = null;
        }
    }

    public dispose(): void {
        this.disable();
    }
}