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
	import { sessionStore, requestLogin, handleLogout, supabaseStore, loginModalConfigStore } from '$lib/stores/authStore';
	import type { Database } from '$lib/database.types';

	type DatabaseObject = Database['public']['Tables']['generated_objects']['Row'];

	const MAX_MODEL_POLL_ATTEMPTS = 60;
	const MAX_POLL_ATTEMPTS = 40; // This seems to be duplicated, ensure you have the correct one.
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
            let currentObject = objectsList[index];
            const updatedObject = { ...currentObject, ...updates };

            const newObjectsList = [...objectsList];
            newObjectsList[index] = updatedObject;
            objectsList = newObjectsList;

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
        // let fetchError: any = null; // fetchError was declared but not used

        try {
            let query = supabase
                .from('generated_objects')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (userId) {
                query = query.eq('user_id', userId);
            } else {
                // If no user, fetch objects where user_id is null (public) or an empty list.
                // For this example, let's assume public objects have user_id as null.
                // If you only want user-specific, this will correctly return nothing if not logged in.
                // query = query.is('user_id', null); // Uncomment if you want to fetch public objects when not logged in
                 console.log("No user logged in. Fetching only public objects or empty list.");
                 // If you have no concept of public objects and everything is user-specific,
                 // then an unauthenticated user would see an empty list.
            }


             const { data: dbData, error } = await query;

            if (error) {
                throw error;
            }
            fetchedData = dbData;
            console.log(`Fetched ${fetchedData?.length ?? 0} objects for user: ${userId || 'anonymous/public'}.`);

        } catch (err: any) {
            // fetchError = err; // Not used
            console.error("Error fetching objects:", err);
            objectsError = `Failed to load objects: ${err.message || 'Unknown error'}`;
        }

        const generatingItems = objectsList.filter(obj => obj.isGenerating);
        const fetchedItems = fetchedData?.map(dbObj => {
        return {
            ...dbObj,
            objectName: dbObj.objectName || dbObj.prompt?.substring(0, 30) || dbObj.id, // Prioritize existing objectName from DB
            status: dbObj.status || 'success', // Prioritize existing status
            statusMessage: dbObj.statusMessage || 'Loaded from DB',
            imageUrl: dbObj.image_url,
            modelUrl: dbObj.model_url,
            modelStatus: dbObj.model_status || (dbObj.model_url ? 'success' : (dbObj.image_url ? 'idle' : 'skipped_image_failed')),
            isGenerating: false, // Fetched items are not actively generating unless re-queued
            attempts: dbObj.attempts || 0,
            modelAttempts: dbObj.modelAttempts || 0,
            statusUrl: null, // Should not be persisted typically
            modelStatusMessage: dbObj.modelStatusMessage || (dbObj.model_url ? 'Model loaded.' : (dbObj.image_url ? null : 'Image not available.')),
            modelStatusUrl: null, // Should not be persisted
            originalImageId: dbObj.original_image_id
        } as GeneratedObject;
    }) || [];

        const generatingMap = new Map(generatingItems.map(item => [item.id, item]));

        const combinedList = [
            ...generatingItems,
            ...fetchedItems.filter(item => !generatingMap.has(item.id))
        ];

        combinedList.sort((a, b) => {
            if (a.isGenerating && !b.isGenerating) return -1;
            if (!a.isGenerating && b.isGenerating) return 1;
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        });

        objectsList = combinedList;
        objectsLoading = false;
    }

	function handleShowModalForObject(objectToShow: GeneratedObject) {
		console.log(`Parent handler (handleShowModalForObject) called for: ${objectToShow.objectName}`);
		selectedImageForModal = objectToShow;
	}


	function triggerBlocklyResize() {
		if (activeTab === 'code' && blocklyWorkspace && browser) {
			Blockly.svgResize(blocklyWorkspace);
            blocklyWorkspace.render();
		}
		threeD?.engine?.resize();
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
        document.body.classList.add('user-select-none');
	}

	function onColumnMouseMove(event: MouseEvent) {
		if (!isResizing || !leftPanelElement) return;
		const deltaX = event.clientX - initialResizeX;
		const newWidth = initialLeftWidth + deltaX;
		const minWidth = 200; // Min width for left panel
        const resizerWidth = columnResizerElement?.offsetWidth || 10;
		const parentWidth = (leftPanelElement.parentElement as HTMLElement).offsetWidth;
		const maxWidth = parentWidth - 200 - resizerWidth; // Ensure right panel has at least 200px

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
        document.body.classList.remove('user-select-none');
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
					Blockly.svgResize(blocklyWorkspace);
					blocklyWorkspace.render();
				}
			});
		}
	});

    // --- State for tracking previous values to prevent unnecessary effect runs ---
    let prevUserIdForEffect: string | null | Symbol = Symbol(); // Initialize with a unique symbol for first run
    let prevSupabaseReadyForEffect: boolean | Symbol = Symbol(); // Initialize with a unique symbol for first run

    $effect(() => {
        const currentSession = get(sessionStore); // Read once per effect run
        const currentUserId = currentSession?.user?.id ?? null;
        const currentSupabaseInstance = get(supabaseStore);
        const currentSupabaseReady = !!currentSupabaseInstance;

        if (browser) {
            const userIdChanged = currentUserId !== prevUserIdForEffect;
            const supabaseReadinessChanged = currentSupabaseReady !== prevSupabaseReadyForEffect;

            if (currentSupabaseReady && (userIdChanged || supabaseReadinessChanged)) {
                // This log helps confirm why fetch is happening
                console.log(`Effect: User ID or Supabase readiness changed. Fetching objects. User: ${currentUserId}, SupabaseReady: ${currentSupabaseReady}. PrevUser: ${String(prevUserIdForEffect)}, PrevSupabaseReady: ${String(prevSupabaseReadyForEffect)}`);
                fetchObjects();
            } else if (!currentSupabaseReady && prevSupabaseReadyForEffect === true) {
                // Handle Supabase becoming unavailable after it was available
                console.log("Effect: Supabase client became unavailable. Clearing objects list.");
                objectsList = []; // Clear objects if Supabase is gone
                objectsLoading = false; // Ensure loading is reset
                objectsError = "Database connection lost.";
            }

            // Update previous values for the next comparison
            prevUserIdForEffect = currentUserId;
            prevSupabaseReadyForEffect = currentSupabaseReady;
        }
    });

	function handleCanvasDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			if (event.dataTransfer.types.includes('application/madmods-object+json')) {
				event.dataTransfer.dropEffect = 'copy';
                document.body.classList.add('dragging-over-canvas');
			} else {
				event.dataTransfer.dropEffect = 'none';
			}
		}
	}
    function handleCanvasDragLeave(event: DragEvent) {
        // Check if the mouse is leaving the canvas for real, not just moving over child elements
        if (event.relatedTarget === null || ! (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
            document.body.classList.remove('dragging-over-canvas');
        }
    }

	async function handleCanvasDrop(event: DragEvent) {
		event.preventDefault();
        document.body.classList.remove('dragging-over-canvas');
		const objectJson = event.dataTransfer?.getData('application/madmods-object+json');
		if (!objectJson) return;
		try {
			const droppedObject: GeneratedObject = JSON.parse(objectJson);
			if (droppedObject.modelStatus !== 'success' || !droppedObject.modelUrl) {
				alert(`Object "${droppedObject.objectName}" doesn't have a ready 3D model.`);
				return;
			}
			const canvas = document.getElementById('runAreaCanvas');
			if (!canvas || !threeD) return;
			const rect = canvas.getBoundingClientRect();
			const screenX = event.clientX - rect.left;
			const screenY = event.clientY - rect.top;
			await threeD.spawnObjectFromDragDrop(droppedObject, screenX, screenY);
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

		try {
			const blocklyDiv = document.getElementById('blocklyDiv');
			const runAreaCanvas = document.getElementById('runAreaCanvas');
			if (blocklyDiv && runAreaCanvas && leftPanelElement) {
				await initializeApp('blocklyDiv', 'runAreaCanvas', getModelUrlForId);
				const physicsButton = document.getElementById('physics');
				currentPhysicsEnabled = physicsButton?.classList.contains('physics-on') ?? false;
			} else {
				throw new Error("Required elements (blocklyDiv, runAreaCanvas, left-panel) not found.");
			}
		} catch (error: any) {
			console.error('Failed to initialize application:', error);
			errorMsg = `Failed to initialize: ${error.message || error}`;
		} finally {
			isLoading = false;
		}

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
        const canvasEl = document.getElementById('runAreaCanvas');
        if (canvasEl) {
             canvasEl.addEventListener('dragleave', handleCanvasDragLeave);
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
		document.removeEventListener('mousemove', onColumnMouseMove); // Clean up global listeners
		document.removeEventListener('mouseup', onColumnMouseUp);     // Clean up global listeners
        const canvasEl = document.getElementById('runAreaCanvas');
        if (canvasEl) {
             canvasEl.removeEventListener('dragleave', handleCanvasDragLeave);
        }
	});


    async function handleObjectNameChange(event: CustomEvent<{ id: string; newName: string }>) {
        const { id, newName } = event.detail;
        const index = objectsList.findIndex(obj => obj.id === id);
		if (index === -1) return;

		let currentObject = objectsList[index];
		let finalName = newName.trim();

		if (!finalName) { // Revert to original or generate new if empty
			finalName = currentObject.objectName || generateDefaultObjectName(objectsList.filter(o => o.id !== id));
		}

		// Ensure uniqueness apart from itself
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
            // Persist name change to DB
            const supabase = get(supabaseStore);
            const userId = getAuthenticatedUserId();
            if (supabase && userId && currentObject.id) {
                try {
                    const { error } = await supabase
                        .from('generated_objects')
                        .update({ objectName: finalName })
                        .eq('id', currentObject.id)
                        .eq('user_id', userId);
                    if (error) throw error;
                    console.log(`Object name for ${currentObject.id} updated to "${finalName}" in DB.`);
                } catch (dbError) {
                    console.error(`Failed to update object name in DB for ${currentObject.id}:`, dbError);
                    // Optionally revert UI or show error
                    alert(`Error saving name change for ${currentObject.objectName}.`);
                    updateObjectState(id, { objectName: currentObject.objectName }); // Revert optimistic update
                }
            }
		}
	}

	async function enqueueImageGeneration(prompt: string, originalImageId?: string) {
        if (!prompt.trim()) return false;
		if (!R2_PUBLIC_URL_BASE || !IMAGE_GENERATION_ENDPOINT) {
            alert("Configuration error prevents generation.");
			return false;
		}

		userIdForRequest = getAuthenticatedUserId();
		if (!userIdForRequest) {
			requestLogin(undefined, false);
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
			modelAttempts: 0,
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
            originalImageId: originalImageId
        };
        objectsList = [newObjectEntry, ...objectsList];


		const requestBody = {
            inputPrompt: prompt,
			userID: userIdForRequest,
			worldID: WORLD_ID,
			propID: generationId,
			imageFormat: 'jpg'
         };

		try {
			const response = await fetch(IMAGE_GENERATION_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), });
			if (!response.ok) {
                let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* ignore */ }
				throw new Error(`Failed to enqueue image: ${errorBody}`);
            }
			const result: any = await response.json();
			if (!result.statusKey) throw new Error("Image enqueue response missing 'statusKey'.");
			const fullStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`;
			updateObjectState(generationId, { status: 'polling', statusUrl: fullStatusUrl, statusMessage: 'Image Queued. Waiting...' });
			startImagePolling(generationId, fullStatusUrl);
			return true;
		} catch (err: any) {
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
		if (objectIndex === -1 || !objectsList[objectIndex].isGenerating) { // Stop if object removed or no longer generating
            clearPollingInterval(generationId);
            return;
        }
		let currentObject = objectsList[objectIndex];
		const currentAttempts = currentObject.attempts + 1;
		updateObjectState(generationId, { attempts: currentAttempts });
        currentObject = objectsList[objectsList.findIndex(obj => obj.id === generationId)];


		if (currentAttempts > MAX_POLL_ATTEMPTS) {
			updateObjectState(generationId, { status: 'failed', statusMessage: `Polling timed out.`, isGenerating: false });
			clearPollingInterval(generationId);
            return;
        }

		try {
			const response = await fetch(statusUrl, { cache: 'no-store' });
			if (response.status === 404) { // Status file not yet created
                 if (currentObject.status === 'polling' || currentObject.status === 'queued') {
					updateObjectState(generationId, { statusMessage: `Waiting for image status... (Attempt ${currentAttempts})` });
				}
                return;
            }
			if (!response.ok) { throw new Error(`HTTP error ${response.status}`); }
			const statusReport: any = await response.json();
			const currentIndex = objectsList.findIndex(obj => obj.id === generationId); // Re-check index
			if (currentIndex === -1 || !objectsList[currentIndex].isGenerating) { clearPollingInterval(generationId); return; }
            currentObject = objectsList[currentIndex];

			switch (statusReport.status) {
				case 'success':
                    if (!statusReport.r2ImagePath) throw new Error("Image status 'success' but missing 'r2ImagePath'.");
                    const fullImageUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ImagePath}`;
					updateObjectState(generationId, {
                        status: 'success',
                        imageUrl: fullImageUrl,
                        image_url: fullImageUrl,
                        statusMessage: 'Image generated.'
                        // isGenerating can remain true if model generation is next step
                    });
					clearPollingInterval(generationId);
					await saveImageToDatabase({
						id: generationId,
						prompt: currentObject.prompt!,
						imageUrl: fullImageUrl,
                        objectName: currentObject.objectName!, // Save current name
						originalImageId: currentObject.original_image_id ?? undefined
					});
					// Optionally trigger model generation if applicable
                    // await triggerModelGeneration(objectsList[currentIndex]); // or however you manage flow
					break;
				case 'failure': case 'error':
                    const failureMsg = statusReport.message || statusReport.errorDetails || 'Unknown error from image worker';
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
					 updateObjectState(generationId, { statusMessage: `Unknown status: ${statusReport.status} (Attempt ${currentAttempts})` });
                    break;
			}
		} catch (err: any) {
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
			if (objectState.modelStatus !== 'skipped_image_failed') {
				updateObjectState(generationId, { modelStatus: 'skipped_image_failed', modelStatusMessage: 'Skipped: Image not successful.', isGenerating: false });
			}
			return;
        }

        userIdForRequest = getAuthenticatedUserId();
		if (!userIdForRequest) {
			requestLogin(undefined, false);
			return;
		}

        const requestBody = {
             imagePublicUrl: objectState.image_url,
			userID: userIdForRequest,
			worldID: WORLD_ID,
			propID: generationId
        };

        updateObjectState(generationId, { modelStatus: 'queued', modelStatusMessage: 'Sending request to model queue...', modelAttempts: 0, isGenerating: true });

        try {
            const response = await fetch(MODEL_GENERATION_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
             if (!response.ok) {
                let errorBody = `HTTP ${response.status}: ${response.statusText}`;
				try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* ignore */ }
				throw new Error(`Failed to enqueue model: ${errorBody}`);
            }
            const result: any = await response.json();
			if (!result.statusKey) throw new Error("Model enqueue response missing 'statusKey'.");
            const fullModelStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`;
			updateObjectState(generationId, { modelStatus: 'polling', modelStatusUrl: fullModelStatusUrl, modelStatusMessage: 'Model Queued. Waiting...' });
			startModelPolling(generationId, fullModelStatusUrl);
        } catch(err: any) {
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
        currentObject = objectsList[objectsList.findIndex(obj => obj.id === generationId)];

        if (currentAttempts > MAX_MODEL_POLL_ATTEMPTS) {
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
                    updateObjectState(generationId, {
                        modelStatus: 'success',
                        modelUrl: fullModelUrl,
                        model_url: fullModelUrl,
                        modelStatusMessage: 'Model generated.',
                        isGenerating: false // Model generation is the final step for 'isGenerating'
                    });
					clearModelPollingInterval(generationId);
                    await saveModelUrlToDatabase(generationId, fullModelUrl);
                    break;
                case 'failure': case 'error':
                     const modelFailureMsg = statusReport.message || statusReport.errorDetails || 'Unknown error from model worker';
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
					 updateObjectState(generationId, { modelStatusMessage: `Unknown model status: ${statusReport.status} (Attempt ${currentAttempts})` });
                    break;
            }
        } catch (err: any) {
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

	async function saveImageToDatabase(imageData: { id: string; prompt: string; imageUrl: string; objectName: string; originalImageId?: string; }) {
        const userId = getAuthenticatedUserId();
		const supabase = get(supabaseStore);
        if (!userId || !supabase) {
			 updateObjectState(imageData.id, { status: 'db_error', statusMessage: 'Generated, but failed to save. Please log in.'});
             return;
        }
		try {
			const { error } = await supabase
				.from('generated_objects')
				.insert({
					id: imageData.id,
					prompt: imageData.prompt,
					image_url: imageData.imageUrl,
                    objectName: imageData.objectName, // Save the objectName
					user_id: userId,
					world_id: WORLD_ID,
					original_image_id: imageData.originalImageId
				});
			if (error) throw error;
            console.log(`[Gen ID: ${imageData.id}] Object (image) saved successfully to DB.`);
            // No need to fetchObjects here if model generation follows and it fetches.
		} catch (error: any) {
			console.error(`[Gen ID: ${imageData.id}] Error saving object (image) to DB:`, error);
			updateObjectState(imageData.id, { status: 'db_error', statusMessage: `DB save failed: ${error.message}`});
		}
	}

	async function saveModelUrlToDatabase(generationId: string, modelUrl: string) {
        const userId = getAuthenticatedUserId();
		const supabase = get(supabaseStore);
        if (!userId || !supabase) {
             console.error(`[Gen ID: ${generationId}] Cannot save model URL to DB: User logged out or Supabase unavailable.`);
             updateObjectState(generationId, { modelStatus: 'db_error', modelStatusMessage: 'Model ready, but DB save failed.'});
             return;
         }
		try {
			const { data, error } = await supabase
				.from('generated_objects')
				.update({ model_url: modelUrl, model_status: 'success' }) // also update model_status in DB
				.eq('id', generationId)
                .eq('user_id', userId);
			if (error) throw error;
            console.log(`[Gen ID: ${generationId}] Model URL saved successfully to DB object.`);
             fetchObjects(); // Refresh list after successful model save (final step)
		} catch (error: any) {
			console.error(`[Gen ID: ${generationId}] Error saving model URL to DB object:`, error);
            updateObjectState(generationId, { modelStatus: 'db_error', modelStatusMessage: `Model DB save error: ${error.message}`});
		}
	}

    function handleObjectCardClick(event: CustomEvent<{ object: GeneratedObject }>) {
        const clickedObject = event.detail.object;
        // Always show modal if an object is clicked, modal can display different states.
		selectedImageForModal = clickedObject;
	}


	async function handleRegenerate(newPrompt: string) {
        if (!selectedImageForModal) return;
		const originalId = selectedImageForModal.original_image_id ?? selectedImageForModal.id;
		selectedImageForModal = null;
		await enqueueImageGeneration(newPrompt, originalId);
	}

	async function handleMake3D() {
        if (!selectedImageForModal) return;
        const objectToProcess = objectsList.find(obj => obj.id === selectedImageForModal!.id);
		selectedImageForModal = null;

		if (objectToProcess) {
            if (objectToProcess.status === 'success' && objectToProcess.image_url &&
                (objectToProcess.modelStatus === 'idle' || objectToProcess.modelStatus === 'skipped_image_failed' || objectToProcess.modelStatus === 'error_enqueue' || objectToProcess.modelStatus === 'failed')
            ) {
                 await triggerModelGeneration(objectToProcess);
            } else if (objectToProcess.modelStatus === 'success' && objectToProcess.modelUrl) {
                alert(`Object "${objectToProcess.objectName}" already has a 3D model.`);
            } else if (objectToProcess.modelStatus === 'queued' || objectToProcess.modelStatus === 'polling' || objectToProcess.modelStatus === 'generating') {
                alert(`Model generation for "${objectToProcess.objectName}" is already in progress: ${objectToProcess.modelStatusMessage}`);
            } else if (objectToProcess.status !== 'success' || !objectToProcess.image_url) {
                alert(`Cannot make 3D model for "${objectToProcess.objectName}" as the image is not ready or failed.`);
            }
		}
	}

	async function handlePlayClick() {
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
		return null;
	}

    async function handleObjectsTabClick() {
		activeTab = 'objects';
        if (!objectsLoading) {
		    await fetchObjects();
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
					{@const user = $sessionStore.user}
					{@const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture}
					<button onclick={handleLogout} class="auth-button logout-button"> Logout </button>
					<div class="auth-avatar-container">
						{#if avatarUrl}
							<img class="auth-avatar-image" src={avatarUrl} alt="User avatar" referrerpolicy="no-referrer" title={user.email ?? 'User Profile'} />
						{:else if user.email}
							<span class="auth-avatar-fallback" title={user.email}> {user.email[0].toUpperCase()} </span>
                        {:else}
                            <span class="auth-avatar-fallback" title="User Profile">?</span>
						{/if}
					</div>
				{:else}
					<button onclick={() => requestLogin(undefined, false)} class="auth-button login-button"> Login </button>
				{/if}
			</div>
		</div>
	</div>

	<div id="split">
		<div id="left-panel" style="width: {browser ? (leftPanelElement?.style.width || '40%') : '40%'}">
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
					Objects {#if objectsLoading && activeTab === 'objects' && objectsList.length === 0}⏳{/if}
				</button>
			</div>
			<div class="tab-content">
				<div id="blocklyArea" class:hidden={activeTab !== 'code'}>
					{#if isLoading && !blocklyWorkspace}<div class="loading-placeholder">Loading Workspace...</div>{/if}
					<div id="blocklyDiv" style="height:100%; width:100%;"></div>
				</div>

				<div id="objectsArea" class:hidden={activeTab !== 'objects'}>
					{#if objectsLoading && objectsList.length === 0 && activeTab === 'objects'}
						<div class="loading-placeholder">Loading Objects...</div>
					{:else if objectsError && activeTab === 'objects'}
						<div class="error-placeholder">Error: {objectsError} <button onclick={fetchObjects}>Retry</button></div>
					{:else if objectsList.length === 0 && !objectsLoading && activeTab === 'objects'}
						<div class="empty-placeholder">No objects found. Create some above!</div>
					{:else if activeTab === 'objects'}
						<div id="object-grid">
							{#each objectsList as object (object.id)}
							<ObjectCard
								object={object}
								on:cardClick={(e) => handleObjectCardClick(e)}
							/>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<span id="columnResizer" onmousedown={onColumnMouseDown}><img id="drag" src="/icons/drag.svg" alt="Resize Handle" /></span>

		<div id="runArea">
			<canvas
			id="runAreaCanvas"
			ondragover={handleCanvasDragOver}
			ondrop={handleCanvasDrop}
            ondragleave={handleCanvasDragLeave}
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
    objectName={selectedImageForModal.objectName ?? 'Unnamed Object'}
    altText={`Details for object: ${selectedImageForModal.objectName ?? 'Unnamed Object'}`}
    modelStatus={selectedImageForModal.modelStatus}
    modelUrl={selectedImageForModal.modelUrl ?? undefined}
    onClose={() => selectedImageForModal = null}
    onRegenerate={handleRegenerate}
    onMake3D={handleMake3D}
    isGeneratingImage={selectedImageForModal.status !== 'success' && selectedImageForModal.isGenerating}
    isGeneratingModel={selectedImageForModal.status === 'success' && selectedImageForModal.modelStatus !== 'success' && selectedImageForModal.isGenerating}
/>
{/if}

<style>
:global(html), :global(body) { height: 100%; margin: 0; overflow: hidden; box-sizing: border-box; }
:global(*, *:before, *:after) { box-sizing: inherit; }
:global(body) { font-family: sans-serif; background-color: #fff; }
:global(body.user-select-none *) { user-select: none !important; -webkit-user-select: none !important; }


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
	background: #4a4a4a;
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;
    flex-shrink: 0;
    position: relative;
    min-width: 200px;
}

.tab-bar {
	display: flex;
	background-color: #3e3e3e;
	border-bottom: 2px solid #555;
    flex-shrink: 0;
	z-index:10;
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
    flex-grow: 1;

}
#blocklyDiv {
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
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    font-size: 14px;
    padding: 20px;
    text-align: center;
    color: #aaa;
}
.error-placeholder button {
    margin-top: 10px;
    padding: 5px 10px;
    background-color: #555;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
}
.error-placeholder button:hover {
    background-color: #666;
}
.error-placeholder {
    color: #ffc8c8;
}


#vr, #debug, #examples, #clear, #help { display: none; }
#vr-dropdown, #examples-dropdown { display: none !important; }

#prompt-input { user-select: text; -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; }
input[type="text"] { user-select: text; -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; }


#runArea {
	transition: outline 0.1s linear;
}
body.dragging-over-canvas #runAreaCanvas {
 		outline: 3px dashed #7C00FE;
 		outline-offset: -3px;
         box-shadow: 0 0 15px rgba(124, 0, 254, 0.5);
	}
</style>
