// src/lib/utils/aiProcessing.ts

// Constants
const RETRY_DELAY_MS = 10000; // Common retry delay (10 seconds)
const MAX_RETRIES = 3; // Max retries for rate limit errors
const IMAGE_GENERATION_RATE_PER_SEC = 2; // Target: 2 image API calls per second
const MODEL_GENERATION_RATE_PER_SEC = 3; // Target: 3 model API calls per second
const MIN_IMAGE_INTERVAL_MS = 1000 / IMAGE_GENERATION_RATE_PER_SEC; // Minimum time between starts of image calls
const MIN_MODEL_INTERVAL_MS = 1000 / MODEL_GENERATION_RATE_PER_SEC; // Minimum time between starts of model calls

// Helper: Delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Interfaces ---
interface ImageGenPayload {
    inputPrompt: string;
    userID: string;
    worldID: string;
    propID: string;
    imageFormat?: string;
}

// Payload for generateModel API expects imagePublicUrl
interface ModelGenPayload {
    imagePublicUrl: string;
    userID: string;
    worldID: string;
    propID: string;
}

// Standard API Response Structure from our backend endpoints
interface ApiResponse<T> {
    success: boolean; // True if the API call itself succeeded (status 2xx)
    data?: T; // The data returned on success (e.g., { r2Key: ..., publicUrl: ... })
    error?: string; // High-level error message from the backend or frontend utility
    errorType?: 'rate_limit' | 'api_error' | 'network_error' | 'other'; // Categorization for handling
    details?: string; // Specific error details string (often JSON stringified body)
}

// Input data structure for each item to process
export interface SceneProp {
    name: string; // Used as propID
    description: string; // Used as inputPrompt
    // Add other relevant fields from your actual data structure if needed
}

// Output structure for the result of processing each item
export interface ProcessResult {
    propName: string;
    status: 'success' | 'image_failed' | 'model_failed'; // Overall status for this prop
    imageR2Key?: string;
    imagePublicUrl?: string;
    modelR2Key?: string;
    modelPublicUrl?: string;
    error?: string; // Final error message if any stage failed
    errorDetails?: string; // Additional details about the final error
}


// --- API Call Utilities (Single Attempt Wrappers) ---

/**
 * Calls the backend '/api/ai/generateImage' endpoint ONCE.
 * Parses the response and returns a structured ApiResponse.
 * Does NOT handle retries; signals 'rate_limit' errorType if 429 is received.
 */
export async function callGenerateAndUploadImageApi(payload: ImageGenPayload): Promise<ApiResponse<{ r2Key: string; publicUrl: string }>> {
    const endpoint = '/api/ai/generateImage'; // Ensure this matches your actual endpoint name
    console.log(`[API Call] POST ${endpoint} for prop: ${payload.propID}`);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        let responseBody: any;
        try {
            // Try parsing JSON first, as success and known errors should be JSON
            responseBody = await response.json();
        } catch {
            // Fallback to text if JSON parsing fails (unexpected body format)
            responseBody = await response.text().catch(() => '');
        }

        if (response.ok) { // Status 200-299
            return { success: true, data: responseBody };
        } else if (response.status === 429) {
            // Specific handling for rate limit
            console.warn(`[API Resp] ${endpoint} returned 429 (Rate Limit) for prop ${payload.propID}.`);
            return { success: false, error: `Image Gen API Rate Limit`, errorType: 'rate_limit', details: JSON.stringify(responseBody) };
        } else {
            // Handle other non-OK statuses (4xx client errors, 5xx server errors from backend)
            const errorMsg = `Image Gen API Error (Status: ${response.status})`;
            console.error(`[API Error] ${endpoint} for prop ${payload.propID}: ${errorMsg} - Body: ${JSON.stringify(responseBody)}`);
            return { success: false, error: errorMsg, errorType: 'api_error', details: JSON.stringify(responseBody) };
        }

    } catch (error: any) {
        // Handle network errors (fetch itself failed)
        const errorMsg = `Network error calling ${endpoint}`;
        console.error(`[API Net Error] ${endpoint} for prop ${payload.propID}: ${errorMsg}`, error);
        return { success: false, error: errorMsg, errorType: 'network_error', details: error.message };
    }
}

