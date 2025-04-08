import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';



/** @type {import('./$types').RequestHandler} */
export async function POST(event: RequestEvent) {

    // --- 1. Check for R2 Binding ---
    if (event.platform?.env.MADMODS_R2) {
        console.error("R2 binding 'MADMODS_R2' not found.");
        throw error(500, "Server configuration error: R2 bucket not available.");
    }
    const bucket = event.platform?.env.MADMODS_R2;


    // --- 2. Get Inputs ---
    let inputs:any;
    try {
        inputs = await event.request.json();
        if (!inputs) {
            throw new Error("Missing input data in request body");
        }
    } catch (err:any) {
        console.error("Failed to parse request JSON:", err);
        throw error(400, `Bad Request: ${err.message}`);
    }
    let fileURL_toUpload = inputs.fileURL_ToUpload;
    let r2key = inputs.r2key;

    // --- 3. Fetch the File from the URL ---
    console.log("Fetching file from fileURL...");
    const fetchResponse = await fetch(fileURL_toUpload);

    if (!fetchResponse.ok) {
        console.error(`Failed to fetch file from ${fileURL_toUpload}. Status: ${fetchResponse.status} ${fetchResponse.statusText}`);
        const errorBody = await fetchResponse.text().catch(() => 'Could not read error body');
        throw error(502, `Failed to download generated file: ${fetchResponse.statusText}. Body: ${errorBody}`);
    }

    // --- 4. Get File Data and Metadata ---
    const fileData = await fetchResponse.arrayBuffer(); // Get content as ArrayBuffer
    const contentType = fetchResponse.headers.get('content-type') || 'application/octet-stream';

    // --- 5. Generate a Unique Key/Filename for R2 ---
    //const uniqueId = crypto.randomUUID();
    

    // --- 9. Write the File to R2 ---
    console.log(`Uploading file to R2 with key: ${r2key} and Content-Type: ${contentType}`);
    await bucket.put(r2key, fileData, {
            httpMetadata: {
                contentType: contentType,
                // cacheControl: 'public, max-age=31536000', // Optional
            },
            // customMetadata: { ... }, // Optional
    });
    console.log("File successfully uploaded to R2.");

    // --- 10. Return Success Response ---
    let response = new Response(JSON.stringify({
        message: 'File generated and stored successfully!',
        r2Key: r2key,
        publicUrl: `https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/${r2key}` // If applicable
    }),
    {
        status: 201,
        headers: {
            'content-type': 'text/plain; charset=UTF-8',
            'Access-Control-Allow-Origin' : 'http://localhost:5173'
        },
    });

    return response;
}