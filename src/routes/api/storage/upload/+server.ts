// src/routes/api/storage/upload/+server.ts

import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
// Removed: import { Buffer } from 'buffer'; // Using Web APIs now

// Helper: Base64 to ArrayBuffer (using Web APIs)
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = atob(base64); // Use built-in atob
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}


export async function POST(event: RequestEvent) {
    const { request, platform } = event;

    // --- 1. Check R2 Binding & Get Public URL Base ---
    if (!platform?.env.MADMODS_R2) {
        console.error("[Upload API] R2 binding 'MADMODS_R2' not found.");
        throw error(500, "Server configuration error: R2 bucket not available.");
    }
    const bucket = platform.env.MADMODS_R2;
    // *** Replace <YOUR_R2_PUBLIC_DOMAIN> if not using env var ***
    const publicUrlBase = platform.env.R2_PUBLIC_URL || "https://pub-48572794ea984ea9976e5d5856e58593.r2.dev";

    // --- 2. Get and Validate Inputs ---
    let inputs: any;
    try {
        inputs = await request.json();
    } catch (err: any) {
        console.error("[Upload API] Failed to parse request JSON:", err);
        throw error(400, `Bad Request: Invalid JSON. ${err.message}`);
    }

    const r2key = inputs.r2key;
    const fileURL_toUpload = inputs.fileURL_ToUpload;
    const fileData_base64 = inputs.fileData; // Expecting Base64 encoded string
    const contentType_fromInput = inputs.contentType; // Required if fileData is provided

    if (!r2key || typeof r2key !== 'string' || r2key.length === 0) {
        throw error(400, "Bad Request: Missing, invalid, or empty 'r2key'");
    }
     if (r2key.startsWith('/')) {
        console.warn(`[Upload API] Warning: r2key "${r2key}" starts with '/', which is often unnecessary.`);
    }

    let fileDataBuffer: ArrayBuffer | null = null;
    let finalContentType: string | null = null;
    let sourceDescription: string = ''; // For logging

    // --- 3. Determine Source: URL or Data ---
    if (fileURL_toUpload && fileData_base64) {
        throw error(400, "Bad Request: Provide either 'fileURL_ToUpload' or 'fileData', not both.");
    }

    if (fileURL_toUpload) {
        // --- 3a. Process URL ---
        if (typeof fileURL_toUpload !== 'string') {
             throw error(400, "Bad Request: Invalid 'fileURL_ToUpload' (must be a string)");
        }
         try {
            new URL(fileURL_toUpload); // Validate URL format
            sourceDescription = `URL: ${fileURL_toUpload}`;
        } catch (_) {
            throw error(400, "Bad Request: 'fileURL_ToUpload' is not a valid URL");
        }

        // Fetch the File from the URL
        let fetchResponse: Response;
        try {
            console.log(`[Upload API] Fetching file from ${sourceDescription}`);
            // Use global fetch for external URLs
            fetchResponse = await fetch(fileURL_toUpload, { headers: { 'User-Agent': 'Cloudflare-Worker-Fetcher/1.0' } });

            if (!fetchResponse.ok) {
                const errorBody = await fetchResponse.text().catch(() => 'Could not read error body');
                console.error(`[Upload API] Failed to fetch file. Status: ${fetchResponse.status}. Body: ${errorBody}`);
                return json({ error: `Failed to download file from origin: ${fetchResponse.status} ${fetchResponse.statusText}`}, { status: 502});
            }

            fileDataBuffer = await fetchResponse.arrayBuffer();
            finalContentType = fetchResponse.headers.get('content-type') || 'application/octet-stream';

        } catch (err: any) {
            console.error(`[Upload API] Network error fetching file from ${fileURL_toUpload}:`, err);
             return json({ error: `Could not reach the specified file URL. ${err.message}` }, { status: 502 });
        }

    } else if (fileData_base64) {
        // --- 3b. Process Base64 Data ---
        if (typeof fileData_base64 !== 'string') {
            throw error(400, "Bad Request: Invalid 'fileData' (must be a Base64 string)");
        }
        if (!contentType_fromInput || typeof contentType_fromInput !== 'string') {
            throw error(400, "Bad Request: Missing or invalid 'contentType' (required when using 'fileData')");
        }
        finalContentType = contentType_fromInput;
        sourceDescription = `Base64 Data (Type: ${finalContentType})`;

        try {
            // Use the Web API compatible helper function
            fileDataBuffer = base64ToArrayBuffer(fileData_base64);
            console.log(`[Upload API] Decoded Base64 data, size: ${fileDataBuffer.byteLength} bytes`);
        } catch (err: any) {
            console.error("[Upload API] Error decoding Base64 data:", err);
            // Use json response for internal calls, error() for direct external calls might be better
            // For consistency when called internally:
            return json({ error: `Invalid Base64 data. ${err.message}` }, { status: 400});
            // throw error(400, `Bad Request: Invalid Base64 data. ${err.message}`); // Original
        }

    } else {
        // --- 3c. No Source Provided ---
        throw error(400, "Bad Request: Must provide either 'fileURL_ToUpload' or 'fileData'.");
    }

    // --- 4. Sanity Check File Data ---
    if (!fileDataBuffer || fileDataBuffer.byteLength === 0) {
         console.error(`[Upload API] Failed to get valid file data for key ${r2key} from ${sourceDescription}`);
         return json({ error: "Server Error: Could not obtain valid file data to upload."}, { status: 500 });
    }
     if (!finalContentType) {
        console.warn(`[Upload API] Content-Type could not be determined for key ${r2key}, defaulting to application/octet-stream.`);
        finalContentType = 'application/octet-stream';
    }


    // --- 5. Write the File to R2 ---
    try {
        console.log(`[Upload API] Uploading to R2. Key: ${r2key}, Type: ${finalContentType}, Size: ${fileDataBuffer.byteLength} bytes`);
        const putObject = await bucket.put(r2key, fileDataBuffer, {
            httpMetadata: { contentType: finalContentType },
        });
        console.log("[Upload API] File successfully uploaded to R2. ETag:", putObject?.etag);
    } catch (err: any) {
        console.error(`[Upload API] Failed to upload to R2 (key: ${r2key}). Error:`, err);
         return json({ error: `Could not store file in R2. ${err.message}`}, { status: 500 });
    }

    // --- 6. Return Success Response ---
    const publicUrl = `${publicUrlBase}/${encodeURIComponent(r2key)}`;
    console.log(`[Upload API] Successfully processed request. R2 Key: ${r2key}, Public URL: ${publicUrl}`);

    // Return the standard success object
    return json({
        message: 'File stored successfully!',
        r2Key: r2key,
        publicUrl: publicUrl
    }, { status: 200 });
}