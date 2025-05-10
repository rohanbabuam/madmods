import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import { loadAndPlaceModel } from "./world/index";
import type { GeneratedObject } from '$lib/types/GeneratedObject';

import * as lighting from "./lighting";
import * as world from "./world";
import * as physics from "./physics";
import * as camera from "./camera";
import * as events from "./events";

import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import { BoundingBoxGizmo } from '@babylonjs/core/Gizmos/boundingBoxGizmo';
import { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo';
// import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';

import { SelectTool } from '../../creatorPageTools/SelectTool';
import { CloneTool } from '../../creatorPageTools/CloneTool';

const GIZMO_IGNORE_MESH_NAMES = ['ground', 'skybox', 'BackgroundPlane', 'BackgroundSkybox'];


import * as MeshRegistry from '../../state/meshRegistry';

import * as SaveLoad from '../../state/saveload';
import { blocklyWorkspace } from '../blockly';

const CAMERA_ANIMATION_FPS = 30;
const CAMERA_ANIMATION_DURATION_SECONDS = 0.5;
const CAMERA_ANIMATION_TOTAL_FRAMES = CAMERA_ANIMATION_DURATION_SECONDS * CAMERA_ANIMATION_FPS;

export type ToolName = 'select' | 'clone' | 'wand' | 'scatter' | null; // Define a type for tool names

export class ThreeD {
  private readonly canvas: any;
  public readonly engine: BABYLON.Engine;
  private havokInstance: any;
  private havokPlugin: BABYLON.HavokPlugin | null = null;
  private camera: BABYLON.Camera | null = null;
  private cameraType: string | null = null;
  private scene: BABYLON.Scene | null = null;
  private skybox: BABYLON.Mesh | null = null;
  private ambientLight: BABYLON.HemisphericLight | null = null;
  private ground: BABYLON.Mesh | null = null;
  private defaultXRExperience: BABYLON.WebXRDefaultExperience | null = null;
  private runningAnimations = {};
  private actionManagers: BABYLON.AbstractActionManager[] = [];


  private utilityLayer: UtilityLayerRenderer | null = null;
  private boundingBoxGizmo: BoundingBoxGizmo | null = null;
  private positionGizmo: PositionGizmo | null = null;
  private attachedGizmoMesh: BABYLON.AbstractMesh | null = null;

  private sceneKeyboardObserver: BABYLON.Observer<BABYLON.KeyboardInfo> | null = null;

  private previousCameraTargetPositionBeforeGizmoAttach: BABYLON.Vector3 | null = null;

    // Tool instances
  private selectToolInstance: SelectTool | null = null;
  private cloneToolInstance: CloneTool | null = null;
  private activeTool: ToolName | null = null; // Initialize to null or a dummy value
  private onToolChangedCallback: ((toolName: ToolName) => void) | null = null;
  private readonly _onToolChangedCallback: ((toolName: ToolName) => void) | null = null;

  constructor(canvas: HTMLElement, havokInstance: any, onToolChangedCallbackParam?: (toolName: ToolName) => void) {
    this.canvas = canvas;
    this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.havokInstance = havokInstance;
    this._onToolChangedCallback = onToolChangedCallbackParam || null;
    // this.scene = new BABYLON.Scene(this.engine); // Initial scene creation often happens in createScene
    // console.log(`[ThreeD.constructor] Initial scene created with ID: ${this.scene?.getUniqueId()}`);
    if (!havokInstance) {
        console.warn("ThreeD constructor: Received null Havok instance.");
    }
}

public getScene(): BABYLON.Scene | null {
    if (this.scene && this.scene.isDisposed) {
        // This log is still useful if getScene is called on a disposed scene
        console.warn("[ThreeD.getScene] Attempted to get a disposed scene.");
        return null;
    }
    return this.scene;
}

public getCamera(): BABYLON.Camera | null {
    if (this.camera && this.camera.isDisposed()) {
        // This log is still useful
        console.warn("[ThreeD.getCamera] Attempted to get a disposed camera.");
        return null;
    }
    if (this.camera && this.scene && !this.scene.isDisposed && this.camera.getScene() !== this.scene) {
        console.warn(`[ThreeD.getCamera] Camera's scene (ID: ${this.camera.getScene()?.getUniqueId()}) does not match ThreeD's current scene (ID: ${this.scene.getUniqueId()}). Returning null as camera is likely stale.`);
        return null; // Camera is stale if its scene doesn't match the current scene
    }
    return this.camera;
}

public getUtilityLayer(): BABYLON.UtilityLayerRenderer | null {
        return this.utilityLayer;
    }

  public getAttachedGizmoMesh(): BABYLON.AbstractMesh | null {
      return this.attachedGizmoMesh;
  }

public attachGizmosPublic = (mesh: BABYLON.AbstractMesh) => {
    if (!mesh) return;
    // Ensure gizmos are available
    if (!this.boundingBoxGizmo && !this.positionGizmo) {
        console.warn("ThreeD.attachGizmosPublic: Gizmos not initialized.");
        return;
    }
    // console.log(`ThreeD.attachGizmosPublic: Attaching to mesh: ${mesh.name}`);

    // Detach from previous if any, and it's different
    if (this.attachedGizmoMesh && this.attachedGizmoMesh !== mesh) {
        this.detachGizmosPublic(); // This ensures clean state before attaching to new
    }
    if (this.attachedGizmoMesh === mesh) {
        // console.log("ThreeD.attachGizmosPublic: Already attached to this mesh.");
        return; // Already attached
    }


    if (this.camera && this.camera instanceof BABYLON.ArcRotateCamera) {
       // Animation logic for camera focus
       this.previousCameraTargetPositionBeforeGizmoAttach = this.camera.target.clone();
       const targetPoint = mesh.getAbsolutePosition();
       this.animateCameraToTarget(targetPoint);
    }

    if (this.boundingBoxGizmo) this.boundingBoxGizmo.attachedMesh = mesh;
    if (this.positionGizmo) this.positionGizmo.attachedMesh = mesh;
    this.attachedGizmoMesh = mesh;

    // Keyboard observer for delete (ensure scene is available)
    if (this.scene && !this.sceneKeyboardObserver) {
      this.sceneKeyboardObserver = this.scene.onKeyboardObservable.add((kbInfo) => {
          // ... (delete logic as before) ...
          if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
              if ((kbInfo.event.key === "Delete" || kbInfo.event.key === "Backspace") && this.attachedGizmoMesh) {
                  const meshToDelete = this.attachedGizmoMesh; // Mesh is captured here
                  // Ensure it's the *same* mesh that's still attached when key is processed
                  if (meshToDelete === this.getAttachedGizmoMesh()) {
                      const meshMetadata = MeshRegistry.getMeshMetadata(meshToDelete);
                      if (meshMetadata && meshMetadata.meshType === 'static') {
                          console.log(`Delete key for static mesh: ${meshToDelete.name}`);
                          this.detachGizmosPublic(); // Detach before delete
                          const customID = MeshRegistry.getCustomID(meshToDelete);
                          if (customID) MeshRegistry.unregisterMesh(customID);
                          if (meshToDelete.physicsBody) meshToDelete.physicsBody.dispose();
                          meshToDelete.dispose();
                          SaveLoad.saveProjectToSession(blocklyWorkspace);
                          console.log("Static mesh deleted and session saved.");
                      }
                  }
              }
          }
      });
    }
  }

public detachGizmosPublic = () => {
    if (!this.attachedGizmoMesh && (!this.boundingBoxGizmo || !this.boundingBoxGizmo.attachedMesh) && (!this.positionGizmo || !this.positionGizmo.attachedMesh)) {
        // console.log("[ThreeD.detachGizmosPublic] Gizmos already detached or no mesh was attached.");
        return;
    }
    console.log("[ThreeD.detachGizmosPublic] Detaching gizmos.");

    if (this.boundingBoxGizmo) {
        this.boundingBoxGizmo.attachedMesh = null;
    }
    if (this.positionGizmo) {
        this.positionGizmo.attachedMesh = null;
    }
    this.attachedGizmoMesh = null; // Clear the record of the attached mesh in ThreeD

    // Optional: Reset camera target if it was changed when a gizmo was attached
    if (this.camera && this.camera instanceof BABYLON.ArcRotateCamera && this.previousCameraTargetPositionBeforeGizmoAttach) {
        // Only animate back if a previous target was stored and camera is ArcRotate
        // this.animateCameraToTarget(this.previousCameraTargetPositionBeforeGizmoAttach); // Or just set it directly: this.camera.target = this.previousCameraTargetPositionBeforeGizmoAttach;
        // this.previousCameraTargetPositionBeforeGizmoAttach = null; // Clear after restoring
        // For now, let's not auto-animate back on every detach, it might be disruptive.
        // User can re-center manually or select another object.
    }

    // Remove keyboard observer if it was tied to a gizmo being attached
    if (this.scene && this.sceneKeyboardObserver) {
        this.scene.onKeyboardObservable.remove(this.sceneKeyboardObserver);
        this.sceneKeyboardObserver = null;
        console.log("[ThreeD.detachGizmosPublic] Removed scene keyboard observer.");
    }
     console.log("[ThreeD.detachGizmosPublic] Gizmos detached.");
}

  private animateCameraToTarget(newTargetPoint: BABYLON.Vector3) {
    if (!this.scene || !(this.camera instanceof BABYLON.ArcRotateCamera)) {
        console.warn("Cannot animate camera: Scene not ready or camera is not ArcRotateCamera.");
        return;
    }

    const currentCamera = this.camera;
    const currentTarget = currentCamera.target;
    const currentPosition = currentCamera.position;


    const targetDiff = newTargetPoint.subtract(currentTarget);



    const newCameraPosition = currentPosition.add(targetDiff);


    const animationCameraTarget = new BABYLON.Animation(
        "cameraTargetTransition",
        "target",
        CAMERA_ANIMATION_FPS,
        BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    const keysTarget = [];
    keysTarget.push({ frame: 0, value: currentTarget.clone() });
    keysTarget.push({ frame: CAMERA_ANIMATION_TOTAL_FRAMES, value: newTargetPoint.clone() });
    animationCameraTarget.setKeys(keysTarget);


    const animationCameraPosition = new BABYLON.Animation(
        "cameraPositionTransition",
        "position",
        CAMERA_ANIMATION_FPS,
        BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    const keysPosition = [];
    keysPosition.push({ frame: 0, value: currentPosition.clone() });
    keysPosition.push({ frame: CAMERA_ANIMATION_TOTAL_FRAMES, value: newCameraPosition.clone() });
    animationCameraPosition.setKeys(keysPosition);


    const ease = new BABYLON.SineEase();
    ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    animationCameraTarget.setEasingFunction(ease);
    animationCameraPosition.setEasingFunction(ease);


    this.scene.stopAnimation(currentCamera);


    console.log(`Animating camera. Target: ${currentTarget.toString()} -> ${newTargetPoint.toString()}, Position: ${currentPosition.toString()} -> ${newCameraPosition.toString()}`);
    this.scene.beginDirectAnimation(
        currentCamera,
        [animationCameraTarget, animationCameraPosition],
        0,
        CAMERA_ANIMATION_TOTAL_FRAMES,
        false
    );
}

public async spawnObjectFromDragDrop(
    objectData: GeneratedObject,
    screenX: number,
    screenY: number
  ): Promise<BABYLON.AbstractMesh | null> {
    if (!this.scene || !this.camera) {
        console.error("Cannot spawn object: Scene or Camera is not initialized."); return null;
    }
    if (!objectData.modelUrl) {
        console.error("Cannot spawn object: Model URL is missing."); return null;
    }

    let targetPosition: BABYLON.Vector3;
    const pickInfo = this.scene.pick(screenX, screenY,
        (mesh) => mesh.isPickable && mesh.isEnabled() && !GIZMO_IGNORE_MESH_NAMES.some(ignoreName => mesh.name.startsWith(ignoreName))
    );

    if (pickInfo && pickInfo.hit && pickInfo.pickedPoint) {
        targetPosition = pickInfo.pickedPoint.clone();
        console.log(`Drag-drop: Picked mesh "${pickInfo.pickedMesh?.name}". Spawn position: ${targetPosition.toString()}`);
    } else {
        console.log("Drag-drop: No mesh picked. Unprojecting to a plane at camera's target depth.");

        // Create a ray from the camera through the screen coordinates
        const ray = this.scene.createPickingRay(screenX, screenY, null, this.camera, false);

        let focalPointDepth: BABYLON.Vector3;
        if (this.camera instanceof BABYLON.ArcRotateCamera) {
            // If camera.target is a mesh, get its absolute position
            if (this.camera.target instanceof BABYLON.AbstractMesh) {
                focalPointDepth = this.camera.target.getAbsolutePosition();
            } else { // Assuming camera.target is a Vector3
                focalPointDepth = this.camera.target.clone();
            }
        } else {
            // For other camera types, define a default depth or use a point in front of the camera
            // For simplicity, let's use a point 10 units in front of the camera
            focalPointDepth = this.camera.position.add(ray.direction.scale(10));
            console.warn("Drag-drop: Camera is not ArcRotate. Using a default depth of 10 units in front of camera.");
        }
        
        // Create a plane parallel to the camera's view plane, passing through the focalPointDepth
        // The normal of this plane is the camera's forward direction
        const cameraForward = this.camera.getForwardRay(1).direction; // Normalized forward vector
        const plane = BABYLON.Plane.FromPositionAndNormal(focalPointDepth, cameraForward);
        
        const distance = ray.intersectsPlane(plane);

        if (distance !== null && distance > 0) {
            targetPosition = ray.origin.add(ray.direction.scale(distance));
            console.log(`Drag-drop: Unprojected to camera's target depth plane. Spawn position: ${targetPosition.toString()}`);
        } else {
            // Fallback if ray doesn't intersect (should be rare if plane is correctly defined)
            console.warn("Drag-drop: Ray did not intersect camera's target depth plane. Spawning at scene origin as a fallback.");
            targetPosition = BABYLON.Vector3.Zero();
        }
    }
    
    console.log(`Calculated target spawn position: ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z}`);
    let loadedMesh: BABYLON.AbstractMesh | null = null;
    try {
        const meshBabylonName = objectData.objectName || `dropped_${objectData.id.substring(0, 8)}`;
        loadedMesh = await world.loadAndPlaceModel(
          meshBabylonName,
          objectData.modelUrl,
          targetPosition,
          this.scene
        );

      if (loadedMesh) {
          console.log(`Model ${meshBabylonName} (drag-drop) placed. Saving project.`);
          SaveLoad.saveProjectToSession(blocklyWorkspace);
      }

        console.log(`Model ${meshBabylonName} should now be loading/placed.`);
        return loadedMesh;
    } catch (error) {
        console.error(`Error during loadAndPlaceModel for ${objectData.objectName}:`, error);
        alert(`Failed to load 3D model for "${objectData.objectName}".`);
        return null;
    }
  }

  public setCameraType = (cameraType: string) => {
    this.cameraType = cameraType;
  };

public createCamera = () => {
    const currentTimestamp = Date.now();
    console.log(`[ThreeD.createCamera (${currentTimestamp})] ENTRY. Current scene ID: ${this.scene?.getUniqueId()}, Current camera: ${this.camera?.name}, Camera disposed: ${this.camera?.isDisposed()}`);

    if (!this.scene || this.scene.isDisposed) {
        console.error(`[ThreeD.createCamera (${currentTimestamp})] ABORTING: Scene is null or disposed.`);
        return;
    }

    // Condition 1: Camera exists, is not disposed, AND belongs to the current scene, AND is of the correct type (or no type preference)
    const currentCameraTypeCorrect = !this.cameraType || (this.camera && this.camera.getClassName() === (this.cameraType === "VRDeviceOrientationFreeCamera" ? "VRDeviceOrientationFreeCamera" : "ArcRotateCamera"));

    if (this.camera && !this.camera.isDisposed() && this.camera.getScene() === this.scene && currentCameraTypeCorrect) {
        console.log(`[ThreeD.createCamera (${currentTimestamp})] Valid camera '${this.camera.name}' of correct type already exists for current scene. Ensuring controls are attached.`);
        // It's generally safe to call attachControl again if it might have been detached.
        // Babylon.js handles if it's already attached to the same element.
        // However, if it was attached to a *different* element before, you should detach first.
        // For simplicity, if it exists and is valid for this scene, we assume we want it attached to this.canvas.
        this.camera.attachControl(this.canvas, true); // Attach to current canvas, true for noPreventDefault
        console.log(`[ThreeD.createCamera (${currentTimestamp})] Controls ensured for existing camera '${this.camera.name}'.`);
        return; 
    }

    // Condition 2: Camera exists but is unsuitable (wrong scene, disposed, wrong type) -> Dispose it
    if (this.camera) {
        console.warn(`[ThreeD.createCamera (${currentTimestamp})] Existing camera '${this.camera.name}' (Scene: ${this.camera.getScene()?.getUniqueId()}, Disposed: ${this.camera.isDisposed()}, Type: ${this.camera.getClassName()}) is unsuitable for current scene/type. Disposing it.`);
        this.camera.detachControl(); // Safe to call, detaches from whatever it was attached to.
        this.camera.dispose();
        this.camera = null;
    }

    // Condition 3: Create a new camera
    const camTypeToCreate = this.cameraType || "ArcRotateCamera"; // Default to ArcRotateCamera string for getClassName comparison
    console.log(`[ThreeD.createCamera (${currentTimestamp})] Creating NEW camera of type: ${camTypeToCreate} for scene ID ${this.scene.getUniqueId()}`);

    if (camTypeToCreate === "VRDeviceOrientationFreeCamera") {
        this.camera = new BABYLON.VRDeviceOrientationFreeCamera("vrCam", BABYLON.Vector3.Zero(), this.scene, false);
        // Add any specific VR camera settings here
    } else { // Default to ArcRotateCamera
        this.camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, new BABYLON.Vector3(0, 1, 0), this.scene);
        // Common ArcRotateCamera settings
        const arcCam = this.camera as BABYLON.ArcRotateCamera;
        arcCam.id = "camera"; // Ensure ID is set
        arcCam.pinchPrecision = 200;
        arcCam.upperRadiusLimit = 1000; // Increased upper radius
        arcCam.lowerRadiusLimit = 0.1;  // Allow closer zoom
        arcCam.wheelPrecision = 50;     // Adjusted wheel precision
        arcCam.allowUpsideDown = false;
        arcCam.minZ = 0.1;
        arcCam.maxZ = 20000; // Increased maxZ for larger scenes
        arcCam.panningSensibility = 1000; 
        // Remove multi-touch panning if it's problematic, but keep pinch-zoom
        if (arcCam.inputs) {
            // Attempt to remove only the panning aspect of multi-touch if possible,
            // or configure the existing pointer input.
            // For simplicity, if multi-touch panning is an issue:
            // arcCam.inputs.removeByType("ArcRotateCameraMultiTouchInput");
            // Or, more fine-grained:
            const pointersInput = arcCam.inputs.attached.pointers as BABYLON.ArcRotateCameraPointersInput;
            if (pointersInput) {
                pointersInput.multiTouchPanning = false; // Disable multi-touch panning
            }
        }
    }

    if (this.camera) {
        console.log(`[ThreeD.createCamera (${currentTimestamp})] New camera ${this.camera.name} (${this.camera.getClassName()}) created. Attaching control to canvas.`);
        this.camera.attachControl(this.canvas, true); // true for noPreventDefault
        
        if (this.camera instanceof BABYLON.ArcRotateCamera && this.camera.target instanceof BABYLON.Vector3) {
             this.previousCameraTargetPositionBeforeGizmoAttach = this.camera.target.clone();
             console.log(`[ThreeD.createCamera (${currentTimestamp})] Initial camera target stored for new camera:`, this.previousCameraTargetPositionBeforeGizmoAttach);
        }
    } else {
        console.error(`[ThreeD.createCamera (${currentTimestamp})] FAILED to create a camera instance AFTER logic flow.`);
    }
    console.log(`[ThreeD.createCamera (${currentTimestamp})] EXIT. Scene ID: ${this.scene?.getUniqueId()}, Camera: ${this.camera?.name} (${this.camera?.getClassName()})`);
};
  public moveCamera = (coordsBlock: CoordsBlock) => {
    camera.moveCamera(coordsBlock, this.camera);
  };

  public moveCameraAlong = (axis: string, units: number) => {
    camera.moveCameraAlong(axis, units, this.camera);
  };

  public pointCameraTowards = (shapeBlock: ShapeBlock) => {
    camera.pointCameraTowards(shapeBlock, this.camera, this.scene);
  };

  public keepDistanceOf = (units: number) => {
    camera.keepDistanceOf(units, this.camera);
  };


  public onClick = (shapeBlock: ShapeBlock, statements: any) => {
    events.onClick(shapeBlock, statements, this.scene);
  };

  public onKeyPress = (key: string, statements: any) => {
    events.onKeyPress(key, statements, this.scene);
  };


  public createLight = (lightBlock: LightBlock, coordsBlock: CoordsBlock) => {
    lighting.createLight(lightBlock, coordsBlock, this.scene);
  };

  public showLight = (lightBlock: LightBlock) => {
    lighting.showLight(lightBlock, this.scene);
  };

  public moveLight = (lightBlock: LightBlock, coordsBlock: CoordsBlock) => {
    lighting.moveLight(lightBlock, coordsBlock, this.scene);
  };

  public moveLightAlong = (lightBlock: LightBlock, axis: string, steps: number) => {
    lighting.moveLightAlong(lightBlock, axis, steps, this.scene);
  };

  public setLightColor = (lightBlock: LightBlock, color: string) => {
    lighting.setLightColor(lightBlock, color, this.scene);
  };

  public setLightIntensity = (lightBlock: LightBlock, intensity: number) => {
    lighting.setLightIntensity(lightBlock, intensity, this.scene);
  };


  public setAmbientLightIntensity = (intensity: number) => {
    if (this.ambientLight) {
      if (intensity < 0) intensity = 0;
      if (intensity > lighting.BRIGHTNESS_MAX) intensity = lighting.BRIGHTNESS_MAX;
      this.ambientLight.intensity = (intensity * lighting.BRIGHTNESS_MULTIPLIER) / 1000;
    }

     if (this.scene && this.scene.environmentTexture) {
        this.scene.environmentIntensity = intensity / 100;
        this.scene.environmentTexture.level = intensity / 100;
    }

  };


  public createShape = async (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock): Promise<void> => {
    await world.createShape(shapeBlock, coordsBlock, this.scene, this.actionManagers);
  };

  public createShapeAndAddTo = async (shapeBlock: ShapeBlock, parentBlock: ShapeBlock, coordsBlock: CoordsBlock): Promise<void> => {
    await world.createShapeAndAddTo(shapeBlock, parentBlock, coordsBlock, this.scene, this.actionManagers);
  };

  public clone = (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock) => {
    world.clone(shapeBlock, coordsBlock, this.scene);
  };

  public remove = (shapeBlock: ShapeBlock) => {
    if (this.attachedGizmoMesh && this.attachedGizmoMesh.name === (shapeBlock as any)[0]?.id) {
        this.detachGizmos();
    }
    world.remove(shapeBlock, this.scene);
  };

  public moveShape = (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock) => {
    world.moveShape(shapeBlock, coordsBlock, this.scene);
  };

  public moveShapeAlong = (shapeBlock: ShapeBlock, axis: string, steps: number) => {
    world.moveShapeAlong(shapeBlock, axis, steps, this.scene);
  };

  public moveShapeTowardsShape = (
    shapeBlockA: ShapeBlock,
    shapeBlockB: ShapeBlock,
    steps: number,
    ignoreY: boolean
  ) => {
    world.moveShapeTowardsShape(shapeBlockA, shapeBlockB, steps, ignoreY, this.scene);
  };

  public rotate = (shapeBlock: ShapeBlock, axis: string, degrees: number) => {
    world.rotate(shapeBlock, axis, degrees, this.scene);
  };

  public getPosition = (shapeBlock: ShapeBlock, axis: string) => {
    return world.getPosition(shapeBlock, axis, this.scene);
  };

  public createGround = (shape: Shape) => {
    this.ground = world.createGround(shape, this.scene);
  };

  public createSkybox = (skybox: any) => {
    if (!this.scene) {
        console.error("ThreeD.createSkybox: Attempted to create skybox but this.scene is null!");
        return;
    }

    this.skybox = world.createSkybox(skybox, this.scene);
  };

  public setSkyColor = (color: string) => {
    world.setSkyColor(color, this.scene);
  };


  public setGravity = (units: number) => {
    physics.setGravity(units, this.scene);
  };

  public applyForce = (shapeBlock: ShapeBlock, axis: string, units: number) => {
    physics.applyForce(shapeBlock, axis, units, this.scene);
  };

  public setMass = (shapeBlock: ShapeBlock, mass: number) => {
    physics.setMass(shapeBlock, mass, this.scene);
  };


public triggerSaveProject = () => {
    // Check if SaveLoad.saveProjectToSession is a function
    if (typeof SaveLoad.saveProjectToSession === 'function') {
        // blocklyWorkspace can be null if Blockly isn't used or initialized for this session.
        // SaveLoad.saveProjectToSession is designed to handle a null workspace.
        console.log("[ThreeD.triggerSaveProject] Calling SaveLoad.saveProjectToSession. Blockly workspace is:", blocklyWorkspace ? "Available" : "Not Available/null");
        SaveLoad.saveProjectToSession(blocklyWorkspace);
    } else {
        console.warn("[ThreeD.triggerSaveProject] Could not save project: SaveLoad.saveProjectToSession function is not available.");
    }
  }

public async createScene(initializeEnvironment: boolean = true, physicsActuallyEnabled?: boolean): Promise<BABYLON.Scene | null> {
    console.log("%%%%%%% FRESH LOAD OF lib/blockly/3d/index.ts - createScene v12 %%%%%%%"); // Version bump
    const sceneTimestamp = Date.now();
    console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] ENTER - InitEnv: ${initializeEnvironment}, Physics: ${physicsActuallyEnabled}. Current Scene before ops: ${this.scene?.getUniqueId()}`);

    // --- 1. DISPOSE OLD RESOURCES ---
    console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Starting cleanup of existing resources...`);
    if (this.selectToolInstance) { this.selectToolInstance.dispose(); this.selectToolInstance = null; console.log("Disposed SelectTool"); }
    this.activeTool = null;

    if (this.boundingBoxGizmo) { this.boundingBoxGizmo.dispose(); this.boundingBoxGizmo = null; console.log("Disposed BoundingBoxGizmo"); }
    if (this.positionGizmo) { this.positionGizmo.dispose(); this.positionGizmo = null; console.log("Disposed PositionGizmo"); }
    if (this.utilityLayer) { this.utilityLayer.dispose(); this.utilityLayer = null; console.log("Disposed UtilityLayer"); }
    this.attachedGizmoMesh = null;

    if (this.scene) {
        if (this.sceneKeyboardObserver) { this.scene.onKeyboardObservable.remove(this.sceneKeyboardObserver); this.sceneKeyboardObserver = null; console.log("Removed scene keyboard observer"); }
        if (this.ambientLight) { this.ambientLight.dispose(); this.ambientLight = null; console.log("Disposed ambient light"); }
        if (this.ground) { this.ground.dispose(); this.ground = null; console.log("Disposed ground"); }
        if (this.skybox) { this.skybox.dispose(); this.skybox = null; console.log("Disposed skybox"); }

        this.actionManagers.forEach(am => { // CORRECTED HERE
            if (am) { // Check if the action manager instance exists
                am.dispose();
            }
        });
        this.actionManagers = [];
        console.log("Disposed action managers and cleared array.");

        this.scene.onBeforeRenderObservable.clear();
        this.runningAnimations = {};

        const oldSceneId = this.scene.getUniqueId();
        this.scene.dispose();
        this.scene = null;
        console.log(`Disposed previous scene (ID: ${oldSceneId})`);
    }
    MeshRegistry.clearRegistry(); console.log("MeshRegistry cleared");

    if (this.defaultXRExperience) {
        console.log("Disposing XR Experience...");
        if (this.defaultXRExperience.baseExperience.state === BABYLON.WebXRState.IN_XR) {
            try { await this.defaultXRExperience.baseExperience.exitXRAsync(); } catch (e) { console.warn("Error exiting XR:", e); }
        }
        this.defaultXRExperience.dispose(); this.defaultXRExperience = null;
        console.log("XR Experience disposed.");
    }
    console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Cleanup complete.`);
    // --- End Dispose ---

    // --- 2. CREATE NEW SCENE ---
    try {
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Creating new BABYLON.Scene...`);
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.useRightHandedSystem = true;
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Scene right-handed system set to true.`);
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] New scene created successfully. ID: ${this.scene.getUniqueId()}`);
    } catch (sceneError) {
        console.error(`--->>> [ThreeD.createScene (${sceneTimestamp})] FAILED TO CREATE BABYLON.Scene!`, sceneError);
        this.scene = null;
        return null;
    }

    // --- 3. INITIALIZE UTILITY LAYER & GIZMOS ---
    console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Initializing UtilityLayer & Gizmos...`);
    try {
        this.utilityLayer = new UtilityLayerRenderer(this.scene, true);
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] UtilityLayer initialized.`);

        this.boundingBoxGizmo = new BoundingBoxGizmo(BABYLON.Color3.FromHexString("#7C00FE"), this.utilityLayer);
        this.boundingBoxGizmo.setEnabledRotationAxis("y");
        this.boundingBoxGizmo.fixedDragMeshScreenSize = true;
        this.boundingBoxGizmo.scaleBoxSize = 0.05;
        this.boundingBoxGizmo.rotationSphereSize = 0.1;
        this.boundingBoxGizmo.setEnabledScaling(true);
        this.boundingBoxGizmo.updateGizmoRotationToMatchAttachedMesh = true;
        this.boundingBoxGizmo.attachedMesh = null;
        this.boundingBoxGizmo.onScaleBoxDragEndObservable.add(() => { if (this.attachedGizmoMesh && MeshRegistry.getMeshType(this.attachedGizmoMesh) === 'static') SaveLoad.saveProjectToSession(blocklyWorkspace); });
        this.boundingBoxGizmo.onRotationSphereDragEndObservable.add(() => { if (this.attachedGizmoMesh && MeshRegistry.getMeshType(this.attachedGizmoMesh) === 'static') SaveLoad.saveProjectToSession(blocklyWorkspace); });
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] BoundingBoxGizmo initialized, attachedMesh set to null.`);

        this.positionGizmo = new PositionGizmo(this.utilityLayer);
        this.positionGizmo.updateGizmoRotationToMatchAttachedMesh = false;
        this.positionGizmo.attachedMesh = null;
        this.positionGizmo.onDragEndObservable.add(() => { if (this.attachedGizmoMesh && MeshRegistry.getMeshType(this.attachedGizmoMesh) === 'static') SaveLoad.saveProjectToSession(blocklyWorkspace); });

        const axisGizmos = [this.positionGizmo.xGizmo, this.positionGizmo.yGizmo, this.positionGizmo.zGizmo];
        axisGizmos.forEach(axisGizmo => {
            if (axisGizmo) {
                if (axisGizmo.coloredMaterial) axisGizmo.coloredMaterial.depthFunction = BABYLON.Engine.ALWAYS;
                if (axisGizmo.hoverMaterial) axisGizmo.hoverMaterial.depthFunction = BABYLON.Engine.ALWAYS;
                if (axisGizmo.disableMaterial) axisGizmo.disableMaterial.depthFunction = BABYLON.Engine.ALWAYS;
            }
        });
        const planeGizmos = [this.positionGizmo.xPlaneGizmo, this.positionGizmo.yPlaneGizmo, this.positionGizmo.zPlaneGizmo];
        planeGizmos.forEach(planeGizmo => {
            if (planeGizmo) {
                if (planeGizmo.coloredMaterial) planeGizmo.coloredMaterial.depthFunction = BABYLON.Engine.ALWAYS;
                if (planeGizmo.hoverMaterial) planeGizmo.hoverMaterial.depthFunction = BABYLON.Engine.ALWAYS;
                if (planeGizmo.disableMaterial) planeGizmo.disableMaterial.depthFunction = BABYLON.Engine.ALWAYS;
            }
        });
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] PositionGizmo initialized, materials configured, attachedMesh set to null.`);

    } catch (layerOrGizmoError) {
        console.error(`--->>> [ThreeD.createScene (${sceneTimestamp})] FAILED to initialize UtilityLayer or Gizmos!`, layerOrGizmoError);
        if (this.boundingBoxGizmo) { this.boundingBoxGizmo.dispose(); this.boundingBoxGizmo = null; }
        if (this.positionGizmo) { this.positionGizmo.dispose(); this.positionGizmo = null; }
        if (this.utilityLayer) { this.utilityLayer.dispose(); this.utilityLayer = null; }
    }

    // --- 4. SETUP CAMERA ---
    console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Calling createCamera. initializeEnvironment: ${initializeEnvironment}. Current camera before call: ${this.camera?.name}`);
    this.createCamera();
    if (!this.camera || this.camera.isDisposed() || (this.scene && this.camera.getScene() !== this.scene)) {
        console.error(`--->>> [ThreeD.createScene (${sceneTimestamp})] CRITICAL: Camera invalid after createCamera call. Cam: ${this.camera?.name}, Cam Disposed: ${this.camera?.isDisposed()}, Cam Scene: ${this.camera?.getScene()?.getUniqueId()}, Target Scene: ${this.scene?.getUniqueId()}.`);
        return this.scene;
    } else {
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Camera ready: ${this.camera.name} (ID: ${this.camera.id}, Scene ID: ${this.camera.getScene().getUniqueId()})`);
    }

    // --- 5. SETUP ENVIRONMENT & PHYSICS ---
    if (initializeEnvironment) {
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Setting up initial environment...`);
        this.scene.clearColor = new BABYLON.Color4(0.15, 0.16, 0.2, 1);
        if (!this.ambientLight || this.ambientLight.isDisposed()) {
            this.ambientLight = new BABYLON.HemisphericLight("defaultAmbientLight", new BABYLON.Vector3(0, 1, 0), this.scene);
        }
        this.ambientLight.intensity = 0.8;
        this.setAmbientLightIntensity(80);

        try {
            if (!this.scene.environmentTexture) {
                const envTexture = new BABYLON.CubeTexture("/assets/env/clouds.env", this.scene);
                this.scene.environmentTexture = envTexture;
                console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Default environment texture set from babylonjs.com.`);
            }
        } catch (envError) {
            console.warn("Could not load default environment texture:", envError);
        }
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Initial environment setup complete.`);
    } else {
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Skipping initial environment setup.`);
    }

    console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Setting up physics (Requested Enabled: ${physicsActuallyEnabled})...`);
    this.havokPlugin = null;
    if (physicsActuallyEnabled) {
        if (this.havokInstance) {
            try {
                this.havokPlugin = new BABYLON.HavokPlugin(true, this.havokInstance);
                this.scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), this.havokPlugin);
                console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Havok physics enabled on scene.`);
            } catch (pluginError) { console.error("Error initializing HavokPlugin:", pluginError); }
        } else { console.error(`--->>> [ThreeD.createScene (${sceneTimestamp})] Cannot enable Havok: WASM instance missing.`); }
    } else {
        if (this.scene.isPhysicsEnabled()) this.scene.disablePhysicsEngine();
        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Physics explicitly disabled or not requested.`);
    }
    console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Physics setup finished. Scene physics enabled: ${this.scene.isPhysicsEnabled()}`);

    // --- 6. TOOL INSTANTIATION ---
     console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] PRE-TOOL-INSTANTIATION CHECK. Scene: ${!!this.scene}(${this.scene?.getUniqueId()}), UtilLayer: ${!!this.utilityLayer}, Cam: ${!!this.camera}(${this.camera?.name}) Gizmos: BBGizmo-${!!this.boundingBoxGizmo} PosGizmo-${!!this.positionGizmo}`);
    
    // Ensure all dependencies for the tools are valid before proceeding
    if (this.scene && !this.scene.isDisposed &&
        this.camera && !this.camera.isDisposed() && // Add check for camera being disposed
        this.utilityLayer && !this.utilityLayer.utilityLayerScene.isDisposed && // Add check for ULR scene
        this.boundingBoxGizmo && // No easy isDisposed for gizmos, rely on them being new
        this.positionGizmo) {

        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Attempting: new SelectTool(...)`);
        try {
            // Call the OLD SelectTool constructor with the CURRENT scene and camera
            this.selectToolInstance = new SelectTool(
                this,                       // Pass the ThreeD instance
                this.scene,                 // Pass the current scene
                this.camera,                // Pass the current camera
                this.utilityLayer,          // Pass the current utilityLayer
                this.boundingBoxGizmo,      // Pass the current boundingBoxGizmo
                this.positionGizmo          // Pass the current positionGizmo
            );
            console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] SelectTool INSTANTIATED using old constructor signature.`);
        } catch (selectToolError) {
            console.error(`--->>> [ThreeD.createScene (${sceneTimestamp})] FAILED to instantiate SelectTool:`, selectToolError);
            this.selectToolInstance = null;
        }

        console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Attempting: new CloneTool(...)`);
        try {
            this.cloneToolInstance = new CloneTool(
                this,
                this.scene,
                this.camera
                // this.utilityLayer // Not strictly needed by CloneTool per current design
            );
            console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] CloneTool INSTANTIATED.`);
        } catch (cloneToolError) {
            console.error(`--->>> [ThreeD.createScene (${sceneTimestamp})] FAILED to instantiate CloneTool:`, cloneToolError);
            this.cloneToolInstance = null;
        }

        if (this.selectToolInstance) {
            console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Calling setTool('select') as default.`);
            this.setTool('select');
        } else {
            console.warn(`--->>> [ThreeD.createScene (${sceneTimestamp})] Default tool 'select' not set: SelectTool instance is null.`);
            this.activeTool = null;
        }
    } else {
        let missingDeps = [];
        if (!this.scene || this.scene.isDisposed) missingDeps.push("Valid Scene");
        if (!this.utilityLayer || this.utilityLayer.utilityLayerScene.isDisposed) missingDeps.push("Valid UtilityLayer");
        if (!this.camera || this.camera.isDisposed()) missingDeps.push("Valid Camera");
        if (!this.boundingBoxGizmo) missingDeps.push("BoundingBoxGizmo");
        if (!this.positionGizmo) missingDeps.push("PositionGizmo");
        console.error(`--->>> [ThreeD.createScene (${sceneTimestamp})] SKIPPING ALL Tool instantiation. Missing or invalid: ${missingDeps.join(', ')}.`);
    }

    console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] EXIT. Final Scene ID: ${this.scene?.getUniqueId()}, Physics Enabled: ${this.scene?.isPhysicsEnabled()}`);
    return this.scene;
}



  public async loadStaticMeshes(sceneObjects: SaveLoad.SavedSceneObject[]): Promise<void> {
    if (!this.scene) {
        console.error("Cannot load static meshes: Scene is not initialized.");
        return;
    }
    console.log("Loading static meshes into the scene...");
    for (const objData of sceneObjects) {
        if (!objData.sourceModelUrl) {
            console.warn(`Skipping static object load (customID: ${objData.customID}): sourceModelUrl is missing.`);
            continue;
        }
        if (!objData.transforms || objData.transforms.length === 0) {
            console.warn(`Skipping static object load (customID: ${objData.customID}): transforms array is missing or empty.`);
            continue;
        }


        const transform = objData.transforms[0];

        try {

            const meshBabylonName = `static_loaded_${objData.customID.substring(0, 8)}`;

            await loadAndPlaceModel(
                meshBabylonName,
                objData.sourceModelUrl,

                new BABYLON.Vector3(transform.position.x, transform.position.y, transform.position.z),
                this.scene,
                objData.customID,
                transform
            );
            console.log(`Static mesh with customID ${objData.customID} processed.`);
        } catch (error) {
            console.error(`Failed to load static mesh with customID ${objData.customID} from URL ${objData.sourceModelUrl}:`, error);

        }
    }
    console.log("Finished processing static meshes for loading.");
  }

// Method to switch tools
public setTool(toolName: ToolName): void { // Use ToolName type
    console.log(`[ThreeD.setTool] Attempting to switch tool from ${this.activeTool} to ${toolName}`);

    if (this.activeTool === toolName && toolName !== null) { // Added check for null
        console.log(`[ThreeD.setTool] Tool '${toolName}' is already active.`);
        // If select tool is re-selected, maybe force detach/attach gizmos or refresh its state
        if (toolName === 'select' && this.selectToolInstance) {
            // this.selectToolInstance.refresh(); // Hypothetical refresh method
        }
        return;
    }

    // Disable current active tool
    if (this.activeTool === 'select' && this.selectToolInstance) {
        console.log(`[ThreeD.setTool] Disabling SelectTool.`);
        this.selectToolInstance.disable();
    } else if (this.activeTool === 'clone' && this.cloneToolInstance) {
        console.log(`[ThreeD.setTool] Disabling CloneTool.`);
        this.cloneToolInstance.disable();
    } else if (this.activeTool) {
        console.warn(`[ThreeD.setTool] Active tool was '${this.activeTool}', but not handled for disabling.`);
    }

    this.activeTool = toolName;

    // Enable new tool
    if (toolName === 'select' && this.selectToolInstance) {
        console.log(`[ThreeD.setTool] Enabling SelectTool.`);
        this.selectToolInstance.enable();
    } else if (toolName === 'clone' && this.cloneToolInstance) {
        console.log(`[ThreeD.setTool] Enabling CloneTool.`);
        this.cloneToolInstance.enable();
    } else if (toolName) {
        console.error(`[ThreeD.setTool] CRITICAL: Tried to enable tool '${toolName}' but instance is NULL or not handled.`);
    }

    // Notify about the tool change
    console.log(`[ThreeD.setTool] Attempting to call _onToolChangedCallback for tool: ${this.activeTool}`);
    if (this._onToolChangedCallback) {
        console.log("[ThreeD.setTool] _onToolChangedCallback is available. Calling it.");
        try {
            this._onToolChangedCallback(this.activeTool);
        } catch (e) {
            console.error("[ThreeD.setTool] Error during _onToolChangedCallback:", e);
        }
    } else {
        console.log("[ThreeD.setTool] _onToolChangedCallback is null or not provided.");
    }
  }

private attachGizmos = (mesh: BABYLON.AbstractMesh) => {
    if (!mesh) return;
    console.log(`>>> attachGizmos: Attaching to mesh: ${mesh.name}. Current metadata:`, JSON.parse(JSON.stringify(mesh.metadata || {})));
    if (this.camera && this.camera instanceof BABYLON.ArcRotateCamera) {
      if (this.attachedGizmoMesh !== mesh) {
           this.previousCameraTargetPositionBeforeGizmoAttach = this.camera.target.clone();
           console.log("Stored previous camera target position before attaching:", this.previousCameraTargetPositionBeforeGizmoAttach);
           const targetPoint = mesh.getAbsolutePosition();
           this.animateCameraToTarget(targetPoint);
           console.log(`Animating camera target to mesh: ${mesh.name}`);
      }
  }
    if (this.boundingBoxGizmo) {
        this.boundingBoxGizmo.attachedMesh = mesh;
    }
    if (this.positionGizmo) {
        this.positionGizmo.attachedMesh = mesh;
    }
    this.attachedGizmoMesh = mesh;
    if (!this.sceneKeyboardObserver) {
      this.sceneKeyboardObserver = this.scene?.onKeyboardObservable.add((kbInfo) => {
          if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
              if ((kbInfo.event.key === "Delete" || kbInfo.event.key === "Backspace") && this.attachedGizmoMesh) {
                  const meshToDelete = this.attachedGizmoMesh;
                  const meshMetadata = MeshRegistry.getMeshMetadata(meshToDelete);

                  console.log('deleting mesh')
                  console.log(meshToDelete)
                  console.log('Retrieved meshMetadata for deletion:', meshMetadata)

                  if (meshMetadata && meshMetadata.meshType === 'static') {
                      console.log(`Delete key pressed for selected static mesh: ${meshToDelete.name} (CustomID: ${meshMetadata.customID})`);
                      this.detachGizmos();
                      const customID = MeshRegistry.getCustomID(meshToDelete);
                      if (customID) {
                          MeshRegistry.unregisterMesh(customID);
                      } else {
                          console.warn("Could not get customID for mesh to delete from registry.");
                      }

                      if (meshToDelete.physicsBody) {
                          meshToDelete.physicsBody.dispose();
                      }
                      meshToDelete.dispose();
                      console.log(`Static mesh ${meshToDelete.name} disposed and unregistered.`);

                      // Save the project state to session storage after deletion
                      SaveLoad.saveProjectToSession(blocklyWorkspace);
                      console.log("Scene state saved to session after static asset deletion.");


                  } else if (meshMetadata && meshMetadata.meshType === 'dynamic') {
                      console.log(`Delete key pressed for dynamic (Blockly) mesh: ${meshToDelete.name}. Deletion should be handled via Blockly block removal.`);

                  } else {
                        console.warn(`Delete key pressed, but attached mesh "${meshToDelete.name}" is not static or has no metadata. Cannot delete.`);
                  }
              }
          }
      });
  }
}

private detachGizmos = () => {
  if (this.boundingBoxGizmo) this.boundingBoxGizmo.attachedMesh = null;
  if (this.positionGizmo) this.positionGizmo.attachedMesh = null;
  this.attachedGizmoMesh = null;
  if (this.scene && this.sceneKeyboardObserver) {
      this.scene.onKeyboardObservable.remove(this.sceneKeyboardObserver);
      this.sceneKeyboardObserver = null;
  }
}

  public clearBlocklyObjects = () => {
      console.warn("Clearing Blockly-added objects (Not Yet Implemented - relies on full scene reset for now)");
      this.detachGizmos();
  }

  public runRenderLoop = () => {
    this.engine.runRenderLoop(
      () => {
        if (this.scene && this.scene.activeCamera) {
          this.scene.render();
          const fpsElement = document.getElementById("fpsCounter");
          if (fpsElement) {
              fpsElement.innerHTML = this.engine.getFps().toFixed() + " fps";
          }
        }
      }
    );
  };

  public createAnimationLoop = (name: string, statements: any) => {
    if (typeof statements !== 'function') {
        console.error(`createAnimationLoop: statements for loop "${name}" is not a function.`);
        return;
    }
    {
      const observer = this.scene?.onBeforeRenderObservable.add(() => {
        if (this.runningAnimations[name] === true) {
            try {
                statements();
            } catch (error) {
                console.error(`Error in animation loop "${name}":`, error);
            }
        }
      });
    }
  };


  public startAnimation = (name: string) => {
    console.log(`Starting animation loop: ${name}`);
    this.runningAnimations[name] = true;
  };


  public stopAnimation = (name: string) => {
    console.log(`Stopping animation loop: ${name}`);
    this.runningAnimations[name] = false;
  };

  public enableInspector = () => {
      if (this.scene) {

        if (this.scene.debugLayer && !this.scene.debugLayer.isVisible()) {
             this.scene.debugLayer.show({
                 embedMode: true,
             }).catch(e => console.error("Error showing Inspector:", e));
        } else if (!this.scene.debugLayer) {
            console.error("Debug layer not available on the scene.");
        }
      } else {
          console.error("Cannot enable inspector: Scene not initialized.");
      }
  };

  public disableInspector = () => {
    if (this.scene && this.scene.debugLayer && this.scene.debugLayer.isVisible()) {
        this.scene.debugLayer.hide();
    }
  };

  public disableXR = async () => {
    if (this.defaultXRExperience) {
        console.log("Attempting to exit XR...");
      try {
        if (this.defaultXRExperience.baseExperience.state === BABYLON.WebXRState.IN_XR) {
            await this.defaultXRExperience.baseExperience.exitXRAsync();
        }
        console.log("Exited XR successfully.");
      } catch(error) {
          console.error("Error exiting XR:", error);
      }
    } else {
        console.log("No XR experience active to disable.");
    }
  };

  public enableXR = async () => {
      if (!this.scene) {
          console.error("Cannot enable XR: Scene not initialized.");
          return;
      }
      if (this.defaultXRExperience) {
          console.warn("XR experience already exists. Attempting to re-enter if not already in XR.");
          if (this.defaultXRExperience.baseExperience.state !== BABYLON.WebXRState.IN_XR) {
              try {
                  await this.defaultXRExperience.baseExperience.enterXRAsync("immersive-vr", "local-floor");
                  console.log("Re-entered XR immersive mode.");
              } catch (error) {
                  console.error("Failed to re-enter XR:", error);
              }
          }
          return;
      }

      console.log("Attempting to create default XR experience...");
      try {
            this.defaultXRExperience = await this.scene.createDefaultXRExperienceAsync({

            floorMeshes: this.ground ? [this.ground] : undefined,
            disableDefaultUI: false,

            });

            if (!this.defaultXRExperience.baseExperience) {
                console.error("XR not supported or available on this device/browser.");
                alert("WebXR is not supported on your browser or device.");
                this.defaultXRExperience = null;
            } else {
                console.log("XR Experience created. Entering XR immersive mode...");

                const sessionSupported = await this.defaultXRExperience.baseExperience.sessionManager.isSessionSupportedAsync("immersive-vr");
                if(sessionSupported){
                    await this.defaultXRExperience.baseExperience.enterXRAsync(
                        "immersive-vr",
                        "local-floor"
                    );
                    console.log("Entered XR immersive mode successfully.");
                } else {
                    console.error("Immersive VR session mode not supported.");
                    alert("Immersive VR mode is not supported on your browser or device.");
                    this.defaultXRExperience.dispose();
                    this.defaultXRExperience = null;
                }
            }
      } catch (error:any) {
          console.error("Error creating or entering XR:", error);
          alert(`Failed to initialize WebXR: ${error.message || error}`);
          if (this.defaultXRExperience) {
              this.defaultXRExperience.dispose();
              this.defaultXRExperience = null;
          }
      }
  };
}


interface CoordsBlock {
    x: number;
    y: number;
    z: number;
}

interface ShapeBlock {
    shape: string;
}

interface LightBlock {
    light: string;
}

interface Shape {

    width?: number;
    height?: number;
    subdivisions?: number;
}

interface Skybox {
    texturePath?: string;
    size?: number;

}