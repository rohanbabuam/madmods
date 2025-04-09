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

// Helper function for delaying execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateImage(prop: any, maxRetries = 3, retryDelayMs = 10000): Promise<boolean> {
    let retries = 0;
    let dev = window.location.port !== ""; // Determine dev environment

    while (retries <= maxRetries) {
        let schnellResult: Response | null = null;
        try {
            console.log(`Attempt ${retries + 1}/${maxRetries + 1} to generate image for prop: ${prop.propID}`);
            schnellResult = await fetch('/api/ai/schnell', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }, // Ensure Content-Type header
                body: JSON.stringify(prop)
            });

            // --- Success Case ---
            if (schnellResult.ok) { // Checks for 200-299 status codes
                const schnellResultJSON: any = await schnellResult.json();
                console.log("Schnell API Success:", schnellResultJSON);
                let generatedImageURL = schnellResultJSON.imageURL;

                if (!generatedImageURL) {
                    console.error(`Error: Image URL missing in successful response for prop: ${prop.propID}`);
                    return false; // Indicate failure
                }

                // --- Proceed with Upload ---
                let userID = prop.userID;
                let worldID = prop.worldID;
                let propID = prop.propID;
                let fileExtension = prop.imageFormat || 'jpg'; // Default if not provided
                const r2Key = `worlds/${userID}/${worldID}/props/${propID}.${fileExtension}`;

                let uploadObject = {
                    'fileURL_ToUpload': generatedImageURL,
                    'r2key': r2Key
                };

                let uploadEndpoint: string; // Use string type
                if (dev) {
                    // Assuming your local dev server runs on a specific port and proxies /api
                    // If your dev setup is different, adjust accordingly.
                    // Using relative path is often more robust if proxied correctly.
                     uploadEndpoint = "https://madmods.world/api/storage/upload";
                    // Or if you need absolute for CORS during dev:
                    // uploadEndpoint = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/storage/upload`;
                } else {
                    uploadEndpoint = "/api/storage/upload"; // Production uses relative path
                }

                console.log(`Uploading generated image to: ${uploadEndpoint} with key: ${r2Key}`);
                const uploadResult = await fetch(uploadEndpoint, {
                    // mode: 'cors', // Usually only needed for cross-origin requests in dev if not proxied
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(uploadObject)
                });

                if (!uploadResult.ok) {
                    const errorText = await uploadResult.text();
                    console.error(`Upload failed for prop ${prop.propID}. Status: ${uploadResult.status}. Response: ${errorText}`);
                    return false; // Indicate failure
                }

                const uploadResultJSON = await uploadResult.json();
                console.log(`Upload successful for prop ${prop.propID}:`, JSON.stringify(uploadResultJSON));


                // generate 3D model and upload
                return true; // Indicate success

            // --- Rate Limit Case ---
            } else if (schnellResult.status === 429) {
                console.warn(`Rate limit hit (429) for prop: ${prop.propID}.`);
                retries++;
                if (retries <= maxRetries) {
                    console.log(`Retrying after ${retryDelayMs / 1000} seconds...`);
                    await delay(retryDelayMs);
                    // Continue to the next iteration of the while loop
                } else {
                    console.error(`Max retries (${maxRetries}) exceeded for prop: ${prop.propID} after rate limit.`);
                    return false; // Indicate failure
                }
            // --- Other Error Case ---
            } else {
                const errorText = await schnellResult.text();
                console.error(`Unexpected error from /api/ai/schnell for prop ${prop.propID}. Status: ${schnellResult.status}. Response: ${errorText}`);
                return false; // Indicate failure (don't retry unexpected errors)
            }

        } catch (error) {
            // --- Network/Fetch Error Case ---
            console.error(`Fetch error during generate/upload for prop ${prop.propID}:`, error);
            retries++; // Optionally count fetch errors as retries
            if (retries <= maxRetries) {
                 // Optionally add a smaller delay for network errors before retrying
                const networkErrorRetryDelay = Math.min(retryDelayMs, 5000); // e.g., wait 5s max
                console.log(`Retrying after network error in ${networkErrorRetryDelay / 1000} seconds...`);
                await delay(networkErrorRetryDelay);
                 // Continue to the next iteration
            } else {
                console.error(`Max retries (${maxRetries}) exceeded for prop: ${prop.propID} after fetch error.`);
                return false; // Indicate failure
            }
        }
    }

    // Should only reach here if max retries were exceeded in the loop logic
    console.error(`Failed to generate image for prop ${prop.propID} after all attempts.`);
    return false; // Indicate failure
}

