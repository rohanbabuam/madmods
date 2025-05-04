import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import { convertToRadians } from "../utils";
import { convertCoordsBlockToCoords, convertShapeBlockToMesh } from "../world";

// --- MODIFIED createCamera Function ---
const createCamera = (
    cameraType: string | null,
    existingCamera: BABYLON.Camera | null, // Can be null
    scene: BABYLON.Scene | null,
    canvas: HTMLElement | null // Use HTMLElement for broader compatibility, or HTMLCanvasElement if specific
): BABYLON.Camera | null => {

    if (!scene) {
        console.error("Cannot create camera: Scene is null.");
        return null;
    }
    if (!canvas) {
         console.error("Cannot create camera: Canvas element is null.");
         return null;
    }

    const effectiveCameraType = cameraType || "ArcRotate"; // Default if null
    let newCamera: BABYLON.Camera; // Declare here

    // --- 1. Handle Existing Camera (if any) ---
    if (existingCamera) {
        console.log(`Handling existing camera (${existingCamera.name} - ${existingCamera.getClassName()})...`);
        // Serialize state BEFORE detaching/disposing

        // Detach control
        try {
            console.log("Detaching control from existing camera...");
            existingCamera.detachControl(); // Use generic detach
        } catch (e) {
             console.warn(`Could not detach control from previous camera: ${e.message}`);
        }

        // Dispose the old camera
        console.log("Disposing existing camera...");
        existingCamera.dispose();
        console.log("Existing camera disposed.");
    } else {
         console.log("No existing camera to handle.");
    }

    // --- 2. Create New Camera ---
    console.log(`Creating new camera of type: ${effectiveCameraType}`);
    try {
        switch (effectiveCameraType) {
            case "ArcRotate":
                newCamera = new BABYLON.ArcRotateCamera(
                    "camera", // Consistent name is useful
                    BABYLON.Tools.ToRadians(-90), // Initial alpha
                    BABYLON.Tools.ToRadians(65),  // Initial beta
                    10,                           // Initial radius
                    new BABYLON.Vector3(0, 1, 0), // Initial target point
                    scene
                );
                // Configure ArcRotate specifics
                (newCamera as BABYLON.ArcRotateCamera).lowerRadiusLimit = 2;
                (newCamera as BABYLON.ArcRotateCamera).upperRadiusLimit = 50;
                (newCamera as BABYLON.ArcRotateCamera).pinchToPanMaxDistance = 0; // Disable pinch-to-pan
                (newCamera as BABYLON.ArcRotateCamera).allowUpsideDown = false;
                (newCamera as BABYLON.ArcRotateCamera).panningSensibility = 1000; // Adjust panning speed if needed
                (newCamera as BABYLON.ArcRotateCamera).wheelPrecision = 50; // Adjust zoom speed

                // Remove multi-touch input safely
                 if (newCamera.inputs && typeof newCamera.inputs.removeByType === 'function') {
                    newCamera.inputs.removeByType("ArcRotateCameraMultiTouchInput");
                 }
                break;

            case "VRDeviceOrientationFreeCamera":
                 // IMPORTANT: Ensure VR libraries/helpers are correctly set up in your project if you use this.
                 // May require additional setup like `scene.createDefaultVRExperience()`
                newCamera = new BABYLON.VRDeviceOrientationFreeCamera("camera", new BABYLON.Vector3(0, 1.6, -3), scene);
                break;

            default:
                 console.warn(`Unsupported camera type "${effectiveCameraType}". Defaulting to ArcRotateCamera.`);
                 // Fallback to ArcRotate
                 newCamera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, new BABYLON.Vector3(0, 1, 0), scene);
                 (newCamera as BABYLON.ArcRotateCamera).lowerRadiusLimit = 2;
                 (newCamera as BABYLON.ArcRotateCamera).upperRadiusLimit = 50;
                 break;
        }

        // --- 3. Attach Control ---
        console.log(`Attaching control to new camera (${newCamera.name})...`);
        newCamera.attachControl(canvas, true); // Attach to the NEW camera
        console.log("Control attached.");

        return newCamera; // Return the newly created camera

    } catch (error) {
        console.error(`Error during camera creation or setup for type ${effectiveCameraType}:`, error);
        return null; // Return null on failure
    }
};

// Move the camera to a new position
const moveCamera = (coordsBlock: CoordsBlock, camera: BABYLON.Camera | null) => {
    if (!camera) { console.warn("moveCamera: Camera is null."); return; } // Null check

    let coords = convertCoordsBlockToCoords(coordsBlock);
    if (coords) {
        // UniversalCamera, FreeCamera, FollowCamera, VR... have a position property
        if ('position' in camera && camera.position instanceof BABYLON.Vector3) {
            camera.position = new BABYLON.Vector3(coords.x, coords.y, coords.z);
        }
        // ArcRotateCamera uses setPosition
        else if (camera instanceof BABYLON.ArcRotateCamera) {
            camera.setPosition(new BABYLON.Vector3(coords.x, coords.y, coords.z));
        } else {
             console.warn(`moveCamera: Don't know how to set position for camera type ${camera.getClassName()}`);
        }
    }
};

