<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores'; // Import the page store
	import oboe from 'oboe';
	import ModelViewer from '$lib/components/ModelViewer.svelte'; // Import the model viewer

	// --- Configuration ---
	const R2_PUBLIC_URL_BASE = 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev';
	const IMAGE_GENERATION_ENDPOINT = 'https://imagegeneration.madmods.world';
	const MODEL_GENERATION_ENDPOINT = 'https://modelgeneration.madmods.world';
	const POLLING_INTERVAL_MS = 1000;
	const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
	const MAX_POLL_ATTEMPTS = Math.round(MAX_POLL_DURATION_MS / POLLING_INTERVAL_MS);
	const MAX_MODEL_POLL_ATTEMPTS = MAX_POLL_ATTEMPTS * 2;
	const USER_ID_FOR_UPLOADS = 'frontendUser';

	// --- Interfaces ---
	interface PropData {
		name: string;
		description?: string;
		colors?: any[];
		transforms?: any[];
		propImage?: string; // Existing or generated image URL
		propModel?: string; // Existing or generated model URL
	}

	interface PropState {
		id: string;
		propData: PropData;

		// Image Generation State
		imageStatus: 'idle' | 'queued' | 'generating' | 'polling' | 'success' | 'failed' | 'error_enqueue' | 'reused'; // Added 'reused' status
		imageStatusUrl?: string;
		imageUrl?: string; // Display URL (either reused or generated)
		imageStatusMessage?: string;
		imageAttempts: number;

		// Model Generation State
		modelStatus: 'idle' | 'queued' | 'generating' | 'polling' | 'success' | 'failed' | 'error_enqueue' | 'skipped_image_failed' | 'reused' | 'skipped_not_in_json'; // Added 'reused' & 'skipped_not_in_json'
		modelStatusUrl?: string;
		modelUrl?: string; // Display URL (either reused or generated)
		modelStatusMessage?: string;
		modelAttempts: number;
	}

	// Type for terminal statuses (used for completion check)
    // Include 'reused' and 'skipped_not_in_json' as terminal states for processing logic
	type TerminalImageStatus = PropState['imageStatus']; // All image statuses are terminal or lead to terminal
    type TerminalModelStatus = PropState['modelStatus']; // All model statuses are terminal or lead to terminal

    // Helper to check if a status is terminal (finished processing)
    function isTerminalImageStatus(status: PropState['imageStatus']): boolean {
        return ['success', 'failed', 'error_enqueue', 'reused'].includes(status);
    }
     function isTerminalModelStatus(status: PropState['modelStatus']): boolean {
         return ['success', 'failed', 'error_enqueue', 'skipped_image_failed', 'reused', 'skipped_not_in_json'].includes(status);
     }


	// --- Reactive State Variables ---
	let receivedProps: PropState[] = [];
	let metadata: any | null = null;
	let isLoading: boolean = false; // Data stream loading
	let error: string | null = null;
	let isComplete: boolean = false; // Data stream complete flag
	let userPrompt: string = 'a dinosaur park';
	let reuseJsonUrl: string = ''; // <-- ADDED: URL for JSON reuse input
	let activeImagePollingIntervals: Map<string, number | NodeJS.Timeout> = new Map();
	let activeModelPollingIntervals: Map<string, number | NodeJS.Timeout> = new Map();

	// Modal State
	let showImageModal = false;
	let selectedImageUrl = '';
	let showModelModal = false;
	let selectedModelUrl = '';
	let selectedPropName = '';

    // Final JSON Upload State
    let uploadStatus: 'idle' | 'pending' | 'uploading' | 'success' | 'failed' | 'skipped' = 'idle';
    let uploadMessage: string = '';
    let finalJsonUrl: string | null = null;

	// --- API URLs ---
	let claudeApiUrl: string = '';
    let uploadApiUrl: string = '';

	// --- Set API URLs on Component Mount ---
	onMount(() => {
		const hostname = $page.url.hostname;
		const dev = hostname.includes('localhost') || hostname === '127.0.0.1';
		claudeApiUrl = dev ? 'https://madmods.world/api/ai/claude-streaming-simulation' : '/api/ai/claude-streaming-simulation';
        uploadApiUrl = dev ? 'http://localhost:5173/api/storage/upload' : '/api/storage/upload';
		console.log('Claude API URL set to:', claudeApiUrl);
		console.log('Upload API URL set to:', uploadApiUrl);
	});

	// --- Cleanup on Destroy ---
	onDestroy(() => {
		console.log("Component destroying. Clearing active polling intervals.");
		activeImagePollingIntervals.forEach(clearInterval);
		activeImagePollingIntervals.clear();
		activeModelPollingIntervals.forEach(clearInterval);
		activeModelPollingIntervals.clear();
	});

	// --- Update Prop State Helper ---
	function updatePropState(propId: string, updates: Partial<PropState> & { propDataUpdates?: Partial<PropData> }) {
		const index = receivedProps.findIndex(p => p.id === propId);
		if (index !== -1) {
			const existingProp = receivedProps[index];
            const updatedPropData = updates.propDataUpdates
                ? { ...existingProp.propData, ...updates.propDataUpdates }
                : existingProp.propData;
            const { propDataUpdates, ...restUpdates } = updates;
			receivedProps[index] = { ...existingProp, ...restUpdates, propData: updatedPropData };
			receivedProps = [...receivedProps];
		} else {
			console.warn(`Attempted to update non-existent prop with ID: ${propId}`);
		}
	}


	// --- Function to Trigger Image Generation (Only called if needed) ---
	async function triggerImageGeneration(propState: PropState) {
		// Condition check already happened before calling this function
        if (!metadata || !metadata.worldName) {
			console.error("Cannot trigger image generation: Metadata (with worldName) not yet received.");
			updatePropState(propState.id, { imageStatus: 'failed', imageStatusMessage: 'Error: Missing world metadata.', modelStatus: 'skipped_image_failed' });
			return;
		}
        const worldID = metadata.worldName.replace(/\s+/g, '-').toLowerCase();
        const propID = propState.id.replace(/\s+/g, '-').toLowerCase();
        const inputPrompt = propState.propData.description || propState.propData.name;
        if (!inputPrompt) {
			console.error(`Cannot trigger image generation for prop ${propID}: No description or name found.`);
			updatePropState(propState.id, { imageStatus: 'failed', imageStatusMessage: 'Error: Missing prompt data.', modelStatus: 'skipped_image_failed' });
			return;
		}

        const requestBody = { inputPrompt, userID: USER_ID_FOR_UPLOADS, worldID, propID, imageFormat: 'jpg' };
        console.log(`[Prop: ${propID}] Enqueuing image generation...`, requestBody);
        updatePropState(propState.id, { imageStatus: 'queued', imageStatusMessage: 'Sending request to image queue...' });

        try {
            const response = await fetch(IMAGE_GENERATION_ENDPOINT, {
				method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
			});
            if (!response.ok) {
				let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* ignore parsing failure */ }
				throw new Error(`Failed to enqueue image: ${errorBody}`);
			}
            const result: any = await response.json();
            if (!result.statusKey) throw new Error("Image enqueue response missing 'statusKey'.");
            const fullStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`;
            updatePropState(propState.id, { imageStatus: 'polling', imageStatusUrl: fullStatusUrl, imageStatusMessage: 'Image Queued. Waiting...', imageAttempts: 0 });
            startImagePolling(propState.id, fullStatusUrl);
        } catch (err: any) {
			console.error(`[Prop: ${propID}] Error enqueuing image generation:`, err);
			updatePropState(propState.id, { imageStatus: 'error_enqueue', imageStatusMessage: `Image Enqueue failed: ${err.message}`, modelStatus: 'skipped_image_failed' }); // Skip model gen
		}
	}

	// --- Function to Start Image Polling ---
	function startImagePolling(propId: string, statusUrl: string) {
		clearPollingInterval(propId, 'image'); // Clear existing interval if any
		console.log(`[Prop: ${propId}] Starting IMAGE polling for status at ${statusUrl}`);
		const intervalId = setInterval(() => { pollImageStatus(propId, statusUrl); }, POLLING_INTERVAL_MS);
		activeImagePollingIntervals.set(propId, intervalId);
	}

	// --- Function to Poll Image Status ---
	async function pollImageStatus(propId: string, statusUrl: string) { 
        const propIndex = receivedProps.findIndex(p => p.id === propId);
		if (propIndex === -1) { /* ... */ clearPollingInterval(propId, 'image'); return; }
		let currentAttempts = receivedProps[propIndex].imageAttempts + 1;
		updatePropState(propId, { imageAttempts: currentAttempts });
		if (currentAttempts > MAX_POLL_ATTEMPTS) { /* ... timeout ... */
            updatePropState(propId, { imageStatus: 'failed', imageStatusMessage: 'Polling timed out.', modelStatus: 'skipped_image_failed' });
            clearPollingInterval(propId, 'image'); return;
        }
		console.log(`[Prop: ${propId}] IMAGE Polling attempt ${currentAttempts}...`);
		try {
			const response = await fetch(statusUrl, { cache: 'no-store' });
			if (response.status === 404) { /* ... 404 handling ... */ return; }
			if (!response.ok) throw new Error(`HTTP error ${response.status} fetching image status`);
			const statusReport: any = await response.json();
			console.log(`[Prop: ${propId}] Received IMAGE status:`, statusReport.status);

			switch (statusReport.status) {
				case 'success':
					if (!statusReport.r2ImagePath) throw new Error("Image status 'success' but missing 'r2ImagePath'.");
					const fullImageUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ImagePath}`;
					updatePropState(propId, {
						imageStatus: 'success',
                        imageUrl: fullImageUrl, // For display
                        imageStatusMessage: 'Image generated.',
                        propDataUpdates: { propImage: fullImageUrl } // For final JSON
					});
					clearPollingInterval(propId, 'image');
                    // ---- TRIGGER MODEL GENERATION (if not reused) ----
                    const finalPropStateForModel = receivedProps.find(p => p.id === propId);
                    if (finalPropStateForModel) {
                        // Check if model was already handled (reused or skipped)
                        if (finalPropStateForModel.modelStatus === 'idle') {
					        triggerModelGeneration(finalPropStateForModel);
                        } else {
                             console.log(`[Prop: ${propId}] Model status already terminal (${finalPropStateForModel.modelStatus}), not triggering generation.`);
                        }
                    } else { /* ... error handling ... */ }
					break;
				case 'failure':
				case 'error':
					updatePropState(propId, {
						imageStatus: 'failed', imageStatusMessage: `Image Failed: ${statusReport.message || 'Unknown error'}`, modelStatus: 'skipped_image_failed',
					});
					clearPollingInterval(propId, 'image');
					break;
                // Other cases ('processing', 'generating', 'queued', default)
                case 'processing':
                case 'generating':
					updatePropState(propId, { imageStatus: 'generating', imageStatusMessage: `Generating image... (Attempt ${currentAttempts})` });
					break;
                case 'queued':
                    updatePropState(propId, { imageStatus: 'queued', imageStatusMessage: `Image in queue... (Attempt ${currentAttempts})` });
					break;
				default:
					console.warn(`[Prop: ${propId}] Unknown IMAGE status: ${statusReport.status}. Continuing poll.`);
					updatePropState(propId, { imageStatusMessage: `Unknown status: ${statusReport.status} (Attempt ${currentAttempts})` });
					break;
			}
		} catch (err: any) { 
            console.error(`[Prop: ${propId}] Error during image polling:`, err);
			if (err instanceof SyntaxError) { /* ... json parse error ... */ }
            else {
                updatePropState(propId, { imageStatus: 'failed', imageStatusMessage: `Polling error: ${err.message}`, modelStatus: 'skipped_image_failed' });
                clearPollingInterval(propId, 'image');
            }
        }
	}

	// --- Function to Trigger Model Generation (Only called if needed) ---
	async function triggerModelGeneration(propState: PropState) {
		// Condition checks (image success, metadata) already happened before calling
        if (propState.imageStatus !== 'success' || !propState.imageUrl) { /* ... redundant check, handled by caller ... */ return; }
        if (!metadata || !metadata.worldName) { /* ... redundant check ... */ return; }

        const worldID = metadata.worldName.replace(/\s+/g, '-').toLowerCase();
		const propID = propState.id.replace(/\s+/g, '-').toLowerCase();
        const requestBody = {
			imagePublicUrl: propState.imageUrl, // Use the generated image URL
			userID: USER_ID_FOR_UPLOADS, worldID, propID
		};
		console.log(`[Prop: ${propID}] Enqueuing 3D model generation...`, requestBody);
		updatePropState(propState.id, { modelStatus: 'queued', modelStatusMessage: 'Sending request to model queue...' });

		try {
			const response = await fetch(MODEL_GENERATION_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
			if (!response.ok) {
                let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* ignore */ }
				throw new Error(`Failed to enqueue model: ${errorBody}`);
            }
			const result: any = await response.json();
			if (!result.statusKey) throw new Error("Model enqueue response missing 'statusKey'.");
			const fullModelStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`;
			updatePropState(propState.id, { modelStatus: 'polling', modelStatusUrl: fullModelStatusUrl, modelStatusMessage: 'Model Queued. Waiting...', modelAttempts: 0 });
			startModelPolling(propState.id, fullModelStatusUrl);
		} catch (err: any) { 
            console.error(`[Prop: ${propID}] Error enqueuing model generation:`, err);
			updatePropState(propState.id, { modelStatus: 'error_enqueue', modelStatusMessage: `Model Enqueue failed: ${err.message}` });
        }
	}

	// --- Function to Start Model Polling ---
	function startModelPolling(propId: string, statusUrl: string) {
        clearPollingInterval(propId, 'model');
		console.log(`[Prop: ${propId}] Starting MODEL polling for status at ${statusUrl}`);
		const intervalId = setInterval(() => { pollModelStatus(propId, statusUrl); }, POLLING_INTERVAL_MS);
		activeModelPollingIntervals.set(propId, intervalId);
    }

	// --- Function to Poll Model Status ---
	async function pollModelStatus(propId: string, statusUrl: string) { 
        const propIndex = receivedProps.findIndex(p => p.id === propId);
		if (propIndex === -1) { /* ... */ clearPollingInterval(propId, 'model'); return; }
		let currentAttempts = receivedProps[propIndex].modelAttempts + 1;
		updatePropState(propId, { modelAttempts: currentAttempts });
		if (currentAttempts > MAX_MODEL_POLL_ATTEMPTS) { /* ... timeout ... */
             updatePropState(propId, { modelStatus: 'failed', modelStatusMessage: 'Model polling timed out.' });
             clearPollingInterval(propId, 'model'); return;
        }
		console.log(`[Prop: ${propId}] MODEL Polling attempt ${currentAttempts}...`);
		try {
			const response = await fetch(statusUrl, { cache: 'no-store' });
			if (response.status === 404) { /* ... 404 handling ... */ return; }
			if (!response.ok) throw new Error(`HTTP error ${response.status} fetching model status`);
			const statusReport: any = await response.json();
			console.log(`[Prop: ${propId}] Received MODEL status:`, statusReport.status);

			switch (statusReport.status) {
				case 'success':
					if (!statusReport.r2ModelPath?.toLowerCase().endsWith('.glb')) { /* ... validation ... */ }
					const fullModelUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ModelPath}`;
					updatePropState(propId, {
						modelStatus: 'success',
                        modelUrl: fullModelUrl, // For display
                        modelStatusMessage: 'Model generated.',
                        propDataUpdates: { propModel: fullModelUrl } // For final JSON
					});
					clearPollingInterval(propId, 'model');
					break;
				case 'failure':
				case 'error':
					updatePropState(propId, { modelStatus: 'failed', modelStatusMessage: `Model Failed: ${statusReport.message || 'Unknown error'}`});
					clearPollingInterval(propId, 'model');
					break;
                // Other cases ('processing', 'generating', 'queued', default)
                case 'processing':
				case 'generating':
					updatePropState(propId, { modelStatus: 'generating', modelStatusMessage: `Generating model... (Attempt ${currentAttempts})` });
					break;
				case 'queued':
				    updatePropState(propId, { modelStatus: 'queued', modelStatusMessage: `Model in queue... (Attempt ${currentAttempts})` });
                    break;
				default:
					console.warn(`[Prop: ${propId}] Unknown MODEL status: ${statusReport.status}. Continuing poll.`);
					updatePropState(propId, { modelStatusMessage: `Unknown model status: ${statusReport.status} (Attempt ${currentAttempts})` });
					break;
			}
		} catch (err: any) {
            console.error(`[Prop: ${propId}] Error during model polling:`, err);
			if (err instanceof SyntaxError) { /* ... json parse error ... */ }
            else {
                updatePropState(propId, { modelStatus: 'failed', modelStatusMessage: `Model polling error: ${err.message}` });
                clearPollingInterval(propId, 'model');
            }
        }
	}

	// --- Helper to Clear Interval ---
	function clearPollingInterval(propId: string, type: 'image' | 'model') {
        const intervalMap = type === 'image' ? activeImagePollingIntervals : activeModelPollingIntervals;
		if (intervalMap.has(propId)) {
			clearInterval(intervalMap.get(propId));
			intervalMap.delete(propId);
			console.log(`[Prop: ${propId}] Cleared ${type} polling interval.`);
		}
    }

	// --- Function to Start Streaming ---
	function startStreaming() {
		if (!claudeApiUrl || !uploadApiUrl) { /* ... */ error = "Initialization error: API URLs not available."; return; }
        // No need to check userPrompt if reuseJsonUrl is provided
		if ((!userPrompt || userPrompt.trim() === '') && (!reuseJsonUrl || reuseJsonUrl.trim() === '')) {
			error = "Please enter a prompt OR provide a JSON URL to reuse."; return;
		}

		console.log(`Starting data stream...`);
		// Reset state
		receivedProps = [];
		metadata = null;
		error = null;
		isLoading = true;
		isComplete = false;
        uploadStatus = 'idle';
        uploadMessage = '';
        finalJsonUrl = null;
		activeImagePollingIntervals.forEach(clearInterval); activeImagePollingIntervals.clear();
		activeModelPollingIntervals.forEach(clearInterval); activeModelPollingIntervals.clear();

		// --- MODIFIED: Include reuseJSON if provided ---
        const requestBody: { prompt: string; reuseJSON?: string } = { prompt: userPrompt || "Reusing JSON" }; // Provide a dummy prompt if reusing
		if (reuseJsonUrl && reuseJsonUrl.trim() !== '') {
            requestBody.reuseJSON = reuseJsonUrl.trim();
			console.log("Sending request with reuseJSON URL:", requestBody.reuseJSON);
		} else {
            console.log("Sending request with prompt:", userPrompt);
        }
        // Clear the reuse URL input after starting, maybe? Optional.
        // reuseJsonUrl = '';

		oboe({
			url: claudeApiUrl, method: 'POST', body: requestBody,
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			cached: false, withCredentials: false
		})
			.node('metadata', (meta: any) => {
                console.log('Received Metadata:', meta);
				if (!metadata) {
					metadata = meta;
					if (!metadata?.worldName) { console.error("Metadata received, but missing 'worldName'."); }
                    // Trigger pending generations (only relevant if NOT reusing JSON with pre-generated props)
                    receivedProps.forEach(p => {
                        if (p.imageStatus === 'idle' && p.imageStatusMessage?.includes('Waiting for metadata')) {
                            // Check again before triggering
                            if (metadata && metadata.worldName) {
                                if (!p.propData.propImage) { // Only trigger if image not already present
                                    console.log(`[Prop: ${p.id}] Triggering delayed image generation (metadata received).`);
							        triggerImageGeneration(p);
                                } else {
                                    console.log(`[Prop: ${p.id}] Image already present, skipping delayed generation.`);
                                }
                            } else { /* ... fail state ... */ }
                        }
                    });
				} else { console.warn("Received metadata chunk again, ignoring."); }
            })
			.node('propCategories.*.props[*]', (propObject: PropData) => { // MODIFIED node handler
                if (!propObject?.name) {
                    console.warn('Received prop without a name, skipping:', propObject);
                    return;
                }
                if (!receivedProps.some(p => p.id === propObject.name)) {
                    console.log(`Received Prop Object: ${propObject.name}`);

                    // --- Initialize Prop State ---
                    const newPropState: PropState = {
						id: propObject.name,
						propData: { ...propObject }, // Store initial data, including potential reused URLs
						// Default states - will be overridden if reused
                        imageStatus: 'idle',
						imageStatusMessage: 'Received. Pending processing.',
						imageAttempts: 0,
						modelStatus: 'idle',
						modelStatusMessage: 'Waiting for image.',
						modelAttempts: 0,
                        imageUrl: undefined, // Ensure reset
                        modelUrl: undefined, // Ensure reset
					};

                    let triggerImageGen = false;
                    let triggerModelGen = false; // Flag for later use

                    // --- Check for Reused Image URL ---
                    if (propObject.propImage) {
                        console.log(`[Prop: ${propObject.name}] Reusing existing image URL: ${propObject.propImage}`);
                        newPropState.imageStatus = 'reused';
                        newPropState.imageUrl = propObject.propImage;
                        newPropState.imageStatusMessage = 'Reused from JSON';
                    } else {
                        // Image needs generation - check if metadata is ready
                        if (metadata && metadata.worldName) {
                             triggerImageGen = true; // Mark for generation below
                             newPropState.imageStatusMessage = 'Pending image generation.';
                        } else {
                            console.warn(`[Prop: ${propObject.name}] Delaying image gen (waiting for metadata).`);
                            newPropState.imageStatusMessage = 'Waiting for metadata...';
                            // Status remains 'idle'
                        }
                    }

                    // --- Check for Reused Model URL ---
                    if (propObject.propModel) {
                         console.log(`[Prop: ${propObject.name}] Reusing existing model URL: ${propObject.propModel}`);
                         newPropState.modelStatus = 'reused';
                         newPropState.modelUrl = propObject.propModel;
                         newPropState.modelStatusMessage = 'Reused from JSON';
                    } else {
                        // Model needs generation or skipping
                        if (newPropState.imageStatus === 'reused') {
                            // Image was reused, but model wasn't provided in JSON
                            console.warn(`[Prop: ${propObject.name}] Image reused, but model URL missing in JSON. Skipping model.`);
                            newPropState.modelStatus = 'skipped_not_in_json';
                            newPropState.modelStatusMessage = 'Skipped: Not in reused JSON.';
                        } else if (newPropState.imageStatus === 'success') {
                             // This case should theoretically not happen here, but for safety:
                             triggerModelGen = true; // Mark for generation (will be called by image poll success)
                             newPropState.modelStatusMessage = 'Pending model generation.';
                        } else if (newPropState.imageStatus === 'idle') {
                             // Normal case: image is also pending
                             newPropState.modelStatusMessage = 'Waiting for image generation.';
                             // Status remains 'idle'
                        } else {
                            // Image failed/skipped during initial check - model should also be skipped
                            newPropState.modelStatus = 'skipped_image_failed';
                            newPropState.modelStatusMessage = 'Skipped: Image processing needed/failed.';
                        }
                    }

                    // Add the initialized/updated state to the list
                    receivedProps = [...receivedProps, newPropState];

                    // Trigger generation only AFTER adding to list and if needed
                    if (triggerImageGen) {
                        // Need to find the state we just added to pass it
                        const stateToTrigger = receivedProps.find(p => p.id === newPropState.id);
                        if (stateToTrigger) {
                            triggerImageGeneration(stateToTrigger);
                        } else {
                             console.error(`[Prop: ${newPropState.id}] Failed to find prop state immediately after adding it!`);
                        }
                    }
                    // Model generation is triggered by image success or handled by reuse checks

				} else {
                     console.warn(`Received duplicate prop name '${propObject.name}'. Skipping.`);
                }
			})
			.done((finalJson: any) => {
                console.log('Stream finished successfully.');
				isLoading = false; // Claude stream finished

                // Final check: Ensure metadata was received AND has worldName. If not, fail waiting props.
                let metadataError = false;
                if (!metadata) {
                    console.error("Stream finished, but no metadata was ever received.");
                    if (!error) error = "Stream completed, but failed to receive essential metadata.";
                    metadataError = true;
                } else if (!metadata.worldName) {
                     console.error("Stream finished, metadata received but missing worldName.");
                     if (!error) error = "Stream completed, but metadata is missing required worldName.";
                     metadataError = true;
                }

                if (metadataError) {
                    receivedProps.forEach(p => {
                        // Fail any prop still waiting for metadata
                        if (p.imageStatus === 'idle' && p.imageStatusMessage?.includes('Waiting for metadata')) {
                            updatePropState(p.id, {
                                imageStatus: 'failed', imageStatusMessage: 'Failed: Critical metadata missing or invalid.',
                                modelStatus: 'skipped_image_failed'
                            });
                        }
                    });
                     uploadStatus = 'failed'; // Prevent upload due to critical metadata error
                     uploadMessage = 'Cannot upload scene JSON: Critical metadata missing.';
                }

                if (!error) {
                    isComplete = true; // Mark Claude stream as complete *only if no fatal errors occurred*
                    // The final upload trigger is handled by the reactive block `$: {...}` below
                } else {
                    // If an error occurred during the stream itself (set by .fail or the metadata check above)
                    isComplete = false; // Ensure it's false
                     if (uploadStatus === 'idle') { // Avoid overwriting specific metadata error message
                        uploadStatus = 'failed';
                        uploadMessage = 'Cannot upload scene JSON due to errors during data generation.';
                     }
                }
            })
			.fail((errorReport: any) => {
                console.error('Stream processing failed:', errorReport);
				isLoading = false;
				isComplete = false; // Stream did not complete successfully
                uploadStatus = 'failed'; // Prevent upload
                uploadMessage = 'Cannot upload scene JSON: Main data stream failed.';
				let errorMessage = `json stream failed: ${errorReport.statusCode || 'Network Error'}. `;
				if (errorReport.body) { try { const parsedBody = JSON.parse(errorReport.body); errorMessage += parsedBody.error || parsedBody.message || parsedBody.details || errorReport.body; } catch (e) { errorMessage += errorReport.body; } }
				else if (errorReport.thrown) { errorMessage += (errorReport.thrown as Error).message || 'Client-side error'; }
				error = errorMessage;

				// Mark any props still processing as failed and clear intervals
				receivedProps.forEach(p => {
                    // Use the defined terminal statuses for checking
					if (!terminalImageStatuses.includes(p.imageStatus as any)) {
						updatePropState(p.id, { imageStatus: 'failed', imageStatusMessage: 'Failed: Main data stream error.' });
						clearPollingInterval(p.id, 'image');
					}
                     if (!terminalModelStatuses.includes(p.modelStatus as any)) {
						updatePropState(p.id, { modelStatus: 'failed', modelStatusMessage: 'Failed: Main data stream error.' });
						clearPollingInterval(p.id, 'model');
					}
				});
            });
	}

    // --- Check if all props have finished processing (Uses helper functions) ---
    $: isAllProcessingComplete = receivedProps.length > 0 && receivedProps.every(p =>
        isTerminalImageStatus(p.imageStatus) && isTerminalModelStatus(p.modelStatus)
    );

    // --- Trigger Final JSON Upload when Ready ---
    $: {
        if (isComplete && isAllProcessingComplete && uploadStatus === 'idle' && !error) {
             console.log("All processing complete. Triggering final JSON upload.");
             uploadStatus = 'pending';
             uploadFinalSceneJson();
        } else if (isComplete && receivedProps.length === 0 && uploadStatus === 'idle' && !error) {
            console.log("Stream finished, no props received/generated. Skipping upload.");
            uploadStatus = 'skipped';
            uploadMessage = 'No props generated, skipping final JSON upload.';
        }
    }

    // --- Function to Upload Final Scene JSON (NEW) ---
    async function uploadFinalSceneJson() {
        // Re-check critical dependencies right before upload attempt
        if (!metadata || !metadata.worldName) {
            console.error("Cannot upload final JSON: Missing metadata or worldName.");
            uploadStatus = 'failed';
            uploadMessage = 'Upload failed: Missing required metadata (worldName).';
            return;
        }
        if (!uploadApiUrl) {
             console.error("Cannot upload final JSON: Upload API URL not configured.");
            uploadStatus = 'failed';
            uploadMessage = 'Upload failed: Frontend configuration error (API URL missing).';
            return;
        }

        uploadStatus = 'uploading'; // Update status
        uploadMessage = 'Preparing and uploading final scene JSON...';
        finalJsonUrl = null; // Clear previous URL if any

        const worldID = metadata.worldName.replace(/\s+/g, '-').toLowerCase();
        // Construct the final R2 key according to the requirement
        const r2key = `worlds/${USER_ID_FOR_UPLOADS}/${worldID}/scene/${worldID}.json`;

        // Construct the final JSON object - using only the updated propData from each state item
        const finalSceneData = {
            metadata: metadata,
            // Extract the propData which now contains propImage and propModel (if successful)
            props: receivedProps.map(p => p.propData)
        };

        try {
            const jsonString = JSON.stringify(finalSceneData, null, 2); // Pretty print JSON
            // Convert JSON string to Base64 using browser's built-in btoa function
            const base64Data = btoa(unescape(encodeURIComponent(jsonString))); // Handle potential UTF-8 issues

            // Prepare the request body for the /api/storage/upload endpoint
            const requestBody = {
                r2key: r2key,
                fileData: base64Data, // The Base64 encoded string
                contentType: 'application/json' // Specify the content type
            };

            console.log(`Uploading final JSON to R2 key: ${r2key}`);
            const response = await fetch(uploadApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody) // Send the control structure as JSON
            });

            const result:any = await response.json(); // Attempt to parse JSON response regardless of status

            if (!response.ok) {
                // Handle API errors based on the response body
                console.error("Upload API call failed:", response.status, result);
                // Use error message from API response if available
                throw new Error(result?.error || result?.message || `Upload failed with status ${response.status}`);
            }

            // Success case
            console.log("Final JSON uploaded successfully:", result);
            uploadStatus = 'success';
            uploadMessage = `Scene JSON uploaded successfully!`;
            finalJsonUrl = result.publicUrl; // Store the public URL from the API response

        } catch (err: any) {
            console.error("Error during final JSON upload:", err);
            uploadStatus = 'failed';
            // Display the caught error message
            uploadMessage = `Upload failed: ${err.message}`;
        }
    }


    // --- Modal Control Functions ---
    function openImageModal(url: string, name: string) {
        selectedImageUrl = url;
        selectedPropName = name;
        showImageModal = true;
    }
    function closeImageModal() {
        showImageModal = false;
        selectedImageUrl = '';
         selectedPropName = '';
    }
    function openModelModal(url: string, name: string) {
        selectedModelUrl = url;
        selectedPropName = name;
        showModelModal = true;
    }
    function closeModelModal() {
        showModelModal = false;
        selectedModelUrl = '';
        selectedPropName = '';
    }

