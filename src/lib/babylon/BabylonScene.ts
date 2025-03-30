import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import HavokPhysics from "@babylonjs/havok";
import '@babylonjs/loaders/glTF';

export const init = async() => {
    //console.log("babylon init");

    let canvas:any = document.getElementById('BabylonCanvas');

    var engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer: true, stencil: true});
    // CreateScene function that creates and return the scene
    var createScene = async function () {
        // This creates a basic Babylon Scene object (non-mesh)
        let scene:any = new BABYLON.Scene(engine);
    
        //This creates and positions a free camera (non-mesh)
        //let camera:any = new BABYLON.UniversalCamera("camera1", new BABYLON.Vector3(0, 5, -5), scene);
        let camera:any = new BABYLON.ArcRotateCamera("camera1", -Math.PI / 2, Math.PI / 2.5, 25, new BABYLON.Vector3(0, 0, 0));
        scene.activeCamera = camera;
        scene.activeCamera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 10;
        camera.upperRadiusLimit = 20;
        camera.wheelDeltaPercentage = 0.01;

        // Parameters: name, position, scene
        // const camera = new BABYLON.FollowCamera("FollowCam", new BABYLON.Vector3(0, 10, -10), scene);

        // // The goal distance of camera from target
        // camera.radius = 12;

        // camera.lowerRadiusLimit = 8;
        // camera.upperRadiusLimit = 12
        

        // // The goal height of camera above local origin (centre) of target
        // camera.heightOffset = 4;
        // camera.lowerHeightOffsetLimit = 4;
        // camera.upperHeightOffsetLimit = 8;

        // // The goal rotation of camera around local origin (centre) of target in x y plane
        // camera.rotationOffset = 0;

        // // Acceleration of camera in moving from current to goal position
        // camera.cameraAcceleration = 0.01;

        // // The speed at which acceleration is halted
        // camera.maxCameraSpeed = 10;

        // // This attaches the camera to the canvas
        // scene.activeCamera = camera;
        // scene.activeCamera.attachControl(canvas, true);
        ///camera.attachControl(canvas, true);
        
    
        // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
        let light:any = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    
        // Default intensity is 1. Let's dim the light a small amount
        light.intensity = 0.7;
    
        // Initialize Havok plugin
        // initialize the plugin using the HavokPlugin constructor
        const havokInstance = await HavokPhysics();
        const hk = new BABYLON.HavokPlugin(false, havokInstance);
    
        // Enable physics in the scene with a gravity
        scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), hk);
        
        //skybox
        // Import the .env file as a CubeTexture
        const texture = new BABYLON.CubeTexture('https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/textures/equirectangular/sky.env', scene);
        // Create a skybox mesh using this texture
        const skybox = scene.createDefaultSkybox(texture, true, 10000, 0.0);

        // Keyboard events
        let inputMap:any = {};
        scene.actionManager = new BABYLON.ActionManager(scene);
        scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, function (evt) {
            inputMap[evt.sourceEvent.key] = evt.sourceEvent.type == "keydown";
        }));
        scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, function (evt) {
            inputMap[evt.sourceEvent.key] = evt.sourceEvent.type == "keydown";
        }));

        // Load GLB exported from Blender using Physics extension enabled
        let defaultScene = 0;
        let sceneURL = 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/models/gltf/Village2.glb'
        //let sceneURL = 'https://raw.githubusercontent.com/CedricGuillemet/dump/master/CharController/levelTest.glb'; let defaultScene=1;
        BABYLON.ImportMeshAsync(sceneURL, scene).then(async ()=>{
            // Load a texture that will be used as lightmap. This Lightmap was made using this process : https://www.youtube.com/watch?v=Q4Ajd06eTak
            //var lightmap = new BABYLON.Texture("https://raw.githubusercontent.com/CedricGuillemet/dump/master/CharController/lightmap.jpg");
            // Meshes using the lightmap
            scene.meshes.forEach((mesh:any)=>{
                if( 
                    mesh.name.includes('hill') ||
                    mesh.name.includes('rock') || 
                    mesh.name.includes('Road') ||
                    mesh.name.includes('landscape') ||
                    mesh.name.includes('dock') ||
                    mesh.name.includes('props') ||
                    mesh.name.includes('animal') ||
                    mesh.name.includes('bridge') ||
                    mesh.name.includes('foundation')
                ){
                    //console.log(mesh.name);
                    new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH);
                    mesh.isPickable = false;  
                    // mesh.material.lightmapTexture = lightmap;
                    // mesh.material.useLightmapAsShadowmap = true;
                    // mesh.material.lightmapTexture.uAng = Math.PI;
                    // mesh.material.lightmapTexture.level = 1.6;
                    // mesh.material.lightmapTexture.coordiatesIndex = 1;  
                    mesh.freezeWorldMatrix();
                    mesh.doNotSyncBoundingInfo = true;
                }
            })
            var lightmapped = ["level_primitive0", "level_primitive1", "level_primitive2"];
            lightmapped.forEach((meshName)=>{
                let mesh:any = scene.getMeshByName(meshName);
                // Create static physics shape for these particular meshes
                if(mesh){
                    new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH);
                    mesh.isPickable = false;  
                    // mesh.material.lightmapTexture = lightmap;
                    // mesh.material.useLightmapAsShadowmap = true;
                    // mesh.material.lightmapTexture.uAng = Math.PI;
                    // mesh.material.lightmapTexture.level = 1.6;
                    // mesh.material.lightmapTexture.coordinatesIndex = 1;  
                    mesh.freezeWorldMatrix();
                    mesh.doNotSyncBoundingInfo = true;
                }
            });

            if(defaultScene){
                // static physics cubes
                var cubes = ["Cube", "Cube.001", "Cube.002", "Cube.003", "Cube.004", "Cube.005"];
                cubes.forEach((meshName)=>{
                    new BABYLON.PhysicsAggregate(scene.getMeshByName(meshName), BABYLON.PhysicsShapeType.BOX, {mass:0.1});
                });
                // inclined plane
                var planeMesh = scene.getMeshByName("Cube.006");
                planeMesh.scaling.set(0.03,3,1);
                var fixedMass = new BABYLON.PhysicsAggregate(scene.getMeshByName("Cube.007"), BABYLON.PhysicsShapeType.BOX, {mass:0});
                var plane = new BABYLON.PhysicsAggregate(planeMesh, BABYLON.PhysicsShapeType.BOX, {mass:0.1});
        
                // plane joint
                var joint = new BABYLON.HingeConstraint(
                    new BABYLON.Vector3(0.75, 0, 0),
                    new BABYLON.Vector3(-0.25, 0, 0),
                    new BABYLON.Vector3(0, 0, -1),
                    new BABYLON.Vector3(0, 0, 1),
                    scene);
                fixedMass.body.addConstraint(plane.body, joint);
            }
    
            // Player/Character state
            let state:any = "IN_AIR";
            var inAirSpeed = 8.0;
            var onGroundSpeed = 10.0;
            var jumpHeight = 1.5;
            var wantJump = false;
            var inputDirection = new BABYLON.Vector3(0,0,0);
            var forwardLocalSpace = new BABYLON.Vector3(0, 0, 1);
            let characterOrientation = BABYLON.Quaternion.Identity();
            let characterGravity = new BABYLON.Vector3(0, -18, 0);
    
            // Physics shape for the character
            let h = 1.2;
            let r = 0.6;
            //let displayCapsule:any = BABYLON.MeshBuilder.CreateCapsule("CharacterDisplay", {height: h, radius: r}, scene);
            let hero:any, idleAnim:any, runAnim:any, jumpAnim:any;
            
            let characterURL = "https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/characters/Timmy5.glb";
            await BABYLON.ImportMeshAsync(characterURL, scene).then((character:any)=>{
                
                //console.log(character);
                hero = character.meshes[0];
                // let camFocusMesh = BABYLON.MeshBuilder.CreateBox("camFocusBox", { size: 0.5 }, scene);
                // camFocusMesh.parent = hero;
                // camFocusMesh.position.z = 8;
                
                //Lock camera on the character 
                camera.lockedTarget = hero;
                
                //animations
                idleAnim = scene.getAnimationGroupByName("idle");
                runAnim = scene.getAnimationGroupByName("run");
                jumpAnim = scene.getAnimationGroupByName("jump");

                //console.log(idleAnim)
                //idleAnim.weight = 1;
                //idleAnim.play(true);
            });
            

            ////37.69171118982338, _y: -1.5508091676823659, _z: -41.486900655615486
            let characterPosition = new BABYLON.Vector3(26, 1, -92);
            let characterController = new BABYLON.PhysicsCharacterController(characterPosition, {capsuleHeight: h, capsuleRadius: r}, scene);
            //camera.setTarget(characterPosition);
    
            // State handling
            // depending on character state and support, set the new state
            var getNextState = function(supportInfo:any) {
                if (state == "IN_AIR") {
                    if (supportInfo.supportedState == BABYLON.CharacterSupportedState.SUPPORTED) {
                        jumpAnim.stop();
                        return "ON_GROUND";
                    }
                    return "IN_AIR";
                } else if (state == "ON_GROUND") {
                    if (supportInfo.supportedState != BABYLON.CharacterSupportedState.SUPPORTED) {
                        return "IN_AIR";
                    }
    
                    if (wantJump) {
                        jumpAnim.start(true, 1.0, jumpAnim.from, jumpAnim.to, false);
                        return "START_JUMP";
                    }
                    return "ON_GROUND";
                } else if (state == "START_JUMP") {
                    return "IN_AIR";
                }
            }
    
            // From aiming direction and state, compute a desired velocity
            // That velocity depends on current state (in air, on ground, jumping, ...) and surface properties
            var getDesiredVelocity = function(deltaTime:any, supportInfo:any, characterOrientation:any, currentVelocity:any) {
                let nextState = getNextState(supportInfo);
                if (nextState != state) {
                    state = nextState;
                }
    
                let upWorld = characterGravity.normalizeToNew();
                upWorld.scaleInPlace(-1.0);
                let forwardWorld = forwardLocalSpace.applyRotationQuaternion(characterOrientation);
                if (state == "IN_AIR") {
                    let desiredVelocity = inputDirection.scale(inAirSpeed)//.applyRotationQuaternion(characterOrientation);
                    let outputVelocity = characterController.calculateMovement(deltaTime, forwardWorld, upWorld, currentVelocity, BABYLON.Vector3.ZeroReadOnly, desiredVelocity, upWorld);
                    // Restore to original vertical component
                    outputVelocity.addInPlace(upWorld.scale(-outputVelocity.dot(upWorld)));
                    outputVelocity.addInPlace(upWorld.scale(currentVelocity.dot(upWorld)));
                    // Add gravity
                    outputVelocity.addInPlace(characterGravity.scale(deltaTime));
                    return outputVelocity;
                } else if (state == "ON_GROUND") {
                    // Move character relative to the surface we're standing on
                    // Correct input velocity to apply instantly any changes in the velocity of the standing surface and this way
                    // avoid artifacts caused by filtering of the output velocity when standing on moving objects.
                    let desiredVelocity = inputDirection.scale(onGroundSpeed)//.applyRotationQuaternion(characterOrientation);
    
                    let outputVelocity = characterController.calculateMovement(deltaTime, forwardWorld, supportInfo.averageSurfaceNormal, currentVelocity, supportInfo.averageSurfaceVelocity, desiredVelocity, upWorld);
                    //console.log('before projection = ', outputVelocity)
                    // Horizontal projection
                    {
                        outputVelocity.subtractInPlace(supportInfo.averageSurfaceVelocity);
                        let inv1k = 1e-3;
                        if (outputVelocity.dot(upWorld) > inv1k) {
                            let velLen = outputVelocity.length();
                            outputVelocity.normalizeFromLength(velLen);
    
                            // Get the desired length in the horizontal direction
                            let horizLen = velLen / supportInfo.averageSurfaceNormal.dot(upWorld);
    
                            // Re project the velocity onto the horizontal plane
                            let c = supportInfo.averageSurfaceNormal.cross(outputVelocity);
                            outputVelocity = c.cross(upWorld);
                            outputVelocity.scaleInPlace(horizLen);
                        }
                        outputVelocity.addInPlace(supportInfo.averageSurfaceVelocity);
                        //console.log('after projection = ', outputVelocity)
                        return outputVelocity;
                    }
                } else if (state == "START_JUMP") {
                    let u = Math.sqrt(2 * characterGravity.length() * jumpHeight);
                    let curRelVel = currentVelocity.dot(upWorld);
                    return currentVelocity.add(upWorld.scale(u - curRelVel));
                }
                return BABYLON.Vector3.Zero();
            }
            


            var heroRotationSpeed = 0.1;
            var animating = true;
            // Display tick update: compute new camera position/target, update the capsule for the character display
            scene.onBeforeRenderObservable.add((scene:any) => {
                var keydown = false;
                //Manage the movements of the character (e.g. position, direction)
                if (inputMap["w"]) {
                    inputDirection = hero.forward;
                    keydown = true;
                }
                if (inputMap["s"]) {
                    inputDirection = hero.forward.negate();
                    keydown = true;
                }
                if (inputMap["a"]) {
                    //inputDirection.x = 0;
                    hero.rotate(BABYLON.Vector3.Up(), -heroRotationSpeed);
                    keydown = true;
                }
                if (inputMap["d"]) {
                    //inputDirection.x = 0;
                    hero.rotate(BABYLON.Vector3.Up(), heroRotationSpeed);
                    keydown = true;
                }
                if (inputMap[" "]) {
                    //wantJump  = true;
                    keydown = true;
                }

                //Manage animations to be played  
                if (keydown) {
                    if (!animating) {
                        
                        if (inputMap["w"] || inputMap["s"]) {
                            //run
                            animating = true;
                            runAnim.start(true, 1.5, runAnim.from, runAnim.to, false);
                        }
                        else if (inputMap["a"]){
                            //left rotate
                            
                        }
                        else if (inputMap["d"]){
                            //right rotate
                            
                        }
                    }
                }
                else {
                    inputDirection.scaleInPlace(0);
                    //wantJump = false;
                    if (animating) {
                        //Default animation is idle when no key is down     
                        idleAnim.start(true, 1.0, idleAnim.from, idleAnim.to, false);

                        //Stop all animations besides Idle Anim when no key is down
                        runAnim.stop();
                        //jumpAnim.stop();

                        //Ensure animation are played only once per rendering loop
                        animating = false;
                    }
                }
                hero.position.copyFrom(characterController.getPosition());
                hero.position.y -= 0.75;
                if (isMouseDown) {
                    console.log(hero.position)
                }
    
                // camera following
                // var cameraDirection = camera.getDirection(new BABYLON.Vector3(0,0,1));
                // cameraDirection.y = 0;
                // cameraDirection.normalize();
                // camera.setTarget(BABYLON.Vector3.Lerp(camera.getTarget(), hero.position, 0.8));
                // var dist = BABYLON.Vector3.Distance(camera.position, hero.position);
                // const amount = (Math.min(dist - 6, 0) + Math.max(dist - 9, 0)) * 0.04;
                // cameraDirection.scaleAndAddToRef(amount, camera.position);
                // camera.position.y += (hero.position.y + 2 - camera.position.y) * 0.04;
            });
    
            // After physics update, compute and set new velocity, update the character controller state
            scene.onAfterPhysicsObservable.add(() => {
                if (scene.deltaTime == undefined) return;
                let dt = scene.deltaTime / 1000.0;
                if (dt == 0) return;
    
                let down = new BABYLON.Vector3(0, -1, 0);
                let support = characterController.checkSupport(dt, down);
    
                BABYLON.Quaternion.FromEulerAnglesToRef(0,camera.rotation.y, 0, characterOrientation);
                let desiredLinearVelocity = getDesiredVelocity(dt, support, characterOrientation, characterController.getVelocity());
                
                if (inputDirection.z === 0 && inputDirection.x === 0 && state === "ON_GROUND") {       
                    characterController.setVelocity(BABYLON.Vector3.Zero());
                }else{      
                    characterController.setVelocity(desiredLinearVelocity);
                }
                characterController.integrate(dt, support, characterGravity);
            });
    
            // Rotate camera
            // Add a slide vector to rotate arount the character
            let isMouseDown = false;
            scene.onPointerObservable.add((pointerInfo:any) => {
                switch (pointerInfo.type) {
                    case BABYLON.PointerEventTypes.POINTERDOWN:
                        isMouseDown = true;
                        break;
    
                    case BABYLON.PointerEventTypes.POINTERUP:
                        isMouseDown = false;
                        break;
    
                    case BABYLON.PointerEventTypes.POINTERMOVE:
                        if (isMouseDown) {
                            
                            // var tgt = camera.getTarget().clone();
                            // camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Right()).scale(pointerInfo.event.movementX * -0.02));
                            // camera.setTarget(tgt);
                        }
                        break;
                }
            });
            // Input to direction
            // from keys down/up, update the Vector3 inputDirection to match the intended direction. Jump with space
            scene.onKeyboardObservable.add((kbInfo:any) => {
                switch (kbInfo.type) {
                    case BABYLON.KeyboardEventTypes.KEYDOWN:
                        if (kbInfo.event.key == 'w' || kbInfo.event.key == 'ArrowUp') {
                            //inputDirection = hero.forward;
                        } else if (kbInfo.event.key == 's' || kbInfo.event.key == 'ArrowDown') {
                            //inputDirection = hero.forward.negate();
                        } else if (kbInfo.event.key == 'a' || kbInfo.event.key == 'ArrowLeft') {
                            //hero.rotate(BABYLON.Vector3.Up(), -heroRotationSpeed);
                            //inputDirection.x = -1;
                        } else if (kbInfo.event.key == 'd' || kbInfo.event.key == 'ArrowRight') {
                            //inputDirection.x = 1;
                            //hero.rotate(BABYLON.Vector3.Up(), heroRotationSpeed);
                        } else if (kbInfo.event.key == ' ') {
                            wantJump = true;
                        }
                        break;
                    case BABYLON.KeyboardEventTypes.KEYUP:
                        if (kbInfo.event.key == 'w' || kbInfo.event.key == 's' || kbInfo.event.key == 'ArrowUp' || kbInfo.event.key == 'ArrowDown') {
                            //inputDirection.z = 0;
                            //console.log('w released')    
                        }
                        if (kbInfo.event.key == 'a' || kbInfo.event.key == 'd' || kbInfo.event.key == 'ArrowLeft' || kbInfo.event.key == 'ArrowRight') {
                            //inputDirection.x = 0;
                        } else if (kbInfo.event.key == ' ') {
                            wantJump = false;
                        }
                        break;
                }
            });
        });
        
        return scene;
    };
    // call the createScene function
    let scene:any = await createScene();
    // run the render loop
    engine.runRenderLoop(function(){
        scene.render();
    });
    // the canvas/window resize event handler
    window.addEventListener('resize', function(){
        engine.resize();
    });
}