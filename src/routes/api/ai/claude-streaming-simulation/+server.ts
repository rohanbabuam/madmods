import type { RequestEvent } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private'; // Or use $env/dynamic/private if preferred

// Define the expected request body structure
interface RequestBody {
	prompt: string;
	reuseJSON?: string; // Optional URL for JSON reuse
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

// Define states for the comment/string parser (Only used for Claude stream)
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

	// --- 1. Validate Request Method ---
	if (request.method !== 'POST') {
		return createErrorResponse('Method not allowed. Use POST.', 405);
	}

	// --- 2. Parse and Validate Request Body ---
	let requestBody: RequestBody;
	try {
		requestBody = await request.json();
	} catch (e) {
		return createErrorResponse(`Invalid JSON in request body: ${(e as Error).message}`, 400);
	}

    // Basic prompt validation (still needed even if reusing JSON later)
    const userPrompt = requestBody.prompt;
    if (typeof userPrompt !== 'string' || userPrompt.trim() === '') {
        return createErrorResponse(
            'Invalid or missing "prompt" (string) in request body.',
            400
        );
    }

	// --- 3. Check for JSON Reuse ---
	if (requestBody.reuseJSON && requestBody.reuseJSON.trim() !== '') {
		const reuseUrl = requestBody.reuseJSON.trim();
		console.log(`Attempting to reuse JSON from: ${reuseUrl}`);

		try {
			// Validate URL format superficially
			new URL(reuseUrl);
		} catch (_) {
			return createErrorResponse(`Invalid URL format provided for 'reuseJSON'.`, 400);
		}

		try {
			// Fetch the JSON from the specified URL
			const fetchResponse = await fetch(reuseUrl, {
                headers: { 'Accept': 'application/json' } // Indicate we prefer JSON
            });

			if (!fetchResponse.ok) {
				const errorText = await fetchResponse.text().catch(() => 'Could not read error body');
				console.error(`Failed to fetch reuseJSON URL. Status: ${fetchResponse.status}. Body: ${errorText}`);
				return createErrorResponse(
					`Failed to fetch JSON from reuse URL: ${fetchResponse.status} ${fetchResponse.statusText}`,
					502 // Bad Gateway seems appropriate
				);
			}

            // Check content type (optional but good practice)
            const contentType = fetchResponse.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                 console.warn(`Warning: Fetched reuseJSON URL (${reuseUrl}) did not return Content-Type 'application/json'. Content-Type was: ${contentType}`);
                 // Continue anyway, but log a warning
            }

			// Get the readable stream from the response body
			const fetchedStream = fetchResponse.body;

			if (!fetchedStream) {
				return createErrorResponse('Failed to get readable stream from fetched JSON response.', 500);
			}

			// Stream the fetched content directly back to the client
			console.log(`Streaming fetched JSON content from ${reuseUrl} back to client.`);
			return new Response(fetchedStream, {
				headers: {
                    'Content-Type': 'application/json; charset=utf-8', // Assume fetched content is valid JSON
                    'X-Content-Type-Options': 'nosniff'
                },
			});

		} catch (err) {
            const errorMsg = `Network or processing error fetching/streaming reuseJSON URL (${reuseUrl}): ${(err as Error).message}`;
			console.error(errorMsg, err);
			return createErrorResponse(errorMsg, 502); // Use 502 for upstream fetch errors
		}
	}

	// --- If not reusing JSON, proceed with Claude ---
	console.log("Reuse JSON URL not provided or empty. Proceeding with Claude generation.");

	// --- 4. Get API Key ---
	const apiKey = platform?.env?.ANTHROPIC_API_KEY || ANTHROPIC_API_KEY;
	if (!apiKey) {
		const errorMsg = 'ANTHROPIC_API_KEY is not configured in environment variables.';
		console.error(errorMsg); // Log server-side
		return createErrorResponse(errorMsg, 500);
	}

	// --- 5. Prepare Anthropic Request Details ---
	const model = requestBody.model || 'claude-3-sonnet-20240229'; // Updated model name
	const maxTokens = requestBody.max_tokens || 4096; // Ensure this is appropriate for the model

	let system_prompt = requestBody.system || `You are a helpful assistant designed to output structured JSON. You will assist in designing a detailed 3D game environment based on the user's prompt. Ensure the output is a single, valid JSON object starting with { and ending with }. Do not include any text before the opening { or after the closing }. Remove all comments from the JSON output. The JSON should contain a 'metadata' object and a 'propCategories' array, where each category has a 'props' array of prop objects (each with at least a 'name').`;
    // Note: Removed redundant method check from original code

	// --- 6. Initialize Anthropic Client ---
	const anthropic = new Anthropic({
		apiKey: apiKey,
		// You can add other configurations like baseURL if needed
	});

	// --- 7. Set up Cloudflare Streaming ---
	// Create a TransformStream to pipe data from Anthropic to the client.
	const { readable, writable } = new TransformStream();
	const writer = writable.getWriter();
	const textEncoder = new TextEncoder(); // To encode strings into Uint8Array for the stream

	// --- 8. Initiate Anthropic Stream and Pipe in Background (with JSON Filtering) ---
	if (!platform?.context) {
		const errorMsg =
			'Cloudflare platform context (platform.context) not available. Cannot use waitUntil for background streaming.';
		console.error(errorMsg);
		return createErrorResponse(errorMsg, 500);
	}

	let stream: Anthropic.Messages.MessageStream;
	try {
		console.log('Attempting to initiate Anthropic stream...');
		stream = anthropic.messages.stream({
			model,
			max_tokens: maxTokens,
			messages: [{ role: 'user', content: userPrompt }],
			system: system_prompt,
		});
		console.log('Anthropic stream object created.');
	} catch (err) {
		const errorMsg = `Error initiating Anthropic stream: ${(err as Error).message}`;
		console.error(errorMsg, err);
		return createErrorResponse(errorMsg, 502); // Indicate issue communicating with Anthropic
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
								console.log('JSON parsing started.');
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
										outputChar = char; // Keep newline for potential JSON structure validity
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
								// Only track braces outside strings to ensure correctness
								if (parserState !== 'IN_STRING' && parserState !== 'IN_STRING_ESCAPE') {
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
                            // console.log("Writing filtered chunk, brace:", braceLevel, "state:", parserState, "chunk:", filteredOutput); // Debug logging
							await writer.write(textEncoder.encode(filteredOutput));
						}

						// 5. Check if JSON object ended cleanly based on brace level and parser state
                        // Crucial: Must be in DEFAULT state AND brace level must be 0
						if (jsonStarted && braceLevel === 0 && parserState === 'DEFAULT') {
							console.log(
								'Detected JSON end (brace level 0, default state). Stopping stream processing.'
							);
							streamFinishedNaturally = true;
                            try { await writer.close(); console.log("Writable stream closed after filtered JSON end."); }
                            catch(closeErr) { console.warn("Error closing writer after JSON end:", closeErr); }
							return; // Exit the async function cleanly
						}

						// Safety check for negative brace level
						if (braceLevel < 0 && parserState === 'DEFAULT') {
							console.warn(
								'Warning: Brace level went negative outside string. JSON may be invalid.'
							);
                            // Optional: could choose to abort here if strict validation is needed
						}
					} else if (event.type === 'message_start') {
						console.log('Stream event: message_start');
					} else if (event.type === 'message_stop') {
						console.log('Stream event: message_stop. Natural end of Claude stream.');
						streamFinishedNaturally = true;
                        // Don't close the writer here yet, wait for the loop exit checks
					} else if (event.type === 'error') {
						const errorMsg = `Anthropic stream error event: ${event.error?.message || 'Unknown stream error'}`;
						console.error(errorMsg, event.error);
                        try { await writer.abort(errorMsg); console.log("Writable stream aborted due to Anthropic error event."); }
                        catch (abortErr) { console.warn("Error aborting writer on Anthropic error:", abortErr); }
						return; // Stop processing on stream error
					}
				} // End for await...of loop

				// --- After the loop finishes ---
				console.log('Anthropic stream processing loop completed.');
                // If the stream ended naturally (message_stop or loop finished), check final state
				if (streamFinishedNaturally) {
                     if (!jsonStarted) {
                        throw new Error("Stream finished naturally, but JSON start ('{') was never found.");
                    } else if (braceLevel === 0 && parserState === 'DEFAULT') {
                        // This can happen if the last chunk ended perfectly or if message_stop occurred right after
                        console.log("Stream finished naturally at JSON end. Closing writer.");
                        try { await writer.close(); console.log("Writable stream closed (natural end, brace 0)."); }
                        catch(closeErr) { console.warn("Error closing writer at natural end:", closeErr); }
                    } else {
                         // JSON is incomplete or state is wrong
                        console.warn(`Stream finished naturally, but JSON appears incomplete or state invalid (brace: ${braceLevel}, state: ${parserState}). Closing writer.`);
                        try { await writer.close(); console.log("Writable stream closed (incomplete/invalid state)."); } // Close normally, client parser will fail
                        catch(closeErr) { console.warn("Error closing writer on incomplete JSON:", closeErr); }
                    }
                } else if (jsonStarted && braceLevel === 0 && parserState === 'DEFAULT') {
                     // This case handles if the stream terminated unexpectedly *exactly* at JSON end
                     console.log("Stream terminated unexpectedly exactly at JSON end. Closing writer.");
                     try { await writer.close(); console.log("Writable stream closed (unexpected termination at end)."); }
                     catch(closeErr) { console.warn("Error closing writer on unexpected termination:", closeErr); }
                }
                // If we reach here and streamFinishedNaturally is false, it implies an unexpected termination
                // or an error not caught by the 'error' event type. Aborting might be safer.
                else if (!streamFinishedNaturally) {
                    const reason = `Stream terminated unexpectedly (brace: ${braceLevel}, state: ${parserState}).`;
                    console.warn(reason);
                    try { await writer.abort(reason); console.log("Writable stream aborted (unexpected termination)."); }
                    catch (abortErr) { console.warn("Error aborting writer on unexpected termination:", abortErr); }
                }


			} catch (err) {
				const errorMsg = `Error during stream processing/filtering: ${(err as Error).message}`;
				console.error(errorMsg, err);
				try {
					await writer.abort(errorMsg);
					console.log('Writable stream aborted due to processing error.');
				} catch (abortErr) {
					console.warn('Error aborting writer after processing error:', abortErr);
				}
			}
		})() // End of async function passed to waitUntil
	); // End of waitUntil

	// --- 9. Return the Readable Stream Immediately ---
	console.log('Returning readable stream response to client (Claude).');
	return new Response(readable, {
		headers: {
            'Content-Type': 'application/json; charset=utf-8', // We are filtering to be JSON
            'X-Content-Type-Options': 'nosniff'
        },
	});
}