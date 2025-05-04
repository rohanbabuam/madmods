<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { v4 as uuidv4 } from 'uuid';
	import { get } from 'svelte/store';
	import * as Blockly from 'blockly/core'; // Keep for type hints if needed, maybe resize

	// Core Blockly/ThreeJS integration logic (kept in parent for now)
	import {
		init as initializeApp,
		run as runBlocklyCode,
		blocklyWorkspace as blocklyWorkspaceStore, // Assuming blockly exposes a store or we manage ref
		threeD
	} from '$lib/blockly/blockly';

	// Types
	import type { GeneratedObject } from '$lib/types/GeneratedObject';
	import type { PageData } from './$types';
	import type { Database } from '$lib/database.types';
	type DatabaseObject = Database['public']['Tables']['generated_objects']['Row'];

	// Stores
	import { sessionStore, showLoginModal, handleLogout, supabaseStore } from '$lib/stores/authStore';

	// Child Components
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import ObjectLibrary from '$lib/components/ObjectLibrary.svelte';
	import PromptBox from '$lib/components/PromptBox.svelte';
	import EditableObjectModal from '$lib/components/EditableObjectModal.svelte';
    import ObjectCard from '$lib/components/ObjectCard.svelte'; // Keep for type if used directly, or remove if only in ObjectLibrary

	// Constants
	const MAX_MODEL_POLL_ATTEMPTS = 60;
	const MAX_POLL_ATTEMPTS = 40;
	const POLLING_INTERVAL_MS = 3000;
	const WORLD_ID = 'default-world';
	const PUBLIC_MODEL_GENERATION_ENDPOINT="https://modelgeneration.madmods.world"
    const PUBLIC_IMAGE_GENERATION_ENDPOINT="https://imagegeneration.madmods.world"
    const PUBLIC_R2_PUBLIC_URL_BASE="https://pub-48572794ea984ea9976e5d5856e58593.r2.dev"
    const IMAGE_GENERATION_ENDPOINT = PUBLIC_IMAGE_GENERATION_ENDPOINT || 'http://localhost:8787/generate';
    const MODEL_GENERATION_ENDPOINT = PUBLIC_MODEL_GENERATION_ENDPOINT
    const R2_PUBLIC_URL_BASE = PUBLIC_R2_PUBLIC_URL_BASE || '';

	// Props
	let { data }: { data: PageData } = $props();

	// Page State
	let overallErrorMsg: string | null = $state(null); // Renamed to avoid clash with CodeEditor's internal error
	let activeTab = $state<'code' | 'objects'>('code');
	let selectedImageForModal = $state<GeneratedObject | null>(null);
	let currentPhysicsEnabled = $state(false);

	// Shared State (managed by parent)
	let objectsList = $state<GeneratedObject[]>([]);
	let objectsLoading = $state(false);
	let objectsError = $state<string | null>(null);
	let promptValue = $state(''); // Used by PromptBox and submitPrompt

	// Internal State & Refs
	const activePollingIntervals = new Map<string, number>();
	const activeModelPollingIntervals = new Map<string, number>();
	let physicsObserver: MutationObserver | null = null;
    let userIdForRequest: string | null | undefined; // Keep track of user ID for requests

	let columnResizerElement: HTMLElement | null = null;
	let leftPanelElement: HTMLElement | null = null;
	let isResizing = false;
	let initialResizeX = 0;
	let initialLeftWidth = 0;

	// Ref for CodeEditor child component instance
	let codeEditorRef: { resize: () => void } | null = null; // Interface matches exported 'api'

	// --- Authentication ---
	const getAuthenticatedUserId = (): string | null => {
		const session = get(sessionStore);
		return session?.user?.id ?? null;
	};

	// --- Object State Management ---
    function updateObjectState(id: string, updates: Partial<GeneratedObject>) {
		// Use rune's array mutation for reactivity
		const index = objectsList.findIndex(obj => obj.id === id);
		if (index !== -1) {
            const updatedObject = { ...objectsList[index], ...updates };
			// Svelte 5: Direct mutation works if objectsList is $state
            objectsList[index] = updatedObject;
            // Alternative Svelte 5 mutation:
            // objectsList.splice(index, 1, updatedObject);

			// Also update the modal if this object is selected
			if (selectedImageForModal && selectedImageForModal.id === id) {
				selectedImageForModal = updatedObject;
			}
		} else {
			console.warn(`[Gen ID: ${id}] Attempted to update state for non-existent object in objectsList.`);
		}
	}

    function generateDefaultObjectName(existingObjects: GeneratedObject[]): string {
		let i = 1;
		let name = `object-${i}`;
		while (existingObjects.some(obj => obj.objectName === name)) {
			i++;
			name = `object-${i}`;
		}
		return name;
	}

	// --- Data Fetching ---
	async function fetchObjects() {
        const supabase = get(supabaseStore);
        const userId = getAuthenticatedUserId(); // Ensure we check current user

        if (!supabase) {
            objectsError = "Database connection not available.";
            console.error("Skipping object fetch: Supabase client not ready.");
            return;
        }

         if (objectsLoading) {
            console.log("Fetch already in progress, skipping.");
            return;
        }

        console.log("Fetching objects from database...");
        objectsLoading = true;
        objectsError = null; // Clear previous errors

        let fetchedData: DatabaseObject[] | null = null;
        let fetchError: any = null;

        try {
            // Fetch objects relevant to the user or public? Modify query as needed.
            // Example: Fetching only user's objects if logged in
            let query = supabase
                .from('generated_objects')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            // if (userId) {
            //     query = query.eq('user_id', userId);
            // } else {
            //     // Handle fetching public objects or none if not logged in, based on app logic
            //      query = query.is('user_id', null); // Example: fetch only public
            //      console.warn("Fetching only public objects as user is not logged in.");
            // }
            // For now, fetching all visible based on original logic
            const { data: dbData, error } = await query;

            if (error) {
                throw error;
            }
            fetchedData = dbData;
            console.log(`Fetched ${fetchedData?.length ?? 0} objects.`);

        } catch (err: any) {
            fetchError = err;
            console.error("Error fetching objects:", err);
            objectsError = `Failed to load objects: ${err.message || 'Unknown error'}`;
        }

        // Merge fetched data with potentially ongoing generations
        const generatingItems = objectsList.filter(obj => obj.isGenerating);
        const fetchedItems = fetchedData?.map((dbObj): GeneratedObject => {
            // Transform DB data into GeneratedObject structure
            return {
                id: dbObj.id,
                prompt: dbObj.prompt,
                objectName: dbObj.prompt?.substring(0, 30) || dbObj.id, // Default name from prompt
                status: 'success', // Assuming loaded from DB means image succeeded
                statusMessage: 'Loaded from DB',
                imageUrl: dbObj.image_url,
                modelUrl: dbObj.model_url,
                user_id: dbObj.user_id,
                world_id: dbObj.world_id,
                created_at: dbObj.created_at,
                modelStatus: dbObj.model_url ? 'success' : 'idle', // Or perhaps 'failed' if tried and failed? DB schema dependent
                isGenerating: false, // Not generating if loaded from DB like this
                attempts: 0, // Reset polling attempts
                modelAttempts: 0, // Reset polling attempts
                statusUrl: null, // Clear transient state
                modelStatusMessage: dbObj.model_url ? 'Model loaded' : null,
                modelStatusUrl: null, // Clear transient state
                originalImageId: dbObj.original_image_id,
                image_url: dbObj.image_url, // Ensure compatibility if needed
                model_url: dbObj.model_url // Ensure compatibility if needed
            };
        }) || [];

        // Create a map of generating items by ID for quick lookup
        const generatingMap = new Map(generatingItems.map(item => [item.id, item]));

        // Combine: Keep generating items, add fetched items that aren't currently generating
        const combinedList = [
            ...generatingItems,
            ...fetchedItems.filter(item => !generatingMap.has(item.id))
        ];

        // Sort the combined list (e.g., generating first, then by date)
        combinedList.sort((a, b) => {
            if (a.isGenerating && !b.isGenerating) return -1;
            if (!a.isGenerating && b.isGenerating) return 1;
            // Both generating or both not: sort by creation date descending
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA; // Most recent first
        });

        objectsList = combinedList; // Update the state
        objectsLoading = false;
    }


	// --- Modal Interaction ---
	function handleShowModalForObject(objectToShow: GeneratedObject) {
		console.log(`Parent handler (handleShowModalForObject) called for: ${objectToShow.objectName}`);
        if (objectToShow.image_url) {
		    console.log(`Setting selectedImageForModal for ${objectToShow.objectName}`);
		    selectedImageForModal = objectToShow;
        } else {
            console.log(`Modal not opened for ${objectToShow.objectName}, image_url is missing.`);
        }
	}

	// --- Resizing Logic ---
	function triggerBlocklyResize() {
        // Call the resize method on the child component instance
        if (activeTab === 'code' && codeEditorRef) {
			console.log("Parent: Triggering CodeEditor resize via ref...");
            codeEditorRef.resize();
        }
	}

	function onColumnMouseDown(event: MouseEvent) {
		if (!leftPanelElement || !columnResizerElement) return;
		isResizing = true;
		initialResizeX = event.clientX;
		initialLeftWidth = leftPanelElement.offsetWidth;
		document.addEventListener('mousemove', onColumnMouseMove);
		document.addEventListener('mouseup', onColumnMouseUp);
		document.body.style.userSelect = 'none'; // Prevent text selection during drag
		document.body.style.webkitUserSelect = 'none';
	}

	function onColumnMouseMove(event: MouseEvent) {
		if (!isResizing || !leftPanelElement) return;
		const deltaX = event.clientX - initialResizeX;
		const newWidth = initialLeftWidth + deltaX;
		const minWidth = 200; // Minimum width for left panel
		const parentWidth = (leftPanelElement.parentElement as HTMLElement)?.offsetWidth ?? window.innerWidth;
		const maxWidth = parentWidth - 200; // Minimum width for right panel

		// Clamp width between min and max
        const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));

		if (leftPanelElement.offsetWidth !== clampedWidth) {
			leftPanelElement.style.width = `${clampedWidth}px`;
			// Debounce or throttle this if it causes performance issues
			triggerBlocklyResize(); // Resize Blockly as the panel width changes
		}
	}

	function onColumnMouseUp() {
		if (!isResizing) return;
		isResizing = false;
		document.removeEventListener('mousemove', onColumnMouseMove);
		document.removeEventListener('mouseup', onColumnMouseUp);
		document.body.style.userSelect = ''; // Restore text selection
		document.body.style.webkitUserSelect = '';
		// Final resize call to ensure consistency
		triggerBlocklyResize();
	}

	const handleWindowResize = () => {
		// Debounce this if needed
		triggerBlocklyResize();
	};

	// --- Lifecycle ---
	onMount(async () => {
		if (!browser) return;

		// Get static elements
		columnResizerElement = document.getElementById('columnResizer');
		leftPanelElement = document.getElementById('left-panel');

		// Physics button observer setup (remains in parent as it affects runBlocklyCode)
		const physicsButton = document.getElementById('physics');
        if (physicsButton) {
             physicsObserver = new MutationObserver((mutationsList) => {
                for(let mutation of mutationsList) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        currentPhysicsEnabled = (mutation.target as HTMLElement).classList.contains('physics-on');
						console.log("Physics state changed:", currentPhysicsEnabled);
                    }
                }
            });
            physicsObserver.observe(physicsButton, { attributes: true });
			// Initial check
			currentPhysicsEnabled = physicsButton.classList.contains('physics-on');
        } else {
			console.warn("Physics button not found for observer setup.");
		}

        // Fetch initial objects
        fetchObjects();

		// Add global listeners
		window.addEventListener('resize', handleWindowResize);
		if (columnResizerElement) {
			columnResizerElement.addEventListener('mousedown', onColumnMouseDown);
		} else {
            console.error("Column resizer element not found!");
        }

		// Note: Blockly/ThreeJS init is now handled by CodeEditor's onMount
	});

	onDestroy(() => {
		if (!browser) return;
		// Cleanup observer
		physicsObserver?.disconnect();

		// Cleanup polling intervals
		activePollingIntervals.forEach(clearInterval);
		activePollingIntervals.clear();
		activeModelPollingIntervals.forEach(clearInterval);
		activeModelPollingIntervals.clear();

		// Cleanup ThreeJS engine (if managed globally or needs explicit cleanup here)
		threeD?.engine?.dispose(); // Check if threeD is accessible and needs disposal here

		// Cleanup listeners
		window.removeEventListener('resize', handleWindowResize);
		if (columnResizerElement) {
			columnResizerElement.removeEventListener('mousedown', onColumnMouseDown);
		}
		// Ensure mouse move/up listeners are removed if component is destroyed mid-resize
		document.removeEventListener('mousemove', onColumnMouseMove);
		document.removeEventListener('mouseup', onColumnMouseUp);
		// Restore body style just in case
		document.body.style.userSelect = '';
		document.body.style.webkitUserSelect = '';

		console.log('+page.svelte: Destroyed, resources cleaned up.');
	});


    // --- Object Naming ---
    function handleObjectNameChange(event: CustomEvent<{ id: string; newName: string }>) {
        // This function needs to be triggered by an event from ObjectLibrary/ObjectCard
        const { id, newName } = event.detail;
        const index = objectsList.findIndex(obj => obj.id === id);
		if (index === -1) return;

		let currentObject = objectsList[index];
		let finalName = newName.trim();

		// Ensure a name exists, generate default if empty
		if (!finalName) {
			finalName = currentObject.objectName || generateDefaultObjectName(objectsList);
		}

		// Ensure name uniqueness (append counter if needed)
		let baseName = finalName;
		let counter = 1;
		let nameToCheck = finalName;
		while (objectsList.some(obj => obj.id !== id && obj.objectName === nameToCheck)) {
			nameToCheck = `${baseName} (${counter})`;
			counter++;
		}
		finalName = nameToCheck;

		// Update state only if the name actually changed
		if (currentObject.objectName !== finalName) {
            updateObjectState(id, { objectName: finalName });
            // TODO: Add DB update call here if object names should persist
            console.log(`Object name for ${id} updated to ${finalName}`);
		} else if (newName !== currentObject.objectName) {
            // Handle case where trim/uniqueness check resulted in the original name
            // but the input was different (e.g., trailing spaces removed)
             updateObjectState(id, { objectName: finalName });
        }
	}

	// --- Image Generation ---
	async function enqueueImageGeneration(prompt: string, originalImageId?: string) {
        if (!prompt.trim()) return false; // Don't generate for empty prompt
		if (!R2_PUBLIC_URL_BASE || !IMAGE_GENERATION_ENDPOINT) {
			console.error("Configuration error: Endpoints or R2 URL missing.");
            alert("Configuration error prevents generation.");
			return false;
		}

		userIdForRequest = getAuthenticatedUserId(); // Check auth status
		if (!userIdForRequest) {
			showLoginModal.set(true); // Prompt login
			return false;
		}

		const generationId = uuidv4();
		const defaultObjectName = generateDefaultObjectName(objectsList); // Ensure unique name

		// Create the initial object state
		const newObjectEntry: GeneratedObject = {
            id: generationId,
			prompt: prompt,
			objectName: defaultObjectName,
			status: 'queued',
			statusMessage: 'Sending request...',
			imageUrl: null,
            modelUrl: null,
			user_id: userIdForRequest, // Associate with user
            world_id: WORLD_ID, // Associate with world
            created_at: new Date().toISOString(),
			attempts: 0,
			original_image_id: originalImageId,
            modelStatus: 'idle', // Initial model status
            isGenerating: true, // Mark as actively generating
            statusUrl: null, // Will be set after enqueue
            modelStatusMessage: null,
            modelStatusUrl: null,
            modelAttempts: 0,
            originalImageId: originalImageId,
            // Compatibility fields if needed elsewhere
            image_url: null,
            model_url: null,
        };

		// Add to the beginning of the list for visibility
		// Svelte 5: Direct array mutation triggers update
        objectsList.unshift(newObjectEntry);

		const requestBody = {
            inputPrompt: prompt,
			userID: userIdForRequest,
			worldID: WORLD_ID,
			propID: generationId, // Use the generated ID
			imageFormat: 'jpg' // Or 'png' if preferred
         };

		console.log(`[Gen ID: ${generationId}] Enqueuing image generation...`, requestBody);
		try {
			const response = await fetch(IMAGE_GENERATION_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), });

			if (!response.ok) {
                let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* Ignore parsing error */ }
				throw new Error(`Failed to enqueue image: ${errorBody}`);
            }

			const result: any = await response.json();
			if (!result.statusKey) throw new Error("Image enqueue response missing 'statusKey'.");

			const fullStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`;
			console.log(`[Gen ID: ${generationId}] Image task enqueued. Status URL: ${fullStatusUrl}`);

			// Update object state with polling info
			updateObjectState(generationId, { status: 'polling', statusUrl: fullStatusUrl, statusMessage: 'Image Queued. Waiting...' });

			// Start polling
			startImagePolling(generationId, fullStatusUrl);
			return true; // Indicate success

		} catch (err: any) {
			console.error(`[Gen ID: ${generationId}] Error enqueuing image generation:`, err);
			// Update state to reflect enqueue error
			updateObjectState(generationId, { status: 'error_enqueue', statusMessage: `Enqueue failed: ${err.message}`, isGenerating: false });
			return false; // Indicate failure
		}
	}

	async function submitPromptFromBox(prompt: string) {
		const success = await enqueueImageGeneration(prompt);
		if (success) {
			// Clear the prompt box value *only* if enqueue was successful
			promptValue = '';
		}
	}

	// --- Image Polling ---
	function startImagePolling(generationId: string, statusUrl: string) {
        clearPollingInterval(generationId); // Ensure no duplicate polls for the same ID
		const intervalId = window.setInterval(() => { pollImageStatus(generationId, statusUrl); }, POLLING_INTERVAL_MS);
		activePollingIntervals.set(generationId, intervalId);
		console.log(`[Gen ID: ${generationId}] Started image polling.`);
	}

	function clearPollingInterval(generationId: string) {
		if (activePollingIntervals.has(generationId)) {
			clearInterval(activePollingIntervals.get(generationId)!);
			activePollingIntervals.delete(generationId);
			console.log(`[Gen ID: ${generationId}] Cleared image polling interval.`);
		}
	}

	async function pollImageStatus(generationId: string, statusUrl: string) {
		const objectIndex = objectsList.findIndex(obj => obj.id === generationId);
        // Stop polling if object is removed or no longer marked as generating (e.g., user cancelled, error occurred)
		if (objectIndex === -1 || !objectsList[objectIndex].isGenerating) {
            console.log(`[Gen ID: ${generationId}] Stopping image poll: Object not found or not generating.`);
            clearPollingInterval(generationId);
            return;
        }

		let currentObject = objectsList[objectIndex]; // Get current state
		const currentAttempts = (currentObject.attempts ?? 0) + 1;
		updateObjectState(generationId, { attempts: currentAttempts }); // Update attempts count
        currentObject = objectsList[objectIndex]; // Re-fetch state after update if needed, though direct mutation might suffice

		// Check for timeout
		if (currentAttempts > MAX_POLL_ATTEMPTS) {
            console.warn(`[Gen ID: ${generationId}] IMAGE polling timed out after ${MAX_POLL_ATTEMPTS} attempts.`);
			updateObjectState(generationId, { status: 'failed', statusMessage: `Polling timed out.`, isGenerating: false });
			clearPollingInterval(generationId);
            return;
        }

		console.log(`[Gen ID: ${generationId}] Polling image status (Attempt ${currentAttempts})... URL: ${statusUrl}`);
		try {
			const response = await fetch(statusUrl, { cache: 'no-store' }); // Prevent caching of status

			// Handle 404: Status file might not exist yet
			if (response.status === 404) {
                 console.log(`[Gen ID: ${generationId}] Status file not found (404), worker likely hasn't created it yet. Continuing poll.`);
                 // Update status message to indicate waiting
				 if (currentObject.status === 'polling' || currentObject.status === 'queued') {
					updateObjectState(generationId, { statusMessage: `Waiting for image status... (Attempt ${currentAttempts})` });
				}
                return; // Wait for the next interval
            }

			// Handle other HTTP errors
			if (!response.ok) { throw new Error(`HTTP error ${response.status}`); }

			// Parse the status report
			const statusReport: any = await response.json();

			// Re-check if the object still exists and is generating before updating state
			const currentIndex = objectsList.findIndex(obj => obj.id === generationId);
			if (currentIndex === -1 || !objectsList[currentIndex].isGenerating) { clearPollingInterval(generationId); return; }
            currentObject = objectsList[currentIndex]; // Get the latest state again

			console.log(`[Gen ID: ${generationId}] Image status report received:`, statusReport);

			// Process status report
			switch (statusReport.status?.toLowerCase()) { // Use lowercase for case-insensitivity
				case 'success':
                    if (!statusReport.r2ImagePath) throw new Error("Image status 'success' but missing 'r2ImagePath'.");
                    const fullImageUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ImagePath}`;
                    console.log(`[Gen ID: ${generationId}] Image generation successful! URL: ${fullImageUrl}`);

					updateObjectState(generationId, {
                        status: 'success',
                        imageUrl: fullImageUrl,
                        image_url: fullImageUrl, // Ensure compatibility
                        statusMessage: 'Image generated.',
                        // Keep isGenerating true until model attempt (or decide policy)
                        // isGenerating: false // Set to false if image is the final step FOR NOW
                    });
					clearPollingInterval(generationId);

					// Save result to DB *after* updating UI state
					await saveImageToDatabase({
						id: generationId,
						prompt: currentObject.prompt!,
						imageUrl: fullImageUrl,
						originalImageId: currentObject.original_image_id ?? undefined
					});
					// Decide whether to automatically trigger 3D generation here
					// await triggerModelGeneration(objectsList[currentIndex]); // Example: Auto-trigger
					break; // Exit switch

				case 'failure':
                case 'error':
                    const failureMsg = statusReport.message || statusReport.errorDetails || 'Unknown error from image worker';
					console.error(`[Gen ID: ${generationId}] Image generation failed. Reason: ${failureMsg}`);
					updateObjectState(generationId, { status: 'failed', statusMessage: `Image Failed: ${failureMsg}`, isGenerating: false });
					clearPollingInterval(generationId);
                    break; // Exit switch

				case 'processing':
                case 'generating':
                    updateObjectState(generationId, { status: 'generating', statusMessage: `Generating image... (Attempt ${currentAttempts})` });
                    break; // Continue polling

				case 'queued':
                    updateObjectState(generationId, { status: 'queued', statusMessage: `Image in queue... (Attempt ${currentAttempts})` });
                    break; // Continue polling

				default:
                     console.warn(`[Gen ID: ${generationId}] Unknown IMAGE status: '${statusReport.status}'. Continuing poll.`);
					 updateObjectState(generationId, { statusMessage: `Unknown status: ${statusReport.status} (Attempt ${currentAttempts})` });
                    // Continue polling, assuming it might resolve
                    break;
			}
		} catch (err: any) {
             console.error(`[Gen ID: ${generationId}] Error during image polling fetch or processing:`, err);
			// Re-check object state before updating on error
			const errorIndex = objectsList.findIndex(obj => obj.id === generationId);
			if (errorIndex === -1 || !objectsList[errorIndex].isGenerating) { clearPollingInterval(generationId); return; }

			// Handle JSON parsing errors specifically (might indicate incomplete file write)
			if (err.message.includes('Unexpected token') || err instanceof SyntaxError) {
				console.warn(`[Gen ID: ${generationId}] JSON parse error during polling, likely incomplete status file. Retrying.`);
				updateObjectState(generationId, { statusMessage: `Reading status... (Attempt ${currentAttempts})` });
			} else {
				// For other errors (network, etc.), mark as failed
				updateObjectState(generationId, { status: 'failed', statusMessage: `Polling error: ${err.message}`, isGenerating: false });
				clearPollingInterval(generationId);
			}
		}
	}


	// --- Model Generation ---
	async function triggerModelGeneration(objectState: GeneratedObject) {
        const generationId = objectState.id;

		// Prerequisite check: Image must be successful
        if (objectState.status !== 'success' || !objectState.image_url) {
             console.warn(`[Gen ID: ${generationId}] Skipping model generation: Image status is '${objectState.status}' or URL is missing.`);
			// Update model status to reflect skip reason if it hasn't already failed/skipped
			if (objectState.modelStatus !== 'skipped_image_failed' && objectState.modelStatus !== 'failed') {
				updateObjectState(generationId, { modelStatus: 'skipped_image_failed', modelStatusMessage: 'Skipped: Image generation not successful.', isGenerating: false });
			}
			return; // Don't proceed
        }

		// Check if already processing or successful
		if (objectState.modelStatus === 'generating' || objectState.modelStatus === 'polling' || objectState.modelStatus === 'queued' || objectState.modelStatus === 'success') {
			console.log(`[Gen ID: ${generationId}] Model generation already started or completed (Status: ${objectState.modelStatus}). Skipping new trigger.`);
			return;
		}

        // Authentication check
        userIdForRequest = getAuthenticatedUserId();
		if (!userIdForRequest) {
			showLoginModal.set(true);
			// Also update state to indicate paused due to auth?
			// updateObjectState(generationId, { modelStatus: 'paused_auth', modelStatusMessage: 'Login required to generate model.' });
			return;
		}

		// Ensure endpoints are configured
		if (!MODEL_GENERATION_ENDPOINT || !R2_PUBLIC_URL_BASE) {
			console.error("Configuration error: Model endpoint or R2 URL missing.");
			updateObjectState(generationId, { modelStatus: 'error_config', modelStatusMessage: 'Configuration error prevents model generation.', isGenerating: false });
			return;
		}

        // Prepare request
        const requestBody = {
             imagePublicUrl: objectState.image_url, // Use the confirmed image URL
			userID: userIdForRequest,
			worldID: WORLD_ID,
			propID: generationId
        };

        console.log(`[Gen ID: ${generationId}] Enqueuing 3D model generation...`, requestBody);
        // Update state immediately to show progress
        updateObjectState(generationId, { modelStatus: 'queued', modelStatusMessage: 'Sending request to model queue...', modelAttempts: 0, isGenerating: true });

        // Make the API call
        try {
            const response = await fetch(MODEL_GENERATION_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
             if (!response.ok) {
                let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* Ignore */ }
				throw new Error(`Failed to enqueue model: ${errorBody}`);
            }
            const result: any = await response.json();
			if (!result.statusKey) throw new Error("Model enqueue response missing 'statusKey'.");

            const fullModelStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`;
			console.log(`[Gen ID: ${generationId}] Model task enqueued. Status URL: ${fullModelStatusUrl}`);

			// Update state for polling
			updateObjectState(generationId, { modelStatus: 'polling', modelStatusUrl: fullModelStatusUrl, modelStatusMessage: 'Model Queued. Waiting...' });
			startModelPolling(generationId, fullModelStatusUrl); // Start polling

        } catch(err: any) {
            console.error(`[Gen ID: ${generationId}] Error enqueuing model generation:`, err);
			updateObjectState(generationId, { modelStatus: 'error_enqueue', modelStatusMessage: `Model Enqueue failed: ${err.message}`, isGenerating: false });
        }
	}


	// --- Model Polling ---
	function startModelPolling(generationId: string, statusUrl: string) {
        clearModelPollingInterval(generationId); // Clear existing interval if any
		const intervalId = window.setInterval(() => { pollModelStatus(generationId, statusUrl); }, POLLING_INTERVAL_MS);
		activeModelPollingIntervals.set(generationId, intervalId);
		console.log(`[Gen ID: ${generationId}] Started model polling.`);
	}

	function clearModelPollingInterval(generationId: string) {
        if (activeModelPollingIntervals.has(generationId)) {
			clearInterval(activeModelPollingIntervals.get(generationId)!);
			activeModelPollingIntervals.delete(generationId);
			console.log(`[Gen ID: ${generationId}] Cleared model polling interval.`);
		}
	}

	async function pollModelStatus(generationId: string, statusUrl: string) {
        const objectIndex = objectsList.findIndex(obj => obj.id === generationId);
		// Stop polling if object removed or no longer generating model
		if (objectIndex === -1 || !objectsList[objectIndex].isGenerating || !(objectsList[objectIndex].modelStatus === 'polling' || objectsList[objectIndex].modelStatus === 'generating' || objectsList[objectIndex].modelStatus === 'queued')) {
            console.log(`[Gen ID: ${generationId}] Stopping model poll: Object not found, not generating, or status changed.`);
            clearModelPollingInterval(generationId);
            return;
        }

		let currentObject = objectsList[objectIndex];
        let currentAttempts = (currentObject.modelAttempts ?? 0) + 1;
		updateObjectState(generationId, { modelAttempts: currentAttempts });
        currentObject = objectsList[objectIndex]; // Get updated state

		// Check for timeout
        if (currentAttempts > MAX_MODEL_POLL_ATTEMPTS) {
            console.warn(`[Gen ID: ${generationId}] MODEL polling timed out after ${MAX_MODEL_POLL_ATTEMPTS} attempts.`);
			updateObjectState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model polling timed out.`, isGenerating: false });
			clearModelPollingInterval(generationId);
            return;
         }

		console.log(`[Gen ID: ${generationId}] Polling model status (Attempt ${currentAttempts})... URL: ${statusUrl}`);
        try {
            const response = await fetch(statusUrl, { cache: 'no-store' });

			// Handle 404 - status file not ready yet
             if (response.status === 404) {
                  console.log(`[Gen ID: ${generationId}] Model status file not found (404). Continuing poll.`);
                  if (currentObject.modelStatus === 'polling' || currentObject.modelStatus === 'queued') {
					updateObjectState(generationId, { modelStatusMessage: `Waiting for model status... (Attempt ${currentAttempts})` });
				}
                 return; // Wait for next interval
            }

			// Handle other HTTP errors
            if (!response.ok) { throw new Error(`HTTP error ${response.status}`); }

			// Parse status
            const statusReport: any = await response.json();

			// Re-check object state before update
            const currentIndex = objectsList.findIndex(obj => obj.id === generationId);
			if (currentIndex === -1 || !objectsList[currentIndex].isGenerating || !(objectsList[currentIndex].modelStatus === 'polling' || objectsList[currentIndex].modelStatus === 'generating' || objectsList[currentIndex].modelStatus === 'queued')) {
				clearModelPollingInterval(generationId);
				return;
			}
            currentObject = objectsList[currentIndex]; // Get latest state

			console.log(`[Gen ID: ${generationId}] Model status report received:`, statusReport);

			// Process model status
            switch (statusReport.status?.toLowerCase()) {
                case 'success':
                    if (!statusReport.r2ModelPath) throw new Error("Model status 'success' but missing 'r2ModelPath'.");
					// Basic validation for GLB extension
					if (!statusReport.r2ModelPath.toLowerCase().endsWith('.glb')) {
						throw new Error(`Model success but path is not a .glb: ${statusReport.r2ModelPath}`);
					}
                    const fullModelUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ModelPath}`;
                    console.log(`[Gen ID: ${generationId}] Model generation successful! URL: ${fullModelUrl}`);

                    updateObjectState(generationId, {
                        modelStatus: 'success',
                        modelUrl: fullModelUrl,
                        model_url: fullModelUrl, // Compatibility
                        modelStatusMessage: 'Model generated.',
                        isGenerating: false // Generation process complete
                    });
					clearModelPollingInterval(generationId);

					// Save model URL to DB
                    await saveModelUrlToDatabase(generationId, fullModelUrl);

                    // Inform potentially running simulation (implementation depends on blockly/threeD structure)
                    console.warn(`[Gen ID: ${generationId}] Model ready. Resolver updated implicitly via getModelUrlForId. Manual scene update might be needed if object '${currentObject.objectName}' was already added.`);
                    // Potentially call a function like `threeD.updateObjectInScene(currentObject.objectName)` if available
                    break; // Exit switch

                case 'failure':
                case 'error':
                     const modelFailureMsg = statusReport.message || statusReport.errorDetails || 'Unknown error from model worker';
					console.error(`[Gen ID: ${generationId}] Model generation failed. Reason: ${modelFailureMsg}`);
					updateObjectState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model Failed: ${modelFailureMsg}`, isGenerating: false });
					clearModelPollingInterval(generationId);
                    break; // Exit switch

                case 'processing':
                case 'generating':
                    updateObjectState(generationId, { modelStatus: 'generating', modelStatusMessage: `Generating model... (Attempt ${currentAttempts})` });
                    break; // Continue polling

                case 'queued':
                    updateObjectState(generationId, { modelStatus: 'queued', modelStatusMessage: `Model in queue... (Attempt ${currentAttempts})` });
                    break; // Continue polling

                default:
                     console.warn(`[Gen ID: ${generationId}] Unknown MODEL status received: '${statusReport.status}'. Continuing poll.`);
					 updateObjectState(generationId, { modelStatusMessage: `Unknown model status: ${statusReport.status} (Attempt ${currentAttempts})` });
                     // Continue polling
                    break;
            }
        } catch (err: any) {
             console.error(`[Gen ID: ${generationId}] Error during model polling fetch or processing:`, err);
			 // Re-check state before update
			const errorIndex = objectsList.findIndex(obj => obj.id === generationId);
			if (errorIndex === -1 || !objectsList[errorIndex].isGenerating || !(objectsList[errorIndex].modelStatus === 'polling' || objectsList[errorIndex].modelStatus === 'generating' || objectsList[errorIndex].modelStatus === 'queued')) {
				clearModelPollingInterval(generationId);
				return;
			}

			// Handle JSON errors specifically
			if (err.message.includes('Unexpected token') || err instanceof SyntaxError) {
				console.warn(`[Gen ID: ${generationId}] JSON parse error during model polling. Retrying.`);
				updateObjectState(generationId, { modelStatusMessage: `Reading status... (Attempt ${currentAttempts})` });
			} else {
				updateObjectState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model polling error: ${err.message}`, isGenerating: false });
				clearModelPollingInterval(generationId);
			}
        }
	}

	// --- Database Operations ---
	async function saveImageToDatabase(imageData: { id: string; prompt: string; imageUrl: string; originalImageId?: string; }) {
        const userId = getAuthenticatedUserId();
		const supabase = get(supabaseStore);
        if (!userId || !supabase) {
             console.error(`[Gen ID: ${imageData.id}] Cannot save image to DB: User logged out or Supabase unavailable.`);
			 // Update state to indicate DB error, allowing user to potentially retry later?
			 updateObjectState(imageData.id, { status: 'db_error', statusMessage: 'Generated, but failed to save (Auth/DB issue).', isGenerating: false }); // Keep isGenerating false
             return;
        }

		console.log(`[Gen ID: ${imageData.id}] Saving object (image) to DB for user ${userId}...`);
		try {
			const { error } = await supabase
				.from('generated_objects')
				.insert({
					id: imageData.id,
					prompt: imageData.prompt,
					image_url: imageData.imageUrl,
					user_id: userId,
					world_id: WORLD_ID,
					original_image_id: imageData.originalImageId,
                    // Ensure required fields like 'created_at' are handled by DB defaults or included here
				});
			if (error) throw error;
			console.log(`[Gen ID: ${imageData.id}] Object (image) saved successfully to DB.`);
            // Optionally refresh the list to ensure consistency, though state is already updated
            // Consider if fetchObjects() is necessary or redundant here
            // fetchObjects(); // Refresh list from DB after successful save - maybe too aggressive?
		} catch (error: any) {
			console.error(`[Gen ID: ${imageData.id}] Error saving object (image) to DB:`, error);
			updateObjectState(imageData.id, { status: 'db_error', statusMessage: `DB save failed: ${error.message}`, isGenerating: false });
		}
	}

	async function saveModelUrlToDatabase(generationId: string, modelUrl: string) {
        const userId = getAuthenticatedUserId();
		const supabase = get(supabaseStore);
        if (!userId || !supabase) {
             console.error(`[Gen ID: ${generationId}] Cannot save model URL to DB: User logged out or Supabase unavailable.`);
             // Update state?
			 updateObjectState(generationId, { modelStatus: 'db_error', modelStatusMessage: 'Model generated, but failed to save URL (Auth/DB issue).'});
             return;
         }
		console.log(`[Gen ID: ${generationId}] Saving model URL to DB object for user ${userId}...`);
		try {
			const { error } = await supabase
				.from('generated_objects')
				.update({ model_url: modelUrl, updated_at: new Date().toISOString() }) // Also update timestamp
				.eq('id', generationId)
                .eq('user_id', userId); // Ensure user owns the object they are updating
			if (error) throw error;
			console.log(`[Gen ID: ${generationId}] Model URL saved successfully to DB object.`);
            // Optionally refresh list
            // fetchObjects(); // Maybe refresh here to get updated_at timestamp?
		} catch (error: any) {
			console.error(`[Gen ID: ${generationId}] Error saving model URL to DB object:`, error);
			updateObjectState(generationId, { modelStatus: 'db_error', modelStatusMessage: `DB model URL save failed: ${error.message}` });
		}
	}


    // --- Modal Actions ---
	async function handleRegenerateFromModal(newPrompt: string) {
        if (!selectedImageForModal) return;
		// Decide if regeneration uses the original image's ID or the current one's ID
		const originalId = selectedImageForModal.original_image_id ?? selectedImageForModal.id;
        const objectToRegenFrom = selectedImageForModal; // Keep ref before closing modal

		// Close modal immediately
		selectedImageForModal = null;

		// Enqueue new generation using the chosen ID and new prompt
		await enqueueImageGeneration(newPrompt, originalId);
	}

	async function handleMake3DFromModal() {
        if (!selectedImageForModal) return;
        const objectIdToProcess = selectedImageForModal.id;

		// Find the latest state of the object in the list
        const objectToProcess = objectsList.find(obj => obj.id === objectIdToProcess);

		// Close modal
		selectedImageForModal = null;

		if (objectToProcess) {
			// Trigger model generation only if image is successful and model isn't already processing/done
            if (objectToProcess.status === 'success' && objectToProcess.image_url) {
                if (!objectToProcess.modelStatus || objectToProcess.modelStatus === 'idle' || objectToProcess.modelStatus === 'failed' || objectToProcess.modelStatus === 'skipped_image_failed' || objectToProcess.modelStatus === 'error_enqueue' || objectToProcess.modelStatus === 'db_error') {
                     console.log(`Triggering model generation for ${objectToProcess.objectName} from modal action.`);
					 await triggerModelGeneration(objectToProcess);
                } else {
                    console.log(`Model generation for ${objectToProcess.objectName} already in progress or completed (Status: ${objectToProcess.modelStatus}). Skipping modal trigger.`);
					// Optionally show a message to the user
                }
            } else {
                 console.warn(`Cannot trigger model generation for ${objectToProcess.objectName}: Image status is '${objectToProcess.status}' or URL is missing.`);
				 // Optionally show a message
            }
		} else {
			console.error(`Could not find object state with ID ${objectIdToProcess} to start model generation from modal action.`);
		}
	}

	// --- Blockly Execution ---
	async function handlePlayClick() {
        console.log("Svelte (+page): Play button clicked. Calling runBlocklyCode...");
        try {
			// Pass the current physics state
             await runBlocklyCode(false, currentPhysicsEnabled); // Assuming runBlocklyCode handles getting the workspace
        } catch (error) {
            console.error("Error executing Blockly code from Play button:", error);
            alert("An error occurred while trying to run the blocks. Check the console.");
        }
    }

	// --- Model Resolver for Blockly/ThreeJS ---
    function getModelUrlForId(name: string): string | null {
		// Find the object by its user-assigned 'objectName'
        const liveObject = objectsList.find(obj => obj.objectName === name);

		if (liveObject) {
			// Check if the model is successfully generated and has a URL
			if (liveObject.modelStatus === 'success' && liveObject.model_url) {
				console.log(`[Resolver] Resolved Name "${name}" to URL: ${liveObject.model_url}`);
				return liveObject.model_url;
			} else {
				// Log why it couldn't be resolved
				console.warn(`[Resolver] Model URL not ready for Name "${name}". Image Status: ${liveObject.status}, Model Status: ${liveObject.modelStatus}, URL: ${liveObject.model_url}`);
				return null; // Return null if not ready
			}
		} else {
			// Object with that name doesn't exist in the current list
            console.warn(`[Resolver] No object found with Name "${name}" in the current objects list. Cannot resolve model URL.`);
			return null;
        }
		// Consider fallback logic or default models if needed
	}

    // --- Tab Management ---
    async function handleObjectsTabClick() {
		activeTab = 'objects';
		// Refresh objects when tab is clicked, ensures latest data
		await fetchObjects();
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
			<button id="play" class="top-button" onclick={handlePlayClick}>Play</button>
			<button id="reset" class="top-button">Reset</button>
			<button
                id="physics"
                class="top-button {currentPhysicsEnabled ? 'physics-on' : 'physics-off'}"
                onclick={(e) => {
                    // Toggle class manually for observer to pick up, or manage state directly
                    (e.currentTarget as HTMLElement).classList.toggle('physics-on');
                    (e.currentTarget as HTMLElement).classList.toggle('physics-off');
                    // State `currentPhysicsEnabled` will be updated by the observer
                }}
            >
                Physics
            </button>
			<button id="fullscreen" class="top-button">Full</button>
			<p></p>
			<p></p>
			<div id="image-upload">
				<label for="import" id="image-upload-label">
					<span class ="mt-8">Open</span>
				</label>
				<input id="import" type="file" />
			</div>
			<button id="export" class="top-button">Save</button>

			<div class="auth-buttons-container">
				{#if $sessionStore?.user}
					{@const avatarUrl = $sessionStore.user.user_metadata?.avatar_url || $sessionStore.user.user_metadata?.picture}
					<button onclick={handleLogout} class="auth-button logout-button"> Logout </button>
					<div class="auth-avatar-container">
						{#if avatarUrl}
							<img class="auth-avatar-image" src={avatarUrl} alt="User avatar" referrerpolicy="no-referrer" title={$sessionStore.user.email ?? 'User Profile'} />
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
		<div id="left-panel">
			<div class="tab-bar">
				<button
					class="tab-button"
					class:active={activeTab === 'code'}
					onclick={() => activeTab = 'code'}
					aria-selected={activeTab === 'code'}
					role="tab"
				>
					Code
				</button>
				<button
					class="tab-button"
					class:active={activeTab === 'objects'}
					onclick={handleObjectsTabClick}
					aria-selected={activeTab === 'objects'}
					role="tab"
                    disabled={objectsLoading && activeTab === 'objects'}
				>
					Objects {#if objectsLoading && activeTab === 'objects'}⏳{/if}
				</button>
			</div>
			<div class="tab-content">

                <CodeEditor
                    active={activeTab === 'code'}
                    blocklyContainerId="blocklyDiv"
                    runAreaCanvasId="runAreaCanvas"
                    {initializeApp}
                    {getModelUrlForId}
                    bind:this={codeEditorRef}
                    />
                    <!-- TODO: Add listeners for init success/failure if needed -->
                    <!-- on:initialized={(e) => handleBlocklyInit(e.detail.workspace)} -->
                    <!-- on:initializationFailed={(e) => handleBlocklyError(e.detail.error)} -->

				<ObjectLibrary
                    active={activeTab === 'objects'}
                    objects={objectsList}
                    isLoading={objectsLoading}
                    error={objectsError}
					onObjectCardClick={handleShowModalForObject}
                    />

			</div>
		</div>

		<span id="columnResizer" onmousedown={onColumnMouseDown}>
            <img id="drag" src="/icons/drag.svg" alt="Resize Handle" />
        </span>

		<div id="runArea">
			<canvas id="runAreaCanvas"></canvas>
			<PromptBox
                bind:value={promptValue}
                isGenerating={objectsList.some(o => o.isGenerating)}
                onSubmit={submitPromptFromBox}
            />
		</div>
	</div>

	<div id="footer"> <div id="fpsCounter"></div> </div>

</div>

{#if overallErrorMsg}
    <div class="init-error-message"> Initialization Error: {overallErrorMsg} </div>
{/if}

{#if selectedImageForModal}
<EditableObjectModal
    imageUrl={selectedImageForModal.imageUrl ?? ''}
    prompt={selectedImageForModal.prompt ?? ''}
    altText={`Details for object: ${selectedImageForModal.objectName}`}
    modelStatus={selectedImageForModal.modelStatus ?? 'idle'}
    modelUrl={selectedImageForModal.modelUrl ?? undefined}
    onClose={() => selectedImageForModal = null}
    onRegenerate={handleRegenerateFromModal}
    onMake3D={handleMake3DFromModal}
/>
{/if}

<style>
/* --- Global & Layout Styles (Remain in +page.svelte) --- */
:global(html), :global(body) { height: 100%; margin: 0; overflow: hidden; box-sizing: border-box; }
:global(*, *:before, *:after) { box-sizing: inherit; }
:global(body) { font-family: sans-serif; background-color: #fff; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
/* Allow text selection on inputs */
:global(input[type="text"]), :global(textarea) { user-select: text; -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; }

#blockly-container { display: grid; height: 100vh; width: 100%; grid-template-rows: 60px 1fr 20px; /* Header, Content, Footer */ margin: 0; padding: 0; overflow: hidden; }
#blockly-header { grid-row: 1; background-color: #705ccc; display: flex; align-items: center; position: relative; z-index: 20; flex-shrink: 0; height: 60px; border-bottom: 1px solid #5a4cad; /* Optional subtle border */ }
#split { grid-row: 2; display: flex; flex-direction: row; height: 100%; width: 100%; position: relative; overflow: hidden; /* Important */ }
#runArea { background: #333333; height: 100%; position: relative; overflow: hidden; /* Canvas needs this */ flex-grow: 1; /* Take remaining space */ display: flex; /* Needed for canvas sizing */ flex-direction: column; /* Canvas first, then prompt */ min-width: 200px; /* Ensure it doesn't collapse too much */ }
#runAreaCanvas { width: 100%; height: 100%; /* Fill the flex item space */ display: block; flex-grow: 1; min-height: 0; /* Critical for flex shrinking */ }
#columnResizer { display: flex; align-items: center; justify-content: center; width: 10px; height: 100%; cursor: col-resize; background-color: #705ccc; /* Match header */ border-left: 1px solid #5a4cad; border-right: 1px solid #5a4cad; z-index: 5; flex-shrink: 0; transition: background-color 0.2s ease; }
#columnResizer img { width: 18px; /* Make handle slightly larger */ height: auto; pointer-events: none; user-select: none; }
#columnResizer:hover { background-color: #8970f8; }
#columnResizer:active { background-color: #5a4cad; } /* Indicate active drag */
#footer { grid-row: 3; background-color: #705ccc; color: #fff; font-size: small; height: 20px; line-height: 20px; flex-shrink: 0; border-top: 1px solid #5a4cad; /* Optional */ }
#fpsCounter { text-align: right; padding-right: 10px; }

/* --- Header Styles --- */
#logo { height: 45px; padding: 5px 0 5px 15px; margin-right: 10px; flex-shrink: 0; }
.blockly-page-logo-link { display: inline-block; line-height: 0; } /* Remove underline */
#buttonrow { display: flex; flex-direction: row; align-items: center; gap: 5px; padding: 0 10px; width: 100%; flex-wrap: nowrap; /* Prevent wrapping */ height: 100%; overflow-x: auto; /* Allow scrolling if too narrow */ }
.top-button { background-color: transparent; border: none; background-size: 30px 30px; /* Icon size */ background-position: center 7px; /* Center icon, leave space for text */ background-repeat: no-repeat; height: 50px; /* Button height */ width: 50px; /* Button width */ margin: 0; padding-top: 30px; /* Space for icon */ box-sizing: border-box; cursor: pointer; color: white; font-size: 12px; text-align: center; line-height: 1.2; flex-shrink: 0; transition: background-color 0.15s ease; border-radius: 4px; }
.top-button:hover { background-color: rgba(255, 255, 255, 0.1); }
.top-button:active { background-color: rgba(255, 255, 255, 0.2); }
/* Specific Icons */
#play { background-image: url(/icons/play.svg); } /* Added play icon */
#reset { background-image: url(/icons/restart.svg); }
.physics-on { background-image: url(/icons/toggle_on.svg); }
.physics-off { background-image: url(/icons/toggle_off.svg); }
#fullscreen { background-image: url(/icons/fullscreen.svg); }
#export { background-image: url(/icons/download.svg); }
/* Image Upload Button */
#image-upload { height: 50px; width: 50px; position: relative; flex-shrink: 0; }
#image-upload>input { display: none; } /* Hide actual file input */
#image-upload-label { display: block; width: 100%; height: 100%; background-image: url(/icons/upload.svg); background-size: 30px 30px; background-position: center 5px; background-repeat: no-repeat; padding-top: 35px; /* Adjust if text overlaps icon */ box-sizing: border-box; cursor: pointer; color: white; font-size: 10px; text-align: center; line-height: 1.2; border-radius: 4px; transition: background-color 0.15s ease; }
#image-upload-label:hover { background-color: rgba(255, 255, 255, 0.1); }
#image-upload-label .mt-8 { margin-top: 0; /* Remove potentially conflicting class if needed */}
/* Auth Buttons */
.auth-buttons-container { margin-left: auto; /* Push to the right */ display: flex; align-items: center; gap: 8px; padding-right: 10px; flex-shrink: 0; }
.auth-button { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; color: white; cursor: pointer; border: none; transition: background-color 0.2s ease; }
.login-button { background-color: #3b82f6; }
.login-button:hover { background-color: #2563eb; }
.logout-button { background-color: #ffbf00; }
.logout-button:hover { background-color: #f5b000; }
.auth-avatar-container { display: flex; align-items: center; }
.auth-avatar-image, .auth-avatar-fallback { height: 32px; width: 32px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.6); object-fit: cover; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; background-color: #60a5fa; color: white; }

/* --- Left Panel & Tabs --- */
#left-panel {
	width: 40%; /* Initial width */
	min-width: 200px; /* Prevent collapsing too much */
	max-width: calc(100% - 200px); /* Prevent expanding too much */
	background: #4a4a4a;
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden; /* Let children handle scroll */
    flex-shrink: 0; /* Prevent shrinking beyond content */
    position: relative; /* For absolute positioning of children if needed */
}

.tab-bar {
	display: flex;
	background-color: #3e3e3e; /* Slightly darker */
	border-bottom: 1px solid #555;
    flex-shrink: 0; /* Prevent tab bar from shrinking */
}

.tab-button {
	padding: 10px 15px;
	cursor: pointer;
	background: none;
	border: none;
	color: #ccc;
	font-size: 14px;
    font-weight: 500;
	border-bottom: 3px solid transparent;
	transition: background-color 0.2s, color 0.2s, border-bottom-color 0.2s, opacity 0.2s;
    margin-bottom: -1px; /* Overlap border */
    position: relative;
    min-width: 80px;
    text-align: center;
	white-space: nowrap; /* Prevent text wrapping */
}
.tab-button:hover {
	background-color: #505050;
	color: #fff;
}
.tab-button.active {
	color: #fff;
	border-bottom-color: #8970f8; /* Highlight color */
}
.tab-button:focus-visible {
	outline: 2px solid #8970f8; /* Accessibility */
	outline-offset: -2px;
}
.tab-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: inherit; /* Don't change background when disabled */
	border-bottom-color: transparent; /* Remove active border if disabled */
}
.tab-button:disabled:hover {
	background-color: #3e3e3e; /* No hover effect when disabled */
	color: #ccc;
}


.tab-content {
	flex-grow: 1; /* Take remaining vertical space */
	position: relative; /* Needed for positioning children */
	overflow: hidden; /* Prevent parent scroll, children manage their own */
    display: flex; /* Use flexbox */
    flex-direction: column; /* Stack children vertically */
}
/* Styles for hidden class - applied by child components */
/* .hidden { display: none !important; } Already defined in children */

/* --- Error Message Style (Global Fallback) --- */
.init-error-message {
    position: fixed; /* Or absolute if needed */
    top: 70px; /* Below header */
    left: 50%;
    transform: translateX(-50%);
    background: rgba(239, 68, 68, 0.9);
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    z-index: 1000; /* High z-index */
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    font-size: 14px;
    text-align: center;
}

/* --- Hide unused original Blockly buttons --- */
#vr, #debug, #examples, #clear, #help { display: none; }
#vr-dropdown, #examples-dropdown { display: none !important; }

</style>