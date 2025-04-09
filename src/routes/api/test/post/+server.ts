import { error, json } from '@sveltejs/kit';

// NO MORE OPTIONS HANDLER NEEDED HERE for CORS preflight

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
    let requestBody = {};
    let status = 200;
    let errorMessage = null;

    try {
        // Make sure Content-Type is correct before parsing
        const contentType = request.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            requestBody = await request.json();
        } else {
             // Handle other content types or error
             errorMessage = "Invalid Content-Type";
             status = 415; // Unsupported Media Type
        }
    } catch (e) {
        console.error("Error parsing request body:", e);
        errorMessage = "Failed to parse request body.";
        status = 400; // Bad Request
    }

    // Your API logic...
    const responseData = {
        message: errorMessage ? errorMessage : "POST request received successfully",
        // NO 'originAllowed' needed here unless your logic uses it
        receivedData: errorMessage ? null : requestBody
    };

    // Just return the JSON data and status.
    // NO need to set Access-Control-Allow-Origin here anymore!
    return json(responseData, { status: status });
}

