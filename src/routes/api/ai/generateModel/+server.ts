// src/routes/api/ai/generateModel/+server.ts

import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
// No longer need direct R2 bucket access here
// Removed: import { Buffer } from 'buffer'; // Using Web APIs now

const STABILITY_API_URL = 'https://api.stability.ai/v2beta/3d/stable-point-aware-3d';

// Helper: ArrayBuffer to Base64 (using Web APIs)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary); // Use built-in btoa
}

export async function POST(event: RequestEvent) {
    const { request, platform, url, fetch: platformFetch } = event; // Use platformFetch

    // --- 0. Dependencies & Env Vars ---
    // R2 binding is NOT needed directly in this endpoint anymore.
    // const bucket = platform.env.MADMODS_R2; // REMOVED

    const stabilityApiKey = env.STABILITY_API_KEY || platform?.env.STABILITY_API_KEY;
    if (!stabilityApiKey) {
        console.error("[GenerateModel API] STABILITY_API_KEY missing.");
        throw error(500, "Server configuration error: Stability API key missing.");
    }

     // --- Determine Upload Endpoint URL & Fetch Client ---
    let uploadEndpointUrl: string;
    let internalFetch = fetch; // Default to global fetch

    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        uploadEndpointUrl = "https://madmods.world/api/storage/upload"; // *** YOUR DEPLOYED URL ***
        console.log(`[GenerateModel API] Running locally, targeting hosted upload API: ${uploadEndpointUrl}`);
    } else {
        uploadEndpointUrl = "/api/storage/upload"; // Relative path
        internalFetch = platformFetch; // Use platform's fetch
        console.log(`[GenerateModel API] Running on hosted env, targeting relative upload API via platformFetch.`);
    }


    try {
        // --- 1. Inputs ---
        let apiInput: any;
        try {
            apiInput = await request.json();
        } catch (err: any) {
            console.error("[GenerateModel API] Failed to parse request JSON:", err);
            throw error(400, `Bad Request: Invalid JSON. ${err.message}`);
        }

        // *** Expect imagePublicUrl instead of imageR2Key ***
        const { imagePublicUrl, userID, worldID, propID } = apiInput;
        if (!imagePublicUrl || !userID || !worldID || !propID) {
            throw error(400, "Bad Request: Missing required fields (imagePublicUrl, userID, worldID, propID)");
        }
        // Validate the URL format
        try {
            new URL(imagePublicUrl);
        } catch (_) {
             throw error(400, "Bad Request: 'imagePublicUrl' is not a valid URL");
        }
        console.log(`[GenerateModel API] Processing request for User: ${userID}, Prop: ${propID}, Image URL: ${imagePublicUrl}`);


        // --- 2. Fetch Image from Public URL ---
        let imageBlob: Blob;
        try {
            console.log(`[GenerateModel API] Fetching image from Public URL: ${imagePublicUrl}`);
            // Use global fetch for fetching the public URL (could be external)
            const imageResponse = await fetch(imagePublicUrl, { headers: { 'User-Agent': 'Cloudflare-Worker-Fetcher/1.0' } });
            if (!imageResponse.ok) {
                 const errorBody = await imageResponse.text().catch(() => 'Could not read error body');
                console.error(`[GenerateModel API] Failed to fetch source image. Status: ${imageResponse.status}. URL: ${imagePublicUrl}. Body: ${errorBody}`);
                throw error(502, `Bad Gateway: Could not fetch source image from URL (${imageResponse.status})`);
            }
            imageBlob = await imageResponse.blob(); // Get image as blob for Stability AI
            if(!imageBlob || imageBlob.size === 0) {
                 throw new Error("Fetched image data is empty.");
            }
             console.log(`[GenerateModel API] Fetched image blob, Size: ${imageBlob.size}, Type: ${imageBlob.type}`);
        } catch (err: any) {
            if (err.status) { throw err; } // Re-throw SvelteKit errors
            console.error(`[GenerateModel API] Error fetching image from ${imagePublicUrl}:`, err);
            throw error(502, `Bad Gateway: Could not fetch source image. ${err.message}`);
        }


        // --- 3. Call Stability AI API ---
        console.log(`[GenerateModel API] Calling Stability AI...`);
        let stabilityResponse: Response;
        let modelData: ArrayBuffer | null = null;
        try {
            const formData = new FormData();
            // Use a generic filename or derive from URL if needed, but it might not matter much
            const filename = imagePublicUrl.substring(imagePublicUrl.lastIndexOf('/') + 1) || 'image.png';
            formData.append('image', imageBlob, filename);

            stabilityResponse = await fetch(STABILITY_API_URL, { // Use global fetch for external API
                method: 'POST',
                headers: { Authorization: `Bearer ${stabilityApiKey}`, Accept: 'model/gltf-binary, application/json' },
                body: formData,
                // @ts-ignore
                duplex: 'half',
            });

            if (stabilityResponse.ok) {
                modelData = await stabilityResponse.arrayBuffer();
                if (!modelData || modelData.byteLength === 0) throw error(502, "Bad Gateway: Stability AI returned empty model data.");
                console.log(`[GenerateModel API] Received ${modelData.byteLength} bytes of GLB data.`);
            } else if (stabilityResponse.status === 429) {
                console.warn(`[GenerateModel API] Stability AI rate limit hit (429).`);
                return json({ error: 'Stability AI Rate Limit Hit' }, { status: 429 }); // Signal 429
            } else {
                const errorText = await stabilityResponse.text().catch(() => 'Could not read Stability AI error body');
                console.error(`[GenerateModel API] Stability AI failed. Status: ${stabilityResponse.status}. Body: ${errorText}`);
                return json({ error: 'Stability AI Error', details: errorText.substring(0, 500) }, { status: stabilityResponse.status });
            }
        } catch (err: any) {
            if (err.status) { throw err; } // Re-throw kit errors if any were thrown above
            console.error(`[GenerateModel API] Network error during Stability AI call:`, err);
            return json({ error: 'Network Error', details: `Failed during Stability AI call. ${err.message}` }, { status: 504 }); // Gateway Timeout
        }


        // --- 4. Prepare Payload for Upload Endpoint (using Base64) ---
        let base64ModelData: string;
        try {
            // Use the Web API compatible helper function
            base64ModelData = arrayBufferToBase64(modelData);
        } catch (encodeErr: any) {
            console.error("[GenerateModel API] Error encoding model data to Base64:", encodeErr);
            throw error(500, "Server Error: Failed to encode model data.");
        }

        const modelR2Key = `worlds/${userID}/${worldID}/props/${propID}/model.glb`;
        const uploadPayload = {
            fileData: base64ModelData, // Send Base64 encoded data
            contentType: 'model/gltf-binary',
            r2key: modelR2Key
        };

        // --- 5. Call the Upload Endpoint Internally ---
        console.log(`[GenerateModel API] Calling internal upload endpoint: ${uploadEndpointUrl} for key: ${modelR2Key}`);
        let uploadResponse: Response;
        let uploadResponseBody: any;
        try {
             uploadResponse = await internalFetch(uploadEndpointUrl, { // Use potentially platformFetch
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(uploadPayload) // Send JSON containing base64 data
             });

             try {
                uploadResponseBody = await uploadResponse.json();
             } catch {
                uploadResponseBody = await uploadResponse.text().catch(() => '');
             }

             if (!uploadResponse.ok) {
                 console.error(`[GenerateModel API] Internal model upload call failed. Status: ${uploadResponse.status}. Response: ${JSON.stringify(uploadResponseBody)}`);
                 return json(
                    { error: `Internal model upload failed (Status: ${uploadResponse.status})`, details: uploadResponseBody },
                    { status: uploadResponse.status >= 500 ? 502 : uploadResponse.status }
                 );
             }
             console.log("[GenerateModel API] Internal model upload call successful.");

        } catch (fetchErr: any) {
             console.error(`[GenerateModel API] Network error calling internal upload endpoint ${uploadEndpointUrl}:`, fetchErr);
             throw error(504, `Gateway Timeout: Could not reach internal upload service. ${fetchErr.message}`);
        }

        // --- 6. Return the successful response body FROM the upload endpoint ---
        return json(uploadResponseBody, { status: 200 });

    } catch (err: any) {
        console.error("[GenerateModel API] Unhandled error in POST handler:", err);
        if (err.status && err.body) throw err;
        throw error(500, `An unexpected server error occurred: ${err.message}`);
    }
}