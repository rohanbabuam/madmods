<script lang="ts">
	import { onMount } from 'svelte';
	import { processSceneData } from '$lib/utils/aiProcessing';
	import type { ProcessResult, SceneProp } from '$lib/utils/aiProcessing';
	import ImageModal from '$lib/components/ImageModal.svelte';
	import ModelViewer from '$lib/components/ModelViewer.svelte';

	// --- Existing Scene Processing State ---
	let isProcessing = false;
	let results: ProcessResult[] = [];
	let progressLog: string[] = [];
	let processingCount = 0;

	let World_JsonURL: string =
		'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/worlds/testuser/dino-world/dino-world.json';
        // ... other URLs
	let sceneData: SceneProp[] = [];

	// Modal State
	let showImageModal = false;
	let showModelModal = false;
	let modalImageUrl = '';
	let modalModelUrl = '';
	let currentPropNameForModal: string | null = null;

	// --- New Anthropic Integration State ---
	let anthropicPrompt = '';
	let anthropicResponseData: any = null;
	let anthropicError: string | null = null;
	let isAnthropicLoading = false;

	let system_prompt = `You will assist in designing a detailed 3D game environment for a game idea that will be prompted by the user. The user prompt will describe the game world and can be anything from a simple & short sentence to a complex and detailed paragraph. Enhance and expand the scope of the user prompt with your creativity.
You need to identify all the 3D props needed to create the 3D game environment and output a well structured JSON that specifies each prop by its name, description and world space transform i.e translation, rotation and scale. Use centimetres for position and scale, and degrees for rotation. Assume that each 3D prop will have its pivot at the center of its bounding box. Specify 3D props as objects and not as parts of objects. Assume that the ground is a flat plane positioned at (0,0,0) and scaled to (1000,1,1000). Don't include the ground plane in the JSON, assume it will be present in the scene by default. It is very important to use centimeters as the units for position and scale. Also, for each listed 3D prop, include all the solid colors as hex codes that will be used for the different parts of the 3D prop.
The description of each prop should include its a descriptive name, color of the different parts of the object in natural language and also pose where applicable. Include hex color codes of the colors as a separate key in each prop section of the json. ex: "colors" : {"orange":<hexcode>, "light purple":<hexcode>}
If you're describing props that may have small complex parts, specify them with very simple shapes. for example, a tree can be described as having its parts top part made from low poly blobs rather than with leaves. Apply the same concept for any prop that can have complex geometry.
If there are multiple types of 3d props belonging to the same category, categorize them by their object type and follow the naming convention - <objectType> followed by hyphen followed by <number>. For example, if there are three types of trees, they should all be listed under trees category and named tree-1, tree-2 and tree-3. Types can even be similar objects with different colors, posses, species, shapes, sizes, varieties of design etc.,
If there are going to be multiple instances of the same 3D prop, specify them as additional transforms under the same prop and not as separate duplicate 3D props. When appropriate, make the instances with variations in rotation and scale so that the 3D environment looks more varied and natural.
None of the 3D props will be animated. Also do not specify any textures for the 3D props, only solid color materials should be used.
The list of 3d props, their various types and number of instances must be extensive and well thought out in order to make the game environment complete in terms of functionality, decoration, aesthetics, fun, and engagement purposes. If the 3D game environment is sparsely populated it will make for a bad experience. The 3D game environment must look well populated and full of fun elements.
here is a sample json format needed. strictly follow this same format.
{
  "metadata": {
    "worldName": <name of world>,
    "timestampUTC": "current utc timestamp",
  },
  "propCategories": {
	"category": {
	  "name": <category_name>,
	  "props":[
		  {
			"name": <propName-1>,
			"description": <description of prop>,
			"colors" : [{<color_name>: <color_hex_code>}, {<color_name>: <color_hex_code>}],
			"transforms": [
			  { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] },
			  { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] }
			  .
			  .
			  .
			]
		  },
		  {
			"name": <propName->",
			"description": <description of prop>,
			"colors" : [{<color_name>: <color_hex_code>}, {<color_name>: <color_hex_code>}],
			"transforms": [
			  { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] }
			  .
			  .
			  .
			]
		  }
		  .
		  .
		  .
		]
	},
	"category": {
	  "name": <category_name>,
	  "props":[
		  {
			"name": <propName-1>,
			"description": "description of prop",
			"colors" : [{<color_name>: <color_hex_code>}],
			"transforms": [
			   { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] }
			   .
			   .
			   .
			]
		  },
		  {
			"name": <propName-2>,
			"description": <description of prop>,
			"colors" : [{<color_name>: <color_hex_code>}, {<color_name>: <color_hex_code>}, {<color_name>: <color_hex_code>}],
			"transforms": [
			  { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] }
			  .
			  .
			  .
			]
		  }
		  .
		  .
		  .
		]
	},
  },
}
Consider player navigability, accessibility to in-game elements, interactions, collisions and overlaps when designing the layout of the 3d environment. Some props may need to overlap in order to achieve the desired effect - grass, bushes etc., for example, or even some solid objects that need to be gorunded with their base extending slightly under the ground plane.
The game uses a low poly stlye with solid colored models.
The game will be for kids aged 6 to 18 years. so make 100% sure that there is strictly no inappropriate content. This is very important.
If in doubt, assume the most sensible approach and continue.
In the output json, include scene level metadata like name of the world and timestamp of creation in UTC. The name of the world should be presentable/marketable and not include words like low-poly, stylized, kid-firendly etc.,
The JSON should be well formed and valid for parsing with code. Do not add comments in the output JSON.

Return only the JSON in your response so that it can be automatically processed. Do not include any additional text.
`

	onMount(async () => {
		loadWorld(); // Keep existing world loading
	});

	function extractTrailingJson(str:string) {
		if (!str || typeof str !== 'string') {
			return null; // Return null for invalid input
		}

		let firstBrace = str.indexOf('{');
		let firstBracket = str.indexOf('[');
		let startIndex = -1;

		// Determine the first potential starting index
		if (firstBrace === -1 && firstBracket === -1) {
			return null; // No '{' or '[' found anywhere
		} else if (firstBrace === -1) {
			startIndex = firstBracket;
		} else if (firstBracket === -1) {
			startIndex = firstBrace;
		} else {
			// Both '{' and '[' exist, start searching from the earliest one
			startIndex = Math.min(firstBrace, firstBracket);
		}

		// Iterate through the string starting from the first potential JSON character
		while (startIndex !== -1) {
			const potentialJson = str.substring(startIndex);
			try {
			// Attempt to parse the substring
			const parsed = JSON.parse(potentialJson);

			// Check if the parsed result is an object or array
			// (JSON.parse can also parse primitives like "1", "true", "\"string\"")
			// We only want objects or arrays as per the typical "trailing JSON" use case.
			if (typeof parsed === 'object' && parsed !== null) {
				// Successfully parsed an object or array from this point to the end
				return potentialJson;
			}
			// If it parsed but wasn't an object/array, we continue searching

			} catch (e) {
			// JSON.parse failed. This means the JSON didn't start *here*.
			// Keep searching for the next potential start.
			}

			// Find the *next* '{' or '[' after the current startIndex
			let nextBrace = str.indexOf('{', startIndex + 1);
			let nextBracket = str.indexOf('[', startIndex + 1);

			// Determine the next startIndex to try
			if (nextBrace === -1 && nextBracket === -1) {
			startIndex = -1; // No more potential starts found
			} else if (nextBrace === -1) {
			startIndex = nextBracket;
			} else if (nextBracket === -1) {
			startIndex = nextBrace;
			} else {
			startIndex = Math.min(nextBrace, nextBracket);
			}
		}

		// If the loop finished without returning, no valid trailing JSON was found
		return null;
		}
	// --- Anthropic API Call Function ---
	async function callAnthropicApi() {
		if (!anthropicPrompt.trim()) {
			anthropicError = 'Please enter a prompt.';
			return;
		}

		isAnthropicLoading = true;
		anthropicResponseData = null;
		anthropicError = null;

		try {
			const response = await fetch('/api/ai/claude', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					prompt: anthropicPrompt,
					system: system_prompt
				})
			});

			if (!response.ok) {
				const errorDetails:any = await response.json(); // Attempt to get error details from server
				throw new Error(`API call failed: ${response.status} ${errorDetails.error || response.statusText} - ${errorDetails.details || ''}`);
			}

			const data = await response.json();
			anthropicResponseData = data;

			let SceneJson = anthropicResponseData.content[0].text;
			let splitJSON:any = extractTrailingJson(SceneJson);
			let cleanJson = removeCommentsFromJson(splitJSON);
			
			let allProps = getPropsFromJSON(cleanJson);
			console.log(allProps);

			//start processing
			//sceneData = allProps;

		} catch (error: any) {
			console.error('Error calling Anthropic API:', error);
			anthropicError = `Error: ${error.message}`;
		} finally {
			isAnthropicLoading = false;
		}
	}

	// --- Existing Scene Processing Functions (keep as is) ---
	function removeCommentsFromJson(jsonString:string) {
		if (typeof jsonString !== 'string') {
			throw new TypeError("Input must be a string.");
		}
		const regex = /("(\\.|[^"\\])*"|'(\\.|[^'\\])*')|(\/\/.*|\/\*[\s\S]*?\*\/)/g;
		return jsonString.replace(regex, (match, group1) => {
			return group1 ? match : '';
		});
	}

	function getPropsFromJSON(json:any){
		let parsedData;
            try {
                parsedData = JSON.parse(json);
            } catch (parseError:any) {
                console.error("Invalid JSON string:", parseError.message);
                throw new Error(`Failed to parse JSON string: ${parseError.message}`);
            }

            if (!parsedData || typeof parsedData !== 'object' || !parsedData.propCategories || typeof parsedData.propCategories !== 'object') {
                throw new Error("Invalid JSON structure: Missing or invalid 'propCategories' object.");
            }

            const allProps = [];
            const categories = parsedData.propCategories;
            for (const categoryKey in categories) {
                if (Object.prototype.hasOwnProperty.call(categories, categoryKey)) {
                    const category = categories[categoryKey];
                    if (!category || typeof category !== 'object' || !Array.isArray(category.props)) {
                        console.warn(`Skipping invalid category structure for key: ${categoryKey}`);
                        continue;
                    }
                    allProps.push(...category.props);
                }
            }
            console.log(`Successfully parsed ${allProps.length} props.`);
            return allProps;
	}
    async function fetchAndFlattenProps(jsonFileURL:string) {
        console.log(`Fetching prop data from: ${jsonFileURL}`);
        try {
            const response = await fetch(jsonFileURL);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
            }
            const jsonDataString = await response.text();
			const cleanedJsonString = removeCommentsFromJson(jsonDataString);
            console.log("Successfully fetched data.");

            let parsedData;
            try {
                parsedData = JSON.parse(cleanedJsonString);
            } catch (parseError:any) {
                console.error("Invalid JSON string:", parseError.message);
                throw new Error(`Failed to parse JSON string: ${parseError.message}`);
            }

            if (!parsedData || typeof parsedData !== 'object' || !parsedData.propCategories || typeof parsedData.propCategories !== 'object') {
                throw new Error("Invalid JSON structure: Missing or invalid 'propCategories' object.");
            }

            const allProps = [];
            const categories = parsedData.propCategories;
            for (const categoryKey in categories) {
                if (Object.prototype.hasOwnProperty.call(categories, categoryKey)) {
                    const category = categories[categoryKey];
                    if (!category || typeof category !== 'object' || !Array.isArray(category.props)) {
                        console.warn(`Skipping invalid category structure for key: ${categoryKey}`);
                        continue;
                    }
                    allProps.push(...category.props);
                }
            }
            console.log(`Successfully parsed ${allProps.length} props.`);
            return allProps;

        } catch (error) {
            console.error(`Error fetching or parsing prop data from ${jsonFileURL}:`, error);
            throw error;
        }
    }

    async function loadProps(jsonUrl:string) {
        try {
            const flatProps = await fetchAndFlattenProps(jsonUrl);
            return flatProps;
        } catch (error) {
            console.error("Failed to load props:", error);
            return [];
        }
    }

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
			const loadedData = await parseJsonFromUrl(jsonFileUrl);
			if (!Array.isArray(loadedData)) {
				throw new Error('Loaded data is not an array');
			}
			const validatedData = loadedData.filter(
				(item): item is SceneProp => typeof item?.name === 'string' && typeof item?.description === 'string'
			);
			if (validatedData.length !== loadedData.length) {
				console.warn('Some items in the loaded JSON did not match the SceneProp structure.');
			}
			return validatedData;
		} catch (error: any) {
			console.error('Could not load scene data:', error.message);
			return [];
		}
	}

	async function loadWorld() {
		console.log('loading world json');
		let data = await loadProps(World_JsonURL);
		console.log(data);
		sceneData = data.slice(0, 5); // Limit to first 5 for demo
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

		const userID = 'testuser';
		const worldID = 'world3';

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

	function closeModals() {
		showImageModal = false;
		showModelModal = false;
		currentPropNameForModal = null;
	}
</script>

<div class="container mx-auto p-4 md:p-8 space-y-8">

	<!-- New Anthropic Prompt Section -->
	<div class="space-y-4">
		<h1 class="text-3xl font-bold text-gray-800">What do you want to build?</h1>
		<div class="flex space-x-2">
			<input
				type="text"
				bind:value={anthropicPrompt}
				placeholder="Ex: a small dinosaur park"
				class="flex-grow p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
				disabled={isAnthropicLoading}
			/>
			<button
				on:click={callAnthropicApi}
				disabled={isAnthropicLoading || !anthropicPrompt.trim()}
				class="px-4 py-2 text-white font-semibold rounded-md shadow-md transition duration-200 ease-in-out {isAnthropicLoading || !anthropicPrompt.trim()
					? 'bg-gray-400 cursor-not-allowed'
					: 'bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50'}"
			>
				{#if isAnthropicLoading}
					<svg
						class="animate-spin h-5 w-5 text-white inline mr-2"
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
					Creating...
				{:else}
					Create
				{/if}
			</button>
		</div>
		{#if anthropicError}
			<p class="text-red-600 text-sm">{anthropicError}</p>
		{/if}
		{#if anthropicResponseData}
			<p class="text-green-600 text-sm">Response logged to console.</p>
		{/if}
	</div>

	<hr class="border-gray-300"> <!-- Separator -->

	<!-- Existing Scene Processing Section -->
	<h2 class="text-2xl font-bold text-gray-800">{sceneData.length} objects generated for your world</h2>

	<!-- Start Button -->
	<div>
		<button
			on:click={startProcessing}
			disabled={isProcessing || sceneData.length === 0}
			class="px-6 py-3 text-white font-semibold rounded-md shadow-md transition duration-200 ease-in-out {isProcessing || sceneData.length === 0
				? 'bg-gray-400 cursor-not-allowed'
				: 'bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50'}"
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
				start processing all {sceneData.length} objects
			{:else}
				First Create a World
			{/if}
		</button>
	</div>

	<!-- Progress Log -->
	{#if progressLog.length > 1}
		<div class="mt-6 border border-gray-200 rounded-lg shadow-sm overflow-hidden">
			<h2 class="text-xl font-semibold text-gray-700 p-4 bg-gray-50 border-b border-gray-200">
				Processing Log:
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