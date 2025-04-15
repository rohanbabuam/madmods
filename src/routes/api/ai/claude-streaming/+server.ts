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

    let system_prompt = `You will assist in designing a detailed 3D game environment for a game idea that will be prompted by the user.`
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
		// Use context.waitUntil to allow the function to return the readable stream
		// immediately while the Anthropic processing happens in the background.
		platform?.context.waitUntil(
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