// src/hooks.server.ts

import type { Handle } from '@sveltejs/kit';

// --- Configuration ---

// Define the list of allowed origins directly in the code
// Ensure these exactly match the client origins (protocol, domain, port if non-standard)
const allowedOrigins: string[] = [
    'app://-',
    'https://localhost:5173',
    'https://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];

// Define allowed methods and headers
const allowedMethods = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
const allowedHeaders = 'Content-Type, Authorization, X-Requested-With'; // Add any other custom headers your frontend sends

// Log the allowed origins on server start (optional, for debugging)
if (allowedOrigins.length > 0) {
    console.info(`[CORS Hook] Allowed Origins (hardcoded): ${allowedOrigins.join(', ')}`);
} else {
    console.warn("[CORS Hook] allowedOrigins array is empty. CORS headers might not be applied correctly.");
}

export const handle: Handle = async ({ event, resolve }) => {
	const requestOrigin:any = event.request.headers.get('Origin');
    let isOriginAllowed = false;

    // Check if the request Origin header is present and is in our allowed list
	if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        isOriginAllowed = true;
	}

	// --- CORS Preflight Handling (OPTIONS Requests) ---
	if (event.request.method === 'OPTIONS') {
		if (isOriginAllowed) {
            // Origin is allowed for OPTIONS request
            const headers = new Headers();
            // Set the specific origin that made the request
			headers.set('Access-Control-Allow-Origin', requestOrigin);
			headers.set('Access-Control-Allow-Methods', allowedMethods);

            // Dynamically allow requested headers
            const requestedHeaders = event.request.headers.get('Access-Control-Request-Headers');
            if (requestedHeaders) {
                 headers.set('Access-Control-Allow-Headers', requestedHeaders);
            } else {
                 headers.set('Access-Control-Allow-Headers', allowedHeaders); // Fallback
            }

            // Optional: Allow credentials
            // headers.set('Access-Control-Allow-Credentials', 'true');
            headers.set('Access-Control-Max-Age', '86400'); // 1 day cache
            headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');

            console.log(`[Hook - OPTIONS] Allowed preflight from ${requestOrigin}`);
			return new Response(null, {
				status: 204, // No Content
				headers: headers
			});
		} else {
            // Origin not allowed or no Origin header for OPTIONS
            console.warn(`[Hook - OPTIONS] Denied preflight from ${requestOrigin || 'N/A'} (Allowed: ${allowedOrigins.join(', ') || 'None'})`);
            return new Response(null, { status: 204 }); // Still 204 is common, just without Allow-*
        }
	}

	// --- Regular Request Handling (Add CORS Headers to Actual Responses) ---

	// Process the actual request
	const response = await resolve(event);

	// Add CORS headers to the actual response IF the origin was allowed
	if (isOriginAllowed) {
        console.log(`[Hook - ${event.request.method}] Adding CORS headers for allowed origin ${requestOrigin}`);
        // Set the specific origin that made the request
		response.headers.set('Access-Control-Allow-Origin', requestOrigin);
        // Optional: Allow credentials
        // response.headers.set('Access-Control-Allow-Credentials', 'true');
        // Optional: Expose headers
        // response.headers.set('Access-Control-Expose-Headers', 'Content-Length, X-My-Custom-Header');
		response.headers.append('Vary', 'Origin'); // Append Origin to Vary header
	} else if (requestOrigin) {
        // Log if Origin header was present but not in the allowed list
        console.warn(`[Hook - ${event.request.method}] Origin ${requestOrigin} not in allowed list. Not adding CORS headers.`);
    }

	return response;
};