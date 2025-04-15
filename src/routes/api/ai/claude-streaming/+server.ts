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

// Helper to create JSON error responses
function createErrorResponse(message: string, status: number): Response {
	return new Response(JSON.stringify({ error: message }), {
		status: status,
		headers: { 'Content-Type': 'application/json' },
	});
}

// Define states for the comment/string parser
type ParserState =
    | 'DEFAULT' // Outside strings/comments
    | 'IN_STRING' // Inside "..."
    | 'IN_STRING_ESCAPE' // Just saw \ inside a string
    | 'SEEN_SLASH' // Just saw /
    | 'IN_SINGLE_LINE_COMMENT' // Inside //...
    | 'IN_MULTI_LINE_COMMENT' // Inside /*...*/
    | 'IN_MULTI_LINE_COMMENT_SEEN_ASTERISK'; // Inside /*...*/ and just saw *

export async function POST(event: RequestEvent) {
    const { request, platform } = event;

	// --- 1. Get API Key ---
	const apiKey = platform?.env?.ANTHROPIC_API_KEY || ANTHROPIC_API_KEY;
	if (!apiKey) {
		const errorMsg = 'ANTHROPIC_API_KEY is not configured in environment variables.';
		console.error(errorMsg); // Log server-side
		return createErrorResponse(errorMsg, 500);
	}

	// --- 2. Validate Request Method ---
	if (request.method !== 'POST') {
		return createErrorResponse('Method not allowed. Use POST.', 405);
	}

	// --- 3. Parse and Validate Request Body ---
	let requestBody: RequestBody;
	try {
		requestBody = await request.json();
	} catch (e) {
		return createErrorResponse(
			`Invalid JSON in request body: ${(e as Error).message}`,
			400
		);
	}

	// --- 4. Prepare Anthropic Request Details ---
	const model = requestBody.model || 'claude-3-7-sonnet-20250219'; // Opus recommended for JSON
	const maxTokens = requestBody.max_tokens || 50000;
    const userPrompt = requestBody.prompt;
    if (typeof userPrompt !== 'string' || userPrompt.trim() === '') {
        return createErrorResponse(
            'Invalid or missing "prompt" (string) in request body.',
            400
        );
    }

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

Return only the JSON in your response so that it can be automatically processed. Do not include any additional text. Output ONLY the raw JSON object requested. Do NOT include any introductory text, explanations, apologies, conversation, or markdown code blocks like \`\`\`json or \`\`\`. Your entire response must start directly with '{' and end directly with '}'. Adhere strictly to the JSON schema provided in the user prompt. DO NOT include any comments within the body of the json because it will cause failures in my downstream applicaitons.
`
    if (request.method !== 'POST') {
        return createErrorResponse('Method not allowed. Use POST.', 405);
    }



		// --- 2. Initialize Anthropic Client ---
		const anthropic = new Anthropic({
			apiKey: apiKey,
            // You can add other configurations like baseURL if needed
		});

		// --- 3. Set up Cloudflare Streaming ---
		// Create a TransformStream to pipe data from Anthropic to the client.
		const { readable, writable } = new TransformStream();
		const writer = writable.getWriter();
		const textEncoder = new TextEncoder(); // To encode strings into Uint8Array for the stream

		// --- 8. Initiate Anthropic Stream and Pipe in Background (with JSON Filtering) ---
	if (!platform?.context) {
        const errorMsg = "Cloudflare platform context (platform.context) not available. Cannot use waitUntil for background streaming.";
        console.error(errorMsg);
        return createErrorResponse(errorMsg, 500);
	}

    let stream:any;
    try {
        console.log("Attempting to initiate Anthropic stream...");
        stream = anthropic.messages.stream({ 
            model, max_tokens: maxTokens, 
            messages: [{ role: 'user', content: userPrompt }], 
            system: system_prompt 
        });
        console.log("Anthropic stream object created.");
    } catch (err) {
        const errorMsg = `Error initiating Anthropic stream: ${(err as Error).message}`;
		console.error(errorMsg, err);
        return createErrorResponse(errorMsg, 502);
    }
    platform.context.waitUntil(
		(async () => {
            let jsonStarted = false;
            let braceLevel = 0;
            let streamFinishedNaturally = false;
            let parserState: ParserState = 'DEFAULT'; // State persists across chunks

			try {
				console.log('Background stream processing started (with JSON/comment filtering)...');
				for await (const event of stream) {
					if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
						let rawChunk = event.delta.text;
                        let chunkToFilter = '';

                        // 1. Find JSON start if not already found
                        if (!jsonStarted) {
                            const startIndex = rawChunk.indexOf('{');
                            if (startIndex !== -1) {
                                jsonStarted = true;
                                console.log("JSON parsing started.");
                                chunkToFilter = rawChunk.substring(startIndex); // Process from '{' onwards
                            } else {
                                continue; // Discard chunk if JSON hasn't started
                            }
                        } else {
                            chunkToFilter = rawChunk; // Process the whole chunk
                        }

                        // 2. Filter comments and track state character by character
                        let filteredOutput = ''; // Chars to be written for *this* chunk
                        for (const char of chunkToFilter) {
                            let outputChar = ''; // Character to potentially add to filteredOutput

                            switch (parserState) {
                                case 'DEFAULT':
                                    if (char === '"') {
                                        outputChar = char;
                                        parserState = 'IN_STRING';
                                    } else if (char === '/') {
                                        parserState = 'SEEN_SLASH';
                                        // Don't output yet, wait for next char
                                    } else {
                                        outputChar = char; // Output other chars directly
                                    }
                                    break;

                                case 'IN_STRING':
                                    outputChar = char; // Output char within string
                                    if (char === '"') {
                                        parserState = 'DEFAULT';
                                    } else if (char === '\\') {
                                        parserState = 'IN_STRING_ESCAPE';
                                    }
                                    break;

                                case 'IN_STRING_ESCAPE':
                                    outputChar = char; // Output the escaped character
                                    parserState = 'IN_STRING'; // Go back to normal string state
                                    break;

                                case 'SEEN_SLASH':
                                    if (char === '/') {
                                        parserState = 'IN_SINGLE_LINE_COMMENT';
                                    } else if (char === '*') {
                                        parserState = 'IN_MULTI_LINE_COMMENT';
                                    } else {
                                        // It wasn't a comment start, output the stored '/' and current char
                                        outputChar = '/' + char;
                                        parserState = 'DEFAULT';
                                    }
                                    break;

                                case 'IN_SINGLE_LINE_COMMENT':
                                    if (char === '\n' || char === '\r') {
                                        outputChar = char; // Keep newline for JSON validity
                                        parserState = 'DEFAULT';
                                    }
                                    // Else: discard character in single-line comment
                                    break;

                                case 'IN_MULTI_LINE_COMMENT':
                                    if (char === '*') {
                                        parserState = 'IN_MULTI_LINE_COMMENT_SEEN_ASTERISK';
                                    }
                                    // Else: discard character
                                    break;

                                case 'IN_MULTI_LINE_COMMENT_SEEN_ASTERISK':
                                    if (char === '/') {
                                        parserState = 'DEFAULT'; // End of comment
                                    } else if (char !== '*') {
                                        // It wasn't '*/', go back to normal multi-line state
                                        parserState = 'IN_MULTI_LINE_COMMENT';
                                    }
                                    // Else: still seeing '*', stay in this state
                                    break;
                            } // End switch

                            // Add the character if it wasn't filtered out
                            if (outputChar) {
                                filteredOutput += outputChar;

                                // 3. Track brace level using ONLY the filtered characters
                                if (parserState !== 'IN_STRING') { // Don't count braces inside strings
                                    if (outputChar === '{') {
                                        braceLevel++;
                                    } else if (outputChar === '}') {
                                        braceLevel--;
                                    }
                                }
                            }
                        } // End character loop for the chunk

                        // 4. Write the filtered output for this chunk
                        if (filteredOutput.length > 0) {
                            // console.log("Writing filtered chunk, brace:", braceLevel, "state:", parserState);
                            await writer.write(textEncoder.encode(filteredOutput));
                        }

                        // 5. Check if JSON object ended cleanly
                        if (jsonStarted && braceLevel === 0 && parserState === 'DEFAULT') {
                            console.log("Detected JSON end (brace level 0, default state). Stopping stream processing.");
                            streamFinishedNaturally = true;
                            await writer.close();
                            console.log("Writable stream closed after filtered JSON end.");
                            return; // Exit the async function cleanly
                        }

                         // Safety check for negative brace level
                        if (braceLevel < 0 && parserState === 'DEFAULT') {
                            console.warn("Warning: Brace level went negative outside string. JSON may be invalid.");
                        }

					} else if (event.type === 'message_start') {
						console.log('Stream event: message_start');
					} else if (event.type === 'message_stop') {
						console.log('Stream event: message_stop. Natural end of Claude stream.');
                        streamFinishedNaturally = true;
					} else if (event.type === 'error') {
                        const errorMsg = `Anthropic stream error event: ${event.error?.message || 'Unknown stream error'}`;
                        console.error(errorMsg, event.error);
                        await writer.abort(errorMsg);
                        return;
                    }
				} // End for await...of loop

                // --- After the loop finishes ---
                console.log('Anthropic stream processing loop completed.');
                if (!streamFinishedNaturally && jsonStarted && braceLevel === 0 && parserState === 'DEFAULT') {
                     // This might happen if the last chunk perfectly ended the JSON
                    console.log("Stream loop finished exactly at JSON end. Closing writer.");
                    await writer.close();
                    console.log("Writable stream closed (loop end, brace 0).");
                } else if (!jsonStarted) {
                    throw new Error("Stream finished, but JSON start ('{') was never found.");
                } else if (braceLevel > 0) {
                    console.warn(`Stream finished, but JSON appears incomplete (brace level: ${braceLevel}, state: ${parserState}). Closing stream anyway.`);
                    await writer.close();
                    console.log("Writable stream closed (incomplete JSON).");
                } else {
                     // Includes case where braceLevel is 0 but we are stuck in a comment/string state
                     console.warn(`Stream finished in unexpected state (brace: ${braceLevel}, state: ${parserState}). Closing writer.`);
                     await writer.close();
                }

			} catch (err) {
                const errorMsg = `Error during stream processing/filtering: ${(err as Error).message}`;
				console.error(errorMsg, err);
                try { await writer.abort(errorMsg); console.log("Writable stream aborted due to error."); }
                catch (abortErr) { console.warn("Error aborting writer:", abortErr); }
			}
		})() // End of async function passed to waitUntil
	); // End of waitUntil

	// --- 9. Return the Readable Stream Immediately ---
	console.log("Returning readable stream response to client.");
	return new Response(readable, {
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
	});
}