/**
 * Calls the backend '/api/ai/generateModel' endpoint ONCE.
 * Parses the response and returns a structured ApiResponse.
 * Does NOT handle retries; signals 'rate_limit' errorType if 429 is received.
 * Expects payload with imagePublicUrl.
 */
export async function callGenerateAndUploadModelApi(payload: ModelGenPayload): Promise<ApiResponse<{ modelR2Key: string; modelPublicUrl: string }>> {
    const endpoint = '/api/ai/generateModel'; // Ensure this matches your actual endpoint name
     console.log(`[API Call] POST ${endpoint} for prop: ${payload.propID}, image URL: ${payload.imagePublicUrl}`); // Log public URL
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload), // Send payload including imagePublicUrl
        });

        let responseBody: any;
         try {
             responseBody = await response.json();
         } catch {
            responseBody = await response.text().catch(() => '');
         }

        if (response.ok) {
            return { success: true, data: responseBody };
        } else if (response.status === 429) {
             console.warn(`[API Resp] ${endpoint} returned 429 (Rate Limit) for prop ${payload.propID}.`);
            // Signal rate limit for orchestrator to handle
            return { success: false, error: 'Model Gen API Rate Limit', errorType: 'rate_limit', details: JSON.stringify(responseBody) };
        } else {
            const errorMsg = `Model Gen API Error (Status: ${response.status})`;
            console.error(`[API Error] ${endpoint} for prop ${payload.propID}: ${errorMsg} - Body: ${JSON.stringify(responseBody)}`);
            // General API error category for other non-OK statuses
            return { success: false, error: errorMsg, errorType: 'api_error', details: JSON.stringify(responseBody) };
        }

    } catch (error: any) {
        const errorMsg = `Network error calling ${endpoint}`;
        console.error(`[API Net Error] ${endpoint} for prop ${payload.propID}: ${errorMsg}`, error);
        // Network error category
        return { success: false, error: errorMsg, errorType: 'network_error', details: error.message };
    }
}


// --- Orchestration Logic ---

/**
 * Processes a list of scene props by calling backend APIs for image and model generation/upload.
 * Manages rate limiting between calls and handles retries for rate limit errors (429) from the APIs.
 *
 * @param sceneData Array of prop objects to process.
 * @param userID Current user ID.
 * @param worldID Current world ID.
 * @param onProgress Optional callback for progress updates: (index, total, stage, propName, status)
 * @returns A promise resolving to an array of ProcessResult objects.
 */
