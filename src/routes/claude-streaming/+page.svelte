<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores'; // Import the page store
	import oboe from 'oboe';

	// --- Reactive State Variables ---
	let receivedProps: any[] = []; // Array to hold fully received prop objects
	let metadata: any | null = null; // To store the metadata part
	let isLoading: boolean = false; // Flag for loading state
	let error: string | null = null; // To store any error message
	let isComplete: boolean = false; // Flag for stream completion
	let userPrompt: string = 'a dinosaur park'; // Default prompt

	// --- API URL (to be set in onMount) ---
	let claudeApiUrl: string = ''; // Initialize as empty, will be set on mount

	// --- Set API URL on Component Mount ---
	onMount(() => {
		// Access hostname via the page store's url property
		const hostname = $page.url.hostname;
		let dev = false;

		if (hostname.includes('localhost') || hostname === '127.0.0.1') {
			dev = true;
            console.log('Detected localhost environment.');
		} else {
            console.log('Detected hosted environment:', hostname);
			dev = false;
		}

        // Set the API URL based on the environment
		claudeApiUrl = dev ? 'https://madmods.world/api/ai/claude-streaming' : '/api/ai/claude-streaming';
        console.log('API URL set to:', claudeApiUrl);
	});

	// --- Function to Start Streaming (Triggered by Button) ---
	function startStreaming() {
        if (!claudeApiUrl) {
            console.error("API URL not set. Cannot start streaming.");
            error = "Initialization error: API URL not available.";
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

		// --- Populate Request Body ---
        // Ensure this matches the fields expected by your backend endpoint
        // (e.g., the Cloudflare function expecting { prompt: string, model?: string, etc. })
		const requestBody = {
			prompt: userPrompt
            // You could add other fields here if needed and if your backend supports them:
            // model: "claude-3-opus-20240229",
            // max_tokens: 4096,
            // system: "Optional system prompt override"
		};

		console.log("Sending request body:", requestBody);

		oboe({
			url: claudeApiUrl, // Use the URL set in onMount
			method: 'POST',
			body: requestBody, // Send the populated request body
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json' // Oboe expects JSON stream
			},
			cached: false,
			withCredentials: false
		})
			.node('metadata', (meta:any) => {
				console.log('Received Metadata:', meta);
				metadata = meta;
			})
			.node('propCategories.*.props[*]', (propObject:any) => {
				if (propObject && typeof propObject === 'object' && propObject.name) {
					console.log('Received Prop Object:', propObject.name);
					receivedProps = [...receivedProps, propObject];
				} else {
					console.warn('Received incomplete or invalid prop object:', propObject);
				}
			})
			.done((finalJson:any) => {
				console.log('Stream finished successfully.');
				if (!finalJson || !finalJson.metadata || !finalJson.propCategories) {
					console.warn("Stream finished, but final JSON structure seems incomplete:", finalJson);
					if (!error) {
						error = "Stream finished, but the final data structure might be incomplete.";
					}
                    isComplete = false; // Don't mark as fully complete if structure is suspicious
				} else {
                    if (!error) { // Don't mark complete if an error occurred during streaming
                        isComplete = true;
                    }
                }
                isLoading = false;
			})
			.fail((errorReport:any) => {
				console.error('Stream processing failed:', errorReport);
				isLoading = false;
                isComplete = false;
                let errorMessage = `Stream failed: ${errorReport.statusCode || 'Network Error'}. `;
                if (errorReport.body) {
                    try {
                        const parsedBody = JSON.parse(errorReport.body);
                        errorMessage += parsedBody.error || parsedBody.message || parsedBody.details || errorReport.body;
                    } catch(e) {
                        errorMessage += errorReport.body; // Show raw body if not JSON
                    }
                } else if (errorReport.thrown) {
                    errorMessage += (errorReport.thrown as Error).message || 'Client-side error during request';
                }
				error = errorMessage;
			});
	}

</script>

<svelte:head>
    <title>Claude Stream Parser</title>
</svelte:head>

