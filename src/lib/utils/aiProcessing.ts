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
async function callGenerateAndUploadImageApi(payload: ImageGenPayload): Promise<ApiResponse<{ r2Key: string; publicUrl: string }>> {
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
async function callGenerateAndUploadModelApi(payload: ModelGenPayload): Promise<ApiResponse<{ r2Key: string; publicUrl: string }>> {
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

// Track last API call times for rate limiting
let lastImageApiCallTime = 0;
let lastModelApiCallTime = 0;

async function processSingleSceneProp(
    prop: SceneProp,
    index: number,
    sceneDataLength: number,
    userID: string,
    worldID: string,
    onProgress?: (index: number, total: number, stage: 'image' | 'model', propName: string, status: string) => void
): Promise<ProcessResult> {
    const updateProgress = (stage: 'image' | 'model', status: string) => {
        if (onProgress) onProgress(index, sceneDataLength, stage, prop.name, status);
    };

    let imageResult: ApiResponse<{ r2Key: string; publicUrl: string }> | null = null;
    let modelResult: ApiResponse<{ r2Key: string; publicUrl: string }> | null = null;
    let processResult: ProcessResult = { propName: prop.name, status: 'image_failed' }; // Initial status

    // --- Image Generation Stage ---
    updateProgress('image', 'starting');
    let imageRetries = 0;
    while (imageRetries <= MAX_RETRIES) {
        updateProgress('image', `attempt_${imageRetries + 1}`);

        // Rate Limit Delay for Image API
        const now = Date.now();
        const timeSinceLastImageCall = now - lastImageApiCallTime;
        const delayNeededForImage = Math.max(0, MIN_IMAGE_INTERVAL_MS - timeSinceLastImageCall);
        if (delayNeededForImage > 0) {
            await delay(delayNeededForImage);
        }
        lastImageApiCallTime = Date.now(); // Update time immediately before the call

        imageResult = await callGenerateAndUploadImageApi({
            inputPrompt: prop.description, userID, worldID, propID: prop.name, imageFormat: 'jpg'
        });

        if (imageResult.success) {
            updateProgress('image', 'attempt_success');
            break; // Image success, proceed to model
        } else if (imageResult.errorType === 'rate_limit' && imageRetries < MAX_RETRIES) {
            imageRetries++;
            updateProgress('image', `rate_limit_retry_${imageRetries}`);
            console.log(`   Image rate limit for ${prop.name}. Retrying (${imageRetries}/${MAX_RETRIES}) after ${RETRY_DELAY_MS / 1000}s...`);
            await delay(RETRY_DELAY_MS);
        } else {
            updateProgress('image', `attempt_failed (${imageResult.errorType || 'unknown'})`);
            processResult = {
                propName: prop.name,
                status: 'image_failed',
                error: imageResult?.error,
                errorDetails: imageResult?.details
            };
            console.error(`[Orchestrator] Image stage failed for ${prop.name}: ${imageResult?.error}`);
            return processResult; // Image failed, stop processing this prop
        }
    }

    if (imageResult?.success) {
        updateProgress('image', 'image_stage_success');
        processResult = {
            propName: prop.name,
            status: 'success', // Interim success, might be downgraded by model stage
            imageR2Key: imageResult.data!.r2Key,
            imagePublicUrl: imageResult.data!.publicUrl,
        };

        // --- Model Generation Stage ---
        updateProgress('model', 'starting');
        let modelRetries = 0;
        while (modelRetries <= MAX_RETRIES) {
            updateProgress('model', `attempt_${modelRetries + 1}`);

            // Rate Limit Delay for Model API
            const now = Date.now();
            const timeSinceLastModelCall = now - lastModelApiCallTime;
            const delayNeededForModel = Math.max(0, MIN_MODEL_INTERVAL_MS - timeSinceLastModelCall);
            if (delayNeededForModel > 0) {
                await delay(delayNeededForModel);
            }
            lastModelApiCallTime = Date.now(); // Update time immediately before call

            modelResult = await callGenerateAndUploadModelApi({
                imagePublicUrl: imageResult.data!.publicUrl,
                userID,
                worldID,
                propID: prop.name
            });

            if (modelResult.success) {
                updateProgress('model', 'attempt_success');
                break; // Model success
            } else if (modelResult.errorType === 'rate_limit' && modelRetries < MAX_RETRIES) {
                modelRetries++;
                updateProgress('model', `rate_limit_retry_${modelRetries}`);
                console.log(`   Model rate limit for ${prop.name}. Retrying (${modelRetries}/${MAX_RETRIES}) after ${RETRY_DELAY_MS / 1000}s...`);
                await delay(RETRY_DELAY_MS);
            } else {
                updateProgress('model', `attempt_failed (${modelResult.errorType || 'unknown'})`);
                processResult.status = 'model_failed'; // Downgrade status
                processResult.error = modelResult?.error;
                processResult.errorDetails = modelResult?.details;
                console.error(`[Orchestrator] Model stage failed for ${prop.name}: ${modelResult?.error}`);
                return processResult; // Model failed, return current result (image might be successful)
            }
        }

        if (modelResult?.success) {
            updateProgress('model', 'model_stage_success');
            processResult.modelR2Key = modelResult.data!.r2Key;
            processResult.modelPublicUrl = modelResult.data!.publicUrl;
            processResult.status = 'success'; // Overall success
        } else if (processResult.status !== 'model_failed') {
            processResult.status = 'model_failed'; // Ensure status is model_failed if model stage failed after image success
        }
    }

    return processResult;
}


/**
 * Processes a list of scene props by calling backend APIs for image and model generation/upload.
 * Manages rate limiting between calls and handles retries for rate limit errors (429) from the APIs.
 * Calls APIs asynchronously and in parallel for each prop.
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

    console.log(`Starting parallel processing for ${sceneData.length} props...`);
    const processPromises = sceneData.map((prop, index) =>
        processSingleSceneProp(prop, index, sceneData.length, userID, worldID, onProgress)
    );

    const results = await Promise.all(processPromises);
    console.log(`\n--- Parallel Processing Complete ---`);

    let overallSuccessCount = 0;
    let imageFailCount = 0;
    let modelFailCount = 0;

    results.forEach(result => {
        if (result.status === 'success') {
            overallSuccessCount++;
        } else if (result.status === 'image_failed') {
            imageFailCount++;
        } else if (result.status === 'model_failed') {
            modelFailCount++;
        }
    });

    console.log(`Total Props: ${sceneData.length}`);
    console.log(`Overall Successful (Image + Model): ${overallSuccessCount}`);
    console.log(`Failed at Image Stage: ${imageFailCount}`);
    console.log(`Failed at Model Stage (after Image OK): ${modelFailCount}`);
    console.log("---------------------------\n");

    return results;
}