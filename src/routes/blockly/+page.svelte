<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

  const MAX_MODEL_POLL_ATTEMPTS = 60;

	import { v4 as uuidv4 } from 'uuid';
	import { get } from 'svelte/store';

	import { init as initializeApp, blocklyWorkspace, threeD } from '$lib/blockly/blockly';
	import EditableImageModal from '$lib/components/EditableImageModal.svelte';

	import type { PageData } from './$types';
	import { sessionStore, showLoginModal, handleLogout, supabaseStore } from '$lib/stores/authStore';
	import type { TypedSupabaseClient } from '$lib/supabaseClient';

	let { data }: { data: PageData } = $props();

	let promptValue = $state('');
	let isLoading = $state(true);
	let errorMsg: string | null = $state(null);
	let selectedImageForModal = $state<GeneratedImage | null>(null);

		let PUBLIC_MODEL_GENERATION_ENDPOINT="https://modelgeneration.madmods.world"
let PUBLIC_IMAGE_GENERATION_ENDPOINT="https://imagegeneration.madmods.world"
let PUBLIC_R2_PUBLIC_URL_BASE="https://pub-48572794ea984ea9976e5d5856e58593.r2.dev"

    interface GeneratedImage {
		id: string;
		prompt: string;
		objectName: string;
		status: 'idle' | 'queued' | 'polling' | 'generating' | 'success' | 'failed' | 'error_enqueue' | 'db_error';
		statusMessage: string;
		statusUrl?: string;
		imageUrl?: string;
		attempts: number;
		originalImageId?: string;
		// --- Add Model Fields ---
		modelStatus?: 'idle' | 'queued' | 'polling' | 'generating' | 'success' | 'failed' | 'error_enqueue' | 'skipped_image_failed';
		modelStatusMessage?: string;
		modelStatusUrl?: string;
		modelUrl?: string;
		modelAttempts?: number;
	}
	let generatedImages = $state<GeneratedImage[]>([]);
	const activePollingIntervals = new Map<string, number>();
    const activeModelPollingIntervals = new Map<string, number>();

	const IMAGE_GENERATION_ENDPOINT = PUBLIC_IMAGE_GENERATION_ENDPOINT || 'http://localhost:8787/generate';
  const MODEL_GENERATION_ENDPOINT = PUBLIC_MODEL_GENERATION_ENDPOINT
	const R2_PUBLIC_URL_BASE = PUBLIC_R2_PUBLIC_URL_BASE || '';

	const getAuthenticatedUserId = (): string | null => {
		const session = get(sessionStore);
		return session?.user?.id ?? null;
	};

	const WORLD_ID = 'default-world';
	const POLLING_INTERVAL_MS = 3000;
	const MAX_POLL_ATTEMPTS = 40;

  let userIdForRequest:any;

   // --- ADD THIS FUNCTION ---
    /**
	 * Finds the successfully generated model URL for a given generation ID.
	 * This function will be passed to the Blockly/3D initialization.
	 * @param id The unique generation ID of the object.
	 * @returns The R2 model URL if found and successful, otherwise null.
	 */
	// function getModelUrlForId(id: string): string | null {
  //       // Use $state variables directly (Svelte 5 runes)
	// 	const image = generatedImages.find(img => img.id === id);
	// 	if (image && image.modelStatus === 'success' && image.modelUrl) {
  //           console.log(`[Resolver] Found model URL for ID ${id}: ${image.modelUrl}`);
	// 		return image.modelUrl;
	// 	}
  //       console.warn(`[Resolver] Model URL not found or not ready for ID ${id}. Status: ${image?.modelStatus}`);
	// 	return null;
	// }

  // --- MODIFY THIS FUNCTION ---
    /**
	 * Finds the successfully generated model URL for a given object name.
	 * This function will be passed to the Blockly/3D initialization.
	 * NOTE: Relies on objectName being unique, which is managed by handleNameChange.
	 * @param name The user-defined, unique object name.
	 * @returns The R2 model URL if found and successful, otherwise null.
	 */
	function getModelUrlForId(name: string): string | null {
        // Use $state variables directly (Svelte 5 runes)
		const image = generatedImages.find(img => img.objectName === name); // <-- Search by name
		if (image && image.modelStatus === 'success' && image.modelUrl) {
            console.log(`[Resolver] Found model URL for Name "${name}": ${image.modelUrl}`);
			return image.modelUrl;
		}
        // More specific warning if the image exists but model isn't ready
        if (image) {
             console.warn(`[Resolver] Model URL not ready for Name "${name}". Image Found. Image Status: ${image.status}, Model Status: ${image.modelStatus}`);
        } else {
            console.warn(`[Resolver] No object found with Name "${name}". Cannot resolve model URL.`);
        }
		return null;
	}
    // --- END MODIFIED FUNCTION ---

    // --- END ADDED FUNCTION ---

    

	onMount(async () => {

		if (!browser) return;

		isLoading = true;
		errorMsg = null;
		console.log('Svelte component mounted, starting app initialization...');
		try {
			const blocklyDiv = document.getElementById('blocklyDiv');
			const runAreaCanvas = document.getElementById('runAreaCanvas');
			if (blocklyDiv && runAreaCanvas) {
				
        // --- MODIFY THIS LINE ---
        //await initializeApp('blocklyDiv', 'runAreaCanvas');
				// Pass the resolver function as an argument
				await initializeApp('blocklyDiv', 'runAreaCanvas', getModelUrlForId);
        // --- END MODIFICATION ---

				console.log('App initialization complete.');
			} else {
				throw new Error("Required elements (blocklyDiv or runAreaCanvas) not found in DOM during mount.");
			}
		} catch (error: any) {
			console.error('Failed to initialize application:', error);
			errorMsg = `Failed to initialize: ${error.message || error}`;
		} finally {
			isLoading = false;
		}
	});

  onDestroy(() => {
		if (!browser) return;

		console.log('Svelte component destroying...');
		if (blocklyWorkspace) {
			try {
				blocklyWorkspace.dispose();
				console.log('Blockly workspace disposed.');
			} catch (e) {
				console.error('Error disposing Blockly workspace:', e);
			}
		}
		threeD?.engine?.dispose();
		console.log('ThreeD engine disposed (attempted).');

		console.log('Clearing all active polling intervals...');
		activePollingIntervals.forEach((intervalId) => {
			clearInterval(intervalId);
		});
		activePollingIntervals.clear();

		// --- Clear Model Polling Intervals ---
		activeModelPollingIntervals.forEach((intervalId) => {
			clearInterval(intervalId);
		});
		activeModelPollingIntervals.clear();
        console.log('Cleared all model polling intervals.');
	});

	function updateImageState(id: string, updates: Partial<GeneratedImage>) {
		const index = generatedImages.findIndex(img => img.id === id);
		if (index !== -1) {
			// Create a new object with merged updates
			const updatedImage = { ...generatedImages[index], ...updates };
			// Replace the old object with the new one in the array
			generatedImages.splice(index, 1, updatedImage);

			// --- Add this block ---
			// If the modal is currently open showing the image that was just updated,
			// explicitly update the 'selectedImageForModal' state to ensure the
			// modal component receives the new props.
			if (selectedImageForModal && selectedImageForModal.id === id) {
				selectedImageForModal = updatedImage;
				// Optional: Log to confirm this runs when expected
				// console.log(`[Gen ID: ${id}] Refreshed selectedImageForModal state.`);
			}
			// --- End added block ---

		} else {
			console.warn(`[Gen ID: ${id}] Attempted to update state for non-existent image.`);
		}
	}

  function generateDefaultObjectName(existingImages: GeneratedImage[]): string {
		let i = 1;
		let name = `object-${i}`;
		// eslint-disable-next-line no-loop-func
		while (existingImages.some(img => img.objectName === name)) {
			i++;
			name = `object-${i}`;
		}
		return name;
	}

	function handleNameChange(imageId: string, newNameInput: string) {
		const index = generatedImages.findIndex(img => img.id === imageId);
		if (index === -1) return;

		let currentImage = generatedImages[index];
		let finalName = newNameInput.trim();

		if (!finalName) {
			// Revert to original or a default if name is cleared
			finalName = currentImage.objectName || generateDefaultObjectName(generatedImages);
		}

		let baseName = finalName;
		let counter = 1;
		let nameToCheck = finalName;

		// Check for duplicates and append suffix if needed
		// eslint-disable-next-line no-loop-func
		while (generatedImages.some(img => img.id !== imageId && img.objectName === nameToCheck)) {
			nameToCheck = `${baseName} (${counter})`;
			counter++;
		}
		finalName = nameToCheck;

		// Update the state if the name actually changed
		if (currentImage.objectName !== finalName) {
			console.log(`[Gen ID: ${imageId}] Updating object name to "${finalName}"`);
			updateImageState(imageId, { objectName: finalName });
		} else if (newNameInput !== currentImage.objectName) {
            // If the user typed something, but it resolved back to the original name
            // (e.g., typed a duplicate, it got corrected back), force re-render the input
            // This is a bit of a workaround for Svelte 5's fine-grained reactivity not
            // automatically updating the input if the bound value didn't *ultimately* change
            // even though the intermediate user input was different.
            currentImage.objectName = finalName; // Force assignment to trigger reactivity if needed
		}
	}


	async function enqueueImageGeneration(prompt: string, originalImageId?: string) {
		if (!prompt.trim()) {
			//alert("Please enter a prompt.");
			return false;
		}
		if (!R2_PUBLIC_URL_BASE) {
			//alert("Configuration error: R2 Public URL Base is not set.");
			return false;
		}
		if (!IMAGE_GENERATION_ENDPOINT) {
			//alert("Configuration error: Image Generation Endpoint is not set.");
			return false;
		}

		const generationId = uuidv4();
		const defaultObjectName = generateDefaultObjectName(generatedImages); // Generate name first

		const newImageEntry: GeneratedImage = {
			id: generationId,
			prompt: prompt,
			objectName: defaultObjectName, // Assign the default name
			status: 'queued',
			statusMessage: 'Sending request...',
			attempts: 0,
			originalImageId: originalImageId
		};

    userIdForRequest = getAuthenticatedUserId();
		if (!userIdForRequest) {
			//alert("Please log in to generate images.");
			showLoginModal.set(true);
			return false;
		}

		generatedImages.unshift(newImageEntry);

		const requestBody = {
			inputPrompt: prompt,
			userID: userIdForRequest,
			worldID: WORLD_ID,
			propID: generationId,
			imageFormat: 'jpg'
		};

		console.log(`[Gen ID: ${generationId}] Enqueuing image generation (User: ${userIdForRequest}, Name: "${defaultObjectName}", Prompt: "${prompt}")...`, requestBody);
		try {
			const response = await fetch(IMAGE_GENERATION_ENDPOINT, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
			});
			if (!response.ok) {
				let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* ignore */ }
				throw new Error(`Failed to enqueue image: ${errorBody}`);
			}
			const result: any = await response.json();
			if (!result.statusKey) throw new Error("Image enqueue response missing 'statusKey'.");
			const fullStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`;
			console.log(`[Gen ID: ${generationId}] Image task enqueued. Status URL: ${fullStatusUrl}`);
			updateImageState(generationId, { status: 'polling', statusUrl: fullStatusUrl, statusMessage: 'Image Queued. Waiting...', });
			startImagePolling(generationId, fullStatusUrl);
			return true;
		} catch (err: any) {
			console.error(`[Gen ID: ${generationId}] Error enqueuing image generation:`, err);
			updateImageState(generationId, { status: 'error_enqueue', statusMessage: `Enqueue failed: ${err.message}`, });
			return false;
		}
	}


	async function submitPrompt() {
		const success = await enqueueImageGeneration(promptValue);
		if (success) {
			promptValue = '';
		}
	}

	function handleImageClick(image: GeneratedImage) {
		if (image.status === 'success' && image.imageUrl) {
			selectedImageForModal = image;
		} else {
			console.log("Cannot open modal for image in status:", image.status);
		}
	}

	async function handleRegenerate(newPrompt: string) {
		if (!selectedImageForModal) return;
		console.log(`Regenerating image ID ${selectedImageForModal.id} with new prompt: "${newPrompt}"`);

		const originalId = selectedImageForModal.originalImageId ?? selectedImageForModal.id;
		const modalImageId = selectedImageForModal.id;
		selectedImageForModal = null;

		await enqueueImageGeneration(newPrompt, originalId);
	}

	async function handleMake3D() {
		if (!selectedImageForModal) return;

		const imageId = selectedImageForModal.id;
		console.log(`Initiating "Make 3D" for image ID ${imageId} with prompt: "${selectedImageForModal.prompt}"`);

		// Find the definitive state from the array
		const imageToProcess = generatedImages.find(img => img.id === imageId);

		if (!imageToProcess) {
			console.error(`[Gen ID: ${imageId}] Could not find image state to start model generation.`);
			//alert("Error: Could not find the image data to start 3D model generation.");
			selectedImageForModal = null; // Close modal even on error
			return;
		}

		// Close the modal *before* starting the async process
		selectedImageForModal = null;

		// Trigger the model generation process
		await triggerModelGeneration(imageToProcess);

		// No need to alert here anymore, status will update in the panel
	}

  function clearModelPollingInterval(generationId: string) {
		if (activeModelPollingIntervals.has(generationId)) {
			clearInterval(activeModelPollingIntervals.get(generationId)!);
			activeModelPollingIntervals.delete(generationId);
			console.log(`[Gen ID: ${generationId}] Cleared MODEL polling interval.`);
		}
	}

	async function triggerModelGeneration(imageState: GeneratedImage) {
		const generationId = imageState.id; // Use the existing ID

		if (imageState.status !== 'success' || !imageState.imageUrl) {
			console.warn(`[Gen ID: ${generationId}] Skipping model generation: Image status is '${imageState.status}' or URL is missing.`);
			if (imageState.modelStatus !== 'skipped_image_failed') {
				updateImageState(generationId, { modelStatus: 'skipped_image_failed', modelStatusMessage: 'Skipped: Image not successful.' });
			}
			return;
		}

		// WORLD_ID is already defined globally in this component
		// Use imageState.id directly as propID
		const propID = generationId;

    userIdForRequest = getAuthenticatedUserId();
		if (!userIdForRequest) {
			//alert("Please log in to generate images.");
			showLoginModal.set(true);
			return false;
		}

		const requestBody = {
			imagePublicUrl: imageState.imageUrl,
			userID: userIdForRequest, // Use the constant defined earlier
			worldID: WORLD_ID,
			propID: propID
		};

		console.log(`[Gen ID: ${propID}] Enqueuing 3D model generation...`, requestBody);
		updateImageState(generationId, { modelStatus: 'queued', modelStatusMessage: 'Sending request to model queue...', modelAttempts: 0 }); // Reset attempts

		try {
			const response = await fetch(MODEL_GENERATION_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* ignore */ }
				throw new Error(`Failed to enqueue model: ${errorBody}`);
			}

			const result: any = await response.json();
			if (!result.statusKey) throw new Error("Model enqueue response missing 'statusKey'.");

			const fullModelStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`;
			console.log(`[Gen ID: ${propID}] Model task enqueued. Status URL: ${fullModelStatusUrl}`);
			updateImageState(generationId, { modelStatus: 'polling', modelStatusUrl: fullModelStatusUrl, modelStatusMessage: 'Model Queued. Waiting...' });
			startModelPolling(generationId, fullModelStatusUrl); // Start polling for the model

		} catch (err: any) {
			console.error(`[Gen ID: ${propID}] Error enqueuing model generation:`, err);
			updateImageState(generationId, { modelStatus: 'error_enqueue', modelStatusMessage: `Model Enqueue failed: ${err.message}` });
		}
	}

	function startModelPolling(generationId: string, statusUrl: string) {
		clearModelPollingInterval(generationId); // Use the specific model clearer
		console.log(`[Gen ID: ${generationId}] Starting MODEL polling for status at ${statusUrl}`);
		const intervalId = window.setInterval(() => { pollModelStatus(generationId, statusUrl); }, POLLING_INTERVAL_MS);
		activeModelPollingIntervals.set(generationId, intervalId);
	}

	async function pollModelStatus(generationId: string, statusUrl: string) {
		const imageIndex = generatedImages.findIndex(img => img.id === generationId);
		if (imageIndex === -1) {
			console.warn(`[Gen ID: ${generationId}] Model polling stopped: Image data not found.`);
			clearModelPollingInterval(generationId);
			return;
		}

		let currentImage = generatedImages[imageIndex];
		let currentAttempts = (currentImage.modelAttempts ?? 0) + 1;
		updateImageState(generationId, { modelAttempts: currentAttempts }); // Update attempts using the state function

		currentImage = generatedImages[imageIndex]; // Re-fetch after update

		if (currentAttempts > MAX_MODEL_POLL_ATTEMPTS) {
			console.warn(`[Gen ID: ${generationId}] Model polling timed out after ${MAX_MODEL_POLL_ATTEMPTS} attempts.`);
			updateImageState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model polling timed out.` });
			clearModelPollingInterval(generationId);
			return;
		}

		try {
			const response = await fetch(statusUrl, { cache: 'no-store' });

			if (response.status === 404) {
				// Only update message if still actively polling
				if (currentImage.modelStatus === 'polling' || currentImage.modelStatus === 'queued') {
					updateImageState(generationId, { modelStatusMessage: `Waiting for model status... (Attempt ${currentAttempts})` });
				}
				return; // Don't process further on 404
			}

			if (!response.ok) {
				throw new Error(`HTTP error ${response.status} fetching model status: ${response.statusText}`);
			}

			const statusReport: any = await response.json();
			// Re-check index in case state array changed during async fetch
			const currentIndex = generatedImages.findIndex(img => img.id === generationId);
			if (currentIndex === -1) { clearModelPollingInterval(generationId); return; }


			switch (statusReport.status) {
				case 'success':
					if (!statusReport.r2ModelPath) throw new Error("Model status 'success' but missing 'r2ModelPath'.");
					if (!statusReport.r2ModelPath.toLowerCase().endsWith('.glb')) {
						throw new Error(`Model success but path is not a .glb file: ${statusReport.r2ModelPath}`);
					}
					const fullModelUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ModelPath}`;
					console.log(`[Gen ID: ${generationId}] Model generation successful! URL: ${fullModelUrl}`);

					updateImageState(generationId, {
						modelStatus: 'success',
						modelUrl: fullModelUrl,
						modelStatusMessage: 'Model generated.'
						// Removed propDataUpdates here as it's specific to the source context
					});
					clearModelPollingInterval(generationId);

					// --- ADD THIS LINE TO SAVE THE MODEL URL ---
					await saveModelUrlToDatabase(generationId, fullModelUrl);
					// --- END ADDED LINE ---


					// --- Placeholder for BabylonJS Load Trigger ---
					const finalImageStateForLoading = generatedImages.find(img => img.id === generationId);
                    // Assuming 'threeD.scene' is your BabylonJS scene reference from '$lib/blockly/blockly'
					if (finalImageStateForLoading && threeD?.scene && finalImageStateForLoading.modelUrl) {
						console.log(`[Gen ID: ${generationId}] Attempting to load model into BabylonJS scene...`);

            const objectNameToLoad = finalImageStateForLoading.objectName;
            console.log(`[Gen ID: ${generationId}] Model ready. Attempting to load model into BabylonJS scene using NAME: "${objectNameToLoad}"...`);

            // TODO: Ensure your BabylonJS loading function uses `generationId`
              //       when it eventually calls getMeshURL internally.
              // Example: someBabylonLoadFunction(generationId); // Pass the ID

						// TODO: Implement or call your actual BabylonJS loading function here
						// Example: loadModelIntoScene(finalImageStateForLoading, threeD.scene);
            console.warn(`[Gen ID: ${generationId}] BabylonJS model loading needs to use the NAME ('${objectNameToLoad}') to resolve the URL via getMeshURL.`);
						console.warn(`[Gen ID: ${generationId}] BabylonJS model loading not fully implemented yet.`);
						// Optionally update status message after trying to load:
						// updateImageState(generationId, { modelStatusMessage: 'Model loaded into scene.' });
					} else if (!threeD?.scene) {
						console.warn(`[Gen ID: ${generationId}] Model ready, but BabylonJS scene is not available. Cannot load.`);
						updateImageState(generationId, { modelStatusMessage: 'Model ready (Scene not found).' });
					} else {
						console.warn(`[Gen ID: ${generationId}] Model ready, but state/URL missing. Cannot load.`);
						updateImageState(generationId, { modelStatusMessage: 'Internal error loading model.' });
					}
					// --- End Placeholder ---
					break;

				case 'failure':
				case 'error':
					const modelFailureMsg = statusReport.message || statusReport.errorDetails || 'Unknown error from model worker';
					console.error(`[Gen ID: ${generationId}] Model generation failed. Reason: ${modelFailureMsg}`);
					updateImageState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model Failed: ${modelFailureMsg}` });
					clearModelPollingInterval(generationId);
					break;

				case 'processing':
				case 'generating':
					updateImageState(generationId, { modelStatus: 'generating', modelStatusMessage: `Generating model... (Attempt ${currentAttempts})` });
					break;

				case 'queued':
				     updateImageState(generationId, { modelStatus: 'queued', modelStatusMessage: `Model in queue... (Attempt ${currentAttempts})` });
				     break;

				default:
					console.warn(`[Gen ID: ${generationId}] Unknown MODEL status received: ${statusReport.status}. Continuing poll.`);
					updateImageState(generationId, { modelStatusMessage: `Unknown model status: ${statusReport.status} (Attempt ${currentAttempts})` });
					break;
			}
		} catch (err: any) {
			console.error(`[Gen ID: ${generationId}] Error during model polling:`, err);
			// Re-check index in case state array changed during async error handling
			const errorIndex = generatedImages.findIndex(img => img.id === generationId);
			if (errorIndex === -1) { clearModelPollingInterval(generationId); return; }

			// Handle JSON parse errors specifically (often indicates status file not fully written yet)
			if (err instanceof SyntaxError) {
				console.warn(`[Gen ID: ${generationId}] JSON parsing error during model poll. Status file might be incomplete. Retrying...`);
				updateImageState(generationId, { modelStatusMessage: `Reading status... (Attempt ${currentAttempts})` });
			} else {
				// For other errors, fail the model generation polling
				updateImageState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model polling error: ${err.message}` });
				clearModelPollingInterval(generationId);
			}
		}
	}




	function startImagePolling(generationId: string, statusUrl: string) {
		clearPollingInterval(generationId);
		console.log(`[Gen ID: ${generationId}] Starting polling for status at ${statusUrl}`);
		const intervalId = window.setInterval(() => { pollImageStatus(generationId, statusUrl); }, POLLING_INTERVAL_MS);
		activePollingIntervals.set(generationId, intervalId);
	}

	function clearPollingInterval(generationId: string) {
		if (activePollingIntervals.has(generationId)) {
			clearInterval(activePollingIntervals.get(generationId)!);
			activePollingIntervals.delete(generationId);
			console.log(`[Gen ID: ${generationId}] Cleared polling interval.`);
		}
	}

  async function saveImageToDatabase(imageData: {
		id: string;
		prompt: string;
		imageUrl: string;
		originalImageId?: string;
	}) {
		const userId = getAuthenticatedUserId();
		const supabase = get(supabaseStore);

		if (!userId) {
			console.error(`[Gen ID: ${imageData.id}] Cannot save image to DB: User is not logged in.`);
			updateImageState(imageData.id, {
				status: 'db_error',
				statusMessage: 'Generated, but failed to save to your account. Please log in.'
			});
			return;
		}
		if (!supabase) {
			console.error(`[Gen ID: ${imageData.id}] Cannot save image to DB: Supabase client not available.`);
			updateImageState(imageData.id, {
				status: 'db_error',
				statusMessage: 'Generated, but failed to save to your account. Client not ready.'
			});
			return;
		}

		console.log(`[Gen ID: ${imageData.id}] Attempting to save object details (image) to Supabase for user ${userId}...`); // Log message updated slightly

		try {
			const { data, error } = await supabase
				.from('generated_objects') // <--- TABLE NAME UPDATED HERE
				.insert({
					id: imageData.id,
					prompt: imageData.prompt,
					image_url: imageData.imageUrl,
					user_id: userId,
					world_id: WORLD_ID,
					original_image_id: imageData.originalImageId
					// model_url will be null initially
				})
				.select();

			if (error) {
				console.error(`[Gen ID: ${imageData.id}] Supabase insert error into generated_objects:`, error); // Log message updated slightly
				throw new Error(`Supabase error (${error.code || 'unknown'}): ${error.message}`);
			}

			console.log(`[Gen ID: ${imageData.id}] Object details (image) saved successfully to Supabase:`, data); // Log message updated slightly

		} catch (error: any) {
			console.error(`[Gen ID: ${imageData.id}] Error saving object details (image) to Supabase:`, error.message || error); // Log message updated slightly
			updateImageState(imageData.id, {
				status: 'db_error',
				statusMessage: `Generated, but DB save failed: ${error.message || 'Unknown error'}`
			});
		}
	}


	async function saveModelUrlToDatabase(generationId: string, modelUrl: string) {
		const userId = getAuthenticatedUserId();
		const supabase = get(supabaseStore);

		if (!userId) {
			console.error(`[Gen ID: ${generationId}] Cannot save model URL to DB: User is not logged in.`);
			// Optionally update state
			return;
		}
		if (!supabase) {
			console.error(`[Gen ID: ${generationId}] Cannot save model URL to DB: Supabase client not available.`);
			// Optionally update state
			return;
		}

		console.log(`[Gen ID: ${generationId}] Attempting to save model URL to Supabase object for user ${userId}...`); // Log message updated slightly

		try {
			const { data, error } = await supabase
				.from('generated_objects') // <--- TABLE NAME UPDATED HERE
				.update({ model_url: modelUrl }) // Update the model_url column
				.eq('id', generationId)          // Where the ID matches
				.select('id');                    // Select something to confirm success

			if (error) {
				console.error(`[Gen ID: ${generationId}] Supabase model URL update error in generated_objects:`, error); // Log message updated slightly
				throw new Error(`Supabase error updating model URL (${error.code || 'unknown'}): ${error.message}`);
			}

			if (!data || data.length === 0) {
				console.warn(`[Gen ID: ${generationId}] Model URL updated in Supabase object, but no confirmation row returned (or row didn't exist?). URL: ${modelUrl}`); // Log message updated slightly
			} else {
				console.log(`[Gen ID: ${generationId}] Model URL saved successfully to Supabase object.`); // Log message updated slightly
			}

		} catch (error: any) {
			console.error(`[Gen ID: ${generationId}] Error saving model URL to Supabase object:`, error.message || error); // Log message updated slightly
			// Optionally update the state
		}
	}


	async function pollImageStatus(generationId: string, statusUrl: string) {
		const imageIndex = generatedImages.findIndex(img => img.id === generationId);
		if (imageIndex === -1) {
			console.warn(`[Gen ID: ${generationId}] Image not found in state during poll. Clearing interval.`);
			clearPollingInterval(generationId);
			return;
		}

		let currentImage = generatedImages[imageIndex];
		const currentAttempts = currentImage.attempts + 1;

		currentImage = { ...currentImage, attempts: currentAttempts };
		generatedImages.splice(imageIndex, 1, currentImage);

		if (currentAttempts > MAX_POLL_ATTEMPTS) {
			console.warn(`[Gen ID: ${generationId}] Polling timed out after ${MAX_POLL_ATTEMPTS} attempts.`);
			updateImageState(generationId, { status: 'failed', statusMessage: `Polling timed out after ${currentAttempts} attempts.` });
			clearPollingInterval(generationId); return;
		}

		try {
			const response = await fetch(statusUrl, { cache: 'no-store' });
			if (response.status === 404) {
				const currentStatus = generatedImages[imageIndex].status;
				if (currentStatus === 'polling' || currentStatus === 'queued') {
					updateImageState(generationId, { statusMessage: `Waiting for status file... (Attempt ${currentAttempts})` });
				} else {
					console.log(`[Gen ID: ${generationId}] Status is ${currentStatus}, ignoring 404.`);
				}
				return;
			}
			if (!response.ok) { throw new Error(`HTTP error ${response.status} fetching status: ${response.statusText}`); }

			const statusReport: any = await response.json();

			const currentIndex = generatedImages.findIndex(img => img.id === generationId);
			if (currentIndex === -1) { clearPollingInterval(generationId); return; }
			currentImage = generatedImages[currentIndex];


			switch (statusReport.status) {
				case 'success':
					if (!statusReport.r2ImagePath) throw new Error("Image status 'success' but missing 'r2ImagePath'.");
					const fullImageUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ImagePath}`;
					console.log(`[Gen ID: ${generationId}] Image generation successful! URL: ${fullImageUrl}`);

					updateImageState(generationId, {
						status: 'success',
						imageUrl: fullImageUrl,
						statusMessage: 'Image generated.',
					});
					clearPollingInterval(generationId);

					await saveImageToDatabase({
						id: generationId,
						prompt: currentImage.prompt,
						imageUrl: fullImageUrl,
						originalImageId: currentImage.originalImageId
					});
					break;
				case 'failure': case 'error':
					const failureMsg = statusReport.message || statusReport.errorDetails || 'Unknown error from worker';
					console.error(`[Gen ID: ${generationId}] Image generation failed. Reason: ${failureMsg}`);
					updateImageState(generationId, { status: 'failed', statusMessage: `Image Failed: ${failureMsg}`, });
					clearPollingInterval(generationId); break;
				case 'processing': case 'generating':
					updateImageState(generationId, { status: 'generating', statusMessage: `Generating image... (Attempt ${currentAttempts})` }); break;
				case 'queued':
					updateImageState(generationId, { status: 'queued', statusMessage: `Image in queue... (Attempt ${currentAttempts})` }); break;
				default:
					console.warn(`[Gen ID: ${generationId}] Unknown status: ${statusReport.status}. Continuing poll.`);
					updateImageState(generationId, { statusMessage: `Unknown status: ${statusReport.status} (Attempt ${currentAttempts})` }); break;
			}
		} catch (err: any) {
			console.error(`[Gen ID: ${generationId}] Error during polling:`, err);
			const currentIndex = generatedImages.findIndex(img => img.id === generationId);
			if (currentIndex === -1) { clearPollingInterval(generationId); return; }

			if (err instanceof SyntaxError) {
				updateImageState(generationId, { statusMessage: `Reading status... (Attempt ${currentAttempts})` });
			} else {
				updateImageState(generationId, { status: 'failed', statusMessage: `Polling error: ${err.message}` });
				clearPollingInterval(generationId);
			}
		}
	}
</script>

<svelte:head>
	<title>Madmods World - Blockly</title>
	<meta name="description" content="Create with Madmods Blockly" />
</svelte:head>

<div id="blockly-container">
	<div id="blockly-header">
		<div id="buttonrow">
			<a href="/" class="blockly-page-logo-link">
				<img id="logo" src="/logos/madmods-logo7.svg" alt="Madmods Logo" />
			</a>
			<p></p>
			<button id="reset" class="top-button">Reset</button>
			<button id="physics" class="top-button physics-off">Physics</button>
			<button id="fullscreen" class="top-button">Full</button>
			<button id="vr" class="top-button">VR</button>
			<div id="vr-dropdown">
				<button class="vr-dropdown-item" id="oculusQuestButton">Oculus Quest</button>
				<button class="vr-dropdown-item" id="googleCardboardButton">Google Cardboard</button>
				<button class="vr-dropdown-item" id="exitVRButton">Exit VR</button>
			</div>
			<button id="debug" class="top-button">Debugger</button>
			<p></p>
			<p></p>
			<button id="examples" class="top-button">Examples</button>
			<div id="examples-dropdown">
				<button class="examples-dropdown-item" data-file="tv-room.json" data-physics="off">TV Room</button>
				<button class="examples-dropdown-item" data-file="spinning-codeorg.json" data-physics="off">Spinning Code.org</button>
				<button class="examples-dropdown-item" data-file="solar-system.json" data-physics="off">Solar System</button>
				<button class="examples-dropdown-item" data-file="pegboard.json" data-physics="on">Pegboard Game</button>
				<button class="examples-dropdown-item" data-file="redpill-bluepill.json" data-physics="on">Red Pill, Blue Pill</button>
			</div>
			<div id="image-upload">
				<label for="import" id="image-upload-label">
					<span class ="mt-8">Open</span>
				</label>
				<input id="import" type="file" />
			</div>
			<button id="export" class="top-button">Save</button>
			<button id="clear" class="top-button">Clear</button>
			<button id="help" class="top-button">Help</button>

			<div class="auth-buttons-container">
				{#if $sessionStore?.user}
					{@const avatarUrl = $sessionStore.user.user_metadata?.avatar_url || $sessionStore.user.user_metadata?.picture}
					<button onclick={handleLogout} class="auth-button logout-button"> Logout </button>

					<div class="auth-avatar-container">
						{#if avatarUrl}
							<img class="auth-avatar-image" src={avatarUrl} alt="{$sessionStore.user.email ?? 'User'} avatar" referrerpolicy="no-referrer" title={$sessionStore.user.email ?? 'User Profile'} />
						{:else}
							<span class="auth-avatar-fallback" title={$sessionStore.user.email ?? 'User Profile'}> {$sessionStore.user.email?.[0]?.toUpperCase() ?? '?'} </span>
						{/if}
					</div>
				{:else}
					<button onclick={() => showLoginModal.set(true)} class="auth-button login-button"> Login </button>
				{/if}
			</div>

		</div>
	</div>

	<div id="split">
		<div id="blocklyArea"> {#if isLoading} Loading Workspace... {/if} </div>
		<span id="columnResizer"><img id="drag" src="/icons/drag.svg" alt="Resize Handle" /></span>
		<div id="runArea">
			<canvas id="runAreaCanvas"></canvas>
      <div id="image-panel">
				{#if generatedImages.length === 0}<div class="panel-placeholder">Generated Objects</div>{/if}
				<!-- PASTE THIS ENTIRE #each BLOCK TO REPLACE THE EXISTING ONE -->
{#each generatedImages as image (image.id)}
<div
  class="image-item"
  class:clickable={image.status === 'success'}
  class:error-state={image.status === 'failed' || image.status === 'error_enqueue' || image.status === 'db_error' || image.modelStatus === 'failed' || image.modelStatus === 'error_enqueue' || image.modelStatus === 'skipped_image_failed'}
  onclick={() => handleImageClick(image)}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleImageClick(image);
    }
  }}
  role={image.status === 'success' ? 'button' : undefined}
  tabindex={image.status === 'success' ? 0 : -1}
  aria-label={image.status === 'success' ? `View details for object: ${image.objectName}` : `Object status: ${image.status}`}
>
  {#if image.status === 'success' && image.imageUrl}
    <div class="image-thumbnail-wrapper">
      <img src={image.imageUrl} alt={`Generated object: ${image.objectName}`} loading="lazy" />
      <div class="image-prompt-overlay">{image.prompt}</div>
    </div>
    <!-- Conditional Status Icon -->
    {#if image.modelStatus === 'success'}
      <span class="status-icon model-success" title="3D Model Ready">🧊</span>
    {:else}
      <span class="status-icon image-success" title="Image Ready">🖼️</span>
    {/if}
  {:else if image.status === 'failed' || image.status === 'error_enqueue' || image.status === 'db_error'}
    <div class="image-thumbnail-placeholder error">✖</div>
    <span class="status-icon error" title={`Image Error: ${image.statusMessage}`}>✖</span>
  {:else}
    <!-- Loading State (Image or Model) -->
    <div class="image-thumbnail-placeholder loading">
      <div class="spinner">⏳</div>
    </div>
    {#if image.modelStatus && ['queued', 'polling', 'generating'].includes(image.modelStatus)}
      <span class="status-icon loading" title={`Model Status: ${image.modelStatusMessage ?? image.modelStatus}`}>⏳</span>
    {:else}
      <span class="status-icon loading" title={`Image Status: ${image.statusMessage}`}>⏳</span>
    {/if}
  {/if}

  <input
    type="text"
    class="image-name-input"
    readonly
    bind:value={image.objectName}
    onclick={(e) => {
      e.stopPropagation();
    }}
    onblur={(e) => handleNameChange(image.id, e.currentTarget.value)}
    onkeydown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      }
    }}
    aria-label={`Edit name for ${image.objectName}`}
    title={image.modelStatus ? `Model: ${image.modelStatusMessage ?? image.modelStatus}` : `Image: ${image.statusMessage}`}
    disabled={image.status !== 'success' && image.status !== 'failed' && image.status !== 'error_enqueue' && image.status !== 'db_error'}
  />

  <!-- MODIFIED CONDITIONAL BLOCK FOR STATUS MESSAGE -->
  {#if image.modelStatus && (image.modelStatus === 'failed' || image.modelStatus === 'error_enqueue' || image.modelStatus === 'skipped_image_failed')}
    <!-- Show only ERROR messages for the model -->
    <p class="image-status-message error" title={image.modelStatusMessage}>{`Model: ${image.modelStatusMessage}`}</p>
  {:else if !image.modelStatus && (image.status === 'failed' || image.status === 'error_enqueue' || image.status === 'db_error')}
    <!-- Show only ERROR messages for the image (if model hasn't started/failed yet) -->
    <p class="image-status-message error" title={image.statusMessage}>{`Image: ${image.statusMessage}`}</p>
  {:else if image.modelStatus === undefined && (image.status === 'failed' || image.status === 'error_enqueue' || image.status === 'db_error')}
    <!-- Explicitly handle image error if modelStatus is truly undefined -->
       <p class="image-status-message error" title={image.statusMessage}>{`Image: ${image.statusMessage}`}</p>
      {/if}
  <!-- NOTE: The conditions for showing LOADING messages (model or image) have been removed. -->
  <!-- The spinning loader is handled by the status-icon above during loading states. -->

</div>
{/each}
<!-- END OF REPLACEMENT BLOCK -->
			</div>
			<div id="prompt-container">
				<textarea id="prompt-input" placeholder="a green and yellow colored robotic dog" bind:value={promptValue} onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitPrompt(); } }} >
                </textarea>
				<button id="prompt-submit" onclick={submitPrompt} disabled={!promptValue.trim() || generatedImages.some(img => ['queued', 'polling', 'generating'].includes(img.status))}>
					{#if generatedImages.some(img => ['queued', 'polling', 'generating'].includes(img.status))} Generating...
					{:else} Create
					{/if}
				</button>
			</div>
		</div>
	</div>

	<div id="footer"> <div id="fpsCounter"></div> </div>
	<div id="blocklyDiv" style="position: absolute;"></div>
</div>

{#if errorMsg && !isLoading} <div class="init-error-message"> Initialization Error: {errorMsg} </div> {/if}

{#if selectedImageForModal && selectedImageForModal.imageUrl}
<EditableImageModal
imageUrl={selectedImageForModal.imageUrl}
prompt={selectedImageForModal.prompt}
altText={`Details for object: ${selectedImageForModal.objectName}`}
modelStatus={selectedImageForModal.modelStatus}
modelUrl={selectedImageForModal.modelUrl}
onClose={() => selectedImageForModal = null}
onRegenerate={handleRegenerate}
onMake3D={handleMake3D}
/>
{/if}

<style>
:global(html), :global(body) {
  height: 100%;
  margin: 0;
  overflow: hidden;
  box-sizing: border-box;
}
:global(*, *:before, *:after) {
  box-sizing: inherit;
}

:global(body) {
  font-family: sans-serif;
  background-color: #fff;
}

#blockly-container {
  display: grid;
  height: 100vh;
  width: 100%;
  grid-template-rows: 60px 1fr 20px;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

#blockly-header {
  grid-row: 1; background-color: #705ccc; display: flex; align-items: center;
  position: relative; z-index: 20; flex-shrink: 0; height: 60px;
}
#split {
  grid-row: 2; display: flex; flex-direction: row; height: 100%;
  width: 100%; position: relative; overflow: hidden;
}
#runArea {
  background: #333333; height: 100%; position: relative; overflow: hidden; flex-grow: 1;
  display: flex;
  flex-direction: column;
}
#runAreaCanvas {
    width: 100%; height: 100%; display: block;
    flex-grow: 1;
    min-height: 0;
}
#blocklyArea {
  width: 40%; background: #ffffff; text-align: center; position: relative;
  overflow: hidden; height: 100%; flex-shrink: 0;
}
#columnResizer {
  display: flex; align-items: center; justify-content: center; width: 10px;
  height: 100%; cursor: col-resize; background-color: #705ccc;
  border-left: 1px solid #444; border-right: 1px solid #444; z-index: 5; flex-shrink: 0;
}
#columnResizer img { width: 18px; height: auto; pointer-events: none; user-select: none; }
#columnResizer:hover { background-color: #777; }
#footer {
  grid-row: 3; background-color: #705ccc; color: #fff; font-size: small;
  height: 20px; line-height: 20px; flex-shrink: 0;
}
#fpsCounter { text-align: right; padding-right: 10px; }
#blocklyDiv { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }

#logo {
    height: 45px;
    padding: 5px 0 5px 15px;
    margin-right: 10px;
    flex-shrink: 0;
}
.blockly-page-logo-link {
    display: inline-block;
    line-height: 0;
}
#buttonrow {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    width: 100%;
    flex-wrap: nowrap;
    height: 100%;
}

.top-button {
  background-color: transparent;
  border: none;
  background-size: 30px 30px;
  background-position: center 7px;
  background-repeat: no-repeat;
  height: 50px;
  width: 50px;
  margin: 0;
  padding-top: 30px;
  box-sizing: border-box;
  cursor: pointer;
  color: white;
  font-size: 12px;
  text-align: center;
  line-height: 1.2;
  flex-shrink: 0;
}
.top-button:hover { background-color: rgba(255, 255, 255, 0.1); border-radius: 4px; }
.top-button:focus-visible { outline: 2px solid white; outline-offset: 1px; border-radius: 4px; }

#reset { background-image: url(/icons/restart.svg); }
.physics-on { background-image: url(/icons/toggle_on.svg); }
.physics-off { background-image: url(/icons/toggle_off.svg); }
#fullscreen { background-image: url(/icons/fullscreen.svg); }
#vr { background-image: url(/icons/vr.svg); }
#debug { background-image: url(/icons/debug.svg); }
#examples { background-image: url(/icons/media.svg); }
#clear { background-image: url(/icons/delete.svg); }
#export { background-image: url(/icons/download.svg); }
#help { background-image: url(/icons/help.svg); }

#image-upload {
    height: 50px; width: 50px;
    position: relative; flex-shrink: 0;
}
#image-upload>input { display: none; }
#image-upload-label {
    display: block;
    width: 100%; height: 100%;
    background-image: url(/icons/upload.svg);
    background-size: 30px 30px;
    /* Adjust icon position slightly higher */
    background-position: center 5px;
    background-repeat: no-repeat;
    /* Adjust padding to push text down, creating space below the icon */
    padding-top: 35px;
    box-sizing: border-box;
    cursor: pointer;
    color: white; font-size: 10px; text-align: center; line-height: 1.2;
}
#image-upload-label:hover { background-color: rgba(255, 255, 255, 0.1); border-radius: 4px; }
#image-upload-label:focus-visible { outline: 2px solid white; outline-offset: 1px; border-radius: 4px; }

.auth-buttons-container {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 10px;
}

.auth-button {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    border: none;
    transition: background-color 0.2s ease;
}
.auth-button:hover {
    opacity: 0.9;
}
.auth-button:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
}

.login-button { background-color: #3b82f6; }
.login-button:hover { background-color: #2563eb; }
.logout-button { background-color: #ffbf00; }
.logout-button:hover { background-color: hsl(45, 100%, 68%); }

.auth-avatar-container {
    display: flex;
    align-items: center;
}
.auth-avatar-image, .auth-avatar-fallback {
    height: 32px;
    width: 32px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.6);
    object-fit: cover;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    background-color: #60a5fa;
    color: white;
}

#prompt-container{
  position:absolute;
  bottom:15px;
  right:15px;
  display:flex;
  align-items:flex-end;
  gap:5px;
  background-color:rgba(112, 92, 204, 0.75);
  padding:8px;
  border-radius:6px;
  box-shadow:0 2px 5px rgba(0, 0, 0, 0.3);
  z-index:11;
}

#prompt-input{
  width:300px;
  height:45px;
  min-height: 45px;
  background-color:#f0f0f0;
  border:1px solid #ccc;
  border-radius:4px;
  padding:8px 10px;
  font-family:sans-serif;
  font-size:13px;
  line-height: 1.4;
  resize:none;
  box-sizing:border-box;
  color: #333;
}
#prompt-input:focus {
    outline: 2px solid #8970f8;
    border-color: #8970f8;
}

#prompt-submit{
  height:45px;
  padding:0 12px;
  background-color:#705ccc;
  color:#fff;
  border:none;
  border-radius:4px;
  cursor: pointer;
  font-size:13px;
  font-weight:700;
  box-sizing: border-box;
  white-space:nowrap;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
}

#prompt-submit:disabled{
  background-color:#675ba0;
  cursor:not-allowed;
  opacity: 0.7;
}

#prompt-submit:hover:not(:disabled){
  background-color:#8970f8;
}
#prompt-submit:focus-visible {
    outline: 2px solid white;
    outline-offset: 1px;
}

#image-panel {
  position:absolute;
  top:15px;
  right:15px;
  bottom: calc(15px + 45px + 16px + 15px);
  width:180px;
  background-color:rgba(112, 92, 204, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius:8px;
  box-shadow:0 2px 8px rgba(0,0,0,.4);
  overflow-y:auto;
  overflow-x:hidden;
  padding:10px;
  box-sizing:border-box;
  z-index:10;
  display:flex;
  flex-direction:column;
  gap:10px;
  scrollbar-width: thin;
  scrollbar-color: #8970f8 rgba(112, 92, 204, 0.3);
}

#image-panel::-webkit-scrollbar {
  width: 6px;
}
#image-panel::-webkit-scrollbar-track {
  background: rgba(112, 92, 204, 0.2);
  border-radius: 3px;
}
#image-panel::-webkit-scrollbar-thumb {
  background-color: #8970f8;
  border-radius: 3px;
  border: 1px solid rgba(112, 92, 204, 0.5);
}

.panel-placeholder{
  color:rgba(255, 255, 255, 0.7);
  font-size:14px;
  text-align:center;
  padding:20px 5px;
  font-style:italic
}

/* --- Add these new styles --- */
.image-thumbnail-wrapper {
	position: relative;
	width: 100%;
	aspect-ratio: 1 / 1; /* Ensure wrapper is square */
	overflow: hidden; /* Keep overlay contained */
	border-radius: 4px;
    margin-bottom: 6px; /* Space between image and input */
    display: flex; /* Center potential placeholders */
    justify-content: center;
    align-items: center;
    background-color: rgba(0, 0, 0, 0.2); /* Slight bg for placeholders */
}

.image-thumbnail-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 30px;
}
.image-thumbnail-placeholder.loading .spinner {
    /* Spinner is now handled by status-icon, this can be simplified or removed */
    /* Or keep it as a fallback visual */
     color: #bdbdbd; /* Keep color */
     font-size: 24px; /* Keep size */
}
.image-thumbnail-placeholder.error {
     color: #ffcece; /* Keep color */
     font-size: 24px; /* Keep size */
}


.image-prompt-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    font-size: 11px;
    line-height: 1.3;
    padding: 4px 6px;
    text-align: center;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s ease, visibility 0.2s ease;
    pointer-events: none; /* Allow clicks to pass through to image */
    max-height: 50%; /* Limit height */
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
   -webkit-line-clamp: 3; /* Limit to 3 lines */
   -webkit-box-orient: vertical;
}

.image-thumbnail-wrapper:hover .image-prompt-overlay {
    opacity: 1;
    visibility: visible;
}

.image-name-input {
    width: 100%;
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    border-radius: 3px;
    padding: 4px 6px;
    font-size: 12px;
    text-align: center;
    box-sizing: border-box;
    transition: background-color 0.2s, border-color 0.2s;
}
.image-name-input:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.4);
}
.image-name-input:focus {
    background-color: rgba(255, 255, 255, 0.2);
    border-color: #a38fed;
    outline: none;
}
.image-name-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* Update status message styling */
.image-status-message {
	font-size: 10px;
	color: rgba(255, 255, 255, 0.7);
	font-style: italic;
	margin-top: 4px; /* Slightly more space */
	width: 100%;
	text-align: center;
	white-space: normal; /* Allow wrapping */
	overflow: hidden;
    line-height: 1.2;
    max-height: 2.4em; /* Limit to roughly 2 lines */
	/* text-overflow: ellipsis; */ /* Ellipsis less useful with wrapping */
}
.image-status-message.error {
    color: #ffc8c8;
}
.image-status-message.loading {
    color: #bdbdbd;
}

/* Modify .status-icon and add specific styles */
.status-icon {
    position: absolute;
    top: 10px; /* Adjust position slightly if needed */
    left: 10px; /* Adjust position slightly if needed */
    font-size: 14px; /* Adjust size for potentially larger icons */
    width: 20px; /* Adjust size */
    height: 20px; /* Adjust size */
    border-radius: 4px; /* Can be square or circle */
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: normal; /* Icons might look better normal weight */
    line-height: 1;
	background-color: rgba(0, 0, 0, 0.3); /* Default background */
	color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.status-icon.image-success {
	background-color: rgba(76, 175, 80, 0.7); /* Greenish */
	border-color: rgba(165, 214, 167, 0.5);
}
.status-icon.model-success {
	background-color: rgba(66, 165, 245, 0.8); /* Bluish */
	border-color: rgba(144, 202, 249, 0.6);
}
.status-icon.error {
	background-color: rgba(239, 83, 80, 0.7); /* Reddish */
	color: white;
	border-color: rgba(255, 205, 210, 0.5);
}
.status-icon.loading {
	background-color: rgba(158, 158, 158, 0.6); /* Greyish */
	border-color: rgba(224, 224, 224, 0.4);
	animation: spin 1.5s linear infinite; /* Keep spinner animation */
}

/* --- Adjust existing styles --- */
.image-item {
	background-color: rgba(126, 101, 226, 0.32);
	border: 1px solid transparent;
	border-radius: 5px;
	padding: 8px;
	display: flex;
	flex-direction: column;
	align-items: center;
	/* removed gap: 6px; spacing handled by margins now */
	overflow: hidden;
	flex-shrink: 0;
	position: relative; /* Needed for absolute positioned status icon */
  
}
.image-item.clickable {
    cursor: pointer;
    transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
}
.image-item.clickable:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 4px 10px rgba(112, 92, 204, 0.6);
}
.image-item.clickable:focus {
    outline: 2px solid #a38fed;
    outline-offset: 2px;
}
.image-item.error-state {
	border-color: #ef5350; /* Add red border for errors */
}

/* Keep this if you haven't removed it already */
/* Ensure spinner animation is defined */
@keyframes spin {
	0% { transform: rotate(0deg); }
	100% { transform: rotate(360deg); }
}

/* Modify image style slightly */
.image-item img {
	max-width: 100%;
	height: 100%; /* Fill the wrapper */
	object-fit: cover;
	border-radius: 4px; /* Match wrapper */
	display: block;
	border: 1px solid rgba(255, 255, 255, 0.1);
}


#drag { width: 18px; height: auto; pointer-events: none; user-select: none; }
#vr-dropdown, #examples-dropdown { position: absolute; display: none; flex-direction: column; top: 55px; width: 200px; background-color: #705ccc; min-width: 160px; box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2); z-index: 1000; border-radius: 4px; overflow: hidden; }
#vr-dropdown { left: 210px; } #examples-dropdown { left: 375px; }
#vr-dropdown button, #examples-dropdown button { font-weight: bold; text-align: left; }
.vr-dropdown-item, .examples-dropdown-item { padding: 8px 12px; text-decoration: none; display: block; color: white; background: none; border: none; text-align: left; cursor: pointer; width: 100%; font-size: 13px; }
.vr-dropdown-item:hover, .examples-dropdown-item:hover { background-color: #8970f8; }

.init-error-message {
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(239, 68, 68, 0.9);
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    z-index: 1000;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    font-size: 14px;
    text-align: center;
}

.blocklyTreeLabel { font-size: 12px !important; }
.blocklyText { font-size: 10px; }


    /* Hide specific buttons by ID */
    #vr,
#debug,
#examples,
#clear,
#help {
  display: none;
}

/* Also hide their associated dropdowns */
#vr-dropdown,
#examples-dropdown {
  display: none !important; /* Use !important to override potential JS manipulation */
}

/* Prevent text selection across the entire page */
:global(body) {
  -webkit-user-select: none; /* Safari, Chrome, Opera, older Edge */
  -moz-user-select: none;    /* Firefox */
  -ms-user-select: none;     /* Internet Explorer/Edge */
  user-select: none;         /* Standard syntax */
}

/* PASTE THIS NEW CSS RULE INSIDE YOUR <style> TAG */

/* Allow text selection specifically for input/textarea elements */
#prompt-input,
.image-name-input {
  -webkit-user-select: text; /* Or 'auto' */
  -moz-user-select: text;    /* Or 'auto' */
  -ms-user-select: text;     /* Or 'auto' */
  user-select: text;         /* Or 'auto' */
}

/* END OF NEW CSS RULE */
</style>