export async function processSceneData(
    sceneData: SceneProp[],
    userID: string,
    worldID: string,
    onProgress?: (index: number, total: number, stage: 'image' | 'model', propName: string, status: string) => void
): Promise<ProcessResult[]> {

    console.log(`Starting processing for ${sceneData.length} props...`);
    // Initialize results array with nulls to maintain order
    const results: (ProcessResult | null)[] = new Array(sceneData.length).fill(null);
    // Create a queue of items with their original index
    const itemsToProcess: { prop: SceneProp; index: number }[] = sceneData.map((prop, index) => ({ prop, index }));

    let globalImageSuccessCount = 0;
    let globalModelSuccessCount = 0;

    // --- Stage 1: Image Generation & Upload (Orchestrated Retries & Rate Limit) ---
    console.log(`\n--- Stage 1: Image Generation & Upload (Rate: ${IMAGE_GENERATION_RATE_PER_SEC}/sec, Retries: ${MAX_RETRIES}) ---`);

    // Corrected: Queue now stores imagePublicUrl needed for the next step
    const modelQueue: { prop: SceneProp; index: number; imagePublicUrl: string }[] = [];

    for (let i = 0; i < itemsToProcess.length; i++) {
        const { prop, index } = itemsToProcess[i];
        const stageStartTime = Date.now(); // Track time for rate limiting delay calculation

        // Helper for progress reporting
        const baseProgressArgs: [number, number, 'image', string, string] = [index, sceneData.length, 'image', prop.name, 'starting'];
        const updateProgress = (status: string) => {
            baseProgressArgs[4] = status; // Update the status part
            if (onProgress) onProgress(...baseProgressArgs); // Call the callback if provided
        };

        updateProgress('starting');

        let imageResult: ApiResponse<{ r2Key: string; publicUrl: string }>;
        let imageRetries = 0;

        // Retry loop specifically for the image generation API call for this item
        while (imageRetries <= MAX_RETRIES) {
             updateProgress(`attempt_${imageRetries + 1}`); // e.g., "attempt_1", "attempt_2"
             // Call the utility function that makes the single API request
            imageResult = await callGenerateAndUploadImageApi({
                inputPrompt: prop.description, userID, worldID, propID: prop.name, imageFormat: 'jpg'
            });

            if (imageResult.success) {
                 updateProgress('attempt_success');
                 break; // Successful call, exit the retry loop
            } else if (imageResult.errorType === 'rate_limit' && imageRetries < MAX_RETRIES) {
                 // It's a rate limit error, and we haven't exceeded max retries
                 imageRetries++;
                 updateProgress(`rate_limit_retry_${imageRetries}`);
                console.log(`   Image rate limit for ${prop.name}. Retrying (${imageRetries}/${MAX_RETRIES}) after ${RETRY_DELAY_MS / 1000}s...`);
                await delay(RETRY_DELAY_MS); // Wait before the next attempt
                // Continue to the next iteration of the while loop
            } else {
                // Failure condition: Either a non-retryable error OR max retries exceeded for rate limit
                 updateProgress(`attempt_failed (${imageResult.errorType || 'unknown'})`);
                 break; // Exit the retry loop on failure
            }
        } // End Image retry loop for this item


        // Process the final outcome of the image stage (after potential retries)
        if (!imageResult!.success) {
            // Store the failure result
            results[index] = { propName: prop.name, status: 'image_failed', error: imageResult!.error, errorDetails: imageResult!.details };
             updateProgress('image_stage_failed'); // Final status update for image stage
             console.error(`[Orchestrator] Image stage failed for ${prop.name}: ${imageResult!.error}`);
        } else {
            // Image stage succeeded
            globalImageSuccessCount++;
            updateProgress('image_stage_success'); // Final status update
            const partialResult: ProcessResult = {
                propName: prop.name,
                status: 'success', // Mark as success *so far*
                imageR2Key: imageResult!.data!.r2Key,
                imagePublicUrl: imageResult!.data!.publicUrl, // Store both R2Key and PublicUrl if needed later
            };
            results[index] = partialResult; // Store the intermediate success
            // Corrected: Push required data to modelQueue
            modelQueue.push({
                prop,
                index,
                imagePublicUrl: partialResult.imagePublicUrl! // Only need public URL for next API call
            });
        }

        // Inter-Item Rate Limiting Delay for Image Stage
        // Apply delay *after* processing an item (including its retries) to control the start rate of the *next* item.
        if (i < itemsToProcess.length - 1) { // Don't delay after the last item
            const stageDuration = Date.now() - stageStartTime; // Time taken for this item's image stage
            const delayNeeded = Math.max(0, MIN_IMAGE_INTERVAL_MS - stageDuration); // Calculate required delay
            if (delayNeeded > 0) {
                 console.log(`   Image stage took ${stageDuration}ms. Waiting ${delayNeeded.toFixed(0)}ms before next item...`);
                 await delay(delayNeeded);
            } else {
                 console.log(`   Image stage took ${stageDuration}ms (>= ${MIN_IMAGE_INTERVAL_MS}ms interval). Proceeding immediately.`);
                 // Optional: await delay(1); // Tiny delay to yield event loop if operations are very fast
            }
        }
    } // End loop through itemsToProcess (Image Stage)
    console.log(`--- Image Stage Complete: ${globalImageSuccessCount} / ${sceneData.length} successful ---`);


    // --- Stage 2: Model Generation & Upload (Orchestrated Retries & Rate Limit) ---
    console.log(`\n--- Stage 2: Model Generation & Upload (Rate: ${MODEL_GENERATION_RATE_PER_SEC}/sec, Retries: ${MAX_RETRIES}) ---`);
    if (modelQueue.length === 0) {
        console.log("No items succeeded in image stage, skipping model generation.");
    } else {
         console.log(`Attempting model generation for ${modelQueue.length} props...`);
    }

    // Process only the items that succeeded in the image stage
    for (let i = 0; i < modelQueue.length; i++) {
        // Corrected: Destructure imagePublicUrl from the queue item
        const { prop, index, imagePublicUrl } = modelQueue[i];
        const stageStartTime = Date.now(); // Track time for rate limiting

        // Setup progress reporting for the model stage
        const baseProgressArgs: [number, number, 'model', string, string] = [index, sceneData.length, 'model', prop.name, 'starting'];
         const updateProgress = (status: string) => {
            baseProgressArgs[4] = status;
            if (onProgress) onProgress(...baseProgressArgs);
        };

        updateProgress('starting');

        let modelResult: ApiResponse<{ modelR2Key: string; modelPublicUrl: string }>;
        let modelRetries = 0;

        // Retry loop specifically for the model generation API call for this item
        while (modelRetries <= MAX_RETRIES) {
            updateProgress(`attempt_${modelRetries + 1}`);
             // Corrected: Pass imagePublicUrl in the payload to the API utility function
            modelResult = await callGenerateAndUploadModelApi({
                imagePublicUrl: imagePublicUrl, // Use the destructured variable
                userID,
                worldID,
                propID: prop.name
            });

            if (modelResult.success) {
                 updateProgress('attempt_success');
                break; // Success, exit retry loop
            } else if (modelResult.errorType === 'rate_limit' && modelRetries < MAX_RETRIES) {
                // Rate limited, more retries available
                modelRetries++;
                updateProgress(`rate_limit_retry_${modelRetries}`);
                console.log(`   Model rate limit for ${prop.name}. Retrying (${modelRetries}/${MAX_RETRIES}) after ${RETRY_DELAY_MS / 1000}s...`);
                await delay(RETRY_DELAY_MS); // Wait
                // Continue loop
            } else {
                 // Failure (non-retryable or max retries hit)
                 updateProgress(`attempt_failed (${modelResult.errorType || 'unknown'})`);
                break; // Exit loop on failure
            }
        } // End Model retry loop for this item


        // Process the final outcome of the model stage
        // We need to update the existing result object stored at the original index
        const finalResult = results[index];
        if (!finalResult) {
             console.error(`[Orchestrator Error] Result object for index ${index} (prop ${prop.name}) is unexpectedly null!`);
             continue; // Should not happen if initialized correctly
        }

        if (!modelResult!.success) {
            // Model stage failed, update the status and error fields
             finalResult.status = 'model_failed'; // Downgrade overall status
             finalResult.error = modelResult!.error; // Add/overwrite error message
             finalResult.errorDetails = modelResult!.details;
             updateProgress('model_stage_failed');
             console.error(`[Orchestrator] Model stage failed for ${prop.name}: ${modelResult!.error}`);
        } else {
            // Model stage succeeded
            globalModelSuccessCount++;
            // Add model details to the result object. Status remains 'success'.
            finalResult.modelR2Key = modelResult!.data!.modelR2Key;
            finalResult.modelPublicUrl = modelResult!.data!.modelPublicUrl;
             updateProgress('model_stage_success');
        }

        // Inter-Item Rate Limiting Delay for Model Stage
        if (i < modelQueue.length - 1) { // Don't delay after the last item in this queue
            const stageDuration = Date.now() - stageStartTime;
            const delayNeeded = Math.max(0, MIN_MODEL_INTERVAL_MS - stageDuration);
             if (delayNeeded > 0) {
                console.log(`   Model stage took ${stageDuration}ms. Waiting ${delayNeeded.toFixed(0)}ms before next item...`);
                await delay(delayNeeded);
            } else {
                 console.log(`   Model stage took ${stageDuration}ms (>= ${MIN_MODEL_INTERVAL_MS}ms interval). Proceeding immediately.`);
                  // Optional: await delay(1);
            }
         }
    } // End loop through modelQueue (Model Stage)
     console.log(`--- Model Stage Complete: ${globalModelSuccessCount} / ${modelQueue.length} successful attempts ---`);


    // --- Final Summary ---
    // Filter out potential nulls (though shouldn't happen) and count statuses
     const finalResults = results.filter(r => r !== null) as ProcessResult[];
    const overallSuccess = finalResults.filter(r => r.status === 'success').length;
    const imageFail = finalResults.filter(r => r.status === 'image_failed').length;
    const modelFail = finalResults.filter(r => r.status === 'model_failed').length; // Failed only at model stage

    console.log(`\n--- Processing Complete ---`);
    console.log(`Total Props: ${sceneData.length}`);
    console.log(`Overall Successful (Image + Model): ${overallSuccess}`);
    console.log(`Failed at Image Stage: ${imageFail}`);
    console.log(`Failed at Model Stage (after Image OK): ${modelFail}`);
    console.log("---------------------------\n");

    return finalResults; // Return the array of results
}