<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores'; // Import the page store
	import oboe from 'oboe';
	import ModelViewer from '$lib/components/ModelViewer.svelte'; // Import the model viewer

	// --- Configuration ---
	// IMPORTANT: Replace with your actual R2 public bucket URL
	const R2_PUBLIC_URL_BASE = 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev';
	const IMAGE_GENERATION_ENDPOINT = 'https://imagegeneration.madmods.world';
	const MODEL_GENERATION_ENDPOINT = 'https://modelgeneration.madmods.world'; // Added
	const POLLING_INTERVAL_MS = 1000; // Poll every 1 second
	const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes timeout for polling
	const MAX_POLL_ATTEMPTS = Math.round(MAX_POLL_DURATION_MS / POLLING_INTERVAL_MS);
	const MAX_MODEL_POLL_ATTEMPTS = MAX_POLL_ATTEMPTS * 2; // Allow up to 10 minutes for model

	// --- Interfaces ---
	interface PropData {
		name: string;
		description?: string;
		colors?: any[];
		transforms?: any[];
	}

	interface PropState {
		id: string; // Unique identifier for this prop instance (e.g., prop.name)
		propData: PropData; // Original prop data from Claude

		// Image Generation State
		imageStatus: 'idle' | 'queued' | 'generating' | 'polling' | 'success' | 'failed' | 'error_enqueue';
		imageStatusUrl?: string;
		imageUrl?: string;
		imageStatusMessage?: string;
		imagePollingIntervalId?: number | NodeJS.Timeout;
		imageAttempts: number;

		// Model Generation State (NEW)
		modelStatus: 'idle' | 'queued' | 'generating' | 'polling' | 'success' | 'failed' | 'error_enqueue' | 'skipped_image_failed'; // Added model status
		modelStatusUrl?: string;
		modelUrl?: string; // .glb URL
		modelStatusMessage?: string;
		modelPollingIntervalId?: number | NodeJS.Timeout;
		modelAttempts: number;
	}

	// --- Reactive State Variables ---
	let receivedProps: PropState[] = [];
	let metadata: any | null = null;
	let isLoading: boolean = false; // Claude stream loading
	let error: string | null = null;
	let isComplete: boolean = false; // Claude stream complete
	let userPrompt: string = 'a dinosaur park'; // Default prompt
	let activeImagePollingIntervals: Map<string, number | NodeJS.Timeout> = new Map();
	let activeModelPollingIntervals: Map<string, number | NodeJS.Timeout> = new Map(); // Map for model polling

	// Modal State (NEW)
	let showImageModal = false;
	let selectedImageUrl = '';
	let showModelModal = false;
	let selectedModelUrl = '';
	let selectedPropName = ''; // For modal titles

	// --- API URL (to be set in onMount) ---
	let claudeApiUrl: string = '';

	// --- Set API URL on Component Mount ---
	onMount(() => {
		const hostname = $page.url.hostname;
		const dev = hostname.includes('localhost') || hostname === '127.0.0.1';
		claudeApiUrl = dev ? 'https://madmods.world/api/ai/claude-streaming' : '/api/ai/claude-streaming';
		console.log('API URL set to:', claudeApiUrl);
	});

	// --- Cleanup on Destroy ---
	onDestroy(() => {
		console.log("Component destroying. Clearing active polling intervals.");
		activeImagePollingIntervals.forEach(clearInterval);
		activeImagePollingIntervals.clear();
		activeModelPollingIntervals.forEach(clearInterval); // Clear model intervals too
		activeModelPollingIntervals.clear();
		// Consider canceling ongoing Oboe stream if possible/needed
	});

	// --- Update Prop State Helper ---
	function updatePropState(propId: string, updates: Partial<PropState>) {
		const index = receivedProps.findIndex(p => p.id === propId);
		if (index !== -1) {
			// Ensure we don't accidentally overwrite interval IDs if they are not in updates
			const existingProp = receivedProps[index];
			receivedProps[index] = { ...existingProp, ...updates };
			receivedProps = [...receivedProps]; // Trigger Svelte reactivity
		} else {
			console.warn(`Attempted to update non-existent prop with ID: ${propId}`);
		}
	}

	// --- Function to Trigger Image Generation ---
	async function triggerImageGeneration(propState: PropState) {
		if (!metadata || !metadata.worldName) {
			console.error("Cannot trigger image generation: Metadata (with worldName) not yet received.");
			updatePropState(propState.id, { imageStatus: 'failed', imageStatusMessage: 'Error: Missing world metadata.', modelStatus: 'skipped_image_failed' }); // Skip model gen
			return;
		}

		const userID = 'frontendUser'; // Replace with actual user ID if available
		const worldID = metadata.worldName.replace(/\s+/g, '-').toLowerCase();
		const propID = propState.id.replace(/\s+/g, '-').toLowerCase();
		const inputPrompt = propState.propData.description || propState.propData.name;

		if (!inputPrompt) {
			console.error(`Cannot trigger image generation for prop ${propID}: No description or name found.`);
			updatePropState(propState.id, { imageStatus: 'failed', imageStatusMessage: 'Error: Missing prompt data.', modelStatus: 'skipped_image_failed' }); // Skip model gen
			return;
		}

		const requestBody = { inputPrompt, userID, worldID, propID, imageFormat: 'jpg' };

		console.log(`[Prop: ${propID}] Enqueuing image generation...`, requestBody);
		updatePropState(propState.id, { imageStatus: 'queued', imageStatusMessage: 'Sending request to image queue...' });

		try {
			const response = await fetch(IMAGE_GENERATION_ENDPOINT, {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* ignore */ }
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
		// updatePropState(propId, { imagePollingIntervalId: intervalId }); // No need to store in state if using Map correctly
	}

	// --- Function to Poll Image Status ---
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
            const latestPropState = receivedProps[propIndex];

			switch (statusReport.status) {
				case 'success':
					if (!statusReport.r2ImagePath) throw new Error("Image status 'success' but missing 'r2ImagePath'.");
					const fullImageUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ImagePath}`;
					console.log(`[Prop: ${propId}] Image generation successful! URL: ${fullImageUrl}`);
					updatePropState(propId, {
						imageStatus: 'success', imageUrl: fullImageUrl, imageStatusMessage: 'Image generated.',
					});
					clearPollingInterval(propId, 'image');
					// ---- TRIGGER MODEL GENERATION ----
                    // Get the *very latest* state after updatePropState
                    const finalPropStateForModel = receivedProps.find(p => p.id === propId);
                    if (finalPropStateForModel) {
					    triggerModelGeneration(finalPropStateForModel);
                    } else {
                        console.error(`[Prop: ${propId}] Prop vanished before triggering model generation!`);
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

	// --- Function to Trigger Model Generation (NEW) ---
	async function triggerModelGeneration(propState: PropState) {
		// Double-check conditions right before sending request
		if (propState.imageStatus !== 'success' || !propState.imageUrl) {
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

		const userID = 'frontendUser'; // Match ID used previously
		const worldID = metadata.worldName.replace(/\s+/g, '-').toLowerCase();
		const propID = propState.id.replace(/\s+/g, '-').toLowerCase();

		const requestBody = {
			imagePublicUrl: propState.imageUrl, // Use the generated image URL
			userID,
			worldID,
			propID
		};

		console.log(`[Prop: ${propID}] Enqueuing 3D model generation...`, requestBody);
		updatePropState(propState.id, { modelStatus: 'queued', modelStatusMessage: 'Sending request to model queue...' });

		try {
			const response = await fetch(MODEL_GENERATION_ENDPOINT, {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
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

	// --- Function to Start Model Polling (NEW) ---
	function startModelPolling(propId: string, statusUrl: string) {
		clearPollingInterval(propId, 'model'); // Clear existing interval if any
		console.log(`[Prop: ${propId}] Starting MODEL polling for status at ${statusUrl}`);

		const intervalId = setInterval(() => { pollModelStatus(propId, statusUrl); }, POLLING_INTERVAL_MS);
		activeModelPollingIntervals.set(propId, intervalId);
		// updatePropState(propId, { modelPollingIntervalId: intervalId }); // No need to store in state
	}

	// --- Function to Poll Model Status (NEW) ---
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
					updatePropState(propId, {
						modelStatus: 'success', modelUrl: fullModelUrl, modelStatusMessage: 'Model generated.',
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
		// const intervalIdKey = type === 'image' ? 'imagePollingIntervalId' : 'modelPollingIntervalId'; // No longer needed

		if (intervalMap.has(propId)) {
			clearInterval(intervalMap.get(propId));
			intervalMap.delete(propId);
			console.log(`[Prop: ${propId}] Cleared ${type} polling interval.`);
			// Find the prop and clear its intervalId field in the state - *No longer storing ID in state*
			// const index = receivedProps.findIndex(p => p.id === propId);
			// if (index !== -1 && receivedProps[index][intervalIdKey]) {
			// 	updatePropState(propId, { [intervalIdKey]: undefined });
			// }
		}
	}


	// --- Function to Start Streaming (Claude Data) ---
	function startStreaming() {
		if (!claudeApiUrl) {
			error = "Initialization error: API URL not available."; return;
		}
		if (!userPrompt || userPrompt.trim() === '') {
			error = "Please enter a prompt before generating."; return;
		}

		console.log(`Starting stream to ${claudeApiUrl}...`);
		// Reset state
		receivedProps = [];
		metadata = null;
		error = null;
		isLoading = true;
		isComplete = false;
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
					if (!metadata?.worldName) console.warn("Metadata received, but missing 'worldName'.");

                    // Now that metadata is confirmed, trigger generation for any props received *before* metadata
                    receivedProps.forEach(p => {
                        if (p.imageStatus === 'idle' && p.imageStatusMessage?.includes('Waiting for metadata')) {
                            if (metadata && metadata.worldName) {
							    console.log(`[Prop: ${p.id}] Triggering delayed image generation (metadata received).`);
							    triggerImageGeneration(p);
                            } else {
                                // This case should be rare if metadata just arrived, but handle it.
                                console.error(`[Prop: ${p.id}] Metadata received, but worldName still missing. Cannot generate image.`);
                                updatePropState(p.id, {
                                    imageStatus: 'failed', imageStatusMessage: 'Failed: Invalid metadata received.',
                                    modelStatus: 'skipped_image_failed'
                                });
                            }
                        }
                    });
				} else {
                    console.warn("Received metadata chunk again, ignoring.");
                }
			})
			.node('propCategories.*.props[*]', (propObject: PropData) => {
				if (propObject?.name && !receivedProps.some(p => p.id === propObject.name)) { // Ensure unique name and not already added
					console.log('Received Prop Object:', propObject.name);
					const newPropState: PropState = {
						id: propObject.name,
						propData: propObject,
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
				} else if (propObject?.name && receivedProps.some(p => p.id === propObject.name)) {
                    console.warn(`Received duplicate prop name '${propObject.name}'. Skipping.`);
                }
                 else {
					console.warn('Received incomplete, invalid, or unnamed prop object:', propObject);
				}
			})
			.done((finalJson: any) => {
				console.log('Stream finished successfully.');
				isLoading = false; // Claude stream finished
				if (!finalJson?.metadata || !finalJson?.propCategories) {
					console.warn("Stream finished, but final JSON structure seems incomplete:", finalJson);
					if (!error) { /* Don't set error if it's just incomplete */ }
				}
                // Final check: Ensure metadata was received. If not, fail waiting props.
                if (!metadata) {
                    console.error("Stream finished, but no metadata was ever received.");
                    if (!error) error = "Stream completed, but failed to receive essential metadata.";
                    receivedProps.forEach(p => {
                        if (p.imageStatus === 'idle' && p.imageStatusMessage?.includes('Waiting for metadata')) {
                            updatePropState(p.id, {
                                imageStatus: 'failed', imageStatusMessage: 'Failed: Metadata never received.',
                                modelStatus: 'skipped_image_failed'
                            });
                        }
                    });
                } else if (!metadata.worldName) {
                     console.error("Stream finished, metadata received but missing worldName.");
                     if (!error) error = "Stream completed, but metadata is missing worldName.";
                     receivedProps.forEach(p => {
                        if (p.imageStatus === 'idle' && p.imageStatusMessage?.includes('Waiting for metadata')) {
                             updatePropState(p.id, {
                                imageStatus: 'failed', imageStatusMessage: 'Failed: worldName missing in metadata.',
                                modelStatus: 'skipped_image_failed'
                            });
                        }
                     });
                }

                if (!error) { isComplete = true; } // Mark complete only if no fatal errors occured


			})
			.fail((errorReport: any) => {
				console.error('Stream processing failed:', errorReport);
				isLoading = false;
				isComplete = false;
				let errorMessage = `json stream failed: ${errorReport.statusCode || 'Network Error'}. `;
				if (errorReport.body) { try { const parsedBody = JSON.parse(errorReport.body); errorMessage += parsedBody.error || parsedBody.message || parsedBody.details || errorReport.body; } catch (e) { errorMessage += errorReport.body; } }
				else if (errorReport.thrown) { errorMessage += (errorReport.thrown as Error).message || 'Client-side error'; }
				error = errorMessage;

				// Mark any props still processing as failed and clear intervals
				receivedProps.forEach(p => {
					if (!['success', 'failed', 'error_enqueue', 'skipped_image_failed'].includes(p.imageStatus)) {
						updatePropState(p.id, { imageStatus: 'failed', imageStatusMessage: 'Failed: Main data stream error.' });
						clearPollingInterval(p.id, 'image');
					}
                     if (!['success', 'failed', 'error_enqueue', 'skipped_image_failed'].includes(p.modelStatus)) {
						updatePropState(p.id, { modelStatus: 'failed', modelStatusMessage: 'Failed: Main data stream error.' });
						clearPollingInterval(p.id, 'model');
					}
				});
			});
	}

    // --- Modal Control Functions (NEW) ---
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
		<textarea id="prompt-input" bind:value={userPrompt} rows="4" class="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100" placeholder="e.g., Describe a futuristic cityscape..." disabled={isLoading}></textarea>
		<!-- <p class="text-xs text-gray-500 mt-1">AI generates structured JSON, then an image & 3D model for each 'prop'.</p> -->
	</div>

	<!-- Generate Button -->
	<div class="mb-6">
		<button on:click={startStreaming} disabled={isLoading || !claudeApiUrl} class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out shadow-md disabled:cursor-not-allowed">
			{#if isLoading}
				<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
				Generating Data...
			{:else if !claudeApiUrl} Initializing...
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
	{#if isComplete && !error}
	<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
		<strong class="font-bold">Success!</strong>
		<span class="block sm:inline"> Stream completed. Image/Model generation may still be in progress.</span>
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
		<p><strong>World Name (ID):</strong> {metadata.worldName || '(Not provided - Required!)'}</p>
		<p><strong>Timestamp:</strong> {metadata.timestampUTC || '(Not provided)'}</p>
		<p><strong>User ID (for images/models):</strong> {'frontendUser'}</p>
	</div>
	{/if}

	<!-- Display Received Props -->
	<div class="space-y-6">
		<h2 class="text-2xl font-semibold mb-3 text-gray-700 border-b pb-2">
			Generated 3D Scene ({receivedProps.length})
		</h2>
		{#if receivedProps.length === 0 && !isLoading && !error && !isComplete}
			<p class="text-gray-500 italic">Enter a prompt and click 'Generate' to start.</p>
		{:else if receivedProps.length === 0 && isLoading}
			<p class="text-gray-500 italic">Waiting for the first prop data from Madmods AI...</p>
		{/if}

		{#each receivedProps as propState, i (propState.id)}
		<div class="border rounded-lg p-4 shadow-sm bg-white hover:shadow-md transition-shadow duration-150 animate-fade-in flex flex-col lg:flex-row gap-4">
			<!-- Left side: Prop Details -->
			<div class="flex-1">
				<h3 class="text-lg font-bold text-indigo-700 mb-2">{propState.propData.name || `Prop ${i + 1}`}</h3>
				<p class="text-gray-600 mb-2 text-sm">{propState.propData.description || 'No description.'}</p>
                <div class="mb-2">
                    <strong class="text-sm text-gray-800">Colors:</strong>
                    {#if propState.propData.colors && propState.propData.colors.length > 0}
                       <div class="flex flex-wrap gap-2 mt-1">
							{#each propState.propData.colors as colorObj}
                                {#if typeof colorObj === 'object' && colorObj !== null}
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
                            <svg class="animate-spin h-5 w-5 mx-auto mb-1 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.96 7.96 0 014 12H0c0 3.04 1.13 5.82 3 7.94l3-2.65z"></path></svg>
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
                    {:else if propState.imageStatus === 'skipped_image_failed'}
                         <div class="text-center p-3 rounded w-full text-xs flex flex-col items-center justify-center min-h-[60px] bg-yellow-50 text-yellow-700">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto mb-1 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
							<p class="font-semibold">Image Skipped</p>
                            <p class="text-xs mt-1 break-words max-w-full text-center">{propState.imageStatusMessage || 'Skipped due to prior error'}</p>
						</div>
					{/if}
				</div>

				<!-- Model Status (NEW) -->
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
                            <svg class="animate-spin h-5 w-5 mx-auto mb-1 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.96 7.96 0 014 12H0c0 3.04 1.13 5.82 3 7.94l3-2.65z"></path></svg>
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

			</div>
		</div>
		{/each}
	</div>

</div>

<!-- Image Modal (NEW) -->
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

<!-- Model Viewer Modal (NEW) -->
{#if showModelModal}
	<!-- Pass the close function correctly -->
	<ModelViewer modelUrl={selectedModelUrl} onClose={closeModelModal} propName={selectedPropName} />
	<!-- Add title accessibility if needed - handled within ModelViewer now -->
	<!-- <div class="sr-only" aria-live="polite">Showing 3D model for {selectedPropName}</div> -->
{/if}


<style>
	/* Simple fade-in animation */
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }

	/* Keep non-@apply styles here if needed, otherwise can be global */
	body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
    img { max-width: 100%; height: auto; display: block; }


	/* Ensure modals appear above other content */
	.fixed.z-40 { z-index: 40; } /* Image modal */
	/* ModelViewer should handle its own z-index (likely z-50) */

    /* Improve pre formatting */
    pre code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 0.8rem;
    }

	/* Removed the rules that used @apply */
    /* .status-box { ... } */
    /* .status-spinner { ... } */
    /* .status-icon { ... } */
    /* .status-attempts { ... } */
    /* .status-message { ... } */
    /* .status-error-details { ... } */

</style>