import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';


// --- Helper function to handle OPTIONS requests ---
function handleOptions(request:any, allowedOrigin:any) {
	const headers = request.headers;
	// Check if the request has the required headers for a preflight request
	if (
	  headers.get('Origin') !== null &&
	  headers.get('Access-Control-Request-Method') !== null &&
	  headers.get('Access-Control-Request-Headers') !== null
	) {
	  // Handle CORS preflight requests.
	  // Specify which headers are allowed in requests sent to this endpoint.
	  // '*' is permissive, list specific ones like 'Content-Type, Authorization' for better security.
	  let respHeaders = {
		'Access-Control-Allow-Origin': allowedOrigin,
		'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', // Include methods you want to allow
		'Access-Control-Allow-Headers': headers.get('Access-Control-Request-Headers'), // Echo back the requested headers
		'Access-Control-Max-Age': '86400', // Optional: Cache preflight response for 1 day
		'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers', // Crucial for caching
	  };
  
	  return new Response(null, {
		status: 204, // No Content - standard for successful preflight
		headers: respHeaders,
	  });
	} else {
	  // Handle standard OPTIONS requests that are not preflights.
	  // Or return error if OPTIONS isn't generally supported.
	  return new Response(null, {
		headers: {
		  'Allow': 'POST, GET, OPTIONS', // Inform client of allowed methods
		},
	  });
	}
  }

/** @type {import('./$types').RequestHandler} */
export async function POST(event: RequestEvent) {
	const cacheKey = new Request(event.url.href.toString());

	let whitelistedOrigins = [
		'app://-',
		'https://localhost:5173',
		'https://127.0.0.1:5173',
		'http://localhost:5173',
		'http://127.0.0.1:5173',
	];

	let showOrigin: string = 'http://localhost:5173';

	let requestOrigin = event.request.headers.get('Origin')?.toString();

	if (requestOrigin && whitelistedOrigins.includes(requestOrigin)) {
		showOrigin = requestOrigin;
	}
	// console.log(event.url.href);
	console.log("showOrigin = ", showOrigin);

	// --- Handle CORS Preflight Request ---
	if (event.request.method === 'OPTIONS') {
		return handleOptions(event.request, showOrigin);
	}

	// // --- 1. Check for R2 Binding ---
	// 	if (!event.platform?.env.MADMODS_R2) {
	// 		console.error("R2 binding 'MADMODS_R2' not found.");
	// 		throw error(500, "Server configuration error: R2 bucket not available.");
	// 	}
	// const bucket = event.platform?.env.MADMODS_R2;

	// // --- 2. Get Inputs ---
    // let inputs:any;
    // try {
    //     inputs = await event.request.json();
    //     if (!inputs) {
    //         throw new Error("Missing input data in request body");
    //     }
    // } catch (err:any) {
    //     console.error("Failed to parse request JSON:", err);
    //     throw error(400, `Bad Request: ${err.message}`);
    // }
    // let fileURL_toUpload = inputs.fileURL_ToUpload;
    // let r2key = inputs.r2key;

	// // --- 3. Fetch the File from the URL ---
    // console.log("Fetching file from fileURL...");
    // const fetchResponse = await fetch(fileURL_toUpload);

    // if (!fetchResponse.ok) {
    //     console.error(`Failed to fetch file from ${fileURL_toUpload}. Status: ${fetchResponse.status} ${fetchResponse.statusText}`);
    //     const errorBody = await fetchResponse.text().catch(() => 'Could not read error body');
    //     throw error(502, `Failed to download generated file: ${fetchResponse.statusText}. Body: ${errorBody}`);
    // }

	// // --- 4. Get File Data and Metadata ---
	// const fileData = await fetchResponse.arrayBuffer(); // Get content as ArrayBuffer
	// const contentType = fetchResponse.headers.get('content-type') || 'application/octet-stream';

	return new Response(JSON.stringify("Origin = "+showOrigin), {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': showOrigin,
			vary: showOrigin,
		}
	});
}
