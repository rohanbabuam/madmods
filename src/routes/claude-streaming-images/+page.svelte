<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores'; // Import the page store
	import oboe from 'oboe';

    // --- Configuration ---
    // IMPORTANT: Replace with your actual R2 public bucket URL
    const R2_PUBLIC_URL_BASE = 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev'; 
    const IMAGE_GENERATION_ENDPOINT = 'https://imagegeneration.madmods.world';
    const POLLING_INTERVAL_MS = 1000; // Poll every 1.5 seconds

	// --- Interfaces ---
    interface PropData {
        name: string;
        description?: string;
        colors?: any[]; // Keep original structure
        transforms?: any[]; // Keep original structure
        // Add any other fields from Claude's prop object
    }

	interface PropState {
		id: string; // Unique identifier for this prop instance (e.g., prop.name or generated UUID)
		propData: PropData; // Original prop data from Claude
		imageStatus: 'idle' | 'queued' | 'generating' | 'polling' | 'success' | 'failed' | 'error_enqueue';
		statusUrl?: string; // Full public URL for status.json
		imageUrl?: string; // Full public URL for the final image.png
		statusMessage?: string; // e.g., error message or current status text
		pollingIntervalId?: number | NodeJS.Timeout; // Timer ID (use NodeJS.Timeout for better typing if in Node env)
        attempts: number; // Track polling attempts
	}

	// --- Reactive State Variables ---
	let receivedProps: PropState[] = []; // Array to hold prop state objects
	let metadata: any | null = null; // To store the metadata part (ensure it has worldName)
	let isLoading: boolean = false; // Flag for loading state (Claude stream)
	let error: string | null = null; // To store general stream error messages
	let isComplete: boolean = false; // Flag for stream completion
	let userPrompt: string = 'a dinosaur park'; // Default prompt
    let activePollingIntervals: Map<string, number | NodeJS.Timeout> = new Map(); // Track intervals by prop ID

	// --- API URL (to be set in onMount) ---
	let claudeApiUrl: string = ''; // Initialize as empty, will be set on mount

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
        activePollingIntervals.forEach((intervalId) => {
            clearInterval(intervalId);
        });
        activePollingIntervals.clear();
        // Also cancel any ongoing Oboe request if possible/needed
        // (Oboe doesn't have a simple .abort() like fetch, might need more complex handling if required)
    });

    // --- Update Prop State Helper ---
    function updatePropState(propId: string, updates: Partial<PropState>) {
        const index = receivedProps.findIndex(p => p.id === propId);
        if (index !== -1) {
            // Create a new object for the specific prop to ensure reactivity
            receivedProps[index] = { ...receivedProps[index], ...updates };
            // Trigger top-level array update for Svelte
            receivedProps = [...receivedProps];
        } else {
            console.warn(`Attempted to update non-existent prop with ID: ${propId}`);
        }
    }


	// --- Function to Trigger Image Generation ---
	async function triggerImageGeneration(propState: PropState) {
        if (!metadata || !metadata.worldName) {
            console.error("Cannot trigger image generation: Metadata (with worldName) not yet received.");
            updatePropState(propState.id, { imageStatus: 'failed', statusMessage: 'Error: Missing world metadata.' });
            return;
        }

        // --- Determine IDs and Prompt ---
        const userID = 'frontendUser';
        const worldID = metadata.worldName.replace(/\s+/g, '-').toLowerCase();
        const propID = propState.id.replace(/\s+/g, '-').toLowerCase();
        const inputPrompt = propState.propData.description // || propState.propData.name;

        if (!inputPrompt) {
            console.error(`Cannot trigger image generation for prop ${propID}: No description or name found.`);
             updatePropState(propState.id, { imageStatus: 'failed', statusMessage: 'Error: Missing prompt data (description/name).' });
            return;
        }

        const requestBody = {
            inputPrompt,
            userID,
            worldID,
            propID,
            imageFormat: 'jpg'
        };

        console.log(`[Prop: ${propID}] Enqueuing image generation...`, requestBody);
        updatePropState(propState.id, { imageStatus: 'queued', statusMessage: 'Sending request to queue...' });

        try {
            const response = await fetch(IMAGE_GENERATION_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                // Attempt to read error from backend response
                let errorBody = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorJson:any = await response.json();
                    errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson);
                } catch (e) { /* Ignore if response body isn't valid JSON */ }
                throw new Error(`Failed to enqueue: ${errorBody}`);
            }

            const result = await response.json();

            if (!result.statusKey) {
                 throw new Error("Enqueue response missing 'statusKey'.");
            }

            const statusKey = result.statusKey;
            const fullStatusUrl = `${R2_PUBLIC_URL_BASE}/${statusKey}`; // Construct full public URL

            console.log(`[Prop: ${propID}] Task enqueued successfully. Status URL: ${fullStatusUrl}`);
            updatePropState(propState.id, {
                imageStatus: 'polling',
                statusUrl: fullStatusUrl,
                statusMessage: 'Queued. Waiting for generation...',
                attempts: 0 // Reset attempts for polling
            });

            // Start polling for this specific prop
            startPolling(propState.id, fullStatusUrl);

        } catch (err: any) {
            console.error(`[Prop: ${propID}] Error enqueuing image generation:`, err);
            updatePropState(propState.id, { imageStatus: 'error_enqueue', statusMessage: `Enqueue failed: ${err.message}` });
        }
	}

    // --- Function to Start Polling ---
    function startPolling(propId: string, statusUrl: string) {
        // Clear any existing interval for this prop just in case
        if (activePollingIntervals.has(propId)) {
            clearInterval(activePollingIntervals.get(propId));
        }

        console.log(`[Prop: ${propId}] Starting polling for status at ${statusUrl}`);

        const intervalId = setInterval(() => {
            pollStatus(propId, statusUrl);
        }, POLLING_INTERVAL_MS);

        activePollingIntervals.set(propId, intervalId);
        // Update the prop state with the interval ID
        updatePropState(propId, { pollingIntervalId: intervalId });
    }

    // --- Function to Poll Status ---
    async function pollStatus(propId: string, statusUrl: string) {
        const propIndex = receivedProps.findIndex(p => p.id === propId);
        if (propIndex === -1) {
            console.warn(`[Prop: ${propId}] Polling stopped: Prop not found in state.`);
            clearPollingInterval(propId);
            return;
        }

        let currentAttempts = receivedProps[propIndex].attempts + 1;
        updatePropState(propId, { attempts: currentAttempts });

        // Add a timeout mechanism (e.g., stop after 2 minutes)
        const MAX_POLL_ATTEMPTS = Math.round((2 * 60 * 1000) / POLLING_INTERVAL_MS); // Approx 2 mins
         if (currentAttempts > MAX_POLL_ATTEMPTS) {
            console.warn(`[Prop: ${propId}] Polling timed out after ${MAX_POLL_ATTEMPTS} attempts.`);
            updatePropState(propId, { imageStatus: 'failed', statusMessage: 'Polling timed out.' });
            clearPollingInterval(propId);
            return;
        }


        console.log(`[Prop: ${propId}] Polling attempt ${currentAttempts}...`);
        try {
            const response = await fetch(statusUrl, { cache: 'no-store' }); // Ensure fresh data

            if (response.status === 404) {
                console.log(`[Prop: ${propId}] Status file not found yet (404). Continuing poll.`);
                 updatePropState(propId, { statusMessage: `Waiting for status file... (Attempt ${currentAttempts})` });
                return; // Keep polling
            }

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status} fetching status`);
            }

            const statusReport = await response.json();

            console.log(`[Prop: ${propId}] Received status:`, statusReport.status);

            switch (statusReport.status) {
                case 'success':
                    if (!statusReport.r2ImagePath) {
                         throw new Error("Status 'success' but missing 'r2ImagePath'.");
                    }
                    const fullImageUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ImagePath}`;
                    console.log(`[Prop: ${propId}] Image generation successful! Image URL: ${fullImageUrl}`);
                    updatePropState(propId, {
                        imageStatus: 'success',
                        imageUrl: fullImageUrl,
                        statusMessage: 'Image generated successfully.',
                    });
                    clearPollingInterval(propId);
                    break;

                case 'failure':
                    console.error(`[Prop: ${propId}] Image generation failed. Reason: ${statusReport.message || statusReport.errorDetails}`);
                    updatePropState(propId, {
                        imageStatus: 'failed',
                        statusMessage: `Generation failed: ${statusReport.message || 'Unknown error'}`,
                    });
                    clearPollingInterval(propId);
                    break;

                case 'processing':
                     console.log(`[Prop: ${propId}] Status is 'processing'. Continuing poll.`);
                     updatePropState(propId, { imageStatus: 'generating', statusMessage: `Generating image... (Attempt ${currentAttempts})` });
                     // Continue polling
                     break;

                // Handle potential intermediate states if your worker adds them
                // case 'queued': // Example if worker updated status before starting
                //     console.log(`[Prop: ${propId}] Status is 'queued'. Continuing poll.`);
                //     updatePropState(propId, { imageStatus: 'queued', statusMessage: `Waiting in queue... (Attempt ${currentAttempts})` });
                //     break;

                default:
                    console.warn(`[Prop: ${propId}] Unknown status received: ${statusReport.status}. Continuing poll.`);
                     updatePropState(propId, { statusMessage: `Unknown status: ${statusReport.status} (Attempt ${currentAttempts})` });
                    // Decide whether to continue polling or fail on unknown status
                    break;
            }

        } catch (err: any) {
            console.error(`[Prop: ${propId}] Error during polling:`, err);
            // Optional: Implement retry logic for network errors, or fail immediately
             updatePropState(propId, { imageStatus: 'failed', statusMessage: `Polling error: ${err.message}` });
             clearPollingInterval(propId); // Stop polling on error
        }
    }

    // --- Helper to Clear Interval ---
    function clearPollingInterval(propId: string) {
        if (activePollingIntervals.has(propId)) {
            clearInterval(activePollingIntervals.get(propId));
            activePollingIntervals.delete(propId);
            console.log(`[Prop: ${propId}] Cleared polling interval.`);
             // Find the prop and clear its intervalId field
            const index = receivedProps.findIndex(p => p.id === propId);
             if (index !== -1 && receivedProps[index].pollingIntervalId) {
                 updatePropState(propId, { pollingIntervalId: undefined });
             }
        }
    }


	// --- Function to Start Streaming (Triggered by Button) ---
	function startStreaming() {
        if (!claudeApiUrl) {
            console.error("API URL not set. Cannot start streaming.");
            error = "Initialization error: API URL not available.";
            return;
        }
         if (R2_PUBLIC_URL_BASE === 'https://your-r2-public-bucket-url.r2.dev') {
             error = "Configuration Error: R2 Public URL is not set. Please update the R2_PUBLIC_URL_BASE constant in the script.";
             return;
         }
        if (!userPrompt || userPrompt.trim() === '') {
            error = "Please enter a prompt before generating.";
            return;
        }

		console.log(`Starting stream to ${claudeApiUrl}...`);
		// Reset state before starting
		receivedProps = [];
		metadata = null;
		error = null; // Clear previous errors
		isLoading = true;
		isComplete = false;
        // Clear any lingering intervals from previous runs
        activePollingIntervals.forEach(clearInterval);
        activePollingIntervals.clear();

		const requestBody = { prompt: userPrompt };
		console.log("Sending request body:", requestBody);

		oboe({
			url: claudeApiUrl,
			method: 'POST',
			body: requestBody,
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			cached: false, withCredentials: false
		})
			.node('metadata', (meta:any) => {
				console.log('Received Metadata:', meta);
				metadata = meta; // Store metadata - needed for worldID
                 if (!metadata || !metadata.worldName) {
                     console.warn("Metadata received, but missing 'worldName'. Image generation might fail.");
                     // Optionally set a general error if worldName is critical early on
                 }
			})
			.node('propCategories.*.props[*]', (propObject: PropData) => { // Expecting PropData structure
				// Basic validation of the received prop object
				if (propObject && typeof propObject === 'object' && propObject.name) {
					console.log('Received Prop Object:', propObject.name);

                    // --- Create Initial Prop State ---
                    const newPropState: PropState = {
                        id: propObject.name, // Using name as ID - ENSURE UNIQUE
                        propData: propObject,
                        imageStatus: 'idle', // Start as idle
                        statusMessage: 'Received. Pending image generation request.',
                        attempts: 0,
                    };

					// Add to our reactive array
					receivedProps = [...receivedProps, newPropState];

                    // --- Trigger Image Generation for this Prop ---
                    // Need to wait briefly for metadata potentially? Or handle missing metadata in trigger fn
                    if (metadata && metadata.worldName) {
                        triggerImageGeneration(newPropState);
                    } else {
                        console.warn(`[Prop: ${newPropState.id}] Received prop before metadata. Delaying image generation trigger.`);
                        // Consider adding a mechanism to trigger later if metadata arrives after props
                         updatePropState(newPropState.id, { statusMessage: 'Received. Waiting for world metadata before image generation.' });
                    }

				} else {
					console.warn('Received incomplete or invalid prop object:', propObject);
                    // Handle invalid prop data if necessary
				}
			})
			.done((finalJson:any) => {
				console.log('Stream finished successfully.');
				if (!finalJson || !finalJson.metadata || !finalJson.propCategories) {
					console.warn("Stream finished, but final JSON structure seems incomplete:", finalJson);
					if (!error) { error = "Stream finished, but the final data structure might be incomplete."; }
                    isComplete = false;
				} else {
                    if (!error) { isComplete = true; }
                }
                isLoading = false; // Claude stream finished loading

                // Check if any props are still waiting for metadata
                receivedProps.forEach(p => {
                    if (p.imageStatus === 'idle' && p.statusMessage?.includes('Waiting for world metadata')) {
                        if (metadata && metadata.worldName) {
                             console.log(`[Prop: ${p.id}] Triggering delayed image generation as metadata is now available.`);
                             triggerImageGeneration(p);
                        } else {
                             console.error(`[Prop: ${p.id}] Stream finished, but metadata (worldName) still missing. Cannot generate image.`);
                             updatePropState(p.id, { imageStatus: 'failed', statusMessage: 'Failed: World metadata was not received.'});
                        }
                    }
                });


			})
			.fail((errorReport:any) => {
				console.error('Stream processing failed:', errorReport);
				isLoading = false;
                isComplete = false;
                let errorMessage = `Claude stream failed: ${errorReport.statusCode || 'Network Error'}. `;
                if (errorReport.body) { try { const parsedBody = JSON.parse(errorReport.body); errorMessage += parsedBody.error || parsedBody.message || parsedBody.details || errorReport.body; } catch(e) { errorMessage += errorReport.body; } }
                else if (errorReport.thrown) { errorMessage += (errorReport.thrown as Error).message || 'Client-side error during request'; }
				error = errorMessage;

                 // Mark any props that were waiting as failed
                receivedProps.forEach(p => {
                    if (p.imageStatus === 'idle' || p.imageStatus === 'queued' || p.imageStatus === 'generating' || p.imageStatus === 'polling') {
                         updatePropState(p.id, { imageStatus: 'failed', statusMessage: 'Failed: Main data stream error.' });
                         clearPollingInterval(p.id);
                    }
                });
			});
	}

