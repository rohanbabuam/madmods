import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function POST(event: RequestEvent) {

    // --- 1. Check for R2 Binding ---
    if (!event.platform?.env.MADMODS_R2) {
        console.error("R2 binding 'MADMODS_R2' not found.");
        throw error(500, "Server configuration error: R2 bucket not available.");
    }
    const bucket = event.platform.env.MADMODS_R2;

    // --- 2. Get and Validate Inputs ---
    let inputs: any;
    try {
        inputs = await event.request.json();
        if (!inputs) {
            throw new Error("Missing JSON body");
        }
    } catch (err: any) {
        console.error("Failed to parse request JSON:", err);
        if (err instanceof SyntaxError) {
            throw error(400, `Bad Request: Invalid JSON format. ${err.message}`);
        }
        throw error(400, `Bad Request: Could not read request body. ${err.message}`);
    }

    const fileURL_toUpload = inputs.fileURL_ToUpload;
    const r2key = inputs.r2key;

    if (!fileURL_toUpload || typeof fileURL_toUpload !== 'string') {
        throw error(400, "Bad Request: Missing or invalid 'fileURL_ToUpload' (must be a string)");
    }
    if (!r2key || typeof r2key !== 'string' || r2key.length === 0) {
        throw error(400, "Bad Request: Missing, invalid, or empty 'r2key' (must be a non-empty string)");
    }
    try {
        new URL(fileURL_toUpload); // Validate URL format
    } catch (_) {
        throw error(400, "Bad Request: 'fileURL_ToUpload' is not a valid URL");
    }
    if (r2key.startsWith('/')) {
        console.warn("Warning: r2key starts with '/', which is often unnecessary.");
        // Optionally, throw error(400, "Bad Request: 'r2key' should not start with a '/'");
    }


    // --- 3. Fetch the File from the URL ---
    let fetchResponse: Response;
    try {
        console.log(`Fetching file from URL: ${fileURL_toUpload}`);
        // You might need to add headers if the target requires them (e.g., User-Agent)
        fetchResponse = await fetch(fileURL_toUpload, { headers: { 'User-Agent': 'Cloudflare-Worker-Fetcher/1.0' } });
    } catch (err: any) {
        console.error(`Network error fetching file from ${fileURL_toUpload}:`, err);
        throw error(502, `Bad Gateway: Could not reach the specified file URL. ${err.message}`);
    }

    if (!fetchResponse.ok) {
        console.error(`Failed to fetch file from ${fileURL_toUpload}. Status: ${fetchResponse.status} ${fetchResponse.statusText}`);
        const errorBody = await fetchResponse.text().catch(() => 'Could not read error body');
        // Provide more context if possible
        throw error(502, `Failed to download file from origin: ${fetchResponse.status} ${fetchResponse.statusText}. Body: ${errorBody}`);
    }

    // --- 4. Get File Data and Metadata ---
    let fileData: ArrayBuffer;
    try {
        fileData = await fetchResponse.arrayBuffer(); // Get content as ArrayBuffer
    } catch (err: any) {
        console.error(`Error reading response body from ${fileURL_toUpload}:`, err);
        throw error(500, `Server error: Could not read file content after download. ${err.message}`);
    }
    const contentType = fetchResponse.headers.get('content-type') || 'application/octet-stream';


    // --- 5. Write the File to R2 ---
    try {
        console.log(`Uploading file to R2 with key: ${r2key}, Content-Type: ${contentType}, Size: ${fileData.byteLength} bytes`);
        const putObject = await bucket.put(r2key, fileData, {
            httpMetadata: {
                contentType: contentType,
                // cacheControl: 'public, max-age=31536000', // Optional
            },
            // customMetadata: { ... }, // Optional
        });
        console.log("File successfully uploaded to R2. ETag:", putObject?.etag); // R2PutResult object might be null on success in some CF versions, check docs/logs
    } catch (err: any) {
        console.error(`Failed to upload file to R2 (key: ${r2key}). Error:`, err);
        const errorMessage = err.message || 'Unknown R2 upload error';
        // Check for specific R2 errors if needed
        throw error(500, `Server error: Could not store file in R2. ${errorMessage}`);
    }

    // --- 6. Return Success Response ---
    // Ensure R2 Public URL is correct (if your bucket is public)
    const publicUrlBase = "https://pub-48572794ea984ea9976e5d5856e58593.r2.dev"; // Make sure this domain is correct for YOUR bucket
    const publicUrl = `${publicUrlBase}/${encodeURIComponent(r2key)}`; // URL encode the key just in case

    console.log(`Successfully processed request. R2 Key: ${r2key}, Public URL: ${publicUrl}`);

    return new Response(JSON.stringify({
        message: 'File fetched and stored successfully!',
        r2Key: r2key,
        publicUrl: publicUrl // If bucket is public and URL is correct
    }),
    {
        status: 200,
        headers: { 'Content-Type': 'application/json' } // Good practice to set Content-Type header
    });
}