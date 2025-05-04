<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { v4 as uuidv4 } from 'uuid';
	import { get } from 'svelte/store';
	import * as Blockly from 'blockly/core';

	import {
		init as initializeApp,
		run as runBlocklyCode,
		blocklyWorkspace,
		threeD
	} from '$lib/blockly/blockly';

	import type { GeneratedObject } from '$lib/types/GeneratedObject';

	import EditableObjectModal from '$lib/components/EditableObjectModal.svelte';
	import ObjectCard from '$lib/components/ObjectCard.svelte';

	import type { PageData } from './$types';
	import { sessionStore, showLoginModal, handleLogout, supabaseStore } from '$lib/stores/authStore';
	import type { Database } from '$lib/database.types';

	type DatabaseObject = Database['public']['Tables']['generated_objects']['Row'];

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

	let { data }: { data: PageData } = $props();

	let isLoading = $state(true);
	let errorMsg: string | null = $state(null);
	let activeTab = $state<'code' | 'objects'>('code');
	let promptValue = $state('a green and yellow robotic dog');
	let selectedImageForModal = $state<GeneratedObject | null>(null);
	let currentPhysicsEnabled = $state(false);

	let objectsList = $state<GeneratedObject[]>([]);
	let objectsLoading = $state(false);
	let objectsError = $state<string | null>(null);

	const activePollingIntervals = new Map<string, number>();
	const activeModelPollingIntervals = new Map<string, number>();
	let physicsObserver: MutationObserver | null = null;
    let userIdForRequest: string | null | undefined;

	let columnResizerElement: HTMLElement | null = null;
	let leftPanelElement: HTMLElement | null = null;
	let isResizing = false;
	let initialResizeX = 0;
	let initialLeftWidth = 0;

	const getAuthenticatedUserId = (): string | null => {
		const session = get(sessionStore);
		return session?.user?.id ?? null;
	};

    function updateObjectState(id: string, updates: Partial<GeneratedObject>) {
		const index = objectsList.findIndex(obj => obj.id === id);
		if (index !== -1) {
            const updatedObject = { ...objectsList[index], ...updates };
            objectsList.splice(index, 1, updatedObject);

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

	async function fetchObjects() {
        const supabase = get(supabaseStore);
        const userId = getAuthenticatedUserId();

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
        objectsError = null;

        let fetchedData: DatabaseObject[] | null = null;
        let fetchError: any = null;

        try {
             const { data: dbData, error } = await supabase
                .from('generated_objects')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

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
        const fetchedItems = fetchedData?.map(dbObj => {
        return {
            ...dbObj, // Spread all DB fields
            // Ensure props used by components are explicitly set/derived if needed
            objectName: dbObj.prompt?.substring(0, 30) || dbObj.id,
            status: 'success',
            statusMessage: 'Loaded from DB',
            imageUrl: dbObj.image_url, // <- Ensure modal prop is populated
            modelUrl: dbObj.model_url, // <- Ensure modal prop is populated
            modelStatus: dbObj.model_url ? 'success' : 'idle',
            isGenerating: false,
            attempts: 0,
            modelAttempts: 0,
            // nullify potentially stale status fields from DB if needed
            statusUrl: null,
            modelStatusMessage: null,
            modelStatusUrl: null,
            originalImageId: dbObj.original_image_id
        } as GeneratedObject;
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

        objectsList = combinedList;
        objectsLoading = false;
    }

	// --- Ensure this function is correctly defined in the script ---
	function handleShowModalForObject(objectToShow: GeneratedObject) {
		// Log details for debugging
		console.log(`Parent handler (handleShowModalForObject) called for: ${objectToShow.objectName}`);
		console.log(`Setting selectedImageForModal`);
		selectedImageForModal = objectToShow;
	}


	function triggerBlocklyResize() {
		if (activeTab === 'code' && blocklyWorkspace && browser) {
			Blockly.svgResize(blocklyWorkspace);
            blocklyWorkspace.render();
		}
	}

	function onColumnMouseDown(event: MouseEvent) {
		if (!leftPanelElement || !columnResizerElement) return;
		isResizing = true;
		initialResizeX = event.clientX;
		initialLeftWidth = leftPanelElement.offsetWidth;
		document.addEventListener('mousemove', onColumnMouseMove);
		document.addEventListener('mouseup', onColumnMouseUp);
		document.body.style.userSelect = 'none';
		document.body.style.webkitUserSelect = 'none';
	}

	function onColumnMouseMove(event: MouseEvent) {
		if (!isResizing || !leftPanelElement) return;
		const deltaX = event.clientX - initialResizeX;
		const newWidth = initialLeftWidth + deltaX;
		const minWidth = 200;
		const parentWidth = (leftPanelElement.parentElement as HTMLElement).offsetWidth;
		const maxWidth = parentWidth - 200;

		if (newWidth >= minWidth && newWidth <= maxWidth) {
			leftPanelElement.style.width = `${newWidth}px`;
			triggerBlocklyResize();
		}
	}

	function onColumnMouseUp() {
		if (!isResizing) return;
		isResizing = false;
		document.removeEventListener('mousemove', onColumnMouseMove);
		document.removeEventListener('mouseup', onColumnMouseUp);
		document.body.style.userSelect = '';
		document.body.style.webkitUserSelect = '';
		triggerBlocklyResize();
	}

	const handleWindowResize = () => {
		triggerBlocklyResize();
	};

	$effect(() => {
		if (browser && activeTab === 'code' && blocklyWorkspace) {
			tick().then(() => {
				const blocklyDivElement = document.getElementById('blocklyDiv');
				if (blocklyDivElement && blocklyDivElement.offsetParent !== null) {
					const currentWidth = blocklyDivElement.offsetWidth;
					console.log("Attempting Blockly redraw (CSS visibility)... Container width:", currentWidth);
					if (currentWidth > 0) {
						Blockly.svgResize(blocklyWorkspace);
						blocklyWorkspace.render();
					}
				}
			});
		}
	});

	function handleCanvasDragOver(event: DragEvent) {
		event.preventDefault(); // Necessary to allow dropping
		// Optional: Add visual feedback (e.g., change border style)
		console.log('drag over')
		if (event.dataTransfer) {
			// Check if we are dragging the correct type of data
			if (event.dataTransfer.types.includes('application/madmods-object+json')) {
				event.dataTransfer.dropEffect = 'copy';
			} else {
				event.dataTransfer.dropEffect = 'none'; // Indicate non-droppable content
			}
		}
		// console.log('Dragging over canvas...'); // Debug log (can be noisy)
	}

	async function handleCanvasDrop(event: DragEvent) {
		event.preventDefault();
		console.log('Item dropped onto canvas');

		// Retrieve the object data
		const objectJson = event.dataTransfer?.getData('application/madmods-object+json');
		if (!objectJson) {
			console.error('Drop event occurred, but no valid object data found in transfer.');
			return;
		}

		try {
			const droppedObject: GeneratedObject = JSON.parse(objectJson);
			console.log('Dropped object data:', droppedObject);

			// Validate the dropped object has a model
			if (droppedObject.modelStatus !== 'success' || !droppedObject.modelUrl) {
				console.warn(`Dropped object "${droppedObject.objectName}" has no valid model URL or status.`);
				alert(`Object "${droppedObject.objectName}" doesn't have a ready 3D model.`);
				return;
			}

			// Get the canvas element
			const canvas = document.getElementById('runAreaCanvas');
			if (!canvas || !threeD) {
				console.error('Canvas element or 3D engine instance not found.');
				return;
			}

			// Calculate drop position relative to the canvas
			const rect = canvas.getBoundingClientRect();
			const screenX = event.clientX - rect.left;
			const screenY = event.clientY - rect.top;

			console.log(`Drop coordinates (canvas relative): X=${screenX}, Y=${screenY}`);

			// Trigger the 3D engine to spawn the object
			// This function needs to be added to the ThreeD class
			await threeD.spawnObjectFromDragDrop(droppedObject, screenX, screenY);

			console.log(`Successfully initiated spawning for "${droppedObject.objectName}"`);
			// Optional: Add user feedback (e.g., temporary message)

		} catch (error) {
			console.error('Error processing dropped object:', error);
			alert('Failed to place the dropped object. Check console for details.');
		}
	}


	onMount(async () => {
		if (!browser) return;

		isLoading = true;
		errorMsg = null;
		columnResizerElement = document.getElementById('columnResizer');
		leftPanelElement = document.getElementById('left-panel');

		console.log('Svelte component mounted, starting app initialization...');
		try {
			const blocklyDiv = document.getElementById('blocklyDiv');
			const runAreaCanvas = document.getElementById('runAreaCanvas');

			if (blocklyDiv && runAreaCanvas && leftPanelElement) {
				await initializeApp('blocklyDiv', 'runAreaCanvas', getModelUrlForId);
				const physicsButton = document.getElementById('physics');
				currentPhysicsEnabled = physicsButton?.classList.contains('physics-on') ?? false;
				console.log('App initialization complete.');

			} else {
				throw new Error("Required elements (blocklyDiv, runAreaCanvas, left-panel) not found.");
			}
		} catch (error: any) {
			console.error('Failed to initialize application:', error);
			errorMsg = `Failed to initialize: ${error.message || error}`;
		} finally {
			isLoading = false;
		}

        fetchObjects();

		const physicsButton = document.getElementById('physics');
        if (physicsButton) {
             physicsObserver = new MutationObserver((mutationsList) => {
                for(let mutation of mutationsList) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        currentPhysicsEnabled = (mutation.target as HTMLElement).classList.contains('physics-on');
                    }
                }
            });
            physicsObserver.observe(physicsButton, { attributes: true });
        }

		window.addEventListener('resize', handleWindowResize);
		if (columnResizerElement) {
			columnResizerElement.addEventListener('mousedown', onColumnMouseDown);
		}
	});

	onDestroy(() => {
		if (!browser) return;
		physicsObserver?.disconnect();
		activePollingIntervals.forEach(clearInterval);
		activePollingIntervals.clear();
		activeModelPollingIntervals.forEach(clearInterval);
		activeModelPollingIntervals.clear();
		blocklyWorkspace?.dispose();
		threeD?.engine?.dispose();

		window.removeEventListener('resize', handleWindowResize);
		if (columnResizerElement) {
			columnResizerElement.removeEventListener('mousedown', onColumnMouseDown);
		}
		document.removeEventListener('mousemove', onColumnMouseMove);
		document.removeEventListener('mouseup', onColumnMouseUp);

		console.log('Svelte component destroyed, resources cleaned up.');
	});


    function handleObjectNameChange(event: CustomEvent<{ id: string; newName: string }>) {
        const { id, newName } = event.detail;
        const index = objectsList.findIndex(obj => obj.id === id);
		if (index === -1) return;

		let currentObject = objectsList[index];
		let finalName = newName.trim();

		if (!finalName) {
			finalName = currentObject.objectName || generateDefaultObjectName(objectsList);
		}

		let baseName = finalName;
		let counter = 1;
		let nameToCheck = finalName;
		while (objectsList.some(obj => obj.id !== id && obj.objectName === nameToCheck)) {
			nameToCheck = `${baseName} (${counter})`;
			counter++;
		}
		finalName = nameToCheck;

		if (currentObject.objectName !== finalName) {
            updateObjectState(id, { objectName: finalName });
		} else if (newName !== currentObject.objectName) {
             updateObjectState(id, { objectName: finalName });
        }
	}

	async function enqueueImageGeneration(prompt: string, originalImageId?: string) {
        if (!prompt.trim()) return false;
		if (!R2_PUBLIC_URL_BASE || !IMAGE_GENERATION_ENDPOINT) {
			console.error("Configuration error: Endpoints or R2 URL missing.");
            alert("Configuration error prevents generation.");
			return false;
		}

		userIdForRequest = getAuthenticatedUserId();
		if (!userIdForRequest) {
			showLoginModal.set(true);
			return false;
		}

		const generationId = uuidv4();
		const defaultObjectName = generateDefaultObjectName(objectsList);

		const newObjectEntry: GeneratedObject = {
            id: generationId,
			prompt: prompt,
			objectName: defaultObjectName,
			status: 'queued',
			statusMessage: 'Sending request...',
			attempts: 0,
			original_image_id: originalImageId,
            imageUrl: null,
            modelUrl: null,
            user_id: userIdForRequest,
            world_id: WORLD_ID,
            created_at: new Date().toISOString(),
            modelStatus: 'idle',
            isGenerating: true,
            statusUrl: null,
            modelStatusMessage: null,
            modelStatusUrl: null,
            modelAttempts: 0,
            originalImageId: originalImageId
        };
		objectsList.unshift(newObjectEntry);

		const requestBody = {
            inputPrompt: prompt,
			userID: userIdForRequest,
			worldID: WORLD_ID,
			propID: generationId,
			imageFormat: 'jpg'
         };

		console.log(`[Gen ID: ${generationId}] Enqueuing image generation...`, requestBody);
		try {
			const response = await fetch(IMAGE_GENERATION_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), });
			if (!response.ok) {
                let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { }
				throw new Error(`Failed to enqueue image: ${errorBody}`);
            }
			const result: any = await response.json();
			if (!result.statusKey) throw new Error("Image enqueue response missing 'statusKey'.");
			const fullStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`;
			console.log(`[Gen ID: ${generationId}] Image task enqueued. Status URL: ${fullStatusUrl}`);
			updateObjectState(generationId, { status: 'polling', statusUrl: fullStatusUrl, statusMessage: 'Image Queued. Waiting...' });
			startImagePolling(generationId, fullStatusUrl);
			return true;
		} catch (err: any) {
			console.error(`[Gen ID: ${generationId}] Error enqueuing image generation:`, err);
			updateObjectState(generationId, { status: 'error_enqueue', statusMessage: `Enqueue failed: ${err.message}`, isGenerating: false });
			return false;
		}
	}

	async function submitPrompt() {
		const success = await enqueueImageGeneration(promptValue);
		if (success) {
			promptValue = '';
		}
	}

	function startImagePolling(generationId: string, statusUrl: string) {
        clearPollingInterval(generationId);
		const intervalId = window.setInterval(() => { pollImageStatus(generationId, statusUrl); }, POLLING_INTERVAL_MS);
		activePollingIntervals.set(generationId, intervalId);
	}

	function clearPollingInterval(generationId: string) {
		if (activePollingIntervals.has(generationId)) {
			clearInterval(activePollingIntervals.get(generationId)!);
			activePollingIntervals.delete(generationId);
		}
	}

	async function pollImageStatus(generationId: string, statusUrl: string) {
		const objectIndex = objectsList.findIndex(obj => obj.id === generationId);
		if (objectIndex === -1 || !objectsList[objectIndex].isGenerating) {
            clearPollingInterval(generationId);
            return;
        }
		let currentObject = objectsList[objectIndex];
		const currentAttempts = currentObject.attempts + 1;
		updateObjectState(generationId, { attempts: currentAttempts });
        currentObject = objectsList[objectIndex];

		if (currentAttempts > MAX_POLL_ATTEMPTS) {
            console.warn(`[Gen ID: ${generationId}] IMAGE polling timed out after ${MAX_POLL_ATTEMPTS} attempts.`);
			updateObjectState(generationId, { status: 'failed', statusMessage: `Polling timed out.`, isGenerating: false });
			clearPollingInterval(generationId);
            return;
        }

		try {
			const response = await fetch(statusUrl, { cache: 'no-store' });
			if (response.status === 404) {
                 if (currentObject.status === 'polling' || currentObject.status === 'queued') {
					updateObjectState(generationId, { statusMessage: `Waiting for image status... (Attempt ${currentAttempts})` });
				}
                return;
            }
			if (!response.ok) { throw new Error(`HTTP error ${response.status}`); }
			const statusReport: any = await response.json();
			const currentIndex = objectsList.findIndex(obj => obj.id === generationId);
			if (currentIndex === -1 || !objectsList[currentIndex].isGenerating) { clearPollingInterval(generationId); return; }
            currentObject = objectsList[currentIndex];

			switch (statusReport.status) {
				case 'success':
                    if (!statusReport.r2ImagePath) throw new Error("Image status 'success' but missing 'r2ImagePath'.");
                    const fullImageUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ImagePath}`;
                    console.log(`[Gen ID: ${generationId}] Image generation successful! URL: ${fullImageUrl}`);
					updateObjectState(generationId, {
                        status: 'success',
                        imageUrl: fullImageUrl,
                        image_url: fullImageUrl,
                        statusMessage: 'Image generated.'
                    });
					clearPollingInterval(generationId);
					await saveImageToDatabase({
						id: generationId,
						prompt: currentObject.prompt!,
						imageUrl: fullImageUrl,
						originalImageId: currentObject.original_image_id ?? undefined
					});
					break;
				case 'failure': case 'error':
                    const failureMsg = statusReport.message || statusReport.errorDetails || 'Unknown error from image worker';
					console.error(`[Gen ID: ${generationId}] Image generation failed. Reason: ${failureMsg}`);
					updateObjectState(generationId, { status: 'failed', statusMessage: `Image Failed: ${failureMsg}`, isGenerating: false });
					clearPollingInterval(generationId);
                    break;
				case 'processing': case 'generating':
                    updateObjectState(generationId, { status: 'generating', statusMessage: `Generating image... (Attempt ${currentAttempts})` });
                    break;
				case 'queued':
                    updateObjectState(generationId, { status: 'queued', statusMessage: `Image in queue... (Attempt ${currentAttempts})` });
                    break;
				default:
                     console.warn(`[Gen ID: ${generationId}] Unknown IMAGE status: ${statusReport.status}. Continuing poll.`);
					 updateObjectState(generationId, { statusMessage: `Unknown status: ${statusReport.status} (Attempt ${currentAttempts})` });
                    break;
			}
		} catch (err: any) {
             console.error(`[Gen ID: ${generationId}] Error during image polling:`, err);
			const errorIndex = objectsList.findIndex(obj => obj.id === generationId);
			if (errorIndex === -1 || !objectsList[errorIndex].isGenerating) { clearPollingInterval(generationId); return; }

			if (err instanceof SyntaxError) {
				updateObjectState(generationId, { statusMessage: `Reading status... (Attempt ${currentAttempts})` });
			} else {
				updateObjectState(generationId, { status: 'failed', statusMessage: `Polling error: ${err.message}`, isGenerating: false });
				clearPollingInterval(generationId);
			}
		}
	}

	async function triggerModelGeneration(objectState: GeneratedObject) {
        const generationId = objectState.id;
        if (objectState.status !== 'success' || !objectState.image_url) {
             console.warn(`[Gen ID: ${generationId}] Skipping model generation: Image status is '${objectState.status}' or URL is missing.`);
			if (objectState.modelStatus !== 'skipped_image_failed') {
				updateObjectState(generationId, { modelStatus: 'skipped_image_failed', modelStatusMessage: 'Skipped: Image not successful.', isGenerating: false });
			}
			return;
        }

        userIdForRequest = getAuthenticatedUserId();
		if (!userIdForRequest) {
			showLoginModal.set(true);
			return;
		}

        const requestBody = {
             imagePublicUrl: objectState.image_url,
			userID: userIdForRequest,
			worldID: WORLD_ID,
			propID: generationId
        };

        console.log(`[Gen ID: ${generationId}] Enqueuing 3D model generation...`, requestBody);
        updateObjectState(generationId, { modelStatus: 'queued', modelStatusMessage: 'Sending request to model queue...', modelAttempts: 0, isGenerating: true });

        try {
            const response = await fetch(MODEL_GENERATION_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
             if (!response.ok) {
                let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { }
				throw new Error(`Failed to enqueue model: ${errorBody}`);
            }
            const result: any = await response.json();
			if (!result.statusKey) throw new Error("Model enqueue response missing 'statusKey'.");
            const fullModelStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`;
			console.log(`[Gen ID: ${generationId}] Model task enqueued. Status URL: ${fullModelStatusUrl}`);
			updateObjectState(generationId, { modelStatus: 'polling', modelStatusUrl: fullModelStatusUrl, modelStatusMessage: 'Model Queued. Waiting...' });
			startModelPolling(generationId, fullModelStatusUrl);
        } catch(err: any) {
            console.error(`[Gen ID: ${generationId}] Error enqueuing model generation:`, err);
			updateObjectState(generationId, { modelStatus: 'error_enqueue', modelStatusMessage: `Model Enqueue failed: ${err.message}`, isGenerating: false });
        }
	}

	function startModelPolling(generationId: string, statusUrl: string) {
        clearModelPollingInterval(generationId);
		const intervalId = window.setInterval(() => { pollModelStatus(generationId, statusUrl); }, POLLING_INTERVAL_MS);
		activeModelPollingIntervals.set(generationId, intervalId);
	}

	function clearModelPollingInterval(generationId: string) {
        if (activeModelPollingIntervals.has(generationId)) {
			clearInterval(activeModelPollingIntervals.get(generationId)!);
			activeModelPollingIntervals.delete(generationId);
		}
	}

	async function pollModelStatus(generationId: string, statusUrl: string) {
        const objectIndex = objectsList.findIndex(obj => obj.id === generationId);
		if (objectIndex === -1 || !objectsList[objectIndex].isGenerating) {
            clearModelPollingInterval(generationId);
            return;
        }
		let currentObject = objectsList[objectIndex];
        let currentAttempts = (currentObject.modelAttempts ?? 0) + 1;
		updateObjectState(generationId, { modelAttempts: currentAttempts });
        currentObject = objectsList[objectIndex];

        if (currentAttempts > MAX_MODEL_POLL_ATTEMPTS) {
            console.warn(`[Gen ID: ${generationId}] Model polling timed out after ${MAX_MODEL_POLL_ATTEMPTS} attempts.`);
			updateObjectState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model polling timed out.`, isGenerating: false });
			clearModelPollingInterval(generationId);
            return;
         }

        try {
            const response = await fetch(statusUrl, { cache: 'no-store' });
             if (response.status === 404) {
                  if (currentObject.modelStatus === 'polling' || currentObject.modelStatus === 'queued') {
					updateObjectState(generationId, { modelStatusMessage: `Waiting for model status... (Attempt ${currentAttempts})` });
				}
                 return;
            }
            if (!response.ok) { throw new Error(`HTTP error ${response.status}`); }
            const statusReport: any = await response.json();
            const currentIndex = objectsList.findIndex(obj => obj.id === generationId);
			if (currentIndex === -1 || !objectsList[currentIndex].isGenerating) { clearModelPollingInterval(generationId); return; }
            currentObject = objectsList[currentIndex];

            switch (statusReport.status) {
                case 'success':
                    if (!statusReport.r2ModelPath) throw new Error("Model status 'success' but missing 'r2ModelPath'.");
					if (!statusReport.r2ModelPath.toLowerCase().endsWith('.glb')) { throw new Error(`Model success but path is not a .glb: ${statusReport.r2ModelPath}`); }
                    const fullModelUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ModelPath}`;
                    console.log(`[Gen ID: ${generationId}] Model generation successful! URL: ${fullModelUrl}`);
                    updateObjectState(generationId, {
                        modelStatus: 'success',
                        modelUrl: fullModelUrl,
                        model_url: fullModelUrl,
                        modelStatusMessage: 'Model generated.',
                        isGenerating: false
                    });
					clearModelPollingInterval(generationId);
                    await saveModelUrlToDatabase(generationId, fullModelUrl);

                    console.warn(`[Gen ID: ${generationId}] Model ready. Resolver updated. Manual scene update might be needed if object '${currentObject.objectName}' exists.`);
                    break;
                case 'failure': case 'error':
                     const modelFailureMsg = statusReport.message || statusReport.errorDetails || 'Unknown error from model worker';
					console.error(`[Gen ID: ${generationId}] Model generation failed. Reason: ${modelFailureMsg}`);
					updateObjectState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model Failed: ${modelFailureMsg}`, isGenerating: false });
					clearModelPollingInterval(generationId);
                    break;
                case 'processing': case 'generating':
                    updateObjectState(generationId, { modelStatus: 'generating', modelStatusMessage: `Generating model... (Attempt ${currentAttempts})` });
                    break;
                case 'queued':
                    updateObjectState(generationId, { modelStatus: 'queued', modelStatusMessage: `Model in queue... (Attempt ${currentAttempts})` });
                    break;
                default:
                     console.warn(`[Gen ID: ${generationId}] Unknown MODEL status received: ${statusReport.status}. Continuing poll.`);
					 updateObjectState(generationId, { modelStatusMessage: `Unknown model status: ${statusReport.status} (Attempt ${currentAttempts})` });
                    break;
            }
        } catch (err: any) {
             console.error(`[Gen ID: ${generationId}] Error during model polling:`, err);
			const errorIndex = objectsList.findIndex(obj => obj.id === generationId);
			if (errorIndex === -1 || !objectsList[errorIndex].isGenerating) { clearModelPollingInterval(generationId); return; }
			if (err instanceof SyntaxError) {
				updateObjectState(generationId, { modelStatusMessage: `Reading status... (Attempt ${currentAttempts})` });
			} else {
				updateObjectState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model polling error: ${err.message}`, isGenerating: false });
				clearModelPollingInterval(generationId);
			}
        }
	}

	async function saveImageToDatabase(imageData: { id: string; prompt: string; imageUrl: string; originalImageId?: string; }) {
        const userId = getAuthenticatedUserId();
		const supabase = get(supabaseStore);
        if (!userId || !supabase) {
             console.error(`[Gen ID: ${imageData.id}] Cannot save image to DB: User logged out or Supabase unavailable.`);
			 updateObjectState(imageData.id, { status: 'db_error', statusMessage: 'Generated, but failed to save. Please log in.', isGenerating: false });
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
					original_image_id: imageData.originalImageId
				});
			if (error) throw error;
			console.log(`[Gen ID: ${imageData.id}] Object (image) saved successfully to DB.`);
            fetchObjects(); // Refresh list after successful save
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
             return;
         }
		console.log(`[Gen ID: ${generationId}] Saving model URL to DB object for user ${userId}...`);
		try {
			const { data, error } = await supabase
				.from('generated_objects')
				.update({ model_url: modelUrl })
				.eq('id', generationId)
                .eq('user_id', userId);
			if (error) throw error;
			console.log(`[Gen ID: ${generationId}] Model URL saved successfully to DB object.`);
             fetchObjects(); // Refresh list after successful save
		} catch (error: any) {
			console.error(`[Gen ID: ${generationId}] Error saving model URL to DB object:`, error);
            // Consider how to update state here, maybe a specific db error status
		}
	}

    // Modified handler for clicks from ObjectCard
    function handleObjectCardClick(event: CustomEvent<{ object: GeneratedObject }>) {
		alert(123)
        const clickedObject = event.detail.object;
        console.log(`Card clicked: ${clickedObject.objectName}, Status: ${clickedObject.status}, Image URL: ${clickedObject.image_url}`);
        // Check if the image URL exists (primary condition)
        // Status check might be secondary, allow opening even if model failed later?
        if (clickedObject.image_url) {
            console.log(`Setting selectedImageForModal for ${clickedObject.objectName}`);
			selectedImageForModal = clickedObject;
		} else {
            console.log(`Modal not opened for ${clickedObject.objectName}, image_url is missing.`);
        }
	}


	async function handleRegenerate(newPrompt: string) {
        if (!selectedImageForModal) return;
		const originalId = selectedImageForModal.original_image_id ?? selectedImageForModal.id;
        const objectToRegenFrom = selectedImageForModal;
		selectedImageForModal = null;
		await enqueueImageGeneration(newPrompt, originalId);
	}

	async function handleMake3D() {
        if (!selectedImageForModal) return;
        const objectToProcess = objectsList.find(obj => obj.id === selectedImageForModal!.id);
		selectedImageForModal = null;
		if (objectToProcess) {
            if (!objectToProcess.modelStatus || objectToProcess.modelStatus === 'idle' || objectToProcess.modelStatus === 'skipped_image_failed') {
                 await triggerModelGeneration(objectToProcess);
            } else {
                console.log(`Model generation for ${objectToProcess.objectName} already in state: ${objectToProcess.modelStatus}`);
            }
		} else {
			console.error("Could not find object state to start model generation from modal action.");
		}
	}

	async function handlePlayClick() {
        console.log("Svelte: Play button clicked. Calling runBlocklyCode...");
        try {
             await runBlocklyCode(false, currentPhysicsEnabled);
        } catch (error) {
            console.error("Error executing Blockly code from Play button:", error);
            alert("An error occurred while trying to run the blocks. Check the console.");
        }
    }

    function getModelUrlForId(name: string): string | null {
        const liveObject = objectsList.find(obj => obj.objectName === name);

		if (liveObject && liveObject.modelStatus === 'success' && liveObject.model_url) {
			return liveObject.model_url;
		}

        if (liveObject) {
             console.warn(`[Resolver] Model URL not ready for Name "${name}". Live Object Found. Image Status: ${liveObject.status}, Model Status: ${liveObject.modelStatus}`);
        } else {
            console.warn(`[Resolver] No object found with Name "${name}" in the current objects list. Cannot resolve model URL.`);
        }
		return null;
	}

    async function handleObjectsTabClick() {
		activeTab = 'objects';
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
			<button id="physics" class="top-button {currentPhysicsEnabled ? 'physics-on' : 'physics-off'}">Physics</button>
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
				<div id="blocklyArea" class:hidden={activeTab !== 'code'}>
					{#if isLoading}<div class="loading-placeholder">Loading Workspace...</div>{/if}
					<div id="blocklyDiv"></div>
				</div>

				<div id="objectsArea" class:hidden={activeTab !== 'objects'}>
					{#if objectsLoading && objectsList.length === 0}
						<div class="loading-placeholder">Loading Objects...</div>
					{:else if objectsError}
						<div class="error-placeholder">Error: {objectsError}</div>
					{:else if objectsList.length === 0 && !objectsLoading}
						<div class="empty-placeholder">No objects found. Create some!</div>
					{:else}
						<div id="object-grid">
							{#each objectsList as object (object.id)}
							<ObjectCard
								{object}
								onCardClick={handleShowModalForObject}
							/>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<span id="columnResizer"><img id="drag" src="/icons/drag.svg" alt="Resize Handle" /></span>

		<div id="runArea">
			<canvas 
			id="runAreaCanvas"
			ondragover={handleCanvasDragOver}
			ondrop={handleCanvasDrop}
			>
			
		</canvas>
			<div id="prompt-container">
				<textarea id="prompt-input" placeholder="a green and yellow colored robotic dog" bind:value={promptValue} onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitPrompt(); } }} >
				</textarea>
				<button id="prompt-submit" onclick={submitPrompt} disabled={!promptValue.trim() || objectsList.some(o => o.isGenerating)}>
					{#if objectsList.some(o => o.isGenerating)} Generating...
					{:else} Make
					{/if}
				</button>
			</div>
		</div>
	</div>

	<div id="footer"> <div id="fpsCounter"></div> </div>

</div>

{#if errorMsg && !isLoading} <div class="init-error-message"> Initialization Error: {errorMsg} </div> {/if}

{#if selectedImageForModal}
<EditableObjectModal
    imageUrl={selectedImageForModal.imageUrl ?? ''}
    prompt={selectedImageForModal.prompt ?? ''}
    altText={`Details for object: ${selectedImageForModal.objectName}`}
    modelStatus={selectedImageForModal.modelStatus}
    modelUrl={selectedImageForModal.modelUrl ?? undefined}
    onClose={() => selectedImageForModal = null}
    onRegenerate={handleRegenerate}
    onMake3D={handleMake3D}
/>
{/if}

<style>
:global(html), :global(body) { height: 100%; margin: 0; overflow: hidden; box-sizing: border-box; }
:global(*, *:before, *:after) { box-sizing: inherit; }
:global(body) { font-family: sans-serif; background-color: #fff; }

#blockly-container { display: grid; height: 100vh; width: 100%; grid-template-rows: 60px 1fr 20px; margin: 0; padding: 0; overflow: hidden; }
#blockly-header { grid-row: 1; background-color: #1d1d1d; display: flex; align-items: center; position: relative; z-index: 20; flex-shrink: 0; height: 60px; }
#split { grid-row: 2; display: flex; flex-direction: row; height: 100%; width: 100%; position: relative; overflow: hidden; }
#runArea { background: #333333; height: 100%; position: relative; overflow: hidden; flex-grow: 1; display: flex; flex-direction: column; }
#runAreaCanvas { width: 100%; height: 100%; display: block; flex-grow: 1; min-height: 0; }
#columnResizer { display: flex; align-items: center; justify-content: center; width: 10px; height: 100%; cursor: col-resize; background-color: #1d1d1d; border-left: 1px solid #444; border-right: 1px solid #444; z-index: 5; flex-shrink: 0; }
#columnResizer img { width: 18px; height: auto; pointer-events: none; user-select: none; }
#columnResizer:hover { background-color: #2d2d2d; }
#footer { grid-row: 3; background-color: #1d1d1d; color: #fff; font-size: small; height: 20px; line-height: 20px; flex-shrink: 0; }
#fpsCounter { text-align: right; padding-right: 10px; }

#logo { height: 45px; padding: 5px 0 5px 15px; margin-right: 10px; flex-shrink: 0; }
.blockly-page-logo-link { display: inline-block; line-height: 0; }
#buttonrow { display: flex; flex-direction: row; align-items: center; gap: 5px; padding: 0 10px; width: 100%; flex-wrap: nowrap; height: 100%; }
.top-button { background-color: transparent; border: none; background-size: 30px 30px; background-position: center 7px; background-repeat: no-repeat; height: 50px; width: 50px; margin: 0; padding-top: 30px; box-sizing: border-box; cursor: pointer; color: white; font-size: 12px; text-align: center; line-height: 1.2; flex-shrink: 0; }
.top-button:hover { background-color: rgba(255, 255, 255, 0.1); border-radius: 4px; }
#reset { background-image: url(/icons/restart.svg); }
.physics-on { background-image: url(/icons/toggle_on.svg); }
.physics-off { background-image: url(/icons/toggle_off.svg); }
#fullscreen { background-image: url(/icons/fullscreen.svg); }
#export { background-image: url(/icons/download.svg); }
#image-upload { height: 50px; width: 50px; position: relative; flex-shrink: 0; }
#image-upload>input { display: none; }
#image-upload-label { display: block; width: 100%; height: 100%; background-image: url(/icons/upload.svg); background-size: 30px 30px; background-position: center 5px; background-repeat: no-repeat; padding-top: 35px; box-sizing: border-box; cursor: pointer; color: white; font-size: 10px; text-align: center; line-height: 1.2; }
#image-upload-label:hover { background-color: rgba(255, 255, 255, 0.1); border-radius: 4px; }
.auth-buttons-container { margin-left: auto; display: flex; align-items: center; gap: 8px; padding-right: 10px; }
.auth-button { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; color: white; cursor: pointer; border: none; transition: background-color 0.2s ease; }
.login-button { background-color: #3b82f6; }
.logout-button { background-color: #ffbf00; }
.auth-avatar-container { display: flex; align-items: center; }
.auth-avatar-image, .auth-avatar-fallback { height: 32px; width: 32px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.6); object-fit: cover; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; background-color: #60a5fa; color: white; }
#prompt-container{ position:absolute; bottom:15px; left:15px; display:flex; align-items:flex-end; gap:5px; background-color:#1d1d1d88; padding:8px; border-radius:6px; box-shadow:0 2px 5px rgba(0, 0, 0, 0.3); z-index:11; }
#prompt-input{ width:300px; height:45px; min-height: 45px; background-color:#1d1d1d88; color:rgb(202, 202, 202) ; border:1px solid #505050; border-radius:4px; padding:8px 10px; font-family:sans-serif; font-size:13px; line-height: 1.4; resize:none; box-sizing:border-box; }
#prompt-submit{ height:45px; padding:0 12px; background-color:#1d1d1d; color:rgb(202, 202, 202); border:none; border-radius:4px; cursor: pointer; font-size:13px; font-weight:700; box-sizing: border-box; white-space:nowrap; transition: background-color 0.2s ease; flex-shrink: 0; }
#prompt-submit:disabled{ background-color:#5e5e5e; cursor:not-allowed; opacity: 0.7; }
#prompt-submit:hover:not(:disabled){ background-color:#7C00FE; }

#vr-dropdown, #examples-dropdown { display: none !important; }
.init-error-message { position: fixed; top: 70px; left: 50%; transform: translateX(-50%); background: rgba(239, 68, 68, 0.9); color: white; padding: 10px 15px; border-radius: 5px; z-index: 1000; box-shadow: 0 2px 5px rgba(0,0,0,0.3); font-size: 14px; text-align: center; }
.blocklyTreeLabel { font-size: 12px !important; }
.blocklyText { font-size: 10px; }

#left-panel {
	width: 40%;
	background: #4a4a4a;
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;
    flex-shrink: 0;
    position: relative;
}

.tab-bar {
	display: flex;
	background-color: #3e3e3e;
	border-bottom: 2px solid #555;
    flex-shrink: 0;
	z-index:10000;
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
    margin-bottom: -1px;
    position: relative;
    min-width: 80px;
    text-align: center;
}
.tab-button:hover {
	background-color: #505050;
	color: #fff;
}
.tab-button.active {
	color: #fff;
	border-bottom: 6px solid #7C00FE;
}
.tab-button:focus-visible {
	outline: 2px solid #7C00FE;
	outline-offset: -2px;
}
.tab-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: inherit;
}

.tab-content {
	flex-grow: 1;
	position: relative;
	overflow: hidden;
    display: flex;
    flex-direction: column;
}

.hidden {
	display: none !important;
}

#blocklyArea {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
	background-color: #fff;
}
#blocklyDiv {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
}


#objectsArea {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background-color: #333333;
    padding: 10px;
    scrollbar-width: auto;
    scrollbar-color: #303030 rgba(0, 0, 0, 0.2);
}
#objectsArea::-webkit-scrollbar { width: 8px; }
#objectsArea::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.1); }
#objectsArea::-webkit-scrollbar-thumb { background-color: #424242; border-radius: 4px; border: 2px solid #4a4a4a; }

#object-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	gap: 10px;
}

.loading-placeholder,
.error-placeholder,
.empty-placeholder {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    font-size: 14px;
    padding: 20px;
    text-align: center;
    color: #aaa;
}
.error-placeholder {
    color: #ffc8c8;
}


#vr, #debug, #examples, #clear, #help { display: none; }
#vr-dropdown, #examples-dropdown { display: none !important; }

:global(body) { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
#prompt-input { user-select: text; -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; }
input[type="text"] { user-select: text; -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; }


/* Optional: Add visual feedback for the drop zone when dragging over */
#runAreaCanvas:dragover { /* This might not work directly on canvas, target parent? */
		/* border: 2px dashed #7C00FE; */ /* Example */
	}
	#runArea {
		/* Add styles here if targeting the parent div for visual feedback */
		/* Example: outline during dragover */
		transition: outline 0.1s linear;
	}
	body.dragging-over-canvas #runArea { /* Use a body class toggled in dragover/dragleave */
 		outline: 3px dashed #424242;
 		outline-offset: -5px;
	}



</style>