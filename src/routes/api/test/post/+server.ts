import { error, json } from '@sveltejs/kit';

let allowedOrigin: string = 'http://localhost:5173';
// --- OPTIONS Handler (Handles CORS Preflight) ---
/** @type {import('./$types').RequestHandler} */
export async function OPTIONS({ request }) {

	let whitelistedOrigins = [
		'app://-',
		'https://localhost:5173',
		'https://127.0.0.1:5173',
		'http://localhost:5173',
		'http://127.0.0.1:5173',
	];

	let requestOrigin = request.headers.get('Origin')?.toString();

	if (requestOrigin && whitelistedOrigins.includes(requestOrigin)) {
		allowedOrigin = requestOrigin;
	}
	
	// Optional: You could add logic here to dynamically determine the allowedOrigin
	// based on the incoming request.origin if you need to support multiple origins,
	// but be very careful with security if doing so. A fixed list is often safer.

    let headers = new Headers();

    // Allow the specific origin making the request
    // Crucially, this *must* be the *single origin* you want to allow, not a wildcard
    // if you are dealing with credentials or sensitive data.
    if (requestOrigin === allowedOrigin) {
        headers.set('Access-Control-Allow-Origin', allowedOrigin);
    } else {
         // If the origin doesn't match, you might choose *not* to send CORS headers,
         // effectively denying the preflight. Or handle it as needed.
         // For simplicity here, we still set it if it matches the single defined origin.
         // Consider more robust origin checking if needed.
        console.warn(`Origin mismatch: Request from ${requestOrigin}, Allowed: ${allowedOrigin}`);
        // Decide how to handle mismatch - perhaps return an empty 204 without Allow-* headers
        // or stick to the configured allowedOrigin if you trust your config.
         headers.set('Access-Control-Allow-Origin', allowedOrigin); // Sticking to config for this example
    }


	// Standard CORS preflight headers
	headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); // Add any other methods you support
	headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // IMPORTANT: Add ALL headers the client might send (e.g., 'Authorization' if you use tokens)
    // You could also dynamically echo back Access-Control-Request-Headers:
    // const requestedHeaders = request.headers.get('Access-Control-Request-Headers');
    // if (requestedHeaders) {
    //   headers.set('Access-Control-Allow-Headers', requestedHeaders);
    // }
	headers.set('Access-Control-Max-Age', '86400'); // Cache preflight for 1 day (optional)
    headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'); // Good practice for caching


	// Return a 204 No Content response for successful preflight
	return new Response(null, {
		status: 204,
		headers: headers
	});
}


// --- POST Handler (Handles the actual request) ---
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	let requestBody = {};
	let errorMessage = null;
    let status = 200; // Default success status

	try {
		// Make sure the request has a body and the Content-Type is correct before parsing
        const contentType = request.headers.get('content-type');
		if (contentType && contentType.includes('application/json')) {
            requestBody = await request.json();
            console.log("Received JSON body:", requestBody);
        } else if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
            // Handle form data if needed
             const formData = await request.formData();
             requestBody = Object.fromEntries(formData);
             console.log("Received Form data:", requestBody);
        } else {
             // Handle plain text or other types, or treat as empty/error
             console.log("Received request with Content-Type:", contentType, "- not parsing body as JSON/Form.");
             // Optionally attempt text parsing: requestBody = { text: await request.text() };
        }
	} catch (e) {
		console.error("Error parsing request body:", e);
		errorMessage = "Failed to parse request body.";
        status = 400; // Bad Request
        requestBody = {}; // Clear potentially partial body
	}

	// Your API logic here - process requestBody...
	const responseData = {
		message: errorMessage ? errorMessage : "POST request received successfully",
		originAllowed: allowedOrigin,
        receivedData: requestBody // Echo back parsed data (for example)
	};

    // Prepare headers for the actual response
    const responseHeaders = new Headers({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin, // Crucial for the actual request too!
	    'Vary': 'Origin' // Important for caching proxies
    });

	// Use SvelteKit's json helper for convenience, passing status and headers
	return json(responseData, {
        status: status,
        headers: responseHeaders
    });
}

// --- Optional: Add GET handler if needed ---
/** @type {import('./$types').RequestHandler} */
export async function GET({ request }) {
     // Prepare headers for the GET response
     const responseHeaders = new Headers({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin,
	    'Vary': 'Origin'
    });

    return json({ message: "GET request received", originAllowed: allowedOrigin }, {
        headers: responseHeaders
    });
}