// function generateImagesWithRateLimit(data: any[], ratePerSecond: number) {
//     let currentIndex = 0;
//     const intervalMillis = 1000 / ratePerSecond; // Calculate delay between calls
  
//     console.log(`Starting image generation. Rate: ${ratePerSecond}/sec (${intervalMillis}ms delay). Total items: ${data.length}`);
  
//     // Start an interval timer
//     const intervalId = setInterval(() => {
//         if(currentIndex > 0 ){
//             return;
//         }
//       // Check if we have processed all items
//       if (currentIndex >= data.length) {
//         clearInterval(intervalId); // Stop the interval
//         console.log("Finished processing all scene data.");
//         return; // Exit the callback
//       }
  
//       // Get the current item
//       const prop = data[currentIndex];
  
//       // Prepare the request body
//       const postBody = {
//           'inputPrompt': prop.description,
//           'userID': 'testuser',
//           'worldID': 'world1',
//           'propID': prop.name,
//           'imageFormat': 'jpg'
//       };
  
//       console.log(`Processing index ${currentIndex}: ${prop.name}`);
      
//       // Call the generate image function
//       generateImage(postBody);
  
//       // Move to the next index for the next interval tick
//       currentIndex++;
  
//     }, intervalMillis); // Set the interval delay
  
//   // Return the interval ID in case you want to stop it externally
//   return intervalId;
// }

// Modified generateImagesWithRateLimit using async loop and delay
async function generateImagesWithRateLimit(data: any[], ratePerSecond: number) {
    // Ensure ratePerSecond is positive to avoid division by zero or negative interval
    if (ratePerSecond <= 0) {
        console.error("ratePerSecond must be positive.");
        return;
    }
    const minIntervalMillis = 1000 / ratePerSecond; // Minimum delay between starts of calls

    console.log(`Starting image generation. Target rate: ${ratePerSecond}/sec (min interval: ${minIntervalMillis.toFixed(2)}ms). Total items: ${data.length}`);

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < data.length; i++) {
        const prop = data[i];
        const startTime = Date.now(); // Record start time for this item

        // --- Prepare Body ---
        // It's safer to create the body inside the loop if properties might change,
        // though in this example it seems constant structure based on `prop`.
        const postBody = {
            'inputPrompt': prop.description || `Image for ${prop.name}`, // Add fallback
            'userID': 'testuser', // Replace with actual dynamic user ID
            'worldID': 'world1',  // Replace with actual dynamic world ID
            'propID': prop.name,      // Ensure prop.name is unique and valid as ID part
            'imageFormat': 'jpg'      // Or get from prop if available
        };

        console.log(`[${i + 1}/${data.length}] Processing prop: ${prop.name}`);

        // --- Call generateImage and wait for its completion (including retries) ---
        const success = await generateImage(postBody); // `generateImage` now returns boolean

        if (success) {
            successCount++;
            console.log(`[${i + 1}/${data.length}] Successfully processed prop: ${prop.name}`);
        } else {
            failureCount++;
            console.error(`[${i + 1}/${data.length}] Failed to process prop: ${prop.name}`);
            // Decide if you want to stop on failure:
            // if (!continueOnError) { break; }
        }

        // --- Calculate delay needed to maintain rate ---
        const endTime = Date.now();
        const duration = endTime - startTime;
        const delayNeeded = Math.max(0, minIntervalMillis - duration); // Ensure delay isn't negative

        if (i < data.length - 1) { // Don't delay after the last item
            if (delayNeeded > 0) {
                console.log(`   Operation took ${duration}ms. Waiting ${delayNeeded.toFixed(2)}ms before next call.`);
                await delay(delayNeeded);
            } else {
                console.log(`   Operation took ${duration}ms (>= min interval ${minIntervalMillis.toFixed(2)}ms). Proceeding immediately.`);
                // Optional: Add a tiny delay (e.g., 1ms) to yield event loop if needed
                // await delay(1);
            }
        }
    }

    console.log("--------------------------------------------------");
    console.log("Finished processing all scene data.");
    console.log(`Summary: ${successCount} successful, ${failureCount} failed.`);
    console.log("--------------------------------------------------");
    // No interval ID to return anymore
}

export const generateImages = async (sceneData:any) => {
    generateImagesWithRateLimit(sceneData, 1)
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