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
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents'; // Import PointerEventTypes

// List of mesh names to ignore for gizmo attachment
const GIZMO_IGNORE_MESH_NAMES = ['ground', 'skybox'];

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

    // --- NEW Gizmo Properties ---
    private utilityLayer: UtilityLayerRenderer | null = null;
    private boundingBoxGizmo: BoundingBoxGizmo | null = null;
    private attachedGizmoMesh: BABYLON.AbstractMesh | null = null;
    private pointerObserver: BABYLON.Observer<BABYLON.PointerInfo> | null = null; // To store the observer


  constructor(canvas: HTMLElement, havokInstance: any) {
    this.canvas = canvas;
    this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.havokInstance = havokInstance; // Store the passed Havok engine instance
    if (!havokInstance) {
        console.warn("ThreeD constructor: Received null or undefined Havok instance. Physics will likely fail to enable.");
    }
  }


  // --- NEW: Method to handle spawning objects from drag-and-drop ---
  public async spawnObjectFromDragDrop(
    objectData: GeneratedObject, // Use the shared type
    screenX: number,
    screenY: number
): Promise<void> {
    if (!this.scene) {
        console.error("Cannot spawn object: Scene is not initialized.");
        return;
    }
    if (!objectData.modelUrl) {
        console.error("Cannot spawn object: Model URL is missing from object data.");
        return;
    }

    console.log(`Attempting to pick 3D point at screen coordinates: ${screenX}, ${screenY}`);

    // Perform a pick operation to find the 3D point under the cursor
    // We prioritize hitting the ground, but fall back to a plane if ground isn't hit.
    const pickInfo = this.scene.pick(
        screenX,
        screenY,
        (mesh) => mesh.isPickable && mesh.isEnabled() // Standard predicate
        // Optional predicate to prioritize ground: (mesh) => mesh.name === 'ground' || (mesh.isPickable && mesh.isEnabled())
    );


    let targetPosition: BABYLON.Vector3;

    if (pickInfo.hit && pickInfo.pickedPoint) {
        console.log(`Pick successful. Hit mesh: ${pickInfo.pickedMesh?.name}. Point:`, pickInfo.pickedPoint);
        targetPosition = pickInfo.pickedPoint.clone();
        // Optional: Add a small offset slightly above the surface to prevent initial intersection
        targetPosition.y += 0.1; // Adjust as needed
    } else {
        // Fallback: If nothing was hit (e.g., dropped onto empty sky),
        // unproject onto the XZ plane at Y=0.
        console.warn("Pick failed (likely dropped on empty space). Unprojecting onto XZ plane at Y=0.");
        // Create a virtual plane at Y=0
        const plane = BABYLON.Plane.FromPositionAndNormal(BABYLON.Vector3.Zero(), BABYLON.Vector3.UpReadOnly);
        const ray = this.scene.createPickingRay(screenX, screenY, null, this.camera);
        const distance = ray.intersectsPlane(plane);

        if (distance !== null && distance > 0) {
            targetPosition = ray.origin.add(ray.direction.scale(distance));
            console.log("Unprojected position:", targetPosition);
        } else {
            // Further fallback: If ray doesn't intersect plane (unlikely), place at origin
            console.error("Failed to unproject screen coordinates onto XZ plane. Placing at origin.");
            targetPosition = BABYLON.Vector3.Zero();
        }
    }

    console.log(`Calculated target spawn position: ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z}`);

    try {
        // Call the actual loading function (needs to be created in world/index.ts)
        await loadAndPlaceModel(
            objectData.objectName || `dropped_${objectData.id.substring(0, 8)}`, // Provide a name
            objectData.modelUrl,
            targetPosition,
            this.scene
        );
        console.log(`Model ${objectData.objectName} should now be loading/placed.`);
    } catch (error) {
        console.error(`Error during loadAndPlaceModel for ${objectData.objectName}:`, error);
        // Potentially show an error to the user
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
      this.camera.upperRadiusLimit = 500;
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
    this.scene.environmentIntensity = intensity / 100;
    this.scene.environmentTexture.level = intensity / 100;
    if (this.skybox) {
      let sky:any = this.scene.createDefaultSkybox(this.scene.environmentTexture);
      console.log(sky)
      sky.name = "skybox";
      this.skybox.name="skybox"
      this.ambientLight.intensity = 1;
    }
  };

  // World functions
  // public createShape = (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock) => {
  //   world.createShape(shapeBlock, coordsBlock, this.scene, this.actionManagers);
  // };

  public createShape = async (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock): Promise<void> => {
    // Await the call
    await world.createShape(shapeBlock, coordsBlock, this.scene, this.actionManagers);
  };

// --- BEFORE ---
/*
  public createShapeAndAddTo = (shapeBlock: ShapeBlock, parentBlock: ShapeBlock, coordsBlock: CoordsBlock) => {
    world.createShapeAndAddTo(shapeBlock, parentBlock, coordsBlock, this.scene, this.actionManagers);
  };
*/

// --- AFTER ---
  // Mark method as async
  public createShapeAndAddTo = async (shapeBlock: ShapeBlock, parentBlock: ShapeBlock, coordsBlock: CoordsBlock): Promise<void> => {
    // Await the call
    await world.createShapeAndAddTo(shapeBlock, parentBlock, coordsBlock, this.scene, this.actionManagers);
  };

  public clone = (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock) => {
    world.clone(shapeBlock, coordsBlock, this.scene);
  };

  public remove = (shapeBlock: ShapeBlock) => {
    world.remove(shapeBlock, this.scene);
  };

  public moveShape = (shapeBlock: ShapeBlock, coordsBlock: CoordsBlock) => {
    world.moveShape(shapeBlock, coordsBlock, this.scene);
  };

  public moveShapeAlong = (shapeBlock: ShapeBlock, axis: string, steps: number) => {
    world.moveShapeAlong(shapeBlock, axis, steps, this.scene);
  };

  // Add this new method
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
    world.createGround(shape, this.scene);
  };

  public createSkybox = (skybox: Skybox) => {
    world.createSkybox(skybox, this.scene);
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
    // MODIFIED: createScene now primarily focuses on setting up a NEW scene environment.
    // It will be called explicitly during initialization and resets.
    public createScene = async (initializeEnvironment: boolean = true, physicsActuallyEnabled?: boolean) => {
      const sceneTimestamp = Date.now();
      console.log(`--->>> ENTER createScene (${sceneTimestamp}) - InitEnv: ${initializeEnvironment}, Physics: ${physicsActuallyEnabled}`);

      // --- Scene Cleanup ---
      console.log(`--->>> createScene (${sceneTimestamp}): Starting cleanup...`);

          // Dispose existing gizmo observer FIRST
    if (this.scene && this.pointerObserver) {
      console.log(`--->>> createScene (${sceneTimestamp}): Removing pointer observer...`);
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
  }

  // Dispose existing gizmo and utility layer BEFORE disposing the scene
  if (this.boundingBoxGizmo) {
      console.log(`--->>> createScene (${sceneTimestamp}): Disposing existing BoundingBoxGizmo...`);
      this.boundingBoxGizmo.dispose();
      this.boundingBoxGizmo = null;
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
          // Dispose the experience object itself
          this.defaultXRExperience.dispose();
          this.defaultXRExperience = null;
          console.log(`--->>> createScene (${sceneTimestamp}): XR Experience disposed.`);
      } else {
          console.log(`--->>> createScene (${sceneTimestamp}): No previous XR Experience to dispose.`);
      }


      // Dispose the old scene OBJECT ITSELF if it exists
      if (this.scene) {
          console.log(`--->>> createScene (${sceneTimestamp}): Previous scene exists. Disposing scene object...`);
          // Note: Disposing the scene should handle action managers, lights, meshes etc.
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
        // Depending on your app structure, you might want to throw here or return early
        return; // Stop further execution in this function
    }

    // --- Initialize Utility Layer and Gizmo for the NEW scene ---
    console.log(`--->>> createScene (${sceneTimestamp}): Attempting to initialize UtilityLayer...`);
    try {
        this.utilityLayer = new UtilityLayerRenderer(this.scene);
        this.utilityLayer.utilityLayerScene.autoClearDepthAndStencil = false;
        console.log(`--->>> createScene (${sceneTimestamp}): UtilityLayer initialized successfully.`);
    } catch (layerError) {
        console.error(`--->>> createScene (${sceneTimestamp}): FAILED to initialize UtilityLayerRenderer!`, layerError);
        this.utilityLayer = null; // Ensure it's null on error
    }

    // Only try to create Gizmo if UtilityLayer succeeded
    if (this.utilityLayer) {
        console.log(`--->>> createScene (${sceneTimestamp}): Attempting to initialize BoundingBoxGizmo...`);
        try {
            this.boundingBoxGizmo = new BoundingBoxGizmo(
                BABYLON.Color3.FromHexString("#7C00FE"),
                this.utilityLayer
            );
            this.boundingBoxGizmo.setEnabledRotationAxis("y");
            this.boundingBoxGizmo.fixedDragMeshScreenSize = true;
            this.boundingBoxGizmo.attachedMesh = null; // Hide initially
            console.log(`--->>> createScene (${sceneTimestamp}): BoundingBoxGizmo initialized successfully.`);
        } catch (gizmoError) {
            console.error(`--->>> createScene (${sceneTimestamp}): FAILED to initialize BoundingBoxGizmo!`, gizmoError);
            this.boundingBoxGizmo = null; // Ensure it's null on error
        }
    } else {
        console.warn(`--->>> createScene (${sceneTimestamp}): Skipping BoundingBoxGizmo initialization because UtilityLayer failed.`);
        this.boundingBoxGizmo = null; // Ensure gizmo is null if layer failed
    }


    if (this.scene && this.boundingBoxGizmo) {
      // Optional: Clear camera reference if we want a fresh one on reset
      // If initializeEnvironment is true, we are likely resetting.
      if (initializeEnvironment) {
           console.log(`--->>> createScene (${sceneTimestamp}): Resetting camera reference.`);
           this.camera = null; // Allow createCamera to make a new one
      }

       // --- Setup Gizmo Interactions (Pointer Observer) ---
    this.setupGizmoInteractions(); // Call the new setup function

      // --- Environment Setup (Only if requested) ---
      if (initializeEnvironment) {
          console.log(`--->>> createScene (${sceneTimestamp}): Setting up initial environment...`);
          // Add your default environment setup here if needed (e.g., default sky color, ambient light)
          // Example: Set a default clear color
          this.scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.2, 1.0);

          // Example: Create a default ambient light if none exists from blocks later
          this.ambientLight = new BABYLON.HemisphericLight("defaultAmbient", new BABYLON.Vector3(0, 1, 0), this.scene);
          this.ambientLight.intensity = 0.7; // Default intensity

          // Example: Setup default environment texture (if you use one)
          // const envTexture = new BABYLON.CubeTexture("/path/to/environment.env", this.scene);
          // this.scene.environmentTexture = envTexture;

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
                  // Apply gravity immediately when physics is enabled
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
          // Ensure physics is disabled if it was enabled before
          if (this.scene.isPhysicsEnabled()) {
               this.scene.disablePhysicsEngine();
          }
      }
      console.log(`--->>> createScene (${sceneTimestamp}): Physics setup finished.`);

      console.log(`--->>> EXIT createScene (${sceneTimestamp})`);
      // Return the scene, although the class property this.scene is the primary way to access it

    }
      return this.scene;
  };

  // --- NEW: Method to Setup Gizmo Pointer Interactions ---
  public setupGizmoInteractions = () => {
    if (!this.scene || !this.boundingBoxGizmo) {
        console.error("Cannot setup gizmo interactions: Scene or Gizmo not ready.");
        return;
    }
    if (this.pointerObserver) {
        console.warn("Gizmo interaction observer already exists. Removing old one.");
        this.scene.onPointerObservable.remove(this.pointerObserver); // Remove if somehow exists
    }

    console.log("Setting up pointer observable for gizmo...");
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
        if (!this.boundingBoxGizmo) return; // Safety check
        // Check if the event is a pick event
        if (pointerInfo.type === PointerEventTypes.POINTERPICK) {
            const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
            
            // Check if a mesh was hit
            if (pickedMesh) {
                // Check if the hit mesh should be ignored (ground, skybox, etc.)
                const meshName = pickedMesh.name || '';
                
                if (GIZMO_IGNORE_MESH_NAMES.some(ignoreName => meshName.startsWith(ignoreName))) {
                     // Clicked on an ignored mesh, detach gizmo if attached
                     if (this.attachedGizmoMesh) {
                         console.log(`Clicked ignored mesh (${meshName}), detaching gizmo.`);
                         this.boundingBoxGizmo.attachedMesh = null;
                         this.attachedGizmoMesh = null;
                     }
                } else {
                    // Clicked on a valid mesh
                    // Attach gizmo only if it's not already attached to this mesh
                    if (this.attachedGizmoMesh !== pickedMesh) {
                         console.log(`Attaching gizmo to: ${meshName}`);
                         this.boundingBoxGizmo.attachedMesh = pickedMesh;
                         this.attachedGizmoMesh = pickedMesh;

                         // --- Optional: Add drag/scale behaviors on attach ---
                         // Note: These might conflict with Blockly controls. Use with caution.
                         if (!pickedMesh.getBehaviorByName('SixDofDragBehavior')) {
                             //const sixDofDragBehavior = new BABYLON.SixDofDragBehavior();
                             //pickedMesh.addBehavior(sixDofDragBehavior);
                         }
                         if (!pickedMesh.getBehaviorByName('MultiPointerScaleBehavior')) {
                             //const multiPointerScaleBehavior = new BABYLON.MultiPointerScaleBehavior();
                             //pickedMesh.addBehavior(multiPointerScaleBehavior);
                         }
                         // ------------------------------------------------------
                    }
                    // else: Clicked the mesh that already has the gizmo, do nothing.
                }
            } else {
                // Clicked on empty space, detach gizmo if attached
                if (this.attachedGizmoMesh) {
                    console.log("Clicked empty space, detaching gizmo.");
                    this.boundingBoxGizmo.attachedMesh = null;
                    this.attachedGizmoMesh = null;
                }
            }
        }else if(pointerInfo.type === PointerEventTypes.POINTERDOWN){
            if (this.attachedGizmoMesh) {
              // console.log(`pointerUp, detaching gizmo.`);
              // this.boundingBoxGizmo.attachedMesh = null;
              // this.attachedGizmoMesh = null;
          }
        }
    });
    console.log("Pointer observable for gizmo setup complete.");
}

  // ... (runRenderLoop, animation loops, inspector, XR functions remain the same)

  // --- NEW (Optional but good practice): Function to clear Blockly-added objects ---
  // This would require tagging objects added by blockly code.
  // For now, we rely on the full scene reset.
  public clearBlocklyObjects = () => {
      console.log("Clearing Blockly-added objects (Not Yet Implemented - relies on full scene reset for now)");
      // Implementation idea:
      // Iterate through scene meshes/lights
      // If mesh.metadata && mesh.metadata.createdBy === 'blockly', dispose it
      // Clear relevant lists in world.ts etc.
  }

  public runRenderLoop = () => {
    this.engine.runRenderLoop(
      function () {
        if (this.scene && this.scene.cameras.length > 0) {
          this.scene.render();
          document.getElementById("fpsCounter").innerHTML = this.engine.getFps().toFixed() + " fps";
        }
      }.bind(this)
    );
  };

  // Create an animation loop
  public createAnimationLoop = (name: string, statements: any) => {
    {
      this.scene.onBeforeRenderObservable.add(() => {
        if (this.runningAnimations[name] === true) statements();
      });
    }
  };

  // Start an animation loop
  public startAnimation = (name: string) => {
    this.runningAnimations[name] = true;
  };

  // Stop an animation loop
  public stopAnimation = (name: string) => {
    delete this.runningAnimations[name];
  };

  public enableInspector = () => {
    this.scene.debugLayer.show({ embedMode: false });
  };

  public disableInspector = () => {
    this.scene.debugLayer.hide();
  };

  public disableXR = async () => {
    if (this.defaultXRExperience) {
      await this.defaultXRExperience.baseExperience.exitXRAsync();
      delete this.defaultXRExperience;
    }
  };

  public enableXR = async () => {
    this.defaultXRExperience = await this.scene.createDefaultXRExperienceAsync({
      floorMeshes: [this.ground],
      disableDefaultUI: true,
    });
    if (!this.defaultXRExperience.baseExperience) {
      console.error("XR not supported on this device");
    } else {
      console.log("Entering XR immersive mode");
      this.defaultXRExperience.baseExperience.enterXRAsync("immersive-vr", "local-floor");
    }
  };
}
