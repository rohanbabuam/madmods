import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import { loadAndPlaceModel } from "./world/index"; // Import the specific function
import type { GeneratedObject } from '$lib/types/GeneratedObject';

import * as lighting from "./lighting";
import * as world from "./world";
import * as physics from "./physics";
import * as camera from "./camera";
import * as events from "./events";

// Import Gizmo classes
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import { BoundingBoxGizmo } from '@babylonjs/core/Gizmos/boundingBoxGizmo';
import { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo'; // *** IMPORT PositionGizmo ***
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents'; // Import PointerEventTypes

// List of mesh names to ignore for gizmo attachment
const GIZMO_IGNORE_MESH_NAMES = ['ground', 'skybox']; // Add other names like environment helpers if needed


import * as MeshRegistry from '../../state/meshRegistry'; // Import MeshRegistry

import * as SaveLoad from '../../state/saveload';
import { blocklyWorkspace } from '../blockly'; // Assuming blocklyWorkspace is exported

// *** ADDED: Camera Animation Constants ***
const CAMERA_ANIMATION_FPS = 30; // Frames per second for the animation
const CAMERA_ANIMATION_DURATION_SECONDS = 0.5; // How long the animation should take
const CAMERA_ANIMATION_TOTAL_FRAMES = CAMERA_ANIMATION_DURATION_SECONDS * CAMERA_ANIMATION_FPS;



export class ThreeD {
  private readonly canvas: any;
  public readonly engine: BABYLON.Engine;
  private havokInstance: any; // Stores the initialized Havok WASM engine
  private havokPlugin: BABYLON.HavokPlugin | null = null; // Stores the plugin instance for the scene
  private camera: BABYLON.Camera | null = null;
  private cameraType: string | null = null;
  private scene: BABYLON.Scene | null = null;
  private skybox: BABYLON.Mesh | null = null;
  private ambientLight: BABYLON.HemisphericLight | null = null;
  private ground: BABYLON.Mesh | null = null;
  private defaultXRExperience: BABYLON.WebXRDefaultExperience | null = null;
  private runningAnimations = {};
  private actionManagers: BABYLON.AbstractActionManager[] = [];

  // --- Gizmo Properties ---
  private utilityLayer: UtilityLayerRenderer | null = null;
  private boundingBoxGizmo: BoundingBoxGizmo | null = null;
  private positionGizmo: PositionGizmo | null = null; // *** ADD PositionGizmo Property ***
  private attachedGizmoMesh: BABYLON.AbstractMesh | null = null;
  private pointerObserver: BABYLON.Observer<BABYLON.PointerInfo> | null = null; // To store the observer

  private sceneKeyboardObserver: BABYLON.Observer<BABYLON.KeyboardInfo> | null = null; // For delete key

  // --- Camera Targeting Properties ---
  private defaultCameraTarget: BABYLON.Vector3 = BABYLON.Vector3.Zero(); // Stores the initial camera target
  private previousCameraTargetPositionBeforeGizmoAttach: BABYLON.Vector3 | null = null; // Store the target *position*
  private framingBehavior: BABYLON.FramingBehavior | null = null; // To hold the framing behavior instance



  constructor(canvas: HTMLElement, havokInstance: any) {
    this.canvas = canvas;
    this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.havokInstance = havokInstance; // Store the passed Havok engine instance
    if (!havokInstance) {
        console.warn("ThreeD constructor: Received null or undefined Havok instance. Physics will likely fail to enable.");
    }
  }


  // *** ADDED: Custom Camera Animation Method ***
  private animateCameraToTarget(newTargetPoint: BABYLON.Vector3) {
    if (!this.scene || !(this.camera instanceof BABYLON.ArcRotateCamera)) {
        console.warn("Cannot animate camera: Scene not ready or camera is not ArcRotateCamera.");
        return;
    }

    const currentCamera = this.camera; // For easier reference
    const currentTarget = currentCamera.target; // Get the current target point
    const currentPosition = currentCamera.position; // Get the current camera position

    // Calculate the difference vector from the old target to the new target
    const targetDiff = newTargetPoint.subtract(currentTarget);

    // Calculate the new camera position by adding the target difference
    // This attempts to maintain the camera's relative position/offset to the target
    const newCameraPosition = currentPosition.add(targetDiff);

    // --- Animation for Camera Target ---
    const animationCameraTarget = new BABYLON.Animation(
        "cameraTargetTransition", // Unique animation name
        "target", // Property to animate
        CAMERA_ANIMATION_FPS,
        BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT // Don't loop
    );

    const keysTarget = [];
    keysTarget.push({ frame: 0, value: currentTarget.clone() }); // Start at current target
    keysTarget.push({ frame: CAMERA_ANIMATION_TOTAL_FRAMES, value: newTargetPoint.clone() }); // End at new target
    animationCameraTarget.setKeys(keysTarget);

    // --- Animation for Camera Position ---
    const animationCameraPosition = new BABYLON.Animation(
        "cameraPositionTransition", // Unique animation name
        "position", // Property to animate
        CAMERA_ANIMATION_FPS,
        BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT // Don't loop
    );

    const keysPosition = [];
    keysPosition.push({ frame: 0, value: currentPosition.clone() }); // Start at current position
    keysPosition.push({ frame: CAMERA_ANIMATION_TOTAL_FRAMES, value: newCameraPosition.clone() }); // End at calculated new position
    animationCameraPosition.setKeys(keysPosition);

    // --- Easing Function (Apply to both) ---
    const ease = new BABYLON.SineEase();
    ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    animationCameraTarget.setEasingFunction(ease);
    animationCameraPosition.setEasingFunction(ease);

    // --- Stop any previous animations on the camera ---
    this.scene.stopAnimation(currentCamera);

    // --- Begin the new animation ---
    console.log(`Animating camera. Target: ${currentTarget.toString()} -> ${newTargetPoint.toString()}, Position: ${currentPosition.toString()} -> ${newCameraPosition.toString()}`);
    this.scene.beginDirectAnimation(
        currentCamera,
        [animationCameraTarget, animationCameraPosition],
        0, // Start frame
        CAMERA_ANIMATION_TOTAL_FRAMES, // End frame
        false // Don't loop
    );
}

  // --- Method to handle spawning objects from drag-and-drop ---
  public async spawnObjectFromDragDrop(
    objectData: GeneratedObject, 
    screenX: number,
    screenY: number
  ): Promise<void> {
    if (!this.scene) {
        console.error("Cannot spawn object: Scene is not initialized."); return;
    }
    if (!objectData.modelUrl) {
        console.error("Cannot spawn object: Model URL is missing."); return;
    }
    console.log(`Attempting to pick 3D point at screen coords: ${screenX}, ${screenY}`);
    const pickInfo = this.scene.pick(screenX, screenY,
        (mesh) => mesh.isPickable && mesh.isEnabled() && !GIZMO_IGNORE_MESH_NAMES.some(ignoreName => mesh.name.startsWith(ignoreName))
    );
    let targetPosition: BABYLON.Vector3;
    if (pickInfo.hit && pickInfo.pickedPoint) {
        targetPosition = pickInfo.pickedPoint.clone();
        targetPosition.y += 0.1; 
    } else {
        const plane = BABYLON.Plane.FromPositionAndNormal(BABYLON.Vector3.Zero(), BABYLON.Vector3.UpReadOnly);
        const ray = this.scene.createPickingRay(screenX, screenY, null, this.camera);
        const distance = ray.intersectsPlane(plane);
        if (distance !== null && distance > 0) {
            targetPosition = ray.origin.add(ray.direction.scale(distance));
        } else {
            targetPosition = BABYLON.Vector3.Zero();
        }
    }
    console.log(`Calculated target spawn position: ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z}`);
    try {
        // Use objectData.id for a more unique BabylonJS ID if objectData.objectName is generic
        const meshBabylonName = objectData.objectName || `dropped_${objectData.id.substring(0, 8)}`;
        const loadedMesh = await world.loadAndPlaceModel( // Ensure world is imported
          meshBabylonName,
          objectData.modelUrl,
          targetPosition, // targetPosition calculated from pick or raycast
          this.scene 
          // No existingCustomID, no initialTransform for fresh drag-drop
      );

      if (loadedMesh) {
          console.log(`Model ${meshBabylonName} (drag-drop) placed. Saving project.`);
          if (blocklyWorkspace) { // Check if blocklyWorkspace is available
              SaveLoad.saveProjectToSession(blocklyWorkspace); // Your renamed function
          } else {
              console.warn("blocklyWorkspace not available to save session after drag-drop.");
          }
      }

        console.log(`Model ${meshBabylonName} should now be loading/placed.`);
    } catch (error) {
        console.error(`Error during loadAndPlaceModel for ${objectData.objectName}:`, error);
        alert(`Failed to load 3D model for "${objectData.objectName}".`);
    }
  }


  // Camera functions
  public setCameraType = (cameraType: string) => {
    this.cameraType = cameraType;
  };

  public createCamera = () => {
    this.camera = camera.createCamera(this.cameraType, this.camera, this.scene, this.canvas);
    if (this.camera instanceof BABYLON.ArcRotateCamera) {
      // Remove the ability to pinch and zoom on trackpads, but keep scroll wheel zoom
      this.camera.pinchToPanMaxDistance = 0;
      this.camera.inputs.removeByType("ArcRotateCameraMultiTouchInput");

      // Set radius limits for the camera
      this.camera.lowerRadiusLimit = 1;
      this.camera.upperRadiusLimit = 5000;
      // this.camera.useFramingBehavior = true;

      // *** ADDED/MODIFIED: Store initial target *position* as the default fallback ***
      // Ensure we store a Vector3 position. Use getAbsolutePosition() if target is initially a mesh.
      if (this.camera.target instanceof BABYLON.AbstractMesh) {
        this.previousCameraTargetPositionBeforeGizmoAttach = this.camera.target.getAbsolutePosition().clone();
     } else if (this.camera.target instanceof BABYLON.Vector3) {
        this.previousCameraTargetPositionBeforeGizmoAttach = this.camera.target.clone();
     } else {
         // Fallback if target is something unexpected
         this.previousCameraTargetPositionBeforeGizmoAttach = BABYLON.Vector3.Zero();
     }
     console.log("Initial camera target position stored:", this.previousCameraTargetPositionBeforeGizmoAttach);

   } else {
       this.previousCameraTargetPositionBeforeGizmoAttach = null;
   }

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

  // Event functions
  public onClick = (shapeBlock: ShapeBlock, statements: any) => {
    events.onClick(shapeBlock, statements, this.scene);
  };

  public onKeyPress = (key: string, statements: any) => {
    events.onKeyPress(key, statements, this.scene);
  };

  // Lighting functions
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

  // Sets the ambient light intensity
  public setAmbientLightIntensity = (intensity: number) => {
    if (this.ambientLight) {
      if (intensity < 0) intensity = 0;
      if (intensity > lighting.BRIGHTNESS_MAX) intensity = lighting.BRIGHTNESS_MAX;
      this.ambientLight.intensity = (intensity * lighting.BRIGHTNESS_MULTIPLIER) / 1000;
    }
     // Also adjust environment intensity if applicable
     if (this.scene && this.scene.environmentTexture) {
        this.scene.environmentIntensity = intensity / 100;
        this.scene.environmentTexture.level = intensity / 100;
    }
    // Re-creating the skybox on intensity change is generally not needed and inefficient
    // if (this.skybox) {
    //   let sky:any = this.scene.createDefaultSkybox(this.scene.environmentTexture);
    //   console.log(sky)
    //   sky.name = "skybox";
    //   this.skybox.name="skybox"
    // }
  };

  // World functions
  public createShape = async (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock): Promise<void> => {
    await world.createShape(shapeBlock, coordsBlock, this.scene, this.actionManagers);
  };

  public createShapeAndAddTo = async (shapeBlock: ShapeBlock, parentBlock: ShapeBlock, coordsBlock: CoordsBlock): Promise<void> => {
    await world.createShapeAndAddTo(shapeBlock, parentBlock, coordsBlock, this.scene, this.actionManagers);
  };

  public clone = (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock) => {
    world.clone(shapeBlock, coordsBlock, this.scene);
  };

  public remove = (shapeBlock: ShapeBlock) => { // This calls world.remove which handles unregistering
    if (this.attachedGizmoMesh && this.attachedGizmoMesh.name === (shapeBlock as any)[0]?.id) { // Assuming shapeBlock[0].id is blockly id
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
    this.ground = world.createGround(shape, this.scene); // Store ground reference if needed for XR etc.
  };

  public createSkybox = (skybox: any) => {
    if (!this.scene) {
        console.error("ThreeD.createSkybox: Attempted to create skybox but this.scene is null!");
        return; // Or throw an error
    }
    // console.log("ThreeD.createSkybox called with scene:", this.scene.uniqueId);
    this.skybox = world.createSkybox(skybox, this.scene); // PASSES this.scene HERE
  };

  public setSkyColor = (color: string) => {
    world.setSkyColor(color, this.scene);
  };

  // Physics functions
  public setGravity = (units: number) => {
    physics.setGravity(units, this.scene);
  };

  public applyForce = (shapeBlock: ShapeBlock, axis: string, units: number) => {
    physics.applyForce(shapeBlock, axis, units, this.scene);
  };

  public setMass = (shapeBlock: ShapeBlock, mass: number) => {
    physics.setMass(shapeBlock, mass, this.scene);
  };

  // Scene functions
    public createScene = async (initializeEnvironment: boolean = true, physicsActuallyEnabled?: boolean) => {
      const sceneTimestamp = Date.now();
      console.log(`--->>> ENTER createScene (${sceneTimestamp}) - InitEnv: ${initializeEnvironment}, Physics: ${physicsActuallyEnabled}`);

      // --- Scene Cleanup ---
      console.log(`--->>> createScene (${sceneTimestamp}): Starting cleanup...`);

      // --- MESH REGISTRY: Clear the registry on scene recreation ---
    MeshRegistry.clearRegistry(); 
    console.log(`--->>> createScene (${sceneTimestamp}): MeshRegistry cleared.`);

      // Dispose existing gizmo observer FIRST
      if (this.scene && this.pointerObserver) {
        console.log(`--->>> createScene (${sceneTimestamp}): Removing pointer observer...`);
        this.scene.onPointerObservable.remove(this.pointerObserver);
        this.pointerObserver = null;
      }

      // Dispose existing gizmos and utility layer BEFORE disposing the scene
      // Order: Gizmos first, then UtilityLayer
      if (this.boundingBoxGizmo) {
          console.log(`--->>> createScene (${sceneTimestamp}): Disposing existing BoundingBoxGizmo...`);
          this.boundingBoxGizmo.dispose();
          this.boundingBoxGizmo = null;
      }
      if (this.positionGizmo) { // *** Dispose PositionGizmo ***
          console.log(`--->>> createScene (${sceneTimestamp}): Disposing existing PositionGizmo...`);
          this.positionGizmo.dispose();
          this.positionGizmo = null;
      }
      if (this.utilityLayer) {
          console.log(`--->>> createScene (${sceneTimestamp}): Disposing existing UtilityLayer...`);
          this.utilityLayer.dispose();
          this.utilityLayer = null;
      }
      this.attachedGizmoMesh = null; // Reset attached mesh reference

      // Dispose existing XR experience BEFORE disposing the scene
      if (this.defaultXRExperience) {
          console.log(`--->>> createScene (${sceneTimestamp}): Disposing existing XR Experience...`);
          if (this.defaultXRExperience.baseExperience.state === BABYLON.WebXRState.IN_XR) {
              console.log("Still in XR mode, attempting to exit before scene disposal.");
              try {
                  await this.defaultXRExperience.baseExperience.exitXRAsync();
              } catch (xrExitError) {
                  console.warn(`--->>> createScene (${sceneTimestamp}): Error exiting XR before scene disposal:`, xrExitError);
              }
          }
          this.defaultXRExperience.dispose();
          this.defaultXRExperience = null;
          console.log(`--->>> createScene (${sceneTimestamp}): XR Experience disposed.`);
      } else {
          console.log(`--->>> createScene (${sceneTimestamp}): No previous XR Experience to dispose.`);
      }


      // Dispose the old scene OBJECT ITSELF if it exists
      if (this.scene) {
          console.log(`--->>> createScene (${sceneTimestamp}): Previous scene exists. Disposing scene object...`);
          this.scene.dispose();
          this.scene = null; // Clear reference
          console.log(`--->>> createScene (${sceneTimestamp}): Previous scene disposed.`);
      } else {
          console.log(`--->>> createScene (${sceneTimestamp}): No previous scene to dispose.`);
      }
      this.actionManagers = []; // Clear the manager references


       // --- Create New Scene ---
    try {
        console.log(`--->>> createScene (${sceneTimestamp}): Creating new BABYLON.Scene...`);
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.actionManager = new BABYLON.ActionManager(this.scene);
        this.runningAnimations = {};
        console.log(`--->>> createScene (${sceneTimestamp}): New scene created successfully.`);
    } catch (sceneError) {
        console.error(`--->>> createScene (${sceneTimestamp}): FAILED TO CREATE BABYLON.Scene!`, sceneError);
        this.scene = null; // Ensure scene is null on error
        return; // Stop further execution in this function
    }

    // --- Initialize Utility Layer and Gizmos for the NEW scene ---
    console.log(`--->>> createScene (${sceneTimestamp}): Attempting to initialize UtilityLayer...`);
    try {
        this.utilityLayer = new UtilityLayerRenderer(this.scene);
        this.utilityLayer.utilityLayerScene.autoClearDepthAndStencil = false; // Keep gizmos visible through objects
        console.log(`--->>> createScene (${sceneTimestamp}): UtilityLayer initialized successfully.`);

        // --- Initialize Gizmos only if UtilityLayer succeeded ---
        console.log(`--->>> createScene (${sceneTimestamp}): Attempting to initialize BoundingBoxGizmo...`);
        try {
            this.boundingBoxGizmo = new BoundingBoxGizmo(
                BABYLON.Color3.FromHexString("#7C00FE"), // Purple color for bounding box
                this.utilityLayer
            );
            this.boundingBoxGizmo.setEnabledRotationAxis("y"); // Allow Y-axis rotation
            this.boundingBoxGizmo.fixedDragMeshScreenSize = true;
            this.boundingBoxGizmo.scaleBoxSize = 0.1; // Adjust handle size if needed
            this.boundingBoxGizmo.attachedMesh = null; // Hide initially

            this.boundingBoxGizmo.setEnabledScaling(true,true);
            this.boundingBoxGizmo.rotationSphereSize = 0.2; 

            // *** ADD OBSERVERS FOR BOUNDING BOX GIZMO TRANSFORMATIONS ***
            this.boundingBoxGizmo.onScaleBoxDragEndObservable.add(() => {
                if (this.attachedGizmoMesh && MeshRegistry.getMeshType(this.attachedGizmoMesh) === 'static') {
                    console.log("BoundingBoxGizmo scale drag ended. Saving project.");
                    if (blocklyWorkspace) {
                        SaveLoad.saveProjectToSession(blocklyWorkspace);
                    } else {
                        console.warn("blocklyWorkspace not available to save session after gizmo scale.");
                    }
                }
            });

            this.boundingBoxGizmo.onRotationSphereDragEndObservable.add(() => {
                if (this.attachedGizmoMesh && MeshRegistry.getMeshType(this.attachedGizmoMesh) === 'static') {
                    console.log("BoundingBoxGizmo rotation drag ended. Saving project.");
                    if (blocklyWorkspace) {
                        SaveLoad.saveProjectToSession(blocklyWorkspace);
                    } else {
                        console.warn("blocklyWorkspace not available to save session after gizmo rotation.");
                    }
                }
            });

            
            console.log(`--->>> createScene (${sceneTimestamp}): BoundingBoxGizmo initialized successfully.`);
        } catch (gizmoError) {
            console.error(`--->>> createScene (${sceneTimestamp}): FAILED to initialize BoundingBoxGizmo!`, gizmoError);
            this.boundingBoxGizmo = null;
        }

        // *** Initialize PositionGizmo ***
        console.log(`--->>> createScene (${sceneTimestamp}): Attempting to initialize PositionGizmo...`);
        try {
            this.positionGizmo = new PositionGizmo(this.utilityLayer);
            this.positionGizmo.attachedMesh = null; // Hide initially


            // Optional: Customize drag sensitivity, colors, scale, etc.
            // this.positionGizmo.updateGizmoRotationToMatchAttachedMesh = true; // If you want gizmo to rotate with mesh
            // this.positionGizmo.scaleRatio = 1.5; // Make gizmo bigger/smaller
            // ***** START: ADDED CODE TO MODIFY POSITION GIZMO MATERIALS *****
            if (this.positionGizmo) {

              // Subscribe to drag end for PositionGizmo (translation)
                this.positionGizmo.onDragEndObservable.add(() => {
                  if (this.attachedGizmoMesh && MeshRegistry.getMeshType(this.attachedGizmoMesh) === 'static') {
                      console.log("PositionGizmo drag ended (translation). Saving project.");
                      if (blocklyWorkspace) {
                          SaveLoad.saveProjectToSession(blocklyWorkspace);
                      } else {
                          console.warn("blocklyWorkspace not available to save session after gizmo transform.");
                      }
                  }
              });


              // Get the individual axis gizmos (which contain the materials)
              const gizmosToModify = [
                  this.positionGizmo.xGizmo,
                  this.positionGizmo.yGizmo,
                  this.positionGizmo.zGizmo
                  // Add plane gizmos if you use/enable them and want them on top too
                  // this.positionGizmo.xPlaneGizmo,
                  // this.positionGizmo.yPlaneGizmo,
                  // this.positionGizmo.zPlaneGizmo
              ];

              gizmosToModify.forEach(axisGizmo => {
                  if (axisGizmo) { // Safety check
                      // Modify the standard material (the colored arrows/lines)
                      if (axisGizmo.coloredMaterial) {
                          // Set depth function to ALWAYS pass the depth test
                          axisGizmo.coloredMaterial.depthFunction = BABYLON.Engine.ALWAYS;
                      }
                      // Modify the material used when hovering over the gizmo handle
                      if (axisGizmo.hoverMaterial) {
                          axisGizmo.hoverMaterial.depthFunction = BABYLON.Engine.ALWAYS;
                      }
                      // If using planar gizmos (squares for plane dragging), modify their material too
                      if (axisGizmo.planarGizmo && axisGizmo.planarGizmo.material) {
                         axisGizmo.planarGizmo.material.depthFunction = BABYLON.Engine.ALWAYS;
                      }
                  }
              });
              console.log(`--->>> createScene (${sceneTimestamp}): Configured PositionGizmo materials to ignore depth.`);
          }
          // ***** END: ADDED CODE TO MODIFY POSITION GIZMO MATERIALS *****
            console.log(`--->>> createScene (${sceneTimestamp}): PositionGizmo initialized successfully.`);
        } catch (posGizmoError) {
            console.error(`--->>> createScene (${sceneTimestamp}): FAILED to initialize PositionGizmo!`, posGizmoError);
            this.positionGizmo = null;
        }


    } catch (layerError) {
        console.error(`--->>> createScene (${sceneTimestamp}): FAILED to initialize UtilityLayerRenderer! Gizmos will not be available.`, layerError);
        this.utilityLayer = null;
        this.boundingBoxGizmo = null; // Ensure gizmos are null if layer failed
        this.positionGizmo = null;
    }


    if (this.scene) { // Proceed only if scene creation was successful
      // Optional: Clear camera reference if we want a fresh one on reset
      if (initializeEnvironment) {
           console.log(`--->>> createScene (${sceneTimestamp}): Resetting camera reference.`);
           this.camera = null; // Allow createCamera to make a new one
      }

       // --- Setup Gizmo Interactions (Pointer Observer) ---
        // Only setup if both gizmos and layer are available
       if (this.utilityLayer && (this.boundingBoxGizmo || this.positionGizmo)) {
           this.setupGizmoInteractions(); // Call the setup function
       } else {
           console.warn(`--->>> createScene (${sceneTimestamp}): Skipping Gizmo interaction setup due to initialization failure.`);
       }


      // --- Environment Setup (Only if requested) ---
      if (initializeEnvironment) {
          console.log(`--->>> createScene (${sceneTimestamp}): Setting up initial environment...`);
          this.scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.2, 1.0);

          this.ambientLight = new BABYLON.HemisphericLight("defaultAmbient", new BABYLON.Vector3(0, 1, 0), this.scene);
          this.ambientLight.intensity = 0.7;

          // Example: Setup default environment texture (adjust path if needed)
          try {
              // You might want to make the path configurable or load conditionally
               const envTexture = new BABYLON.CubeTexture("/assets/env/clouds.env", this.scene);
               this.scene.environmentTexture = envTexture;
               this.scene.environmentIntensity = 0.7; // Match ambient light initially
          } catch(envError) {
              console.warn("Could not load default environment texture:", envError);
          }


          console.log(`--->>> createScene (${sceneTimestamp}): Initial environment setup complete.`);
      } else {
           console.log(`--->>> createScene (${sceneTimestamp}): Skipping initial environment setup.`);
      }


      // --- Physics Setup ---
      console.log(`--->>> createScene (${sceneTimestamp}): Setting up physics (Enabled: ${physicsActuallyEnabled})...`);
      this.havokPlugin = null; // Reset plugin instance reference
      if (physicsActuallyEnabled) {
          if (this.havokInstance) {
              console.log(`--->>> createScene (${sceneTimestamp}): Initializing HavokPlugin...`);
              try {
                  this.havokPlugin = new BABYLON.HavokPlugin(true, this.havokInstance);
                  this.scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), this.havokPlugin);
                  console.log(`--->>> createScene (${sceneTimestamp}): Havok physics enabled successfully.`);
              } catch (pluginError) {
                  console.error(`--->>> createScene (${sceneTimestamp}): Error initializing HavokPlugin:`, pluginError);
                  alert("Failed to initialize physics plugin. Check console.");
              }
          } else {
              console.error(`--->>> createScene (${sceneTimestamp}): Cannot enable Havok - WASM instance missing!`);
              alert("Physics engine instance is missing. Cannot enable physics.");
          }
      } else {
          console.log(`--->>> createScene (${sceneTimestamp}): Physics explicitly disabled for this scene.`);
          if (this.scene.isPhysicsEnabled()) {
               this.scene.disablePhysicsEngine();
          }
      }
      console.log(`--->>> createScene (${sceneTimestamp}): Physics setup finished.`);

    } // End of scene successful check

      console.log(`--->>> EXIT createScene (${sceneTimestamp})`);
      return this.scene;
  };


  // --- NEW METHOD to load static meshes from save data ---
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

        // Assuming non-instanced for now, taking the first transform.
        const transform = objData.transforms[0];

        try {
            // Use a unique name for BabylonJS mesh, can incorporate customID for traceability
            const meshBabylonName = `static_loaded_${objData.customID.substring(0, 8)}`;
            
            await loadAndPlaceModel(
                meshBabylonName,
                objData.sourceModelUrl,
                // defaultPosition is less relevant here as initialTransform provides position
                new BABYLON.Vector3(transform.position.x, transform.position.y, transform.position.z), 
                this.scene,
                objData.customID,    // Pass the customID from the save file
                transform            // Pass the full transform data from the save file
            );
            console.log(`Static mesh with customID ${objData.customID} processed.`);
        } catch (error) {
            console.error(`Failed to load static mesh with customID ${objData.customID} from URL ${objData.sourceModelUrl}:`, error);
            // Optionally, alert the user or add to an error list
        }
    }
    console.log("Finished processing static meshes for loading.");
  }
  // --- Method to Setup Gizmo Pointer Interactions ---
  public setupGizmoInteractions = () => {
    // Guard clauses
    if (!this.scene) {
        console.error("Cannot setup gizmo interactions: Scene not ready.");
        return;
    }
    if (!this.utilityLayer || (!this.boundingBoxGizmo && !this.positionGizmo)) {
        console.error("Cannot setup gizmo interactions: UtilityLayer or Gizmos not initialized.");
        return;
    }
    if (this.pointerObserver) {
        console.warn("Gizmo interaction observer already exists. Removing old one first.");
        this.scene.onPointerObservable.remove(this.pointerObserver); // Remove if somehow exists
        this.pointerObserver = null;
    }

    console.log("Setting up pointer observable for gizmos...");
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
        // Safety check inside the observer callback
        if (!this.boundingBoxGizmo && !this.positionGizmo) return;

        // Only act on Pointer Pick events for selection/deselection
        if (pointerInfo.type === PointerEventTypes.POINTERPICK) {
            const pickedMesh = pointerInfo.pickInfo?.pickedMesh;

            if (pickedMesh) {
              // console.log(`Pointer pick: Hit mesh "${pickedMesh.name}"`);
              const meshName = pickedMesh.name || '';
              const isIgnoredGizmoMesh = GIZMO_IGNORE_MESH_NAMES.some(ignoreName => meshName.startsWith(ignoreName));
              const isGizmoElementItself = pickedMesh.parent && pickedMesh.parent.name && pickedMesh.parent.name.includes("Gizmo");

              if (isIgnoredGizmoMesh || isGizmoElementItself) {
                  if (this.attachedGizmoMesh) this.detachGizmos(); // Clicked ignored/gizmo, detach
                  return;
              }

              // --- LOGIC TO FIND THE ASSET ROOT ---
              let meshToAttachGizmoTo: any = null;
              const pickedMeshMetadata = MeshRegistry.getMeshMetadata(pickedMesh); // Gets pickedMesh.metadata

              if (pickedMeshMetadata) {
                  if (pickedMeshMetadata.isAssetRoot && pickedMeshMetadata.customID) {
                      // The picked mesh is itself the registered root asset
                      meshToAttachGizmoTo = pickedMesh as BABYLON.AbstractMesh;
                      // console.log(`Picked mesh "${pickedMesh.name}" is an asset root.`);
                  } else if (pickedMeshMetadata.isChildOfStaticAsset && pickedMeshMetadata.rootAssetCustomID) {
                      // The picked mesh is a child of a registered asset
                      meshToAttachGizmoTo = MeshRegistry.getMeshByCustomID(pickedMeshMetadata.rootAssetCustomID);
                      // if (meshToAttachGizmoTo) console.log(`Picked child "${pickedMesh.name}", found root asset "${meshToAttachGizmoTo.name}" to attach gizmo.`);
                      // else console.warn(`Child mesh "${pickedMesh.name}" has rootAssetCustomID "${pickedMeshMetadata.rootAssetCustomID}" but root not found in registry.`);
                  }
              }
              
              // Fallback: if no metadata helped, and it's an AbstractMesh, consider attaching to it directly
              // (This case should be less common if metadata is set up well)
              if (!meshToAttachGizmoTo && pickedMesh instanceof BABYLON.AbstractMesh) {
                  // console.warn(`Could not determine asset root for "${pickedMesh.name}" from metadata. Attaching gizmo directly if it's registered.`);
                  // Check if this pickedMesh itself is registered (e.g. a primitive created by Blockly)
                  const directMetadata = MeshRegistry.getMeshMetadata(pickedMesh);
                  if (directMetadata && directMetadata.customID && directMetadata.meshType) { // It's a registered mesh of some type
                      meshToAttachGizmoTo = pickedMesh;
                  }
              }
              // --- END LOGIC TO FIND ASSET ROOT ---

              if (meshToAttachGizmoTo) {
                  if (this.attachedGizmoMesh !== meshToAttachGizmoTo) {
                      this.attachGizmos(meshToAttachGizmoTo); // Attach to the (potentially root) mesh
                  }
                  // else: Clicked the same mesh (or part of the same asset) that already has gizmos. Do nothing.
              } else {
                  // Clicked something not leading to a known asset or registered mesh, detach if anything was attached.
                  // console.log(`No suitable mesh found to attach gizmo for picked mesh "${pickedMesh.name}". Detaching if active.`);
                  if (this.attachedGizmoMesh) this.detachGizmos();
              }

          } else { // Clicked on empty space
              if (this.attachedGizmoMesh) this.detachGizmos();
          }
      }
  });
}

