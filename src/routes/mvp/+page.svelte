<!-- src/routes/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	// *** Adjust this import path if your utility file name/location changed ***
	import { processSceneData } from '$lib/utils/aiProcessing';
	// Ensure SceneProp is exported if needed here, or adjust type for sceneData
	import type { ProcessResult, SceneProp } from '$lib/utils/aiProcessing';
	import ImageModal from '$lib/components/ImageModal.svelte';
	import ModelViewer from '$lib/components/ModelViewer.svelte';

	let isProcessing = false;
	let results: ProcessResult[] = [];
	let progressLog: string[] = [];
	let processingCount = 0; // Track how many are currently processed for the button text

	let World_JsonURL: string =
		'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/worlds/testuser/world1/json/world.json';
	// Use SceneProp[] if the structure matches, otherwise use any[] and ensure compatibility with processSceneData
	let sceneData: SceneProp[] = []; // Initialize as SceneProp array

	// Modal State
	let showImageModal = false;
	let showModelModal = false;
	let modalImageUrl = '';
	let modalModelUrl = '';
	let currentPropNameForModal: string | null = null; // For alt text / title

	onMount(async () => {
		loadWorld();
	});

	async function parseJsonFromUrl(url: string) {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
			}
			const jsonData = await response.json();
			return jsonData;
		} catch (error) {
			console.error('Failed to fetch or parse JSON:', error);
			throw error;
		}
	}

	async function loadScene(jsonFileUrl: string) {
		console.log(`Attempting to load scene data from: ${jsonFileUrl}`);
		try {
			// Assuming the JSON directly contains an array compatible with SceneProp[]
			const loadedData = await parseJsonFromUrl(jsonFileUrl);
			if (!Array.isArray(loadedData)) {
				throw new Error('Loaded data is not an array');
			}
			// Ensure loaded data items have at least 'name' and 'description'
			const validatedData = loadedData.filter(
				(item): item is SceneProp => typeof item?.name === 'string' && typeof item?.description === 'string'
			);
			if (validatedData.length !== loadedData.length) {
				console.warn('Some items in the loaded JSON did not match the SceneProp structure.');
			}
			return validatedData;
		} catch (error: any) {
			console.error('Could not load scene data:', error.message);
			return []; // Return empty array on error
		}
	}

	async function loadWorld() {
		console.log('loading world json');
		let data = await loadScene(World_JsonURL);
		// Assign the first 3 items or fewer if data is shorter
		sceneData = data.slice(0, 5);
		console.log('Loaded sceneData:', sceneData);
	}

	async function startProcessing() {
		if (isProcessing) return;
		if (sceneData.length === 0) {
			console.warn('No scene data loaded to process.');
			progressLog = ['Error: No scene data loaded. Please check the JSON URL.'];
			return;
		}

		isProcessing = true;
		processingCount = 0;
		results = [];
		progressLog = ['Processing started...'];

		// Use your desired User/World IDs
		const userID = 'testuser';
		const worldID = 'world3'; // Make sure this matches R2 structure if needed

		try {
			results = await processSceneData(sceneData, userID, worldID, handleProgressUpdate);
			console.log('Final Results:', results);
		} catch (error: any) {
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
		console.log(message);
		progressLog = [...progressLog, message];
		if (status.includes('_stage_')) {
			processingCount = index + 1;
		}
	}

	// Modal Control Functions
	function openImageModal(url: string, propName: string) {
		if (!url) return;
		modalImageUrl = url;
		currentPropNameForModal = propName;
		showImageModal = true;
		showModelModal = false;
	}

	function openModelModal(url: string, propName: string) {
		if (!url) return;
		modalModelUrl = url;
		currentPropNameForModal = propName;
		showModelModal = true;
		showImageModal = false;
	}

	// This function is now passed as the onClose prop
	function closeModals() {
		showImageModal = false;
		showModelModal = false;
		currentPropNameForModal = null;
	}
</script>

<!-- Main Page Structure (Tailwind classes assumed from previous examples) -->
<div class="container mx-auto p-4 md:p-8 space-y-8">
	<h1 class="text-3xl font-bold text-gray-800">Scene Prop AI Processing</h1>
	<p class="text-gray-600 max-w-2xl">
		This tool processes scene props by calling backend APIs to generate and store images (Replicate)
		and 3D models (Stability AI) in Cloudflare R2. It applies rate limiting between API calls and
		automatically retries on rate limit errors (429).
	</p>

	<!-- Start Button -->
	<div>
		<button
			on:click={startProcessing}
			disabled={isProcessing || sceneData.length === 0}
			class="px-6 py-3 text-white font-semibold rounded-md shadow-md transition duration-200 ease-in-out {isProcessing || sceneData.length === 0
				? 'bg-gray-400 cursor-not-allowed'
				: 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50'}"
			title={sceneData.length === 0 ? 'Load scene data first' : ''}
		>
			{#if isProcessing}
				<svg
					class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					><circle
						class="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
					></circle><path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path></svg
				>
				Processing {processingCount} / {sceneData.length}...
			{:else if sceneData.length > 0}
				Start Processing All {sceneData.length} Props
			{:else}
				Load Data First
			{/if}
		</button>
	</div>

	<!-- Progress Log -->
	{#if progressLog.length > 1}
		<div class="mt-6 border border-gray-200 rounded-lg shadow-sm overflow-hidden">
			<h2 class="text-xl font-semibold text-gray-700 p-4 bg-gray-50 border-b border-gray-200">
				Progress Log:
			</h2>
			<ul class="max-h-80 overflow-y-auto p-4 space-y-1 text-sm font-mono text-gray-600">
				{#each progressLog as logEntry, i (i)}
					<li class="whitespace-pre-wrap border-b border-gray-100 pb-1 last:border-b-0">
						{logEntry}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Results Table -->
	{#if results.length > 0}
		<div class="mt-8">
			<h2 class="text-xl font-semibold text-gray-700 mb-4">Results:</h2>
			<div class="overflow-x-auto shadow-md rounded-lg border border-gray-200">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th
								scope="col"
								class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>#</th
							>
							<th
								scope="col"
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>Prop Name</th
							>
							<th
								scope="col"
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>Status</th
							>
							<th
								scope="col"
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>Image</th
							>
							<th
								scope="col"
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>Model</th
							>
							<th
								scope="col"
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>Error</th
							>
							<th
								scope="col"
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
								>Details</th
							>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each results as result, i (result?.propName || i)}
							{#if result}
								<tr
									class="{result.status === 'success' ? 'bg-green-50 hover:bg-green-100' : 'bg-red-50 hover:bg-red-100'} transition-colors duration-150"
								>
									<td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{i + 1}</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"
										>{result.propName}</td
									>
									<td
										class="px-6 py-4 whitespace-nowrap text-sm font-semibold {result.status === 'success' ? 'text-green-600' : 'text-red-600'}"
									>
										{result.status.replace('_', ' ').toUpperCase()}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
										{#if result.imagePublicUrl}
											<button
												on:click={() => openImageModal(result.imagePublicUrl!, result.propName)}
												class="text-blue-600 hover:text-blue-800 hover:underline disabled:text-gray-400 disabled:no-underline"
												disabled={!result.imagePublicUrl}
												aria-label="View generated image for {result.propName}"
											>
												View Image
											</button>
										{:else if result.status === 'success' || result.status === 'model_failed'}
											(Generated)
										{:else}
											-
										{/if}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
										{#if result.modelPublicUrl}
											<!-- *** This button was added *** -->
											<button
												on:click={() => openModelModal(result.modelPublicUrl!, result.propName)}
												class="text-blue-600 hover:text-blue-800 hover:underline disabled:text-gray-400 disabled:no-underline"
												disabled={!result.modelPublicUrl}
												aria-label="View generated 3D model for {result.propName}"
											>
												View Model
											</button>
										{:else if result.status === 'success'}
											(Generated)
										{:else}
											-
										{/if}
									</td>
									<td class="px-6 py-4 text-sm text-red-700">{result.error || ''}</td>
									<td class="px-6 py-4 text-xs text-gray-500 break-all"
										>{result.errorDetails || ''}</td
									>
								</tr>
							{:else}
								<!-- Optional: Row for items perhaps not yet processed -->
								<!-- <tr class="bg-gray-50"><td class="px-4 py-4 text-sm text-gray-400">{i+1}</td><td class="px-6 py-4 text-sm text-gray-400 italic">(Not Processed Yet)</td><td colspan="5"></td></tr> -->
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<!-- Render Modals Conditionally -->
{#if showImageModal}
	<ImageModal
		imageUrl={modalImageUrl}
		altText="Generated image for {currentPropNameForModal || 'prop'}"
		onClose={closeModals}
	/>
{/if}

{#if showModelModal}
	<ModelViewer modelUrl={modalModelUrl} onClose={closeModals} />
{/if}