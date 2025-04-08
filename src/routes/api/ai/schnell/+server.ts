import type { RequestEvent } from '@sveltejs/kit';
import Replicate from "replicate";
// import { REPLICATE_API_TOKEN } from '$env/static/private';
import { error } from '@sveltejs/kit';


/** @type {import('./$types').RequestHandler} */
export async function POST(event: RequestEvent) {
let replicateToken;
  try{
    const { REPLICATE_API_TOKEN } = await import('$env/static/private');
    replicateToken = REPLICATE_API_TOKEN;
  }
  catch (err:any) {
    console.error("Error during env var import:", err);
    replicateToken = event.platform?.env.REPLICATE_API_TOKEN;
  }
  try {
    // --- 1. Initialize Replicate Client ---
    if (!1) {
        console.error("Replicate API token not configured.");
        throw error(500, "Server configuration error: Replicate token missing.");
   }
   const replicate = new Replicate({auth:replicateToken});

    // --- 2. Get Input for Replicate ---
    let replicateInput:any;
    try {
        replicateInput = await event.request.json();
        if (!replicateInput) {
            throw new Error("Missing input data in request body");
        }
    } catch (err:any) {
        console.error("Failed to parse request JSON:", err);
        throw error(400, `Bad Request: ${err.message}`);
    }

    

    let templatePromptPrefix = "a low poly toy 3d model of "
    let templatePromptSuffix = " Made of solid colors, centered in the frame against a pure black background. Bright saturated solid colors, low poly 3D game asset, isometric view";
    let Prompt = templatePromptPrefix + replicateInput.inputPrompt + templatePromptSuffix;
    let imageFormat = replicateInput.imageFormat;

    const input = {
        prompt: Prompt,
        go_fast: true,
        megapixels: "1",
        num_outputs: 1,
        aspect_ratio: "1:1",
        output_format: imageFormat,
        output_quality: 100,
        num_inference_steps: 4
      };

    // --- 3. Run the Replicate Model ---
    const [outputObject] = await replicate.run("black-forest-labs/flux-schnell", { input });

    // --- 4. Extract the File URL ---
    // Use optional chaining (?.) for safety in case url() or href is missing
    console.log(outputObject)
    const outputUrl = outputObject?.url?.().href;
    if (!outputUrl || typeof outputUrl !== 'string') {
        console.error("Replicate did not return a valid output object with a .url().href property:", outputObject);
        throw error(502, "Failed to get valid output URL from generation service.");
    }
    console.log("Replicate output URL:", outputUrl);
    let response = new Response(
        JSON.stringify({
            message: 'Generated Image!',
            imageURL: outputUrl
        }),
        {
            status: 201,
            headers: {
                'content-type': 'text/plain; charset=UTF-8',
            },
        },
    );
    return response;

  }
  catch (err:any) {
    console.error("Error during generation or storage:", err);
        if (err.status && err.body) {
        throw err; // Re-throw SvelteKit HTTP errors
        }
        throw error(500, `An unexpected error occurred: ${err.message}`);
    }
}