// Move the camera along an axis (interpret axis differently for different cameras)
const moveCameraAlong = (axis: string, units: number, camera: BABYLON.Camera | null) => {
    if (!camera) { console.warn("moveCameraAlong: Camera is null."); return; } // Null check

    const radians = convertToRadians(units); // Convert degrees/units to radians if appropriate

    if (camera instanceof BABYLON.ArcRotateCamera) {
        switch (axis.toLowerCase()) {
            case "x": // Interpret X as rotating around Y (alpha)
                camera.alpha += radians; // Adjust alpha for horizontal rotation
                break;
            case "y": // Interpret Y as rotating up/down (beta)
                camera.beta += radians; // Adjust beta for vertical angle
                // Clamp beta to avoid flipping over
                camera.beta = BABYLON.Scalar.Clamp(camera.beta, 0.1, Math.PI - 0.1);
                break;
            case "z": // Interpret Z as zooming in/out (radius)
                // Adjust units appropriately for radius change (might not need radians)
                camera.radius -= units; // Subtract units to move closer, add to move farther
                // Clamp radius if limits are set
                if (camera.lowerRadiusLimit) camera.radius = Math.max(camera.lowerRadiusLimit, camera.radius);
                if (camera.upperRadiusLimit) camera.radius = Math.min(camera.upperRadiusLimit, camera.radius);
                break;
        }
    }
    // For cameras with direct position control (Universal, Free, Follow, VR)
    else if ('position' in camera && camera.position instanceof BABYLON.Vector3) {
        // This moves along GLOBAL axes. Consider local axes if needed (camera.getWorldMatrix().getRow(0/1/2))
        switch (axis.toLowerCase()) {
            case "x":
                camera.position.x += units;
                break;
            case "y":
                camera.position.y += units;
                break;
            case "z":
                camera.position.z += units;
                break;
        }
    } else {
        console.warn(`moveCameraAlong: Don't know how to move camera type ${camera.getClassName()} along axes.`);
    }
};

// Point the camera towards a shape
const pointCameraTowards = (shapeBlock: ShapeBlock, camera: BABYLON.Camera | null, scene: BABYLON.Scene | null) => {
    if (!camera) { console.warn("pointCameraTowards: Camera is null."); return; } // Null check
    if (!scene) { console.warn("pointCameraTowards: Scene is null."); return; } // Null check

    let mesh = convertShapeBlockToMesh(shapeBlock, scene);
    if (mesh) {
        if (camera instanceof BABYLON.FollowCamera) {
            console.log(`Setting FollowCamera lockedTarget to ${mesh.name}`);
            camera.lockedTarget = mesh; // Assign the mesh directly
        }
        else if ('setTarget' in camera && typeof camera.setTarget === 'function') {
            // UniversalCamera, FreeCamera, ArcRotateCamera (though focusOn is better for Arc)
             console.log(`Setting camera target to mesh position: ${mesh.position}`);
             camera.setTarget(mesh.position);
        }
        // Use focusOn specifically for ArcRotate for better framing behavior
        else if (camera instanceof BABYLON.ArcRotateCamera) {
             console.log(`Focusing ArcRotateCamera on mesh ${mesh.name}`);
             camera.focusOn([mesh], true); // true for smooth transition
        } else {
             console.warn(`pointCameraTowards: Camera type ${camera.getClassName()} may not support setting a target.`);
        }
    } else {
        console.warn(`pointCameraTowards: Could not find mesh for shapeBlock "${shapeBlock?.name}"`);
    }
};

// Set the camera distance for relevant cameras
const keepDistanceOf = (units: number, camera: BABYLON.Camera | null) => {
    if (!camera) { console.warn("keepDistanceOf: Camera is null."); return; } // Null check

    if (camera instanceof BABYLON.FollowCamera || camera instanceof BABYLON.ArcRotateCamera) {
         if (units > 0) { // Ensure positive radius
             camera.radius = units;
             console.log(`Set camera radius to ${units}`);
         } else {
              console.warn(`keepDistanceOf: Invalid distance ${units}. Must be positive.`);
         }
    } else {
        console.warn(`keepDistanceOf: Camera type ${camera.getClassName()} does not have a 'radius' property.`);
    }
};

export { createCamera, moveCamera, moveCameraAlong, pointCameraTowards, keepDistanceOf };