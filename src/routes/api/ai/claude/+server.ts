// src/routes/api/anthropic/+server.ts
import { json, error } from '@sveltejs/kit';
import { ANTHROPIC_API_KEY } from '$env/static/private'; // Or use $env/dynamic/private if preferred

export async function POST({ request }) {
	try {
		if (!ANTHROPIC_API_KEY) {
			throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
		}

		const requestBody:any = await request.json();
		const userPrompt = requestBody.prompt;
		const systemPrompt = requestBody.system || 'You are a helpful assistant.'; // Allow passing system prompt or use default

		if (typeof userPrompt !== 'string' || userPrompt.trim() === '') {
			return error(400, 'Invalid or missing prompt in request body.');
		}

		// Call the Anthropic API from the server
		const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
            // Note: The URL and structure might differ slightly based on which Anthropic API you use
            // The original example used 'experimental/templatize_prompt', let's use the standard 'messages' endpoint
			method: 'POST',
			headers: {
				'x-api-key': ANTHROPIC_API_KEY,
				'anthropic-version': '2023-06-01', // Use a recent version
				'content-type': 'application/json'
			},
			body: JSON.stringify({
                model: "claude-3-7-sonnet-20250219", // Choose your preferred model
                max_tokens: 50000, // Adjust as needed
				messages: [{ role: 'user', content: userPrompt }],
                system: systemPrompt
			})
		});

		// Check if the Anthropic API call was successful
		if (!anthropicResponse.ok) {
			const errorBody = await anthropicResponse.text(); // Get raw error response
			console.error(`Anthropic API Error ${anthropicResponse.status}: ${errorBody}`);
			return error(anthropicResponse.status, `Anthropic API error: ${errorBody}`);
		}

		const anthropicData = await anthropicResponse.json();
		return json(anthropicData);

	} catch (err) {
		console.error('Error processing Anthropic request:', err);
		return error(500, `Internal server error: ${(err as Error).message}`);
	}
}