// --- Helper method to attach gizmos ---
private attachGizmos = (mesh: BABYLON.AbstractMesh) => {
    if (!mesh) return;

    console.log(`>>> attachGizmos: Attaching to mesh: ${mesh.name}. Current metadata:`, JSON.parse(JSON.stringify(mesh.metadata || {}))); // <--- ADD THIS LOG

    // --- Camera Animation Logic ---
    if (this.camera && this.camera instanceof BABYLON.ArcRotateCamera) {
      // Only animate if attaching to a NEW mesh
      if (this.attachedGizmoMesh !== mesh) {
           // Store the current target's position *before* changing it
           // Note: camera.target might have been updated by a previous animation,
           // so we directly read its current state.
           this.previousCameraTargetPositionBeforeGizmoAttach = this.camera.target.clone();
           console.log("Stored previous camera target position before attaching:", this.previousCameraTargetPositionBeforeGizmoAttach);

           // Get the absolute position of the mesh to target
           const targetPoint = mesh.getAbsolutePosition();

           // *** Use the custom animation function ***
           this.animateCameraToTarget(targetPoint);
           console.log(`Animating camera target to mesh: ${mesh.name}`);

           // *** REMOVED direct setTarget ***
           // this.camera.setTarget(mesh);
      }
  }
  // --- End Camera Animation Logic ---


    if (this.boundingBoxGizmo) {
        this.boundingBoxGizmo.attachedMesh = mesh;
    }
    if (this.positionGizmo) {
        this.positionGizmo.attachedMesh = mesh;
    }
    this.attachedGizmoMesh = mesh;

    // --- ADD Keyboard listener for delete ---
    if (!this.sceneKeyboardObserver) { // Add only if not already present
      // console.log("Attaching keyboard observer for selected mesh deletion.");
      this.sceneKeyboardObserver = this.scene.onKeyboardObservable.add((kbInfo) => {
          if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
              if ((kbInfo.event.key === "Delete" || kbInfo.event.key === "Backspace") && this.attachedGizmoMesh) {
                  const meshToDelete = this.attachedGizmoMesh; // Capture before detaching
                  const meshMetadata = MeshRegistry.getMeshMetadata(meshToDelete);

                  console.log('deleting mesh')
                  console.log(meshToDelete)
                  console.log('Retrieved meshMetadata for deletion:', meshMetadata) // New log message

                  if (meshMetadata && meshMetadata.meshType === 'static') {
                      console.log(`Delete key pressed for selected static mesh: ${meshToDelete.name} (CustomID: ${meshMetadata.customID})`);
                      
                      // 1. Detach gizmos first
                      this.detachGizmos(); // This will also clear this.attachedGizmoMesh and remove this keyboard observer

                      // 2. Remove the mesh from the scene and registry
                      // world.remove expects a ShapeBlock-like structure. We need to adapt or call underlying logic.
                      // For simplicity, let's call MeshRegistry.unregisterMeshByReference and mesh.dispose directly.
                      // This assumes world.remove primarily does these for non-Blockly meshes.
                      
                      const customID = MeshRegistry.getCustomID(meshToDelete); // Get ID before dispose
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

                      if (blocklyWorkspace) {
                        SaveLoad.saveProjectToSession(blocklyWorkspace); // YOUR RENAMED FUNCTION
                        console.log("Scene state saved to session after static asset deletion.");
                    }

                      // 3. Optional: Trigger a save to session storage to persist the deletion
                      // This requires access to blocklyWorkspace, which might be better handled by an event emitter
                      // or by having blockly.ts listen for a custom "sceneModified" event.
                      // For now, let's log that it should happen.
                      console.log("Static mesh deleted. Consider saving workspace/scene to session.");
                      // Example if blocklyWorkspace is accessible (e.g., via a getter or passed in):
                      // if (getBlocklyWorkspace()) { // Hypothetical getter
                      //    SaveLoad.saveWorkspaceAndSceneToSession(getBlocklyWorkspace());
                      // }
                  } else if (meshMetadata && meshMetadata.meshType === 'dynamic') {
                      console.log(`Delete key pressed for dynamic (Blockly) mesh: ${meshToDelete.name}. Deletion should be handled via Blockly block removal.`);
                      // Optionally provide feedback to user to delete the block
                  } else {
                      // console.log("Delete key pressed, but selected mesh is not static or has no metadata.");
                  }
              }
          }
      });
  }
}