</script>

<svelte:head>
	<title>Generative 3D World Building Pipeline</title>
</svelte:head>

<div class="container mx-auto p-6 font-sans">
	<h1 class="text-3xl font-bold mb-6 text-gray-800">Generative 3D World Building Pipeline</h1>

	<!-- Input Area -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <!-- Prompt Input -->
        <div>
            <label for="prompt-input" class="block text-sm font-medium text-gray-700 mb-1">Enter Prompt:</label>
            <textarea
                id="prompt-input"
                bind:value={userPrompt}
                rows="4"
                class="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                placeholder="e.g., Describe a futuristic cityscape..."
                disabled={isLoading || uploadStatus === 'uploading' || (reuseJsonUrl && reuseJsonUrl.trim() !== '')}
            ></textarea>
            <p class="text-xs text-gray-500 mt-1">Describe the world you want to generate.</p>
        </div>

        <!-- Reuse JSON Input (NEW) -->
        <div>
            <label for="reuse-json-url" class="block text-sm font-medium text-gray-700 mb-1">Or Reuse Existing JSON:</label>
            <input
                type="url"
                id="reuse-json-url"
                bind:value={reuseJsonUrl}
                class="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                placeholder="https://your-r2-url/.../scene.json"
                disabled={isLoading || uploadStatus === 'uploading' || (userPrompt && userPrompt.trim() !== '')}
            />
            <p class="text-xs text-gray-500 mt-1">Enter the R2 public URL of a previously generated scene JSON to reuse its props.</p>
        </div>
    </div>


	<!-- Generate Button -->
	<div class="mb-6">
		<button
            on:click={startStreaming}
            disabled={
                isLoading ||
                !claudeApiUrl ||
                !uploadApiUrl ||
                uploadStatus === 'uploading' ||
                ((!userPrompt || userPrompt.trim() === '') && (!reuseJsonUrl || reuseJsonUrl.trim() === ''))
            }
            class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out shadow-md disabled:cursor-not-allowed"
        >
			{#if isLoading}
				<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
				{#if reuseJsonUrl && reuseJsonUrl.trim() !== ''} Reusing Data... {:else} Generating Data... {/if}
			{:else if !claudeApiUrl || !uploadApiUrl} Initializing...
            {:else if uploadStatus === 'uploading'}
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Uploading Scene...
			{:else}
                {#if reuseJsonUrl && reuseJsonUrl.trim() !== ''} Reuse JSON {:else} Generate 3D World {/if}
			{/if}
		</button>
	</div>

	<!-- Status/Error Messages -->
	{#if error}
	<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 whitespace-pre-wrap" role="alert">
		<strong class="font-bold">Error!</strong>
		<span class="block sm:inline"> {error}</span>
	</div>
	{/if}
    <!-- Message shown after stream finishes but before all processing jobs are done -->
	{#if isComplete && !isAllProcessingComplete && receivedProps.length > 0 && !error && !['success', 'failed', 'skipped'].includes(uploadStatus) }
	<div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mb-4" role="status">
		<strong class="font-bold">Processing...</strong>
		<span class="block sm:inline"> Data stream complete. Waiting for any remaining generation tasks to finish before final upload.</span>
	</div>
	{/if}
	{#if isLoading}
	<div class="text-center text-gray-600 my-4">
		<p>
            {#if reuseJsonUrl && reuseJsonUrl.trim() !== ''} Streaming reused JSON data... {:else} Streaming data from Madmods AI... {/if}
        </p>
		{#if receivedProps.length > 0 || metadata} <p class="text-sm">(Rendering results received so far)</p> {/if}
	</div>
	{/if}

	<!-- Display Metadata -->
	{#if metadata}
	<div class="mb-6 p-4 border rounded-lg shadow-sm bg-gray-50">
		<h2 class="text-xl font-semibold mb-2 text-gray-700">Metadata</h2>
		<p><strong>World Name (ID):</strong> <span class:text-red-600={!metadata.worldName}>{metadata.worldName || '(Not provided - CRITICAL ERROR!)'}</span></p>
		<p><strong>Timestamp:</strong> {metadata.timestampUTC || '(Not provided)'}</p>
		<p><strong>User ID (for images/models):</strong> {USER_ID_FOR_UPLOADS}</p>
	</div>
	{/if}

    <!-- Final Upload Status (NEW Section) -->
    {#if uploadStatus === 'uploading'}
    <div class="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded relative mb-4 flex items-center" role="status">
        <svg class="animate-spin mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
		<div><strong class="font-bold">Uploading Scene...</strong>
        <span class="block sm:inline"> {uploadMessage || 'Processing...'}</span></div>
	</div>
    {:else if uploadStatus === 'success'}
    <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
		<strong class="font-bold">Upload Complete!</strong>
        <span class="block sm:inline"> {uploadMessage}</span>
        {#if finalJsonUrl}
            <a href={finalJsonUrl} target="_blank" rel="noopener noreferrer" class="ml-2 text-sm underline text-green-800 hover:text-green-900 font-medium">View Uploaded JSON</a>
        {/if}
	</div>
    {:else if uploadStatus === 'failed'}
    <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 whitespace-pre-wrap" role="alert">
		<strong class="font-bold">Upload Failed!</strong>
		<span class="block sm:inline"> {uploadMessage || 'An unknown error occurred during upload.'}</span>
	</div>
    {:else if uploadStatus === 'skipped'}
     <div class="bg-gray-100 border border-gray-400 text-gray-700 px-4 py-3 rounded relative mb-4" role="status">
		<strong class="font-bold">Upload Skipped.</strong>
		<span class="block sm:inline"> {uploadMessage || 'No scene JSON was uploaded.'}</span>
	</div>
    {/if}


	<!-- Display Received Props -->
	<div class="space-y-6">
		<h2 class="text-2xl font-semibold mb-3 text-gray-700 border-b pb-2">
			Generated Scene Props ({receivedProps.length})
            <!-- Status indicators remain the same -->
             {#if isLoading} <span class="text-sm font-normal text-gray-500">(Receiving data...)</span>
            {:else if !isComplete && receivedProps.length > 0} <span class="text-sm font-normal text-gray-500">(Processing...)</span>
            {:else if isComplete && !isAllProcessingComplete && receivedProps.length > 0 && !error} <span class="text-sm font-normal text-yellow-600">(Waiting for jobs...)</span>
            {:else if isComplete && isAllProcessingComplete && receivedProps.length > 0 && !error} <span class="text-sm font-normal text-green-600">(Processing Complete)</span>
            {/if}
		</h2>
		<!-- Empty state messages remain the same -->
        {#if receivedProps.length === 0 && !isLoading && !error && uploadStatus === 'idle' && !isComplete}
			<p class="text-gray-500 italic">Enter a prompt or reuse URL and click 'Generate' / 'Reuse' to start.</p>
		{:else if receivedProps.length === 0 && isLoading}
			<p class="text-gray-500 italic">Waiting for the first prop data...</p>
        {:else if receivedProps.length === 0 && isComplete && !error && uploadStatus === 'skipped'}
             <p class="text-gray-500 italic">Stream finished, but no props were generated.</p>
		{/if}

		{#each receivedProps as propState, i (propState.id)}
		<div class="border rounded-lg p-4 shadow-sm bg-white hover:shadow-md transition-shadow duration-150 animate-fade-in flex flex-col lg:flex-row gap-4">
			<!-- Left side: Prop Details (displays reused URLs automatically) -->
			<div class="flex-1">
                <h3 class="text-lg font-bold text-indigo-700 mb-2">{propState.propData.name || `Prop ${i + 1}`}</h3>
				<p class="text-gray-600 mb-2 text-sm">{propState.propData.description || 'No description.'}</p>
                <!-- Colors Display -->
                <div class="mb-2">
                    <strong class="text-sm text-gray-800">Colors:</strong>
                    {#if propState.propData.colors && propState.propData.colors.length > 0}
                       <div class="flex flex-wrap gap-2 mt-1">
							{#each propState.propData.colors as colorObj}
                                {#if typeof colorObj === 'object' && colorObj !== null && !Array.isArray(colorObj)}
                                    {#each Object.entries(colorObj) as [name, hex]}
                                        <span class="text-xs font-medium px-2.5 py-0.5 rounded border" title={String(hex ?? 'Invalid Hex')}>
                                            <span class="inline-block w-3 h-3 rounded-full mr-1 border border-gray-300 align-middle" style="background-color: {typeof hex === 'string' && hex.startsWith('#') ? hex : '#ffffff'};"></span>
                                            {name} ({typeof hex === 'string' ? hex : 'Invalid'})
                                        </span>
                                    {/each}
                                {:else} <span class="text-xs text-red-500 italic">Invalid Color Format</span> {/if}
							{/each}
						</div>
                    {:else} <span class="text-sm text-gray-500 italic ml-2">None</span> {/if}
                </div>
                <!-- Transforms Display -->
                <div>
                    <strong class="text-sm text-gray-800">Transforms:</strong>
                    <span class="text-sm ml-2">{Array.isArray(propState.propData.transforms) ? propState.propData.transforms.length : 0} instance(s)</span>
                     {#if Array.isArray(propState.propData.transforms) && propState.propData.transforms.length > 0}
                        <details class="text-xs mt-1">
                            <summary class="cursor-pointer text-gray-600">Show Details</summary>
                            <pre class="bg-gray-100 p-2 rounded mt-1 overflow-x-auto max-h-40"><code>{JSON.stringify(propState.propData.transforms, null, 2)}</code></pre>
                        </details>
                    {/if}
                </div>
                 <!-- Display final URLs if available (NEW) -->
                 {#if propState.propData.propImage}
                 <div class="mt-2 text-xs text-gray-500">
                     <strong>Image URL:</strong> <a href={propState.propData.propImage} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline break-all ml-1">{propState.propData.propImage}</a>
                 </div>
                 {/if}
                  {#if propState.propData.propModel}
                 <div class="mt-1 text-xs text-gray-500">
                     <strong>Model URL:</strong> <a href={propState.propData.propModel} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline break-all ml-1">{propState.propData.propModel}</a>
                 </div>
                 {/if}
            </div>

			<!-- Right side: Image & Model Status (NEW STATUSES ADDED) -->
			<div class="w-full lg:w-64 flex flex-col gap-4 border-t lg:border-t-0 lg:border-l pt-4 lg:pt-0 lg:pl-4">

				<!-- Image Status Display -->
				<div class="flex flex-col items-center">
					<strong class="text-sm text-gray-800 mb-1">Generated Image</strong>
					{#if propState.imageStatus === 'idle'}
						<div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-gray-50 text-gray-500">
                            <p>{propState.imageStatusMessage || 'Waiting...'}</p>
                        </div>
                    {:else if propState.imageStatus === 'reused' && propState.imageUrl}
                        <button on:click={() => openImageModal(propState.imageUrl!, propState.propData.name)} class="w-full h-32 bg-gray-100 rounded overflow-hidden flex items-center justify-center hover:opacity-80 transition-opacity border border-gray-200">
							<img src={propState.imageUrl} alt="Thumb for {propState.propData.name}" class="object-contain w-full h-full" loading="lazy"/>
						</button>
						<p class="text-xs mt-1 text-center text-purple-600">{propState.imageStatusMessage || 'Reused'}</p> <!-- Purple for reused -->
					{:else if propState.imageStatus === 'queued' || propState.imageStatus === 'generating' || propState.imageStatus === 'polling'}
						<div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-blue-50 text-blue-700">
                            <svg class="animate-spin h-5 w-5 mx-auto mb-1 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <p class="animate-pulse">{propState.imageStatusMessage || 'Processing...'}</p>
                            {#if propState.imageStatus === 'polling' || propState.imageStatus === 'generating'}
                                <p class="text-xs text-gray-500 mt-1">(Attempt {propState.imageAttempts})</p>
                            {/if}
						</div>
					{:else if propState.imageStatus === 'success' && propState.imageUrl}
						<button on:click={() => openImageModal(propState.imageUrl!, propState.propData.name)} class="w-full h-32 bg-gray-100 rounded overflow-hidden flex items-center justify-center hover:opacity-80 transition-opacity border border-gray-200">
							<img src={propState.imageUrl} alt="Thumb for {propState.propData.name}" class="object-contain w-full h-full" loading="lazy"/>
						</button>
						<p class="text-xs mt-1 text-center text-green-600">{propState.imageStatusMessage || 'Success'}</p>
					{:else if propState.imageStatus === 'failed' || propState.imageStatus === 'error_enqueue'}
						<div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-red-50 text-red-700">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto mb-1 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
							<p class="font-semibold">Image Failed</p>
							<p class="text-xs mt-1 break-words max-w-full text-center">{propState.imageStatusMessage || 'Unknown error'}</p>
						</div>
					{/if}
				</div>

				<!-- Model Status Display -->
                 <div class="flex flex-col items-center mt-2">
                    <strong class="text-sm text-gray-800 mb-1">3D Model</strong>
                    {#if propState.modelStatus === 'idle'}
                        <div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-gray-50 text-gray-500">
                            <p>{propState.modelStatusMessage || 'Waiting...'}</p>
                        </div>
                    {:else if propState.modelStatus === 'reused' && propState.modelUrl}
                         <button on:click={() => openModelModal(propState.modelUrl!, propState.propData.name)} class="bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold py-1.5 px-3 rounded transition duration-150 ease-in-out shadow w-full"> <!-- Purple button -->
                            View Reused 3D Model
                        </button>
                         <p class="text-xs mt-1 text-center text-purple-600">{propState.modelStatusMessage || 'Reused'}</p>
                    {:else if propState.modelStatus === 'skipped_image_failed'}
                         <div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-yellow-50 text-yellow-700">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto mb-1 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
							<p class="font-semibold">Model Skipped</p>
                            <p class="text-xs mt-1 break-words max-w-full text-center">{propState.modelStatusMessage || 'Skipped: Image generation failed.'}</p>
						</div>
                    {:else if propState.modelStatus === 'skipped_not_in_json'}
                         <div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-orange-50 text-orange-700"> <!-- Orange for this skipped state -->
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto mb-1 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
							<p class="font-semibold">Model Skipped</p>
                            <p class="text-xs mt-1 break-words max-w-full text-center">{propState.modelStatusMessage || 'Skipped: Not in reused JSON.'}</p>
						</div>
                    {:else if propState.modelStatus === 'queued' || propState.modelStatus === 'generating' || propState.modelStatus === 'polling'}
                        <div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-blue-50 text-blue-700">
                            <svg class="animate-spin h-5 w-5 mx-auto mb-1 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <p class="animate-pulse">{propState.modelStatusMessage || 'Processing...'}</p>
                            {#if propState.modelStatus === 'polling' || propState.modelStatus === 'generating'}
                                <p class="text-xs text-gray-500 mt-1">(Attempt {propState.modelAttempts})</p>
                            {/if}
                        </div>
                    {:else if propState.modelStatus === 'success' && propState.modelUrl}
                        <button on:click={() => openModelModal(propState.modelUrl!, propState.propData.name)} class="bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold py-1.5 px-3 rounded transition duration-150 ease-in-out shadow w-full">
                            View 3D Model
                        </button>
                         <p class="text-xs mt-1 text-center text-green-600">{propState.modelStatusMessage || 'Model Ready'}</p>
                    {:else if propState.modelStatus === 'failed' || propState.modelStatus === 'error_enqueue'}
                        <div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-red-50 text-red-700">
                           <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto mb-1 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
							<p class="font-semibold">Model Failed</p>
							<p class="text-xs mt-1 break-words max-w-full text-center">{propState.modelStatusMessage || 'Unknown error'}</p>
                        </div>
                    {/if}
                </div>

			</div> <!-- End Right Side -->
		</div> <!-- End Prop Card -->
		{/each}
	</div> <!-- End Props List -->

</div> <!-- End Container -->

<!-- Image Modal -->
{#if showImageModal}
<div class="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-75 p-4" on:click|self={closeImageModal} role="dialog" aria-modal="true" aria-labelledby="image-modal-title">
    <div class="relative max-w-4xl max-h-[90vh] bg-white rounded-lg shadow-xl overflow-hidden">
        <button on:click={closeImageModal} class="absolute top-2 right-2 z-50 rounded-full bg-gray-600 bg-opacity-50 p-1 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white" aria-label="Close image viewer">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <h3 id="image-modal-title" class="sr-only">Image for {selectedPropName}</h3>
        {#if selectedImageUrl} <img src={selectedImageUrl} alt="Full size for {selectedPropName}" class="block max-w-full max-h-[85vh] object-contain"/> {:else} <div class="p-8 text-center text-gray-500">Loading image...</div> {/if}
    </div>
</div>
{/if}

<!-- Model Viewer Modal -->
{#if showModelModal}
	<ModelViewer modelUrl={selectedModelUrl} onClose={closeModelModal} propName={selectedPropName} />
{/if}


<style>
	/* Simple fade-in animation */
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }

	/* Basic styles */
	body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
    img { max-width: 100%; height: auto; display: block; }

	/* Ensure modals appear above other content */
	.fixed.z-40 { z-index: 40; } /* Image modal */
	/* ModelViewer likely uses z-50 internally */

    /* Improve pre formatting */
    pre code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 0.8rem;
    }

</style>