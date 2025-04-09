<!-- src/routes/+page.svelte -->
<script lang="ts">
    import { onMount } from "svelte";
	// *** Adjust this import path if your utility file name/location changed ***
	import { processSceneData } from '$lib/utils/aiProcessing';
	import type { SceneProp, ProcessResult } from '$lib/utils/aiProcessing';

	let isProcessing = false;
	let results: ProcessResult[] = [];
	let progressLog: string[] = [];
    let processingCount = 0; // Track how many are currently processed for the button text

    let World_JsonURL:string = "https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/worlds/testuser/world1/json/world.json"
	let sceneData: any[] = [];

    onMount(async () => {
		loadWorld();
	});

    async function parseJsonFromUrl(url:string) {
        try {
        // 1. Fetch the resource from the network
        const response = await fetch(url);
    
        // 2. Check if the request was successful (status code 200-299)
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
        }
    
        // 3. Parse the response body as JSON
        const jsonData = await response.json();
    
        // 4. Return the parsed data
        return jsonData;
    
        } catch (error) {
        // 5. Handle potential errors (network issues, parsing errors, etc.)
        console.error('Failed to fetch or parse JSON:', error);
        // Re-throw the error so the calling code can handle it
        throw error;
        }
    }

    let loadScene = async (jsonFileUrl:string) => {
    console.log(`Attempting to load scene data from: ${jsonFileUrl}`);
    try {
      const sceneData:any = await parseJsonFromUrl(jsonFileUrl);
      return sceneData;
      //console.log("Scene data loaded successfully:");
      //console.log(sceneData);
    } catch (error:any) {
      console.error("Could not load scene data:", error.message);
      // Handle the error appropriately (e.g., show an error message to the user)
    }
}
	async function loadWorld(){
		console.log('loading world json')
        let data = await loadScene(World_JsonURL);
        sceneData = data.slice(0, 3);
		console.log(sceneData);
	}



	async function startProcessing() {
		if (isProcessing) return;
		isProcessing = true;
        processingCount = 0; // Reset counter
		results = []; // Clear previous results
		progressLog = ['Processing started...']; // Reset log

		// Replace with actual dynamic IDs from user session or context
		const userID = 'testuser';
		const worldID = 'world2';

		try {
            // Call the main orchestration function
			results = await processSceneData(sceneData, userID, worldID, handleProgressUpdate);
             console.log("Final Results:", results);
		} catch (error: any) {
            // Catch unexpected errors during the orchestration itself
			console.error('An unexpected error occurred during the orchestration process:', error);
			progressLog = [...progressLog, `FATAL ORCHESTRATION ERROR: ${error.message}`];
		} finally {
			isProcessing = false;
			progressLog = [...progressLog, 'Processing finished. Check console and results table.'];
		}
	}

    // Callback function to handle progress updates from the orchestrator
	function handleProgressUpdate(
        index: number,
        total: number,
        stage: 'image' | 'model',
        propName: string,
        status: string // Detailed status from orchestrator
    ) {
		const message = `[${index + 1}/${total}] ${stage.toUpperCase()} - ${propName} - ${status}`;
		console.log(message); // Log detailed status to console
		progressLog = [...progressLog, message]; // Add to reactive log displayed on page
        // Update counter when a stage finishes (success or fail) for button text
        if (status.includes('_stage_')) {
            processingCount = index + 1;
        }
	}
</script>

<div class="container mx-auto p-4 md:p-8 space-y-8">

    <h1 class="text-3xl font-bold text-gray-800">Scene Prop AI Processing</h1>

    <p class="text-gray-600 max-w-2xl">
        This tool processes scene props by calling backend APIs to generate and store images (Replicate) and 3D models (Stability AI) in Cloudflare R2.
        It applies rate limiting between API calls and automatically retries on rate limit errors (429).
    </p>

    <div>
        <button
            on:click={startProcessing}
            disabled={isProcessing}
            class="px-6 py-3 text-white font-semibold rounded-md shadow-md transition duration-200 ease-in-out
                   {isProcessing
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50'}"
        >
            {#if isProcessing}
                 <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing {processingCount} / {sceneData.length}...
            {:else}
                Start Processing All {sceneData.length} Props
            {/if}
        </button>
    </div>


    {#if progressLog.length > 1}
        <div class="mt-6 border border-gray-200 rounded-lg shadow-sm overflow-hidden">
             <h2 class="text-xl font-semibold text-gray-700 p-4 bg-gray-50 border-b border-gray-200">Progress Log:</h2>
             <ul class="max-h-80 overflow-y-auto p-4 space-y-1 text-sm font-mono text-gray-600">
                {#each progressLog as logEntry, i (i)}
                    <li class="whitespace-pre-wrap border-b border-gray-100 pb-1 last:border-b-0">{logEntry}</li>
                {/each}
            </ul>
        </div>
    {/if}


    {#if results.length > 0}
        <div class="mt-8">
            <h2 class="text-xl font-semibold text-gray-700 mb-4">Results:</h2>
            <div class="overflow-x-auto shadow-md rounded-lg border border-gray-200">
                 <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prop Name</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Error</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                         {#each results as result, i (result?.propName || i)}
                            {#if result}
                                <tr class="{result.status === 'success' ? 'bg-green-50 hover:bg-green-100' : 'bg-red-50 hover:bg-red-100'} transition-colors duration-150">
                                    <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{i + 1}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{result.propName}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold {result.status === 'success' ? 'text-green-600' : 'text-red-600'}">
                                        {result.status.replace('_', ' ').toUpperCase()}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {#if result.imagePublicUrl}
                                            <a href={result.imagePublicUrl} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 hover:underline">View Image</a>
                                        {:else if result.status === 'success' || result.status === 'model_failed'}
                                            (Generated)
                                        {:else}
                                            -
                                        {/if}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                         {#if result.modelPublicUrl}
                                            <a href={result.modelPublicUrl} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 hover:underline">View Model</a>
                                        {:else if result.status === 'success'}
                                            (Generated)
                                        {:else}
                                            -
                                        {/if}
                                    </td>
                                    <td class="px-6 py-4 text-sm text-red-700">{result.error || ''}</td>
                                    <td class="px-6 py-4 text-xs text-gray-500 break-all">{result.errorDetails || ''}</td>
                                </tr>
                            {:else}
                                 <!-- Optional: Row for items not yet processed if needed -->
                                 <!-- <tr class="bg-gray-50"><td class="px-4 py-4 text-sm text-gray-400">{i+1}</td><td class="px-6 py-4 text-sm text-gray-400 italic">(Pending/Skipped)</td><td colspan="5"></td></tr> -->
                            {/if}
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}

</div>

<!-- No <style> block needed when using Tailwind exclusively -->