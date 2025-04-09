import { corsHeaders } from '$lib/server/corsHeaders';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.request.method !== 'OPTIONS') {
		const response = await resolve(event);
		for (const [key, value] of Object.entries(corsHeaders)) {
			response.headers.set(key, value);
		}
		return response;
	}

	return new Response('ok', { headers: corsHeaders });
};