// --- Helper method to detach gizmos ---
private detachGizmos = () => {
  // --- Camera Animation Logic ---
  // ... (existing camera animation code) ...

  if (this.boundingBoxGizmo) this.boundingBoxGizmo.attachedMesh = null;
  if (this.positionGizmo) this.positionGizmo.attachedMesh = null;
  this.attachedGizmoMesh = null;

  // --- REMOVE Keyboard listener ---
  if (this.scene && this.sceneKeyboardObserver) {
      // console.log("Detaching keyboard observer for selected mesh deletion.");
      this.scene.onKeyboardObservable.remove(this.sceneKeyboardObserver);
      this.sceneKeyboardObserver = null;
  }
}


  // --- NEW (Optional but good practice): Function to clear Blockly-added objects ---
  public clearBlocklyObjects = () => {
      console.warn("Clearing Blockly-added objects (Not Yet Implemented - relies on full scene reset for now)");
      // Implementation idea:
      // Iterate through scene meshes/lights/cameras etc.
      // If node.metadata && node.metadata.createdBy === 'blockly', dispose it
      // Reset internal lists in world.ts etc. if they track these objects by name.
      // Detach gizmos before clearing.
      this.detachGizmos();
      // ... rest of clearing logic ...
  }

  public runRenderLoop = () => {
    this.engine.runRenderLoop(
      () => { // Use arrow function to maintain 'this' context
        if (this.scene && this.scene.activeCamera) { // Check for activeCamera
          this.scene.render();
          const fpsElement = document.getElementById("fpsCounter");
          if (fpsElement) {
              fpsElement.innerHTML = this.engine.getFps().toFixed() + " fps";
          }
        }
      }
    );
  };

  // Create an animation loop
  public createAnimationLoop = (name: string, statements: any) => {
    // Ensure statements is a function
    if (typeof statements !== 'function') {
        console.error(`createAnimationLoop: statements for loop "${name}" is not a function.`);
        return;
    }
    {
      // Store the observer to potentially remove it later if needed
      const observer = this.scene.onBeforeRenderObservable.add(() => {
        // Check the running state within the callback
        if (this.runningAnimations[name] === true) {
            try {
                statements();
            } catch (error) {
                console.error(`Error in animation loop "${name}":`, error);
                // Optionally stop the loop on error:
                // this.stopAnimation(name);
                // this.scene.onBeforeRenderObservable.remove(observer);
            }
        }
      });
      // You might want to store the observer keyed by 'name' if you need to remove specific loops later
      // e.g., this.animationObservers[name] = observer;
    }
  };

  // Start an animation loop
  public startAnimation = (name: string) => {
    console.log(`Starting animation loop: ${name}`);
    this.runningAnimations[name] = true;
  };

  // Stop an animation loop
  public stopAnimation = (name: string) => {
    console.log(`Stopping animation loop: ${name}`);
    // Setting to false is often enough if the check is inside the observer
    this.runningAnimations[name] = false;
    // Or delete if you prefer and check existence: delete this.runningAnimations[name];
    // If you stored the observer, you'd remove it here:
    // if (this.animationObservers[name]) {
    //     this.scene.onBeforeRenderObservable.remove(this.animationObservers[name]);
    //     delete this.animationObservers[name];
    // }
  };

  public enableInspector = () => {
      if (this.scene) {
        // Ensure debug layer isn't already shown in a conflicting way
        if (this.scene.debugLayer && !this.scene.debugLayer.isVisible()) {
             this.scene.debugLayer.show({
                 embedMode: true, // Or false for a separate window
                 // Optional: specify HTML element id if embedMode is true
                 // embedHostID: 'inspector-host'
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
        // Consider disposing the experience after exit if not needed anymore
        // this.defaultXRExperience.dispose();
        // this.defaultXRExperience = null;
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
          return; // Don't create a new one
      }

      console.log("Attempting to create default XR experience...");
      try {
            this.defaultXRExperience = await this.scene.createDefaultXRExperienceAsync({
            // Pass the ground mesh if it exists and you want teleportation/boundaries
            floorMeshes: this.ground ? [this.ground] : undefined,
            disableDefaultUI: false, // Enable default UI elements like teleportation reticle
            // disableTeleportation: false, // Explicitly enable teleportation
            });

            if (!this.defaultXRExperience.baseExperience) {
                console.error("XR not supported or available on this device/browser.");
                alert("WebXR is not supported on your browser or device.");
                this.defaultXRExperience = null; // Clear the reference if failed
            } else {
                console.log("XR Experience created. Entering XR immersive mode...");
                // Check if session is supported first
                const sessionSupported = await this.defaultXRExperience.baseExperience.sessionManager.isSessionSupportedAsync("immersive-vr");
                if(sessionSupported){
                    await this.defaultXRExperience.baseExperience.enterXRAsync(
                        "immersive-vr", // Session mode
                        "local-floor"   // Reference space type
                    );
                    console.log("Entered XR immersive mode successfully.");
                } else {
                    console.error("Immersive VR session mode not supported.");
                    alert("Immersive VR mode is not supported on your browser or device.");
                    this.defaultXRExperience.dispose(); // Clean up if mode not supported
                    this.defaultXRExperience = null;
                }
            }
      } catch (error) {
          console.error("Error creating or entering XR:", error);
          alert(`Failed to initialize WebXR: ${error.message || error}`);
          if (this.defaultXRExperience) {
              this.defaultXRExperience.dispose(); // Clean up on error
              this.defaultXRExperience = null;
          }
      }
  };
}

// --- Helper Types (assuming these might be defined elsewhere, added here for completeness if not) ---
// Replace with your actual type definitions if they exist

interface CoordsBlock {
    x: number;
    y: number;
    z: number;
}

interface ShapeBlock {
    shape: string; // Name of the shape/mesh
}

interface LightBlock {
    light: string; // Name of the light
}

interface Shape {
    // Properties for ground creation
    width?: number;
    height?: number;
    subdivisions?: number;
    // ... other potential ground properties
}

interface Skybox {
    // Properties for skybox creation
    texturePath?: string; // e.g., "/textures/skybox" (for skybox_px.jpg etc.)
    size?: number;
    // ... other potential skybox properties
}

// ---------------------------------------------------------------------------------------------