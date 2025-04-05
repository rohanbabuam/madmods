import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import HavokPhysics from "@babylonjs/havok";
import '@babylonjs/loaders/glTF'; 
import * as GUI from '@babylonjs/gui'
import { GridMaterial } from '@babylonjs/materials/Grid';

export const init = async() => {
    //console.log("babylon init");

    let canvas:any = document.getElementById('BabylonCanvas');

    //var engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer: true, stencil: true});
    const engine = new BABYLON.WebGPUEngine(canvas);
    await engine.initAsync();
    
    // CreateScene function that creates and return the scene
    var createScene = async function () {
        // This creates a basic Babylon Scene object (non-mesh)
        let scene:any = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0,0,0,0);

        var groundMaterial = new GridMaterial("groundMaterial", scene);
        groundMaterial.majorUnitFrequency = 40;
        groundMaterial.minorUnitVisibility = 0.5;
        groundMaterial.gridRatio = 4;
        groundMaterial.opacity = 0.05;
        groundMaterial.useMaxLine = true;
    
        var ground = BABYLON.MeshBuilder.CreateGround("ground", {width: 1000, height: 1000}, scene);
        ground.material = groundMaterial;

        //This creates and positions a free camera (non-mesh)
        //let camera:any = new BABYLON.UniversalCamera("camera1", new BABYLON.Vector3(0, 5, -5), scene);
        let camera:any = new BABYLON.ArcRotateCamera("camera1", -Math.PI / 2, Math.PI / 2.5, 10, new BABYLON.Vector3(0, 0, 0));
        scene.activeCamera = camera;
        scene.activeCamera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 1;
        camera.upperRadiusLimit = 20;
        camera.wheelDeltaPercentage = 0.01;
        // camera.alpha = -4.16;
        camera.beta = 1.5;
        camera.radius = 4;
        // camera.position.x = -1.8
        // camera.position.y = 2.5
        // camera.position.z = - 5;
        //camera.setTarget(new BABYLON.Vector3(.12, 1.44, 2.05));
        //camera.inputs.attached.mousewheel.detachControl();

        
    
        // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
        let light:any = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);

        let avatarURL = "https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/characters/Timmy5.glb";
        BABYLON.LoadAssetContainerAsync(avatarURL,scene,
        {'onProgress': async (e)=>{

        }})
        .then(async function (container) {
            container.addAllToScene();
            let hero = scene.meshes[1];
            const box = BABYLON.MeshBuilder.CreateBox("box", {height: 0.2, width: 0.2, depth: 0.2}, scene);
            box.setParent(hero);
            box.position.y = 1.3;
            box.position.x = -1;
            box.scaling.x=0;
            box.scaling.y=0;
            box.scaling.z=0;
            camera.lockedTarget = box;
            //hero.rotation.x = Math.PI/4;
            hero.rotate(BABYLON.Vector3.Up(), -Math.PI / 1.2);
            hero.position.z = 0;
            hero.position.x = 0;
            console.log(hero)

            //new BABYLON.AxesViewer(scene, 5);
            //animations
            let idleAnim = scene.getAnimationGroupByName("idle");
            let runAnim = scene.getAnimationGroupByName("run");
            let jumpAnim = scene.getAnimationGroupByName("jump");
            //jumpAnim.play();
            idleAnim.start(true, 1.0, idleAnim.from, idleAnim.to, false);
        });
    
        // Default intensity is 1. Let's dim the light a small amount
        light.intensity = 0.7;
    
        let isMouseDown = false;
        scene.onPointerObservable.add((pointerInfo:any) => {
            switch (pointerInfo.type) {
                case BABYLON.PointerEventTypes.POINTERDOWN:
                    isMouseDown = true;
                    break;
    
                case BABYLON.PointerEventTypes.POINTERUP:
                    isMouseDown = false;
                    console.log(camera)
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