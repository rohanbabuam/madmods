import type { RequestEvent } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private'; // Or use $env/dynamic/private if preferred

// Define the expected request body structure (optional but good practice)
interface RequestBody {
    prompt: string;
    model?: string;
    system?: string;
    max_tokens?: number;
}
export async function POST(event: RequestEvent) {

    let system_prompt = `You will assist in designing a detailed 3D game environment for a game idea that will be prompted by the user. The user prompt will describe the game world and can be anything from a simple & short sentence to a complex and detailed paragraph. Enhance and expand the scope of the user prompt with your creativity.
You need to identify all the 3D props needed to create the 3D game environment and output a well structured JSON that specifies each prop by its name, description and world space transform i.e translation, rotation and scale. Use centimetres for position and scale, and degrees for rotation. Assume that each 3D prop will have its pivot at the center of its bounding box. Specify 3D props as objects and not as parts of objects. Assume that the ground is a flat plane positioned at (0,0,0) and scaled to (1000,1,1000). Don't include the ground plane in the JSON, assume it will be present in the scene by default. It is very important to use centimeters as the units for position and scale. Also, for each listed 3D prop, include all the solid colors as hex codes that will be used for the different parts of the 3D prop.
The description of each prop should include its a descriptive name, color of the different parts of the object in natural language and also pose where applicable. Include hex color codes of the colors as a separate key in each prop section of the json. ex: "colors" : {"orange":<hexcode>, "light purple":<hexcode>}
If you're describing props that may have small complex parts, specify them with very simple shapes. for example, a tree can be described as having its parts top part made from low poly blobs rather than with leaves. Apply the same concept for any prop that can have complex geometry.
If there are multiple types of 3d props belonging to the same category, categorize them by their object type and follow the naming convention - <objectType> followed by hyphen followed by <number>. For example, if there are three types of trees, they should all be listed under trees category and named tree-1, tree-2 and tree-3. Types can even be similar objects with different colors, posses, species, shapes, sizes, varieties of design etc.,
If there are going to be multiple instances of the same 3D prop, specify them as additional transforms under the same prop and not as separate duplicate 3D props. When appropriate, make the instances with variations in rotation and scale so that the 3D environment looks more varied and natural.
None of the 3D props will be animated. Also do not specify any textures for the 3D props, only solid color materials should be used.
The list of 3d props, their various types and number of instances must be extensive and well thought out in order to make the game environment complete in terms of functionality, decoration, aesthetics, fun, and engagement purposes. If the 3D game environment is sparsely populated it will make for a bad experience. The 3D game environment must look well populated and full of fun elements.
here is a sample json format needed. strictly follow this same format.
{
  "metadata": {
    "worldName": <name of world>,
    "timestampUTC": "current utc timestamp",
  },
  "propCategories": {
	"category": {
	  "name": <category_name>,
	  "props":[
		  {
			"name": <propName-1>,
			"description": <description of prop>,
			"colors" : [{<color_name>: <color_hex_code>}, {<color_name>: <color_hex_code>}],
			"transforms": [
			  { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] },
			  { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] }
			  .
			  .
			  .
			]
		  },
		  {
			"name": <propName->",
			"description": <description of prop>,
			"colors" : [{<color_name>: <color_hex_code>}, {<color_name>: <color_hex_code>}],
			"transforms": [
			  { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] }
			  .
			  .
			  .
			]
		  }
		  .
		  .
		  .
		]
	},
	"category": {
	  "name": <category_name>,
	  "props":[
		  {
			"name": <propName-1>,
			"description": "description of prop",
			"colors" : [{<color_name>: <color_hex_code>}],
			"transforms": [
			   { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] }
			   .
			   .
			   .
			]
		  },
		  {
			"name": <propName-2>,
			"description": <description of prop>,
			"colors" : [{<color_name>: <color_hex_code>}, {<color_name>: <color_hex_code>}, {<color_name>: <color_hex_code>}],
			"transforms": [
			  { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] }
			  .
			  .
			  .
			]
		  }
		  .
		  .
		  .
		]
	},
  },
}
Consider player navigability, accessibility to in-game elements, interactions, collisions and overlaps when designing the layout of the 3d environment. Some props may need to overlap in order to achieve the desired effect - grass, bushes etc., for example, or even some solid objects that need to be gorunded with their base extending slightly under the ground plane.
The game uses a low poly stlye with solid colored models.
The game will be for kids aged 6 to 18 years. so make 100% sure that there is strictly no inappropriate content. This is very important.
If in doubt, assume the most sensible approach and continue.
In the output json, include scene level metadata like name of the world and timestamp of creation in UTC. The name of the world should be presentable/marketable and not include words like low-poly, stylized, kid-firendly etc.,
The JSON should be well formed and valid for parsing with code. Do not add comments in the output JSON.

Return only the JSON in your response so that it can be automatically processed. Do not include any additional text.
`
        const { request, platform } = event;
        let Anthropic_API_Key = ANTHROPIC_API_KEY

		// --- 1. Authentication and Input Validation ---
        if(!Anthropic_API_Key){
            if (!platform?.env.ANTHROPIC_API_KEY) {                
                console.error('ANTHROPIC_API_KEY not set in Cloudflare environment variables');
                return new Response('API Key not configured', { status: 500 });
            }
            else{
                Anthropic_API_Key = platform?.env.ANTHROPIC_API_KEY;
            }
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        let requestBody: RequestBody;
        try {
            requestBody = await request.json();
        } catch (e) {
            return new Response('Invalid JSON in request body', { status: 400 });
        }

        const userPrompt = requestBody.prompt;
        if (typeof userPrompt !== 'string' || userPrompt.trim() === '') {
			return new Response('Invalid or missing "prompt" in request body.', { status: 400 });
		}

        // Use provided model or default
        const model = requestBody.model || "claude-3-7-sonnet-20250219"; // Use a powerful model for JSON
        const maxTokens = requestBody.max_tokens || 50000; // Sensible default

        // --- 2. Prompt Engineering (Crucial for JSON Output) ---
		// Instruct Claude explicitly to return *only* the JSON structure.
		const structuredPrompt = `
Generate a scene description based on the following user request.
Output the entire response as a single raw JSON object, without any introductory text, code blocks, or explanations. Adhere strictly to this schema:
{
  "metadata": {
    "worldName": "<name of world, inferred or generic>",
    "timestampUTC": "<current UTC timestamp in ISO format>",
  },
  "propCategories": {
    "<category_name>": {
      "name": "<category_name>",
      "props":[
          {
            "name": "<propName>",
            "description": "<description of prop>",
            "colors" : [{ "<color_name>": "<color_hex_code>" }, ...],
            "transforms": [
              { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] },
              ...
            ]
          },
          ...
        ]
    },
    ...
  }
}

User Request: ${userPrompt}

JSON Output:
{`; // Prime the model

		// --- 3. Initialize Anthropic Client ---
		const anthropic = new Anthropic({
			apiKey: Anthropic_API_Key,
            // You can add other configurations like baseURL if needed
		});

		// --- 4. Set up Cloudflare Streaming ---
		// Create a TransformStream to pipe data from Anthropic to the client.
		const { readable, writable } = new TransformStream();
		const writer = writable.getWriter();
		const textEncoder = new TextEncoder(); // To encode strings into Uint8Array for the stream

		// --- 5. Start Anthropic Stream and Pipe in Background ---
		// Use ctx.waitUntil to allow the function to return the readable stream
		// immediately while the Anthropic processing happens in the background.
		platform?.ctx.waitUntil(
			(async () => {
				try {
                    console.log("Initiating Anthropic stream...");
					// Get the stream iterator from the Anthropic SDK
					const stream = anthropic.messages.stream({
						model: model,
						max_tokens: maxTokens,
						messages: [{ role: 'user', content: structuredPrompt }],
						system: system_prompt,
					});

					// Iterate through the stream events provided by the SDK
                    // The SDK yields different event types. We primarily want 'content_block_delta'.
					for await (const event of stream) {
                        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            const textChunk = event.delta.text;
                            // console.log("Received chunk:", textChunk); // Debugging
							// Write the text chunk received from Anthropic to the writable stream
                            // Oboe.js on the frontend will receive these raw chunks.
                            // Use await here because writer.write() returns a promise that resolves when the chunk is accepted.
							await writer.write(textEncoder.encode(textChunk));
                        } else if (event.type === 'message_start') {
                             console.log("Anthropic Message Start:", event.message.id);
                             // Optional: You could write an opening bracket '{' here if needed,
                             // but priming the prompt is usually better.
                        } else if (event.type === 'message_stop') {
                            console.log("Anthropic Message Stop.");
                        }
                        // You can handle other event types like 'message_delta', 'content_block_start/stop' if needed.
					}
                    console.log("Anthropic stream finished.");

				} catch (err) {
					console.error('Error during Anthropic API stream processing:', err);
                    // Signal an error to the reader side of the TransformStream
                    await writer.abort(`Anthropic streaming error: ${(err as Error).message}`);
				} finally {
					// IMPORTANT: Close the writer when the Anthropic stream is finished or an error occurred.
                    // This signals the end of the stream to the client.
                    try {
                        await writer.close();
                         console.log("Writable stream closed.");
                    } catch (closeErr) {
                        // Might error if already aborted, log it but don't crash
                        console.warn("Error closing writer (might be expected if aborted):", closeErr);
                    }
				}
			})(), // End of async function passed to ctx.waitUntil
		); // End of ctx.waitUntil

		// --- 6. Return the Readable Stream ---
		// Send the readable part of the TransformStream back to the browser immediately.
		// The browser will start receiving data as soon as the background process writes to it.
		return new Response(readable, {
			headers: {
                // CRITICAL: Set Content-Type to application/json so Oboe.js knows how to parse it.
                // Even though we are streaming text chunks, these chunks *form* a JSON object.
				'Content-Type': 'application/json; charset=utf-8',
                'X-Content-Type-Options': 'nosniff', // Good practice security header
                // Optional: Add cache control if appropriate
                // 'Cache-Control': 'no-cache',
			},
		});
}