<div class="container mx-auto p-6 font-sans">
	<h1 class="text-3xl font-bold mb-6 text-gray-800">Claude JSON Stream Generator</h1>

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
         <p class="text-xs text-gray-500 mt-1">Enter a description and the AI will attempt to generate structured JSON data.</p>
    </div>

    <!-- Generate Button -->
	<div class="mb-6">
		<button
			on:click={startStreaming}
			disabled={isLoading || !claudeApiUrl} 
			class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out shadow-md disabled:cursor-not-allowed">
			{#if isLoading}
				<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
				Generating...
            {:else if !claudeApiUrl}
                Initializing...
			{:else}
				Generate JSON
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
			<span class="block sm:inline"> Stream completed. Check results below.</span>
		</div>
	{/if}
    {#if isLoading}
         <div class="text-center text-gray-600 my-4">
             <p>Streaming data from AI...</p>
             {#if receivedProps.length > 0 || metadata}
                <p class="text-sm">(Rendering results received so far)</p>
             {/if}
         </div>
    {/if}


	<!-- Display Metadata (if received) -->
	{#if metadata}
		<div class="mb-6 p-4 border rounded-lg shadow-sm bg-gray-50">
			<h2 class="text-xl font-semibold mb-2 text-gray-700">Metadata</h2>
			<p><strong>World Name:</strong> {metadata.worldName || '(Not provided)'}</p>
			<p><strong>Timestamp:</strong> {metadata.timestampUTC || '(Not provided)'}</p>
		</div>
	{/if}

	<!-- Display Received Props (as they arrive) -->
	<div class="space-y-4">
         <h2 class="text-2xl font-semibold mb-3 text-gray-700 border-b pb-2">
            Received Props ({receivedProps.length})
        </h2>
		{#if receivedProps.length === 0 && !isLoading && !error}
             <p class="text-gray-500 italic">Enter a prompt and click 'Generate JSON' to start.</p>
        {:else if receivedProps.length === 0 && isLoading}
             <p class="text-gray-500 italic">Waiting for the first prop data to arrive...</p>
		{/if}

		{#each receivedProps as prop, i (prop.name || i)}
            <!-- Render prop details (same as previous example) -->
			<div class="border rounded-lg p-4 shadow-sm bg-white hover:shadow-md transition-shadow duration-150 animate-fade-in">
				<h3 class="text-lg font-bold text-indigo-700 mb-2">{prop.name || `Prop ${i + 1} (Unnamed)`}</h3>
				<p class="text-gray-600 mb-2 text-sm">{prop.description || 'No description.'}</p>
				<div class="mb-2">
					<strong class="text-sm text-gray-800">Colors:</strong>
					{#if prop.colors && prop.colors.length > 0}
						<div class="flex flex-wrap gap-2 mt-1">
							{#each prop.colors as colorObj}
                                {#if typeof colorObj === 'object' && colorObj !== null}
                                    {#each Object.entries(colorObj) as [name, hex]}
                                        <span class="text-xs font-medium px-2.5 py-0.5 rounded border" title={hex}>
                                            <span
                                                class="inline-block w-3 h-3 rounded-full mr-1 border border-gray-300 align-middle"
                                                style="background-color: {typeof hex === 'string' ? hex : '#ffffff'};"
                                            ></span>
                                            {name} ({typeof hex === 'string' ? hex : 'Invalid'})
                                        </span>
                                    {/each}
                                {:else}
                                     <span class="text-xs text-red-500 italic">Invalid color format</span>
                                {/if}
							{/each}
						</div>
					{:else}
						<span class="text-sm text-gray-500 italic ml-2">None specified</span>
					{/if}
				</div>
				<div>
					<strong class="text-sm text-gray-800">Transforms:</strong>
					<span class="text-sm ml-2">{Array.isArray(prop.transforms) ? prop.transforms.length : 0} instance(s)</span>
                    {#if Array.isArray(prop.transforms) && prop.transforms.length > 0}
                        <details class="text-xs mt-1">
                            <summary class="cursor-pointer text-gray-600">Show Details</summary>
                            <pre class="bg-gray-100 p-2 rounded mt-1 overflow-x-auto"><code>{JSON.stringify(prop.transforms, null, 2)}</code></pre>
                        </details>
                    {/if}
				</div>
			</div>
		{/each}
	</div>

</div>

<style>
	/* Simple fade-in animation for new props */
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
        animation: fadeIn 0.3s ease-out forwards;
    }

	body {
		font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
	}
    pre {
        white-space: pre-wrap;
        word-wrap: break-word;
    }
</style>