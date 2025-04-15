// src/routes/api/ai/generateImage/+server.ts

import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import Replicate from "replicate";
import { env } from '$env/dynamic/private';

export async function POST(event: RequestEvent) {
    const { request, platform, url, fetch: platformFetch } = event; // Use platformFetch for internal calls when deployed
    let replicateToken: string | undefined;

    // --- 0. Get Replicate Token ---
    try {
        replicateToken = env.REPLICATE_API_TOKEN || platform?.env.REPLICATE_API_TOKEN;
        if (!replicateToken) throw new Error("Token not found in dynamic/platform env.");
        console.log("[GenerateImage API] Using Replicate Token");
    } catch (err: any) {
        console.error("[GenerateImage API] Error accessing REPLICATE_API_TOKEN:", err.message);
        if (!replicateToken) replicateToken = platform?.env.REPLICATE_API_TOKEN;
    }
    if (!replicateToken) {
        console.error("[GenerateImage API] Replicate API token is missing.");
        throw error(500, "Server configuration error: Replicate token missing.");
    }

    // --- Determine Upload Endpoint URL & Fetch Client ---
    let uploadEndpointUrl: string;
    let internalFetch = fetch; // Default to global fetch

    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        uploadEndpointUrl = "https://madmods.world/api/storage/upload"; // *** YOUR DEPLOYED URL ***
        console.log(`[GenerateImage API] Running locally, targeting hosted upload API: ${uploadEndpointUrl}`);
    } else {
        uploadEndpointUrl = "/api/storage/upload"; // Relative path
        internalFetch = platformFetch; // Use platform's fetch
        console.log(`[GenerateImage API] Running on hosted env, targeting relative upload API via platformFetch.`);
    }

    try {
        // --- 1. Initialize Replicate Client ---
        const replicate = new Replicate({ auth: replicateToken });

        // --- 2. Get & Validate Input ---
        let apiInput: any;
        try {
            apiInput = await request.json();
        } catch (err: any) {
            console.error("[GenerateImage API] Failed to parse request JSON:", err);
            throw error(400, `Bad Request: Invalid JSON. ${err.message}`);
        }

        const { inputPrompt, userID, worldID, propID, imageFormat = 'jpg' } = apiInput;
        if (!inputPrompt || !userID || !worldID || !propID) {
            throw error(400, "Bad Request: Missing required fields");
        }
        console.log(`[GenerateImage API] Processing request for User: ${userID}, Prop: ${propID}`);

        // --- 3. Prepare Replicate Input ---
        const templatePromptPrefix = "a colorful cartoon style 3d model of ";
        const templatePromptSuffix = " Made of solid colors, centered in the frame against a pure black background. Bright saturated solid colors, low poly 3D game asset";
        const fullPrompt = templatePromptPrefix + inputPrompt + templatePromptSuffix;
        const replicateInput = { prompt: fullPrompt, go_fast: true, megapixels: "1", num_outputs: 1, aspect_ratio: "1:1", output_format: imageFormat, output_quality: 100, num_inference_steps: 4 };

        // --- 4. Run Replicate Model ---
        console.log(`[GenerateImage API] Calling Replicate...`);
        let replicateRunResult: any; // Store the raw result of replicate.run
        try {
            // Get the full result, which is usually an array
            replicateRunResult = await replicate.run("black-forest-labs/flux-schnell", { input: replicateInput });
             if (!Array.isArray(replicateRunResult) || replicateRunResult.length === 0) {
                 // Handle cases where it's not an array or is empty
                 throw new Error("Replicate API returned an unexpected result format (expected non-empty array).");
             }
        } catch (err: any) {
            console.error("[GenerateImage API] Error calling Replicate API:", err);
            if (err.toString().includes("429") || err.status === 429 || err.response?.status === 429) {
                console.warn("[GenerateImage API] Replicate rate limit hit (429).");
                return json({ error: 'Replicate Rate Limit Hit' }, { status: 429 }); // Signal 429
            }
            const errorMessage = err.message || 'Unknown Replicate error';
            return json({ error: 'Replicate API Error', details: errorMessage }, { status: 502 }); // Bad Gateway
        }

        // --- 5. Extract Generated Image URL (Corrected) ---
        // Assuming the first element of the result array contains the desired output
        const outputObject = replicateRunResult[0];
        let generatedImageUrl: string | null = null;

        // Attempt extraction using the user's suggested structure first
        if (typeof outputObject === 'object' && outputObject !== null) {
            try {
                // Use optional chaining to safely access nested properties/methods
                const urlResult = outputObject.url?.(); // Call .url() if it exists
                generatedImageUrl = urlResult?.href ?? null; // Get .href from the result if it exists
            } catch (e) {
                console.warn("[GenerateImage API] Error accessing replicateOutput.url().href, will check other formats:", e);
                // Fall through to check if outputObject itself is a string
            }
        }

        // If the object structure didn't yield a URL, check if the output item is directly a string
        if (!generatedImageUrl && typeof outputObject === 'string') {
             generatedImageUrl = outputObject;
        }

        // Final validation
        if (!generatedImageUrl) {
            console.error("[GenerateImage API] Could not extract a valid URL from Replicate output:", outputObject);
            throw error(502, "Failed to get valid output URL from Replicate.");
        }
        console.log("[GenerateImage API] Replicate output URL extracted:", generatedImageUrl);


        // --- 6. Prepare Payload for Upload Endpoint ---
        const r2Key = `worlds/${userID}/${worldID}/props/${propID}/image.${imageFormat}`;
        const uploadPayload = {
            fileURL_ToUpload: generatedImageUrl,
            r2key: r2Key
        };

        // --- 7. Call the Upload Endpoint Internally ---
        console.log(`[GenerateImage API] Calling internal upload endpoint: ${uploadEndpointUrl} for key: ${r2Key}`);
        let uploadResponse: Response;
        let uploadResponseBody: any;
        try {
             uploadResponse = await internalFetch(uploadEndpointUrl, { // Uses global fetch or platformFetch
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(uploadPayload)
             });

             try {
                uploadResponseBody = await uploadResponse.json();
             } catch {
                uploadResponseBody = await uploadResponse.text().catch(() => '');
             }

             if (!uploadResponse.ok) {
                 console.error(`[GenerateImage API] Internal upload call failed. Status: ${uploadResponse.status}. Response: ${JSON.stringify(uploadResponseBody)}`);
                 return json(
                    { error: `Internal upload failed (Status: ${uploadResponse.status})`, details: uploadResponseBody },
                    { status: uploadResponse.status >= 500 ? 502 : uploadResponse.status }
                 );
             }
              console.log("[GenerateImage API] Internal upload call successful.");

        } catch (fetchErr: any) {
             console.error(`[GenerateImage API] Network error calling internal upload endpoint ${uploadEndpointUrl}:`, fetchErr);
             throw error(504, `Gateway Timeout: Could not reach internal upload service. ${fetchErr.message}`);
        }

        // --- 8. Return the successful response body FROM the upload endpoint ---
        return json(uploadResponseBody, { status: 200 });

    } catch (err: any) {
        console.error("[GenerateImage API] Unhandled error in POST handler:", err);
        if (err.status && err.body) throw err;
        throw error(500, `An unexpected server error occurred: ${err.message}`);
    }
}