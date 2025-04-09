import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import HavokPhysics from "@babylonjs/havok";
import '@babylonjs/loaders/glTF'; 
import * as GUI from '@babylonjs/gui'

let scene:any;
let dev:any;



// Helper function to extract extension (same as before)
function getFileExtension(url:string) {
    try {
        const pathname = new URL(url).pathname;
        const parts = pathname.split('.');
        if (parts.length > 1) {
            return parts.pop();
        }
    } catch (e) {
        console.error("Could not parse URL to get extension:", url, e);
    }
    return 'bin'; // Fallback
}

async function generate3D (PostBody:any) {

}

async function generateImage (prop:any) {
    const schnellResult = await fetch('/api/ai/schnell', {
        method: 'POST',
        body: JSON.stringify(prop)
    });
    const schnellResultJSON:any = await schnellResult.json()
    console.log(schnellResultJSON)
    let generatedImageURL = schnellResultJSON.imageURL;
    console.log(generatedImageURL);

    
    // upload generatedImageURL
    let userID = prop.userID;
    let worldID = prop.worldID;
    let propID = prop.propID;
    let fileExtension = prop.imageFormat;
    const r2Key = `worlds/${userID}/${worldID}/props/${propID}.${fileExtension}`;
    
    let uploadObject = {
        'fileURL_ToUpload' : generatedImageURL,
        'r2key' : r2Key
    }


    if (window.location.port === "") {
        dev = false;
    } else {
        dev = true;
    }
    let uploadEndpoint:any;
    if(dev){
        uploadEndpoint = "https://madmods.world/api/storage/upload"
    }else{
        uploadEndpoint = "/api/storage/upload"
    }

    console.log(uploadEndpoint)
    const uploadResult = await fetch(uploadEndpoint, {
        mode: 'cors',
        method: 'POST',
        headers: {
            // VITAL: Tell the server you're sending JSON
            'Content-Type': 'application/json',
            // Add any other necessary headers like Authorization if needed
            // 'Authorization': 'Bearer your_token_here'
        },
        body: JSON.stringify(uploadObject)
    });
    const uploadResultJSON = await uploadResult.json()
    let uploadFileResponse = JSON.stringify(uploadResultJSON);
    console.log(uploadFileResponse);
    
    // generate3D for all uploaded images
    
}

async function parseJsonFromUrl(url:string) {
    try {
      // 1. Fetch the resource from the network
      const response = await fetch(url);
  
      // 2. Check if the request was successful (status code 200-299)
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
      }
  
      // 3. Parse the response body as JSON
      const jsonData = await response.json();
  
      // 4. Return the parsed data
      return jsonData;
  
    } catch (error) {
      // 5. Handle potential errors (network issues, parsing errors, etc.)
      console.error('Failed to fetch or parse JSON:', error);
      // Re-throw the error so the calling code can handle it
      throw error;
    }
}

export const generateImages = async (sceneData:any) => {
    sceneData.forEach( (prop:any, index:number) => {
        if(index == 0){
            // console.log(prop.description);
            let postBody = {
                'inputPrompt':prop.description,
                'userID' : 'testuser',
                'worldID' : 'world1',
                'propID' : prop.name,
                'imageFormat': 'jpg'
            }
            generateImage(postBody);
        }
      });
}


export const loadScene = async (jsonFileUrl:string) => {
    console.log(`Attempting to load scene data from: ${jsonFileUrl}`);
    try {
      const sceneData:any = await parseJsonFromUrl(jsonFileUrl);
      return sceneData;
      //console.log("Scene data loaded successfully:");
      //console.log(sceneData);
    } catch (error:any) {
      console.error("Could not load scene data:", error.message);
      // Handle the error appropriately (e.g., show an error message to the user)
    }
}

export const makeGame = async() => {
    //console.log("babylon init");

    // let canvas:any = document.getElementById('BabylonCanvas');
    // const engine = new BABYLON.WebGPUEngine(canvas);
    // await engine.initAsync();
    // scene = new BABYLON.Scene(engine);

    // CreateScene function that creates and return the scene
    var PopulateWorldFromJSON = async function (jsonURL: string) {
        let camera:any = new BABYLON.ArcRotateCamera("camera1", -Math.PI / 2, Math.PI / 2.5, 10, new BABYLON.Vector3(0, 0, 0));
        scene.activeCamera = camera;
        scene.activeCamera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 10;
        camera.upperRadiusLimit = 20;
        camera.wheelDeltaPercentage = 0.01;
        camera.inputs.attached.mousewheel.detachControl();
        
    
        // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
        let light:any = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
        // Default intensity is 1. Let's dim the light a small amount
        light.intensity = 0.7;

        // Load GLB
        let defaultScene = 0;
        let sceneURL = 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/models/gltf/Village2.glb';
        let SceneLoadPercent = 0.0;
        //let sceneURL = 'https://raw.githubusercontent.com/CedricGuillemet/dump/master/CharController/levelTest.glb'; let defaultScene=1;
        BABYLON.LoadAssetContainerAsync(sceneURL,scene,{'onProgress': async (e)=>{
            SceneLoadPercent = e.loaded/e.total;
            if(SceneLoadPercent >= 1){
                console.log('scene loaded');
        }}})
        .then(async function (container) {
                //container.addAllToScene();
        });

        return scene;
    };
    let World_JsonURL:string = "https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/worlds/testuser/world1/json/world.json"
    // call the createScene function
    //scene = await PopulateWorldFromJSON(World_JsonURL);

    //loadScene(World_JsonURL)

    // run the render loop
    // engine.runRenderLoop(function(){
    //     scene.render();
    // });
    // // the canvas/window resize event handler
    // window.addEventListener('resize', function(){
    //     engine.resize();
    // });
}