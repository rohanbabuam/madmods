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
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';

import { SelectTool } from '../../creatorPageTools/SelectTool';

const GIZMO_IGNORE_MESH_NAMES = ['ground', 'skybox'];


import * as MeshRegistry from '../../state/meshRegistry';

import * as SaveLoad from '../../state/saveload';
import { blocklyWorkspace } from '../blockly';

const CAMERA_ANIMATION_FPS = 30;
const CAMERA_ANIMATION_DURATION_SECONDS = 0.5;
const CAMERA_ANIMATION_TOTAL_FRAMES = CAMERA_ANIMATION_DURATION_SECONDS * CAMERA_ANIMATION_FPS;



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


  private defaultCameraTarget: BABYLON.Vector3 = BABYLON.Vector3.Zero();
  private previousCameraTargetPositionBeforeGizmoAttach: BABYLON.Vector3 | null = null;
  private framingBehavior: BABYLON.FramingBehavior | null = null;

    // Tool instances
  private selectToolInstance: SelectTool | null = null;
  private activeTool: string | null = null; // Initialize to null or a dummy value



  constructor(canvas: HTMLElement, havokInstance: any) {
    this.canvas = canvas;
    this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.havokInstance = havokInstance;
    if (!havokInstance) {
        console.warn("ThreeD constructor: Received null or undefined Havok instance. Physics will likely fail to enable.");
    }
  }

