<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores'; // Import the page store
	import oboe from 'oboe';
	import ModelViewer from '$lib/components/ModelViewer.svelte'; // Import the model viewer

	// --- Configuration ---
	// IMPORTANT: Replace with your actual R2 public bucket URL if not using env vars
	const R2_PUBLIC_URL_BASE = 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev';
	const IMAGE_GENERATION_ENDPOINT = 'https://imagegeneration.madmods.world';
	const MODEL_GENERATION_ENDPOINT = 'https://modelgeneration.madmods.world';
	const POLLING_INTERVAL_MS = 1000; // Poll every 1 second
	const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes timeout for polling
	const MAX_POLL_ATTEMPTS = Math.round(MAX_POLL_DURATION_MS / POLLING_INTERVAL_MS);
	const MAX_MODEL_POLL_ATTEMPTS = MAX_POLL_ATTEMPTS * 2; // Allow up to 10 minutes for model
    const USER_ID_FOR_UPLOADS = 'frontendUser'; // Consistent User ID for generation and uploads

	// --- Interfaces ---
	interface PropData {
		name: string;
		description?: string;
		colors?: any[];
		transforms?: any[];
        propImage?: string; // <-- ADDED: To store generated image URL in final JSON
        propModel?: string; // <-- ADDED: To store generated model URL in final JSON
	}

	interface PropState {
		id: string; // Unique identifier for this prop instance (e.g., prop.name)
		propData: PropData; // Original prop data from Claude, will be updated with URLs

		// Image Generation State
		imageStatus: 'idle' | 'queued' | 'generating' | 'polling' | 'success' | 'failed' | 'error_enqueue';
		imageStatusUrl?: string;
		imageUrl?: string; // Temporary storage for display/modal before putting in propData
		imageStatusMessage?: string;
		imageAttempts: number;

		// Model Generation State
		modelStatus: 'idle' | 'queued' | 'generating' | 'polling' | 'success' | 'failed' | 'error_enqueue' | 'skipped_image_failed';
		modelStatusUrl?: string;
		modelUrl?: string; // Temporary storage for display/modal before putting in propData
		modelStatusMessage?: string;
		modelAttempts: number;
	}

    // Type for terminal statuses (used for completion check)
    type TerminalStatus = 'success' | 'failed' | 'error_enqueue' | 'skipped_image_failed';
    // Note: image doesn't have 'skipped' as a final state itself, it leads to model being skipped.
    const terminalImageStatuses: Extract<PropState['imageStatus'], 'success' | 'failed' | 'error_enqueue'>[] = ['success', 'failed', 'error_enqueue'];
    const terminalModelStatuses: TerminalStatus[] = ['success', 'failed', 'error_enqueue', 'skipped_image_failed'];


	// --- Reactive State Variables ---
	let receivedProps: PropState[] = [];
	let metadata: any | null = null;
	let isLoading: boolean = false; // Claude stream loading
	let error: string | null = null;
	let isComplete: boolean = false; // Claude stream complete flag
	let userPrompt: string = 'a dinosaur park'; // Default prompt
	let activeImagePollingIntervals: Map<string, number | NodeJS.Timeout> = new Map();
	let activeModelPollingIntervals: Map<string, number | NodeJS.Timeout> = new Map();

	// Modal State
	let showImageModal = false;
	let selectedImageUrl = '';
	let showModelModal = false;
	let selectedModelUrl = '';
	let selectedPropName = ''; // For modal titles

    // Final JSON Upload State (NEW)
    let uploadStatus: 'idle' | 'pending' | 'uploading' | 'success' | 'failed' | 'skipped' = 'idle';
    let uploadMessage: string = '';
    let finalJsonUrl: string | null = null; // Store the URL of the uploaded JSON

	// --- API URLs (to be set in onMount) ---
	let claudeApiUrl: string = '';
    let uploadApiUrl: string = ''; // <-- ADDED

	// --- Set API URLs on Component Mount ---
	onMount(() => {
		const hostname = $page.url.hostname;
		const dev = hostname.includes('localhost') || hostname === '127.0.0.1';
		// Use relative paths for production builds, absolute for local dev potentially hitting deployed APIs
		claudeApiUrl = dev ? 'https://madmods.world/api/ai/claude-streaming' : '/api/ai/claude-streaming';
        // Adjust local dev URL for upload API if different from page origin
        uploadApiUrl = dev ? 'https://madmods.world/api/storage/upload' : '/api/storage/upload';
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
		// Consider canceling ongoing Oboe stream if possible/needed
	});

	// --- Update Prop State Helper (Modified to handle nested propData) ---
	function updatePropState(propId: string, updates: Partial<PropState> & { propDataUpdates?: Partial<PropData> }) {
		const index = receivedProps.findIndex(p => p.id === propId);
		if (index !== -1) {
			const existingProp = receivedProps[index];
			// Merge propData updates if provided
            const updatedPropData = updates.propDataUpdates
                ? { ...existingProp.propData, ...updates.propDataUpdates }
                : existingProp.propData;

            // Remove propDataUpdates from the main updates object before spreading
            const { propDataUpdates, ...restUpdates } = updates;

			receivedProps[index] = {
                ...existingProp,
                ...restUpdates, // Apply top-level updates
                propData: updatedPropData // Apply nested updates
            };
			receivedProps = [...receivedProps]; // Trigger Svelte reactivity
		} else {
			console.warn(`Attempted to update non-existent prop with ID: ${propId}`);
		}
	}


	// --- Function to Trigger Image Generation ---
	async function triggerImageGeneration(propState: PropState) {
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
			console.log(`[Prop: ${propID}] Image task enqueued. Status URL: ${fullStatusUrl}`);
			updatePropState(propState.id, {
				imageStatus: 'polling', imageStatusUrl: fullStatusUrl, imageStatusMessage: 'Image Queued. Waiting...', imageAttempts: 0,
			});
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

	// --- Function to Poll Image Status (Modified for propData update) ---
	async function pollImageStatus(propId: string, statusUrl: string) {
		const propIndex = receivedProps.findIndex(p => p.id === propId);
		if (propIndex === -1) {
			console.warn(`[Prop: ${propId}] Image polling stopped: Prop not found.`);
			clearPollingInterval(propId, 'image'); return;
		}

		let currentAttempts = receivedProps[propIndex].imageAttempts + 1;
		updatePropState(propId, { imageAttempts: currentAttempts });

		if (currentAttempts > MAX_POLL_ATTEMPTS) {
			console.warn(`[Prop: ${propId}] Image polling timed out after ${MAX_POLL_ATTEMPTS} attempts.`);
			updatePropState(propId, { imageStatus: 'failed', imageStatusMessage: 'Polling timed out.', modelStatus: 'skipped_image_failed' });
			clearPollingInterval(propId, 'image'); return;
		}

		console.log(`[Prop: ${propId}] IMAGE Polling attempt ${currentAttempts}...`);
		try {
			const response = await fetch(statusUrl, { cache: 'no-store' }); // Prevent caching of status file

			if (response.status === 404) {
                // Only update message if status is still 'polling'
                if(receivedProps[propIndex].imageStatus === 'polling') {
				    updatePropState(propId, { imageStatusMessage: `Waiting for image status... (Attempt ${currentAttempts})` });
                }
                return; // Keep polling
			}
			if (!response.ok) throw new Error(`HTTP error ${response.status} fetching image status`);

			const statusReport: any = await response.json();
			console.log(`[Prop: ${propId}] Received IMAGE status:`, statusReport.status);

            // Ensure we have the latest prop state before potentially triggering model gen
            const latestPropState = receivedProps[propIndex]; // Read state again *before* switch

			switch (statusReport.status) {
				case 'success':
					if (!statusReport.r2ImagePath) throw new Error("Image status 'success' but missing 'r2ImagePath'.");
					const fullImageUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ImagePath}`;
					console.log(`[Prop: ${propId}] Image generation successful! URL: ${fullImageUrl}`);
					// --- UPDATE PROP DATA ---
					updatePropState(propId, {
						imageStatus: 'success',
                        imageUrl: fullImageUrl, // Keep for immediate display/modal
                        imageStatusMessage: 'Image generated.',
                        propDataUpdates: { propImage: fullImageUrl } // Store in propData for final JSON
					});
					clearPollingInterval(propId, 'image');
					// ---- TRIGGER MODEL GENERATION ----
                    // Get the *very latest* state after updatePropState
                    const finalPropStateForModel = receivedProps.find(p => p.id === propId);
                    if (finalPropStateForModel) {
					    triggerModelGeneration(finalPropStateForModel);
                    } else {
                        console.error(`[Prop: ${propId}] Prop vanished before triggering model generation!`);
                        // Ensure model status reflects failure if prop disappears
                         updatePropState(propId, { modelStatus: 'failed', modelStatusMessage: 'Internal error: Prop data lost before model trigger.' });
                    }
					break;

				case 'failure':
				case 'error': // Handle potential 'error' status from worker
					console.error(`[Prop: ${propId}] Image generation failed. Reason: ${statusReport.message || statusReport.errorDetails || 'Unknown error'}`);
					updatePropState(propId, {
						imageStatus: 'failed', imageStatusMessage: `Image Failed: ${statusReport.message || 'Unknown error'}`, modelStatus: 'skipped_image_failed', // Explicitly skip model gen
					});
					clearPollingInterval(propId, 'image');
					break;

				case 'processing':
                case 'generating': // Handle potential synonyms
					updatePropState(propId, { imageStatus: 'generating', imageStatusMessage: `Generating image... (Attempt ${currentAttempts})` });
					break;

                case 'queued': // Handle if worker explicitly reports queued status
                    updatePropState(propId, { imageStatus: 'queued', imageStatusMessage: `Image in queue... (Attempt ${currentAttempts})` });
					break;

				default:
					console.warn(`[Prop: ${propId}] Unknown IMAGE status: ${statusReport.status}. Continuing poll.`);
					// Keep polling, maybe update message to reflect unknown state
					updatePropState(propId, { imageStatusMessage: `Unknown status: ${statusReport.status} (Attempt ${currentAttempts})` });
					break;
			}
		} catch (err: any) {
			console.error(`[Prop: ${propId}] Error during image polling:`, err);
			// Check if it's a JSON parsing error, which might mean the file is incomplete
			if (err instanceof SyntaxError) {
				console.warn(`[Prop: ${propId}] JSON parsing error during image poll, possibly incomplete status file. Retrying...`);
                updatePropState(propId, { imageStatusMessage: `Reading status... (Attempt ${currentAttempts})` });
			} else {
				updatePropState(propId, { imageStatus: 'failed', imageStatusMessage: `Polling error: ${err.message}`, modelStatus: 'skipped_image_failed' });
				clearPollingInterval(propId, 'image');
			}
		}
	}

	// --- Function to Trigger Model Generation ---
	async function triggerModelGeneration(propState: PropState) {
		// Double-check conditions right before sending request
		if (propState.imageStatus !== 'success' || !propState.imageUrl /* Check temporary URL used for triggering */) {
			console.warn(`[Prop: ${propState.id}] Skipping model generation because image generation did not succeed or URL is missing.`);
			if (propState.modelStatus !== 'skipped_image_failed') { // Avoid redundant update
                updatePropState(propState.id, { modelStatus: 'skipped_image_failed', modelStatusMessage: 'Skipped: Image failed.' });
            }
			return;
		}
		if (!metadata || !metadata.worldName) {
			console.error(`[Prop: ${propState.id}] Cannot trigger model generation: Metadata missing.`);
			updatePropState(propState.id, { modelStatus: 'failed', modelStatusMessage: 'Error: Missing world metadata.' });
			return;
		}

		const worldID = metadata.worldName.replace(/\s+/g, '-').toLowerCase();
		const propID = propState.id.replace(/\s+/g, '-').toLowerCase();

		const requestBody = {
			imagePublicUrl: propState.imageUrl, // Use the generated image URL
			userID: USER_ID_FOR_UPLOADS,
			worldID,
			propID
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
			console.log(`[Prop: ${propID}] Model task enqueued. Status URL: ${fullModelStatusUrl}`);
			updatePropState(propState.id, {
				modelStatus: 'polling', modelStatusUrl: fullModelStatusUrl, modelStatusMessage: 'Model Queued. Waiting...', modelAttempts: 0,
			});
			startModelPolling(propState.id, fullModelStatusUrl);

		} catch (err: any) {
			console.error(`[Prop: ${propID}] Error enqueuing model generation:`, err);
			updatePropState(propState.id, { modelStatus: 'error_enqueue', modelStatusMessage: `Model Enqueue failed: ${err.message}` });
		}
	}

	// --- Function to Start Model Polling ---
	function startModelPolling(propId: string, statusUrl: string) {
		clearPollingInterval(propId, 'model'); // Clear existing interval if any
		console.log(`[Prop: ${propId}] Starting MODEL polling for status at ${statusUrl}`);
		const intervalId = setInterval(() => { pollModelStatus(propId, statusUrl); }, POLLING_INTERVAL_MS);
		activeModelPollingIntervals.set(propId, intervalId);
	}

	// --- Function to Poll Model Status (Modified for propData update) ---
	async function pollModelStatus(propId: string, statusUrl: string) {
		const propIndex = receivedProps.findIndex(p => p.id === propId);
		if (propIndex === -1) {
			console.warn(`[Prop: ${propId}] Model polling stopped: Prop not found.`);
			clearPollingInterval(propId, 'model'); return;
		}

		let currentAttempts = receivedProps[propIndex].modelAttempts + 1;
		updatePropState(propId, { modelAttempts: currentAttempts });

		if (currentAttempts > MAX_MODEL_POLL_ATTEMPTS) { // Use dedicated model timeout
			console.warn(`[Prop: ${propId}] Model polling timed out after ${currentAttempts} attempts.`);
			updatePropState(propId, { modelStatus: 'failed', modelStatusMessage: 'Model polling timed out.' });
			clearPollingInterval(propId, 'model'); return;
		}

		console.log(`[Prop: ${propId}] MODEL Polling attempt ${currentAttempts}...`);
		try {
			const response = await fetch(statusUrl, { cache: 'no-store' }); // Prevent caching

			if (response.status === 404) {
				// It's normal for the status file to not exist immediately after queuing
                if(receivedProps[propIndex].modelStatus === 'polling') {
				    updatePropState(propId, { modelStatusMessage: `Waiting for model status... (Attempt ${currentAttempts})` });
                }
                return; // Keep polling
			}
			if (!response.ok) throw new Error(`HTTP error ${response.status} fetching model status`);

			const statusReport: any = await response.json();
			console.log(`[Prop: ${propId}] Received MODEL status:`, statusReport.status);

			switch (statusReport.status) {
				case 'success':
					if (!statusReport.r2ModelPath) throw new Error("Model status 'success' but missing 'r2ModelPath'.");
					// Validate it's a .glb file before setting
					if (!statusReport.r2ModelPath.toLowerCase().endsWith('.glb')) {
						throw new Error(`Model success but path is not a .glb file: ${statusReport.r2ModelPath}`);
					}
					const fullModelUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ModelPath}`;
					console.log(`[Prop: ${propId}] Model generation successful! URL: ${fullModelUrl}`);
                    // --- UPDATE PROP DATA ---
					updatePropState(propId, {
						modelStatus: 'success',
                        modelUrl: fullModelUrl, // Keep for immediate display/modal
                        modelStatusMessage: 'Model generated.',
                        propDataUpdates: { propModel: fullModelUrl } // Store in propData for final JSON
					});
					clearPollingInterval(propId, 'model');
					break;

				case 'failure':
				case 'error': // Handle potential 'error' status
					console.error(`[Prop: ${propId}] Model generation failed. Reason: ${statusReport.message || statusReport.errorDetails || 'Unknown error'}`);
					updatePropState(propId, {
						modelStatus: 'failed', modelStatusMessage: `Model Failed: ${statusReport.message || 'Unknown error'}`,
					});
					clearPollingInterval(propId, 'model');
					break;

				case 'processing':
				case 'generating': // Handle synonyms
					updatePropState(propId, { modelStatus: 'generating', modelStatusMessage: `Generating model... (Attempt ${currentAttempts})` });
					break;

				case 'queued': // Handle if worker explicitly reports queued status
				    updatePropState(propId, { modelStatus: 'queued', modelStatusMessage: `Model in queue... (Attempt ${currentAttempts})` });
                    break;

				default:
					console.warn(`[Prop: ${propId}] Unknown MODEL status: ${statusReport.status}. Continuing poll.`);
					updatePropState(propId, { modelStatusMessage: `Unknown model status: ${statusReport.status} (Attempt ${currentAttempts})` });
					break;
			}
		} catch (err: any) {
			console.error(`[Prop: ${propId}] Error during model polling:`, err);
            // Check if it's a JSON parsing error, which might mean the file is incomplete
			if (err instanceof SyntaxError) {
				console.warn(`[Prop: ${propId}] JSON parsing error during model poll, possibly incomplete status file. Retrying...`);
                updatePropState(propId, { modelStatusMessage: `Reading status... (Attempt ${currentAttempts})` });
			} else {
                updatePropState(propId, { modelStatus: 'failed', modelStatusMessage: `Model polling error: ${err.message}` });
                clearPollingInterval(propId, 'model');
            }
		}
	}


	// --- Helper to Clear Interval (handles both image and model) ---
	function clearPollingInterval(propId: string, type: 'image' | 'model') {
		const intervalMap = type === 'image' ? activeImagePollingIntervals : activeModelPollingIntervals;
		if (intervalMap.has(propId)) {
			clearInterval(intervalMap.get(propId));
			intervalMap.delete(propId);
			console.log(`[Prop: ${propId}] Cleared ${type} polling interval.`);
		}
	}


	// --- Function to Start Streaming (Claude Data) ---
	function startStreaming() {
		if (!claudeApiUrl || !uploadApiUrl) { // Check both URLs
			error = "Initialization error: API URLs not available."; return;
		}
		if (!userPrompt || userPrompt.trim() === '') {
			error = "Please enter a prompt before generating."; return;
		}

		console.log(`Starting stream to ${claudeApiUrl}...`);
		// Reset state thoroughly
		receivedProps = [];
		metadata = null;
		error = null;
		isLoading = true;
		isComplete = false;
        uploadStatus = 'idle'; // <-- Reset upload status
        uploadMessage = '';
        finalJsonUrl = null;
		activeImagePollingIntervals.forEach(clearInterval);
		activeImagePollingIntervals.clear();
		activeModelPollingIntervals.forEach(clearInterval);
		activeModelPollingIntervals.clear();

		const requestBody = { prompt: userPrompt };
		console.log("Sending request body:", requestBody);

		oboe({
			url: claudeApiUrl, method: 'POST', body: requestBody,
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			cached: false, withCredentials: false // Explicitly disable caching for the stream request itself
		})
			.node('metadata', (meta: any) => {
				console.log('Received Metadata:', meta);
				if (!metadata) { // Only set metadata once
					metadata = meta;
					if (!metadata?.worldName) {
                        console.error("Metadata received, but missing 'worldName'. This is required for uploads and generation IDs.");
                        // Do not set global error yet, let subsequent steps fail naturally or handle in .done()
                    }

                    // Now that metadata is confirmed (or confirmed missing), trigger generation for any props received *before* metadata
                    receivedProps.forEach(p => {
                        if (p.imageStatus === 'idle' && p.imageStatusMessage?.includes('Waiting for metadata')) {
                            if (metadata && metadata.worldName) {
							    console.log(`[Prop: ${p.id}] Triggering delayed image generation (metadata received).`);
							    triggerImageGeneration(p);
                            } else {
                                // This case handles metadata arriving but missing the critical worldName
                                console.error(`[Prop: ${p.id}] Metadata received, but worldName still missing. Cannot generate image.`);
                                updatePropState(p.id, {
                                    imageStatus: 'failed', imageStatusMessage: 'Failed: Required worldName missing in metadata.',
                                    modelStatus: 'skipped_image_failed'
                                });
                            }
                        }
                    });
				} else {
                    console.warn("Received metadata chunk again, ignoring.");
                }
			})
			.node('propCategories.*.props[*]', (propObject: PropData) => { // Assuming this is the correct path
                // Basic validation: Must have a name
				if (!propObject?.name) {
                    console.warn('Received prop without a name, skipping:', propObject);
                    return; // Skip processing this invalid prop
                }
                if (!receivedProps.some(p => p.id === propObject.name)) { // Ensure unique name and not already added
					console.log('Received Prop Object:', propObject.name);
					const newPropState: PropState = {
						id: propObject.name,
						propData: { ...propObject }, // Store the initial data; URLs will be added later
						// Image State Init
						imageStatus: 'idle',
						imageStatusMessage: 'Received. Pending image generation.',
						imageAttempts: 0,
						// Model State Init
						modelStatus: 'idle', // Start model as idle too
						modelStatusMessage: 'Waiting for image generation.',
						modelAttempts: 0,
					};
					receivedProps = [...receivedProps, newPropState];

					// Trigger image generation if metadata is available, otherwise mark as waiting
					if (metadata && metadata.worldName) {
						triggerImageGeneration(newPropState);
					} else {
						console.warn(`[Prop: ${newPropState.id}] Delaying image gen trigger (waiting for metadata).`);
						updatePropState(newPropState.id, {
                            imageStatusMessage: 'Waiting for metadata...',
                            // Model status stays 'idle' implicitly
                        });
					}
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

    // --- Check if all props have finished processing (NEW) ---
    $: isAllProcessingComplete = receivedProps.length > 0 && receivedProps.every(p =>
        (terminalImageStatuses as ReadonlyArray<string>).includes(p.imageStatus) &&
        (terminalModelStatuses as ReadonlyArray<string>).includes(p.modelStatus)
    );

    // --- Trigger Final JSON Upload when Ready (NEW Reactive Logic) ---
    $: {
        // Condition: Claude stream done, all props done, upload not started/failed, no stream errors
        if (isComplete && isAllProcessingComplete && uploadStatus === 'idle' && !error) {
             console.log("All generation processes complete and stream finished. Triggering final JSON upload.");
             uploadStatus = 'pending'; // Mark as pending to prevent immediate re-triggering
             uploadFinalSceneJson(); // Call the async function
        } else if (isComplete && receivedProps.length === 0 && uploadStatus === 'idle' && !error) {
            // Handle case where stream finishes but no props were generated
            console.log("Stream finished, but no props were generated. Skipping upload.");
            uploadStatus = 'skipped'; // Mark as skipped
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


    // --- Modal Control Functions (Unchanged) ---
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

	<!-- Prompt Input Area -->
	<div class="mb-4">
		<label for="prompt-input" class="block text-sm font-medium text-gray-700 mb-1">Enter Prompt:</label>
		<textarea
            id="prompt-input"
            bind:value={userPrompt}
            rows="4"
            class="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            placeholder="e.g., Describe a futuristic cityscape..."
            disabled={isLoading || uploadStatus === 'uploading'}
        ></textarea>
		<!-- <p class="text-xs text-gray-500 mt-1">AI generates structured JSON, then an image & 3D model for each 'prop'.</p> -->
	</div>

	<!-- Generate Button -->
	<div class="mb-6">
		<button
            on:click={startStreaming}
            disabled={isLoading || !claudeApiUrl || !uploadApiUrl || uploadStatus === 'uploading'}
            class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out shadow-md disabled:cursor-not-allowed"
        >
			{#if isLoading}
				<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
				Generating Data...
			{:else if !claudeApiUrl || !uploadApiUrl} Initializing...
            {:else if uploadStatus === 'uploading'}
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Uploading Scene...
			{:else} Generate 3D World
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
    <!-- Message shown after Claude stream finishes but before all image/model jobs are done -->
	{#if isComplete && !isAllProcessingComplete && receivedProps.length > 0 && !error && !['success', 'failed', 'skipped'].includes(uploadStatus) }
	<div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mb-4" role="status">
		<strong class="font-bold">Processing...</strong>
		<span class="block sm:inline"> Data stream complete. Waiting for all image/model generation tasks to finish before final upload.</span>
	</div>
	{/if}
	{#if isLoading}
	<div class="text-center text-gray-600 my-4">
		<p>Streaming data from Madmods AI...</p>
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
            {#if isLoading} <span class="text-sm font-normal text-gray-500">(Receiving data...)</span>
            {:else if !isComplete && receivedProps.length > 0} <span class="text-sm font-normal text-gray-500">(Processing...)</span>
            {:else if isComplete && !isAllProcessingComplete && receivedProps.length > 0 && !error} <span class="text-sm font-normal text-yellow-600">(Waiting for jobs...)</span>
            {:else if isComplete && isAllProcessingComplete && receivedProps.length > 0 && !error} <span class="text-sm font-normal text-green-600">(Processing Complete)</span>
            {/if}
		</h2>
		{#if receivedProps.length === 0 && !isLoading && !error && uploadStatus === 'idle' && !isComplete}
			<p class="text-gray-500 italic">Enter a prompt and click 'Generate' to start.</p>
		{:else if receivedProps.length === 0 && isLoading}
			<p class="text-gray-500 italic">Waiting for the first prop data from Madmods AI...</p>
        {:else if receivedProps.length === 0 && isComplete && !error && uploadStatus === 'skipped'}
             <p class="text-gray-500 italic">Stream finished, but no props were generated.</p>
		{/if}

		{#each receivedProps as propState, i (propState.id)}
		<div class="border rounded-lg p-4 shadow-sm bg-white hover:shadow-md transition-shadow duration-150 animate-fade-in flex flex-col lg:flex-row gap-4">
			<!-- Left side: Prop Details -->
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

			<!-- Right side: Image & Model Status -->
			<div class="w-full lg:w-64 flex flex-col gap-4 border-t lg:border-t-0 lg:border-l pt-4 lg:pt-0 lg:pl-4">

				<!-- Image Status -->
				<div class="flex flex-col items-center">
					<strong class="text-sm text-gray-800 mb-1">Generated Image</strong>
					{#if propState.imageStatus === 'idle'}
						<div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-gray-50 text-gray-500">
                            <p>{propState.imageStatusMessage || 'Waiting...'}</p>
                        </div>
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
                    <!-- 'skipped' is not a terminal state for image itself -->
					{/if}
				</div>

				<!-- Model Status -->
                 <div class="flex flex-col items-center mt-2">
                    <strong class="text-sm text-gray-800 mb-1">3D Model</strong>
                    {#if propState.modelStatus === 'idle'}
                        <div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-gray-50 text-gray-500">
                            <p>{propState.modelStatusMessage || 'Waiting for image...'}</p>
                        </div>
                    {:else if propState.modelStatus === 'skipped_image_failed'}
                         <div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-yellow-50 text-yellow-700">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto mb-1 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
							<p class="font-semibold">Model Skipped</p>
                            <p class="text-xs mt-1 break-words max-w-full text-center">{propState.modelStatusMessage || 'Skipped: Image generation failed.'}</p>
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
                        <button
                            on:click={() => openModelModal(propState.modelUrl!, propState.propData.name)}
                            class="bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold py-1.5 px-3 rounded transition duration-150 ease-in-out shadow w-full"
                        >
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
<div
	class="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-75 p-4"
	on:click|self={closeImageModal}
	role="dialog"
	aria-modal="true"
	aria-labelledby="image-modal-title"
>
	<div class="relative max-w-4xl max-h-[90vh] bg-white rounded-lg shadow-xl overflow-hidden">
		<button
			on:click={closeImageModal}
			class="absolute top-2 right-2 z-50 rounded-full bg-gray-600 bg-opacity-50 p-1 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white"
			aria-label="Close image viewer"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
		</button>
        <h3 id="image-modal-title" class="sr-only">Image for {selectedPropName}</h3>
		{#if selectedImageUrl}
			<img src={selectedImageUrl} alt="Full size for {selectedPropName}" class="block max-w-full max-h-[85vh] object-contain"/>
		{:else}
			<div class="p-8 text-center text-gray-500">Loading image...</div>
		{/if}
	</div>
</div>
{/if}

<!-- Model Viewer Modal -->
{#if showModelModal}
	<ModelViewer modelUrl={selectedModelUrl} onClose={closeModelModal}/>
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