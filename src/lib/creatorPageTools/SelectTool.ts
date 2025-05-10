// lib/creatorPageTools/selectTool.ts
import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import type { ThreeD } from '$lib/blockly/3d';
import * as MeshRegistry from '$lib/state/meshRegistry';

const GIZMO_IGNORE_MESH_NAMES = ['ground', 'skybox'];
const DRAG_THRESHOLD_SQUARED = 25;

export class SelectTool {
    private threeDInstance: ThreeD;
    private scene: BABYLON.Scene;
    public camera: BABYLON.Camera;
    private utilityLayer: BABYLON.UtilityLayerRenderer;
    private boundingBoxGizmo: BABYLON.BoundingBoxGizmo | null;
    private positionGizmo: BABYLON.PositionGizmo | null;
    
    public isEnabled: boolean = false;
    private pointerObserver: BABYLON.Observer<BABYLON.PointerInfo> | null = null;
    private isPotentialDeselect: boolean = false;
    private pointerDownPosition: { x: number, y: number } | null = null; // To track drag start
    private cameraWasDragging: boolean = false;


    constructor(
        threeD: ThreeD,
        scene: BABYLON.Scene,
        camera: BABYLON.Camera,
        utilityLayer: BABYLON.UtilityLayerRenderer,
        boundingBoxGizmo: BABYLON.BoundingBoxGizmo | null,
        positionGizmo: BABYLON.PositionGizmo | null
    ) {
         console.log("[SelectTool.constructor] Initializing SelectTool. Scene ID:", scene?.getUniqueId());
        this.threeDInstance = threeD;
        this.scene = scene;
        this.camera = camera;
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
        if (this.pointerObserver) return;
        // console.log(`[SelectTool.registerPointerObserver] REGISTERING new pointer observer on scene ID: ${this.scene.getUniqueId()}`);

        this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo: BABYLON.PointerInfo) => {
            // console.log(`[SelectTool.PointerCallback] Type: ${pointerInfo.type}, Btn: ${pointerInfo.event.button}, Enabled: ${this.isEnabled}`);
            const camera = this.threeDInstance?.getCamera();
            if (!this.isEnabled || !camera) return;

            const currentAttachedMesh = this.threeDInstance.getAttachedGizmoMesh();

            switch (pointerInfo.type) {
                case BABYLON.PointerEventTypes.POINTERMOVE:
                    if (this.pointerDownPosition) { // A click/drag potentially started
                        const dx = pointerInfo.event.clientX - this.pointerDownPosition.x;
                        const dy = pointerInfo.event.clientY - this.pointerDownPosition.y;
                        if ((dx * dx + dy * dy) > DRAG_THRESHOLD_SQUARED) {
                            // console.log("[SelectTool] Drag detected (camera or other).");
                            this.isPotentialDeselect = false;
                            this.cameraWasDragging = true; // Assume any significant drag might be camera
                            this.pointerDownPosition = null;
                        }
                    }
                    break;

                case BABYLON.PointerEventTypes.POINTERDOWN:
                    // console.log(`[SelectTool] POINTERDOWN. Button: ${pointerInfo.event.button}`);
                    this.isPotentialDeselect = false;
                    this.pointerDownPosition = null;
                    this.cameraWasDragging = false; // Reset camera drag flag on new pointer down

                    if (pointerInfo.event.button !== 0) return; // Only left clicks

                    this.pointerDownPosition = { x: pointerInfo.event.clientX, y: pointerInfo.event.clientY };

                    const pickResultOnDown = this.scene.pick(this.scene.pointerX, this.scene.pointerY, undefined, false, camera);
                    let isInteractionWithGizmoOnDown = false;
                    if (pickResultOnDown?.pickedMesh && pickResultOnDown.pickedMesh.getScene() === this.threeDInstance.getUtilityLayer()?.utilityLayerScene) {
                        isInteractionWithGizmoOnDown = true;
                    } else if (this.boundingBoxGizmo?.isDragging || this.positionGizmo?.isDragging || this.boundingBoxGizmo?.isHovered || this.positionGizmo?.isHovered) {
                        isInteractionWithGizmoOnDown = true;
                    }
                    
                    if (isInteractionWithGizmoOnDown) {
                        this.pointerDownPosition = null; // Gizmo interaction, not a scene click/drag
                        return;
                    }

                    if (currentAttachedMesh) {
                        if (!pickResultOnDown?.pickedMesh || GIZMO_IGNORE_MESH_NAMES.some(name => pickResultOnDown.pickedMesh?.name.startsWith(name))) {
                            this.isPotentialDeselect = true;
                        }
                    }
                    break;

                case BABYLON.PointerEventTypes.POINTERUP:
                    // console.log(`[SelectTool] POINTERUP. Button: ${pointerInfo.event.button}. PotentialDeselect: ${this.isPotentialDeselect}. CameraWasDragging: ${this.cameraWasDragging}`);
                    
                    const wasDraggingSceneOrCamera = !this.pointerDownPosition || this.cameraWasDragging;
                    const wasGizmoDragging = this.boundingBoxGizmo?.isDragging || this.positionGizmo?.isDragging;
                    
                    // Reset flags for next cycle
                    this.pointerDownPosition = null; 
                    const  previousCameraDraggingState = this.cameraWasDragging; // store before reset
                    this.cameraWasDragging = false;


                    if (pointerInfo.event.button !== 0) { // Not a left click release
                        this.isPotentialDeselect = false;
                        return;
                    }

                    if (wasGizmoDragging) { // If a gizmo was being interacted with, its own observable handles it.
                        // console.log("[SelectTool] POINTERUP ignored, gizmo was dragging.");
                        this.isPotentialDeselect = false;
                        return;
                    }
                    
                    if (previousCameraDraggingState) { // If camera was dragging, don't interpret this UP as a select/deselect
                        // console.log("[SelectTool] POINTERUP ignored, camera was dragging.");
                        this.isPotentialDeselect = false;
                        return;
                    }


                    // If isPotentialDeselect is true, it means POINTERDOWN was on empty/ignored space,
                    // and no significant drag (camera or otherwise) occurred.
                    if (this.isPotentialDeselect) {
                        const pickInfoUp = this.scene.pick(this.scene.pointerX, this.scene.pointerY, undefined, false, camera);
                        if (!pickInfoUp?.pickedMesh || GIZMO_IGNORE_MESH_NAMES.some(ignoreName => pickInfoUp.pickedMesh?.name?.startsWith(ignoreName))) {
                            // console.log("[SelectTool] Confirmed deselect on empty/ignored.");
                            if (currentAttachedMesh) this.threeDInstance.detachGizmosPublic();
                        }
                        this.isPotentialDeselect = false;
                        return; 
                    }
                    
                    // If it wasn't a camera drag and not a deselect intent, proceed with selection attempt
                    const pickInfo = pointerInfo.pickInfo; // Use the pickInfo from the POINTERUP event
                    const pickedMesh = pickInfo?.pickedMesh;

                    if (pickedMesh) {
                        const meshName = pickedMesh.name || '';
                        const isGizmoElementItself = pickedMesh.getScene() === this.threeDInstance.getUtilityLayer()?.utilityLayerScene;

                        if (isGizmoElementItself) return; 
                        if (GIZMO_IGNORE_MESH_NAMES.some(ignoreName => meshName.startsWith(ignoreName))) {
                            if(currentAttachedMesh) this.threeDInstance.detachGizmosPublic(); // Should have been caught by isPotentialDeselect
                            return;
                        }

                        let meshToAttachGizmoTo: BABYLON.AbstractMesh | null = null;

                        const pickedMeshMetadata = MeshRegistry.getMeshMetadata(pickedMesh);
                        if (pickedMeshMetadata) { 
                            if (pickedMeshMetadata.isAssetRoot || (pickedMeshMetadata.meshType && pickedMeshMetadata.customID) ) meshToAttachGizmoTo = pickedMesh;
                            else if (pickedMeshMetadata.isChildOfStaticAsset && pickedMeshMetadata.rootAssetCustomID) meshToAttachGizmoTo = MeshRegistry.getMeshByCustomID(pickedMeshMetadata.rootAssetCustomID);
                        } else if (pickedMesh instanceof BABYLON.AbstractMesh) { 
                             const directMeta = MeshRegistry.getMeshMetadata(pickedMesh);
                             if (directMeta && directMeta.customID && directMeta.meshType) meshToAttachGizmoTo = pickedMesh;
                        }
                        
                        if (meshToAttachGizmoTo) {
                            if (currentAttachedMesh !== meshToAttachGizmoTo) {
                                // console.log("[SelectTool] Attaching to new mesh:", meshToAttachGizmoTo.name);
                                this.threeDInstance.attachGizmosPublic(meshToAttachGizmoTo);
                            }
                        } else {
                            if (currentAttachedMesh) this.threeDInstance.detachGizmosPublic();
                        }
                    } else { 
                        // No mesh picked on UP, and not a camera drag, and not a deselect intent
                        // This means a click on empty space that wasn't flagged by POINTERDOWN (should be rare)
                        if (currentAttachedMesh) this.threeDInstance.detachGizmosPublic();
                    }
                    this.isPotentialDeselect = false; 
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