public getCamera(): BABYLON.Camera | null {
    return this.camera; // Assuming this.camera is the main scene camera
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
    if (!this.attachedGizmoMesh) return;
    // console.log("ThreeD.detachGizmosPublic: Detaching gizmos.");
    
    if (this.boundingBoxGizmo) this.boundingBoxGizmo.attachedMesh = null;
    if (this.positionGizmo) this.positionGizmo.attachedMesh = null;
    this.attachedGizmoMesh = null;

    // Scene keyboard observer for delete key should be removed when gizmo is detached
    // if (this.scene && this.sceneKeyboardObserver) {
    //     this.scene.onKeyboardObservable.remove(this.sceneKeyboardObserver);
    //     this.sceneKeyboardObserver = null;
    // }
    // Let's keep the delete observer active as long as a scene exists,
    // it only acts if attachedGizmoMesh is not null.
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
    this.camera = camera.createCamera(this.cameraType, this.camera, this.scene, this.canvas);
    if (this.camera instanceof BABYLON.ArcRotateCamera) {

      this.camera.pinchToPanMaxDistance = 0;
      this.camera.inputs.removeByType("ArcRotateCameraMultiTouchInput");


      this.camera.lowerRadiusLimit = 1;
      this.camera.upperRadiusLimit = 5000;




      if (this.camera.target instanceof BABYLON.AbstractMesh) {
        this.previousCameraTargetPositionBeforeGizmoAttach = this.camera.target.getAbsolutePosition().clone();
     } else if (this.camera.target instanceof BABYLON.Vector3) {
        this.previousCameraTargetPositionBeforeGizmoAttach = this.camera.target.clone();
     } else {

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


    public createScene = async (initializeEnvironment: boolean = true, physicsActuallyEnabled?: boolean) => {
      const sceneTimestamp = Date.now();
      console.log(`--->>> ENTER createScene (${sceneTimestamp}) - InitEnv: ${initializeEnvironment}, Physics: ${physicsActuallyEnabled}`);


      console.log(`--->>> createScene (${sceneTimestamp}): Starting cleanup...`);


    MeshRegistry.clearRegistry();
    console.log(`--->>> createScene (${sceneTimestamp}): MeshRegistry cleared.`);



      if (this.boundingBoxGizmo) {
          console.log(`--->>> createScene (${sceneTimestamp}): Disposing existing BoundingBoxGizmo...`);
          this.boundingBoxGizmo.dispose();
          this.boundingBoxGizmo = null;
      }
      if (this.positionGizmo) {
          console.log(`--->>> createScene (${sceneTimestamp}): Disposing existing PositionGizmo...`);
          this.positionGizmo.dispose();
          this.positionGizmo = null;
      }
      if (this.utilityLayer) {
          console.log(`--->>> createScene (${sceneTimestamp}): Disposing existing UtilityLayer...`);
          this.utilityLayer.dispose();
          this.utilityLayer = null;
      }
      this.attachedGizmoMesh = null;


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



      if (this.scene) {
          console.log(`--->>> createScene (${sceneTimestamp}): Previous scene exists. Disposing scene object...`);
          this.scene.dispose();
          this.scene = null;
          console.log(`--->>> createScene (${sceneTimestamp}): Previous scene disposed.`);
      } else {
          console.log(`--->>> createScene (${sceneTimestamp}): No previous scene to dispose.`);
      }
      this.actionManagers = [];



    try {
        console.log(`--->>> createScene (${sceneTimestamp}): Creating new BABYLON.Scene...`);
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.actionManager = new BABYLON.ActionManager(this.scene);
        this.runningAnimations = {};
        console.log(`--->>> createScene (${sceneTimestamp}): New scene created successfully.`);
    } catch (sceneError) {
        console.error(`--->>> createScene (${sceneTimestamp}): FAILED TO CREATE BABYLON.Scene!`, sceneError);
        this.scene = null;
        return;
    }


    console.log(`--->>> createScene (${sceneTimestamp}): Attempting to initialize UtilityLayer...`);
    try {
        this.utilityLayer = new UtilityLayerRenderer(this.scene);
        this.utilityLayer.utilityLayerScene.autoClearDepthAndStencil = false;
        console.log(`--->>> createScene (${sceneTimestamp}): UtilityLayer initialized successfully.`);


        console.log(`--->>> createScene (${sceneTimestamp}): Attempting to initialize BoundingBoxGizmo...`);
        try {
            this.boundingBoxGizmo = new BoundingBoxGizmo(
                BABYLON.Color3.FromHexString("#7C00FE"),
                this.utilityLayer
            );
            this.boundingBoxGizmo.setEnabledRotationAxis("y");
            this.boundingBoxGizmo.fixedDragMeshScreenSize = true;
            this.boundingBoxGizmo.scaleBoxSize = 0.1;
            this.boundingBoxGizmo.attachedMesh = null;

            this.boundingBoxGizmo.setEnabledScaling(true,true);
            this.boundingBoxGizmo.rotationSphereSize = 0.2;


            this.boundingBoxGizmo.onScaleBoxDragEndObservable.add(() => {
                if (this.attachedGizmoMesh && MeshRegistry.getMeshType(this.attachedGizmoMesh) === 'static') {
                    console.log("BoundingBoxGizmo scale drag ended. Saving project.");
                    SaveLoad.saveProjectToSession(blocklyWorkspace); // Pass blocklyWorkspace (could be null)
                }
            });

            this.boundingBoxGizmo.onRotationSphereDragEndObservable.add(() => {
                if (this.attachedGizmoMesh && MeshRegistry.getMeshType(this.attachedGizmoMesh) === 'static') {
                    console.log("BoundingBoxGizmo rotation drag ended. Saving project.");
                    SaveLoad.saveProjectToSession(blocklyWorkspace); // Pass blocklyWorkspace (could be null)
                }
            });


            console.log(`--->>> createScene (${sceneTimestamp}): BoundingBoxGizmo initialized successfully.`);
        } catch (gizmoError) {
            console.error(`--->>> createScene (${sceneTimestamp}): FAILED to initialize BoundingBoxGizmo!`, gizmoError);
            this.boundingBoxGizmo = null;
        }


        console.log(`--->>> createScene (${sceneTimestamp}): Attempting to initialize PositionGizmo...`);
        try {
            this.positionGizmo = new PositionGizmo(this.utilityLayer);
            this.positionGizmo.attachedMesh = null;
            if (this.positionGizmo) {
                this.positionGizmo.onDragEndObservable.add(() => {
                  if (this.attachedGizmoMesh && MeshRegistry.getMeshType(this.attachedGizmoMesh) === 'static') {
                      console.log("PositionGizmo drag ended (translation). Saving project.");
                      SaveLoad.saveProjectToSession(blocklyWorkspace); // Pass blocklyWorkspace (could be null)
                  }
              });
              
              const gizmosToModify = [
                  this.positionGizmo.xGizmo,
                  this.positionGizmo.yGizmo,
                  this.positionGizmo.zGizmo
              ];

              gizmosToModify.forEach(axisGizmo => {
                  if (axisGizmo) {

                      if (axisGizmo.coloredMaterial) {

                          axisGizmo.coloredMaterial.depthFunction = BABYLON.Engine.ALWAYS;
                      }

                      if (axisGizmo.hoverMaterial) {
                          axisGizmo.hoverMaterial.depthFunction = BABYLON.Engine.ALWAYS;
                      }

                      if (axisGizmo.planarGizmo && axisGizmo.planarGizmo.material) {
                         axisGizmo.planarGizmo.material.depthFunction = BABYLON.Engine.ALWAYS;
                      }
                  }
              });
              console.log(`--->>> createScene (${sceneTimestamp}): Configured PositionGizmo materials to ignore depth.`);
          }

            console.log(`--->>> createScene (${sceneTimestamp}): PositionGizmo initialized successfully.`);
        } catch (posGizmoError) {
            console.error(`--->>> createScene (${sceneTimestamp}): FAILED to initialize PositionGizmo!`, posGizmoError);
            this.positionGizmo = null;
        }


    } catch (layerError) {
        console.error(`--->>> createScene (${sceneTimestamp}): FAILED to initialize UtilityLayerRenderer! Gizmos will not be available.`, layerError);
        this.utilityLayer = null;
        this.boundingBoxGizmo = null;
        this.positionGizmo = null;
    }

    console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] About to instantiate SelectTool. Scene valid: ${!!this.scene}, UtilityLayer valid: ${!!this.utilityLayer}`);

    if (this.scene && this.utilityLayer) {
        try {
            this.selectToolInstance = new SelectTool(
                this,
                this.scene,
                this.utilityLayer,
                this.boundingBoxGizmo, // Can be null if gizmo init failed
                this.positionGizmo   // Can be null if gizmo init failed
            );
            console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] SelectTool INSTANTIATED successfully.`);
            // Activate the default tool (select)
            console.log(`--->>> [ThreeD.createScene (${sceneTimestamp})] Calling setTool('select') from createScene.`);
            this.setTool('select');
        } catch (toolError) {
            console.error(`--->>> [ThreeD.createScene (${sceneTimestamp})] FAILED to instantiate or set SelectTool:`, toolError);
            this.selectToolInstance = null; // Ensure it's null on error
        }
    } else {
        console.error(`--->>> [ThreeD.createScene (${sceneTimestamp})] SKIPPING SelectTool instantiation: Scene or UtilityLayer not available.`);
    }

    if (this.scene) {

      if (initializeEnvironment) {
           console.log(`--->>> createScene (${sceneTimestamp}): Resetting camera reference.`);
           this.camera = null;
      }

      if (initializeEnvironment) {
          console.log(`--->>> createScene (${sceneTimestamp}): Setting up initial environment...`);
          this.scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.2, 1.0);

          this.ambientLight = new BABYLON.HemisphericLight("defaultAmbient", new BABYLON.Vector3(0, 1, 0), this.scene);
          this.ambientLight.intensity = 0.7;


          try {

               const envTexture = new BABYLON.CubeTexture("/assets/env/clouds.env", this.scene);
               this.scene.environmentTexture = envTexture;
               this.scene.environmentIntensity = 0.7;
          } catch(envError) {
              console.warn("Could not load default environment texture:", envError);
          }


          console.log(`--->>> createScene (${sceneTimestamp}): Initial environment setup complete.`);
      } else {
           console.log(`--->>> createScene (${sceneTimestamp}): Skipping initial environment setup.`);
      }

      console.log(`--->>> createScene (${sceneTimestamp}): Setting up physics (Enabled: ${physicsActuallyEnabled})...`);
      this.havokPlugin = null;
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

    }

      console.log(`--->>> EXIT createScene (${sceneTimestamp})`);
      return this.scene;
  };



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
public setTool(toolName: string | null): void {
    // Check if selectToolInstance is null before trying to use it
    if (toolName === 'select' && !this.selectToolInstance) {
        console.warn(`[ThreeD.setTool] Attempted to enable 'select' tool, but selectToolInstance is null. Tool: ${toolName}, Current Active: ${this.activeTool}`);
        // Optionally, try to re-initialize it if scene and utility layer are ready.
        // This might indicate an issue with initialization order.
        // if (this.scene && this.utilityLayer) {
        //    console.log("[ThreeD.setTool] Attempting to re-initialize SelectTool as it was null.");
        //    this.selectToolInstance = new SelectTool(this, this.scene, this.utilityLayer, this.boundingBoxGizmo, this.positionGizmo);
        // } else {
        //     return; // Cannot proceed
        // }
    }


    if (this.activeTool === toolName && toolName !== null) {
        // console.log(`[ThreeD.setTool] Tool ${toolName} is already active.`);
        return;
    }

    console.log(`[ThreeD.setTool] Switching tool from ${this.activeTool} to ${toolName}`);

    // Disable the current active tool
    if (this.activeTool === 'select' && this.selectToolInstance) {
        console.log(`[ThreeD.setTool] Disabling current SelectTool instance.`);
        this.selectToolInstance.disable();
    }
    // Add logic here for disabling other tools if you add them

    this.activeTool = toolName;

    // Enable the new tool
    if (this.activeTool === 'select' && this.selectToolInstance) {
        console.log(`[ThreeD.setTool] Enabling new SelectTool instance for tool: ${this.activeTool}`);
        this.selectToolInstance.enable();
    } else if (this.activeTool === 'select' && !this.selectToolInstance) {
        console.error(`[ThreeD.setTool] CANNOT ENABLE 'select' tool because selectToolInstance is STILL NULL.`);
    }
    // Add logic here for enabling other tools
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

      this.sceneKeyboardObserver = this.scene.onKeyboardObservable.add((kbInfo) => {
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

      const observer = this.scene.onBeforeRenderObservable.add(() => {

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
      } catch (error) {
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