</script>

<svelte:head>
    <title>Claude Stream + Image Gen</title>
</svelte:head>

<div class="container mx-auto p-6 font-sans">
	<h1 class="text-3xl font-bold mb-6 text-gray-800">Claude JSON Stream + Image Generator</h1>

    <!-- Prompt Input Area -->
    <div class="mb-4">
        <label for="prompt-input" class="block text-sm font-medium text-gray-700 mb-1">Enter Prompt:</label>
        <textarea
            id="prompt-input"
            bind:value={userPrompt}
            rows="4"
            class="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            placeholder="e.g., Describe a bustling medieval market square. Output strictly as JSON..."
            disabled={isLoading}
        ></textarea>
         <p class="text-xs text-gray-500 mt-1">Enter a description. AI will generate structured JSON data, and an image will be generated for each 'prop'.</p>
    </div>

    <!-- Generate Button -->
	<div class="mb-6">
		<button
			on:click={startStreaming}
			disabled={isLoading || !claudeApiUrl || R2_PUBLIC_URL_BASE === 'https://your-r2-public-bucket-url.r2.dev'}
			class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out shadow-md disabled:cursor-not-allowed"
            title={R2_PUBLIC_URL_BASE === 'https://your-r2-public-bucket-url.r2.dev' ? 'Please configure R2_PUBLIC_URL_BASE in the script' : ''}
            >
			{#if isLoading}
				<!-- Loading spinner -->
				<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
				Generating Data...
            {:else if !claudeApiUrl}
                Initializing...
			{:else}
				Generate JSON & Images
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
			<span class="block sm:inline"> Claude stream completed. Image generation may still be in progress.</span>
		</div>
	{/if}
    {#if isLoading}
         <div class="text-center text-gray-600 my-4">
             <p>Streaming data from Claude AI...</p>
             {#if receivedProps.length > 0 || metadata} <p class="text-sm">(Rendering results received so far)</p> {/if}
         </div>
    {/if}


	<!-- Display Metadata (if received) -->
	{#if metadata}
		<div class="mb-6 p-4 border rounded-lg shadow-sm bg-gray-50">
			<h2 class="text-xl font-semibold mb-2 text-gray-700">Metadata</h2>
			<p><strong>World Name (ID):</strong> {metadata.worldName || '(Not provided)'}</p>
			<p><strong>Timestamp:</strong> {metadata.timestampUTC || '(Not provided)'}</p>
            <!-- Display UserID used -->
            <p><strong>User ID (for images):</strong> {'frontendUser'}</p>
		</div>
	{/if}

	<!-- Display Received Props (as they arrive) -->
	<div class="space-y-6"> <!-- Increased spacing -->
         <h2 class="text-2xl font-semibold mb-3 text-gray-700 border-b pb-2">
            Received Props ({receivedProps.length})
        </h2>
		{#if receivedProps.length === 0 && !isLoading && !error && !isComplete}
             <p class="text-gray-500 italic">Enter a prompt and click 'Generate JSON & Images' to start.</p>
        {:else if receivedProps.length === 0 && isLoading}
             <p class="text-gray-500 italic">Waiting for the first prop data to arrive from Claude...</p>
		{/if}

		{#each receivedProps as propState, i (propState.id)}
            <!-- Use propState.id as the key -->
			<div class="border rounded-lg p-4 shadow-sm bg-white hover:shadow-md transition-shadow duration-150 animate-fade-in flex flex-col md:flex-row gap-4">
                <!-- Left side: Prop Details -->
				<div class="flex-1">
                    <h3 class="text-lg font-bold text-indigo-700 mb-2">{propState.propData.name || `Prop ${i + 1} (Unnamed)`}</h3>
                    <p class="text-gray-600 mb-2 text-sm">{propState.propData.description || 'No description.'}</p>
                    <div class="mb-2">
                        <strong class="text-sm text-gray-800">Colors:</strong>
                        {#if propState.propData.colors && propState.propData.colors.length > 0}
                           <!-- Color rendering logic (same as before) -->
                           <div class="flex flex-wrap gap-2 mt-1">
								{#each propState.propData.colors as colorObj}
                                    {#if typeof colorObj === 'object' && colorObj !== null}
                                        {#each Object.entries(colorObj) as [name, hex]}
                                            <span class="text-xs font-medium px-2.5 py-0.5 rounded border" title={hex}>
                                                <span class="inline-block w-3 h-3 rounded-full mr-1 border border-gray-300 align-middle" style="background-color: {typeof hex === 'string' ? hex : '#ffffff'};"></span>
                                                {name} ({typeof hex === 'string' ? hex : 'Invalid'})
                                            </span>
                                        {/each}
                                    {:else} <span class="text-xs text-red-500 italic">Invalid color format</span> {/if}
								{/each}
							</div>
                        {:else} <span class="text-sm text-gray-500 italic ml-2">None specified</span> {/if}
                    </div>
                    <div>
                        <strong class="text-sm text-gray-800">Transforms:</strong>
                        <span class="text-sm ml-2">{Array.isArray(propState.propData.transforms) ? propState.propData.transforms.length : 0} instance(s)</span>
                         {#if Array.isArray(propState.propData.transforms) && propState.propData.transforms.length > 0}
                            <details class="text-xs mt-1">
                                <summary class="cursor-pointer text-gray-600">Show Details</summary>
                                <pre class="bg-gray-100 p-2 rounded mt-1 overflow-x-auto"><code>{JSON.stringify(propState.propData.transforms, null, 2)}</code></pre>
                            </details>
                        {/if}
                    </div>
                </div>

                <!-- Right side: Image Generation Status & Result -->
                <div class="w-full md:w-48 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-4">
                    <strong class="text-sm text-gray-800 mb-2">Generated Image</strong>
                    {#if propState.imageStatus === 'idle'}
                        <div class="text-center p-4 bg-gray-50 rounded w-full">
                            <p class="text-xs text-gray-500">Waiting for data...</p>
                        </div>
                    {:else if propState.imageStatus === 'queued' || propState.imageStatus === 'generating' || propState.imageStatus === 'polling'}
                        <div class="text-center p-4 bg-blue-50 rounded w-full">
                            <svg class="animate-spin h-6 w-6 text-blue-600 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <p class="text-xs text-blue-700 animate-pulse">{propState.statusMessage || 'Generating...'}</p>
                             {#if propState.imageStatus === 'polling' || propState.imageStatus === 'generating'}
                                <p class="text-xs text-gray-500 mt-1">(Attempt {propState.attempts})</p>
                             {/if}
                        </div>
                    {:else if propState.imageStatus === 'success' && propState.imageUrl}
                        <div class="w-full h-32 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                             <img src={propState.imageUrl} alt="Generated image for {propState.propData.name}" class="object-contain w-full h-full" loading="lazy"/>
                        </div>
                         <p class="text-xs text-green-600 mt-1">{propState.statusMessage || 'Success'}</p>
                    {:else if propState.imageStatus === 'failed' || propState.imageStatus === 'error_enqueue'}
                         <div class="text-center p-4 bg-red-50 rounded w-full">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"> <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> </svg>
                            <p class="text-xs text-red-700">Failed</p>
                            <p class="text-xs text-red-600 mt-1 break-words">{propState.statusMessage || 'An unknown error occurred.'}</p>
                        </div>
                    {/if}
                </div>
			</div>
		{/each}
	</div>

</div>

<style>
	/* Simple fade-in animation for new props */
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
        animation: fadeIn 0.5s ease-out forwards;
    }

	body {
		font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
	}
    pre {
        white-space: pre-wrap;
        word-wrap: break-word;
    }
    /* Ensure images don't exceed their container */
    img {
        max-width: 100%;
        height: auto;
        display: block; /* Prevents bottom space */
    }
</style>