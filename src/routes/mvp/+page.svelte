<script lang="ts">
	import { onMount } from 'svelte'; // Removed onDestroy as it wasn't used here
	import { processSceneData } from '$lib/utils/aiProcessing';
	import type { ProcessResult, SceneProp } from '$lib/utils/aiProcessing';
	import ImageModal from '$lib/components/ImageModal.svelte';
	import ModelViewer from '$lib/components/ModelViewer.svelte';
	import WorldViewerModal from '$lib/components/WorldViewerModal.svelte'; // Import the world viewer
	import type { WorldPropData } from '$lib/components/WorldViewerModal.svelte'; // Import the type

	// --- Scene Generation State ---
	let isAnthropicLoading = false;
	let anthropicPrompt = '';
	let anthropicResponseData: any = null; // Store the raw response if needed
    let parsedWorldName: string | null = null; // To store the world name from JSON
	let anthropicError: string | null = null;
	let sceneData: SceneProp[] = []; // Holds the prop definitions from Anthropic

	// --- Asset Processing State ---
	let isProcessing = false; // For image/model generation step
	let results: ProcessResult[] = []; // Results from processSceneData
	let progressLog: string[] = [];
	let processingCount = 0; // Count for the progress indicator

	// --- Modal Visibility State ---
	let showImageModal = false;
	let showModelModal = false;
	let showWorldViewerModal = false; // Controls the BabylonJS modal

	// --- Data for Modals ---
	let modalImageUrl = '';
	let modalModelUrl = '';
	let currentPropNameForModal: string | null = null;
	let worldViewerProps: WorldPropData[] = []; // Data prepared for the World Viewer

    // --- Button Visibility ---
    let showGenerateModelsButton = false; // Show after successful description generation
    let showViewWorldButton = false; // Show after successful model processing

	// --- Anthropic System Prompt ---
	// Ensure your system prompt is correctly defined here
	let system_prompt = `You will assist in designing a detailed 3D game environment for a game idea that will be prompted by the user. The user prompt will describe the game world and can be anything from a simple & short sentence to a complex and detailed paragraph. Enhance and expand the scope of the user prompt with your creativity.
You need to identify all the 3D props needed to create the 3D game environment and output a well structured JSON that specifies each prop by its name, description and world space transform i.e translation, rotation and scale. Use centimetres for position and scale, and degrees for rotation. Assume that each 3D prop will have its pivot at the center of its bounding box. Specify 3D props as objects and not as parts of objects. Assume that the ground is a flat plane positioned at (0,0,0) and scaled to (1000,1,1000). Don't include the ground plane in the JSON, assume it will be present in the scene by default. It is very important to use centimeters as the units for position and scale. Also, for each listed 3D prop, include all the solid colors as hex codes that will be used for the different parts of the 3D prop.
The description of each prop should include its a descriptive name, color of the different parts of the object in natural language and also pose where applicable. Include hex color codes of the colors as a separate key in each prop section of the json. ex: "colors" : [{"orange":"<hexcode>"}, {"light purple":"<hexcode>"}]
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
	"categoryName1": {
	  "name": "categoryName1",
	  "props":[
		  {
			"name": "<propName-1>",
			"description": "<description of prop>",
			"colors" : [{"<color_name>": "<color_hex_code>"}, {"<color_name>": "<color_hex_code>"}],
			"transforms": [
			  { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] },
			  { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] }
			]
		  },
		  {
			"name": "<propName-2>",
			"description": "<description of prop>",
			"colors" : [{"<color_name>": "<color_hex_code>"}],
			"transforms": [ { "translation": [x, y, z], "rotation": [x, y, z], "scale": [x, y, z] } ]
		  }
		]
	},
    "categoryName2": {
      "name": "categoryName2",
      "props": [ /* ... more props ... */ ]
    }
  }
}
Consider player navigability, accessibility to in-game elements, interactions, collisions and overlaps when designing the layout of the 3d environment. Some props may need to overlap in order to achieve the desired effect - grass, bushes etc., for example, or even some solid objects that need to be gorunded with their base extending slightly under the ground plane.
The game uses a low poly stlye with solid colored models.
The game will be for kids aged 6 to 18 years. so make 100% sure that there is strictly no inappropriate content. This is very important.
If in doubt, assume the most sensible approach and continue.
In the output json, include scene level metadata like name of the world and timestamp of creation in UTC. The name of the world should be presentable/marketable and not include words like low-poly, stylized, kid-firendly etc.,
The JSON should be well formed and valid for parsing with code. Do not add comments in the output JSON.

Return only the JSON in your response so that it can be automatically processed. Do not include any additional text.`;

	let World_JsonURL: string = 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/worlds/testuser/dino-world/dino-world.json';


	// onMount
	onMount(async () => {
		loadWorld(); // Keep existing world loading
	});
	

	async function fetchJSON(jsonFileURL:string) {
        console.log(`Fetching prop data from: ${jsonFileURL}`);
        try {
            const response = await fetch(jsonFileURL);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
            }
            const jsonDataString = await response.text();

			const potentialJson = extractTrailingJson(jsonDataString);
			if (!potentialJson) throw new Error("Could not extract valid JSON from the response text.");

			const cleanJson = removeCommentsFromJson(potentialJson);

            console.log("Successfully fetched data.");
			console.log(cleanJson);
			return cleanJson;
		}
		catch (error:any) {
            console.error(`Error fetching or parsing prop data from ${jsonFileURL}:`, error);
            throw error;
        }
	}

	async function loadWorld() {
		console.log('loading world json');
		let worldJson = await fetchJSON(World_JsonURL);
		let data = getPropsFromJSON(worldJson);
		sceneData = data.slice(0, 5); // Limit to first 5 for demo
		console.log('Loaded sceneData:', sceneData);
	}

	// --- Helper Functions ---

    // Extracts JSON from a string that might have leading text
	function extractTrailingJson(str:string): string | null {
		if (!str || typeof str !== 'string') return null;
		let firstBrace = str.indexOf('{');
		let firstBracket = str.indexOf('['); // Although our target is {}, check for [] just in case
		let startIndex = -1;

		if (firstBrace === -1 && firstBracket === -1) return null;
		else if (firstBrace === -1) startIndex = firstBracket;
		else if (firstBracket === -1) startIndex = firstBrace;
		else startIndex = Math.min(firstBrace, firstBracket);

		while (startIndex !== -1) {
			const potentialJson = str.substring(startIndex);
			try {
				const parsed = JSON.parse(potentialJson);
				if (typeof parsed === 'object' && parsed !== null) {
					return potentialJson; // Found valid object/array JSON
				}
			} catch (e) { /* Ignore parsing errors, continue search */ }

			// Find the *next* potential start after the current one
			let nextBrace = str.indexOf('{', startIndex + 1);
			let nextBracket = str.indexOf('[', startIndex + 1);

			if (nextBrace === -1 && nextBracket === -1) startIndex = -1;
			else if (nextBrace === -1) startIndex = nextBracket;
			else if (nextBracket === -1) startIndex = nextBrace;
			else startIndex = Math.min(nextBrace, nextBracket);
		}
		return null; // No valid trailing JSON object/array found
	}

    // Removes JS-style comments // /* */ from a JSON string
	function removeCommentsFromJson(jsonString:string): string {
		if (typeof jsonString !== 'string') {
            console.error("removeCommentsFromJson: Input must be a string.");
            return jsonString; // Return original on error
        }
        // This regex handles strings correctly to avoid removing comments inside strings
		const regex = /("(\\.|[^"\\])*"|'(\\.|[^'\\])*')|(\/\/.*|\/\*[\s\S]*?\*\/)/g;
		return jsonString.replace(regex, (match, group1) => group1 ? match : '');
	}

    // Parses the JSON string and extracts the flat list of props
	function getPropsFromJSON(jsonString: string): SceneProp[] {
		let parsedData: any;
		try {
			parsedData = JSON.parse(jsonString);
		} catch (parseError: any) {
			console.error("getPropsFromJSON: Invalid JSON string:", parseError.message);
			throw new Error(`Failed to parse JSON description: ${parseError.message}`);
		}

		if (!parsedData || typeof parsedData !== 'object' || !parsedData.propCategories || typeof parsedData.propCategories !== 'object') {
			throw new Error("Invalid JSON structure: Missing or invalid 'propCategories' object.");
		}

        // Extract metadata
        parsedWorldName = parsedData.metadata?.worldName ?? 'Unnamed World';
        console.log(`Parsed World Name: ${parsedWorldName}`);

		const allProps: SceneProp[] = [];
		const categories = parsedData.propCategories;

		for (const categoryKey in categories) {
			if (Object.prototype.hasOwnProperty.call(categories, categoryKey)) {
				const category = categories[categoryKey];
				// Basic validation for category structure
				if (!category || typeof category !== 'object' || !Array.isArray(category.props)) {
					console.warn(`Skipping invalid category structure for key: ${categoryKey}`);
					continue;
				}
                // Further validation for each prop within the category
                for(const prop of category.props) {
                    if(prop && typeof prop === 'object' && prop.name && prop.description && Array.isArray(prop.transforms) && prop.transforms.length > 0) {
                        allProps.push(prop as SceneProp);
                    } else {
                        console.warn(`Skipping invalid prop in category ${categoryKey}:`, prop);
                    }
                }
			}
		}
		console.log(`getPropsFromJSON: Successfully parsed ${allProps.length} props.`);
		return allProps;
	}

	// --- API Call to Anthropic ---
	async function callAnthropicApi() {
		if (!anthropicPrompt.trim()) {
			anthropicError = 'Please enter a description for your world.';
			return;
		}

		// Reset state for a new generation
		isAnthropicLoading = true;
		anthropicResponseData = null;
		anthropicError = null;
		sceneData = [];
		results = [];
        worldViewerProps = [];
		progressLog = [];
        showGenerateModelsButton = false;
        showViewWorldButton = false;
        parsedWorldName = null;

		try {
			console.log("Calling Anthropic API...");
			const response = await fetch('/api/ai/claude', { // Ensure this endpoint is correct
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: anthropicPrompt, system: system_prompt })
			});

			if (!response.ok) {
				let errorDetails = 'Could not retrieve error details.';
				try {
					const errorJson:any = await response.json();
					errorDetails = errorJson?.error ?? errorJson?.message ?? JSON.stringify(errorJson);
				} catch { /* Ignore if response is not JSON */ }
				throw new Error(`API call failed: ${response.status} ${response.statusText}. Details: ${errorDetails}`);
			}

			const data:any = await response.json();
			anthropicResponseData = data; // Store raw response

            // Process the response content
			const rawJsonText = data?.content?.[0]?.text;
			if (!rawJsonText) throw new Error("No text content found in Anthropic response.");

			const potentialJson = extractTrailingJson(rawJsonText);
			if (!potentialJson) throw new Error("Could not extract valid JSON from the response text.");

			const cleanJson = removeCommentsFromJson(potentialJson);

			//sceneData = getPropsFromJSON(cleanJson); // This will also set parsedWorldName

            if(sceneData.length > 0) {
                showGenerateModelsButton = true; // Enable the next step
                progressLog = [`Generated description for "${parsedWorldName}" with ${sceneData.length} prop types.`];
            } else {
                anthropicError = "Generated description did not contain any valid props.";
            }


		} catch (error: any) {
			console.error('Error during Anthropic API call or processing:', error);
			anthropicError = `Error generating description: ${error.message}`;
            // Ensure state reflects failure
            sceneData = [];
            showGenerateModelsButton = false;
		} finally {
			isAnthropicLoading = false;
		}
	}

	// --- Process Scene Data (Generate Images/Models) ---
	async function startProcessing() {
		if (isProcessing) return;
		if (!sceneData || sceneData.length === 0) {
			console.warn('startProcessing: No scene data available.');
			progressLog = [...progressLog, 'Error: Cannot start processing, generate a world description first.'];
			return;
		}

		isProcessing = true;
        showViewWorldButton = false; // Hide view button during processing
		processingCount = 0;
		results = []; // Clear previous results
		progressLog = [...progressLog, `Starting asset generation for ${sceneData.length} props...`];

		// Use a default or make these dynamic if needed
		const userID = 'testuser';
        // Use the parsed name, sanitize for use as an ID, fallback
		const worldID = parsedWorldName?.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'generated-world';

		try {
            console.log(`Starting processSceneData for world: ${worldID}`);
			results = await processSceneData(sceneData, userID, worldID, handleProgressUpdate);
			console.log('processSceneData Final Results:', results);

            // Prepare data for the world viewer AFTER processing finishes
            prepareWorldViewerData();

		} catch (error: any) {
			console.error('An unexpected error occurred during processSceneData:', error);
			progressLog = [...progressLog, `FATAL PROCESSING ERROR: ${error.message}`];
            results = []; // Clear potentially partial results on fatal error
		} finally {
			isProcessing = false;
			progressLog = [...progressLog, 'Asset generation finished. Check results table.'];

            // Determine if the "View World" button should be shown
            if (worldViewerProps.length > 0) {
			    showViewWorldButton = true;
                progressLog = [...progressLog, `Ready to view world with ${worldViewerProps.length} models.`];
            } else if (results.length > 0) {
                // Processing finished, but no viewable models
                progressLog = [...progressLog, 'Note: No models were successfully generated to display in the world viewer.'];
                 showViewWorldButton = false; // Ensure it's hidden
            } else {
                 // No results at all (likely due to fatal error)
                 showViewWorldButton = false;
            }
		}
	}

    // Callback for progress updates from processSceneData
	function handleProgressUpdate(
		index: number, // 0-based index of the prop being processed
		total: number, // Total number of props
		stage: 'image' | 'model', // Current stage ('image' or 'model')
		propName: string,
		status: string // Detailed status message from the orchestrator
	) {
		const message = `[${index + 1}/${total}] ${stage.toUpperCase()} - "${propName}" - ${status}`;
		console.log(message); // Log detailed status to console

        // Update user-facing log more selectively
        // e.g., only log start/success/failure of major stages
        if (status.includes('started') || status.includes('success') || status.includes('failed')) {
            progressLog = [...progressLog, message];
        }

        // Update the counter displayed on the button
        // A simple approach: update count when starting a new item's image stage
        if (stage === 'image' && status.includes('started')) {
		    processingCount = index + 1;
        }
	}


	// --- Prepare Data for World Viewer Component ---
    function prepareWorldViewerData() {
        console.log("Preparing data for World Viewer from results:", results);
        if (!results || results.length === 0 || !sceneData || sceneData.length === 0) {
            worldViewerProps = [];
            console.log("World Viewer data preparation skipped: No results or scene data.");
            return;
        }

        // Map successful results to the required WorldPropData format
        worldViewerProps = results
            .map(result => {
                // Find the original scene data for this prop to get transforms and description
                const originalProp = sceneData.find(prop => prop.name === result.propName);

                // Check for success, valid model URL, and existence of original prop data with transforms
                if (result.status === 'success' && result.modelPublicUrl && originalProp && Array.isArray(originalProp.transforms) && originalProp.transforms.length > 0) {
                    return {
                        name: result.propName,
                        url: result.modelPublicUrl, // Use the final public URL from processing
                        description: originalProp.description, // Get description from original data
                        colors: originalProp.colors, // Get colors from original data
                        transforms: originalProp.transforms // Get transforms from original data
                    };
                }
                // If conditions aren't met, return null to filter it out later
                return null;
            })
            // Filter out the nulls and ensure TypeScript knows the remaining items match WorldPropData
            .filter((item): item is WorldPropData => item !== null);

        console.log(`Prepared ${worldViewerProps.length} props for World Viewer.`);
    }

	// --- Modal Control Functions ---

	function openImageModal(url: string, propName: string) {
		if (!url) return;
		modalImageUrl = url;
		currentPropNameForModal = propName;
		showImageModal = true;
		showModelModal = false;
        showWorldViewerModal = false; // Close other modals
	}

	function openModelModal(url: string, propName: string) {
		if (!url) return;
		modalModelUrl = url;
		currentPropNameForModal = propName;
		showModelModal = true;
		showImageModal = false;
        showWorldViewerModal = false; // Close other modals
	}

    function openWorldViewer() {
        if (worldViewerProps.length > 0) {
		    showWorldViewerModal = true;
            showImageModal = false;
            showModelModal = false;
        } else {
            console.warn("Cannot open world viewer: No successful models with transforms available.");
            // Optionally show a user message here
        }
	}

	function closeModals() {
        // Close all modals
		showImageModal = false;
		showModelModal = false;
        showWorldViewerModal = false;
		currentPropNameForModal = null; // Reset prop name context
	}

</script>

<!-- Main Page Layout (Using Tailwind CSS) -->
<div class="container mx-auto p-4 md:p-8 space-y-8 font-sans">

	<!-- Section 1: World Description Input -->
	<section class="bg-white p-6 rounded-lg shadow border border-gray-200 space-y-4">
		<h1 class="text-2xl md:text-3xl font-bold text-gray-800">1. Describe Your World</h1>
		<p class="text-gray-600">Enter a prompt describing the game world you want to create (e.g., "a cozy mushroom village in a twilight forest", "a futuristic cyberpunk city alley").</p>
		<div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
			<input
				type="text"
				bind:value={anthropicPrompt}
				placeholder="e.g., a candy kingdom with gingerbread houses"
				class="flex-grow p-3 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent transition duration-150 ease-in-out"
				disabled={isAnthropicLoading}
                aria-label="World description prompt"
			/>
			<button
				on:click={callAnthropicApi}
				disabled={isAnthropicLoading || !anthropicPrompt.trim()}
				class="px-5 py-3 text-white font-semibold rounded-md shadow-md transition duration-200 ease-in-out flex items-center justify-center
                       {isAnthropicLoading || !anthropicPrompt.trim()
					    ? 'bg-gray-400 cursor-not-allowed'
					    : 'bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50'}"
			>
				{#if isAnthropicLoading}
					<svg class="animate-spin h-5 w-5 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
					Generating...
				{:else}
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
                    </svg>
					Generate Description
				{/if}
			</button>
		</div>
		{#if anthropicError}
			<p class="text-red-600 text-sm px-1 py-2 bg-red-50 border border-red-200 rounded"><strong class="font-semibold">Error:</strong> {anthropicError}</p>
		{/if}
	</section>

	<!-- Separator -->
 	{#if showGenerateModelsButton || progressLog.length > 0 || results.length > 0}
	    <hr class="border-gray-300 my-8">
    {/if}

	<!-- Section 2: Asset Generation & Viewing -->
    {#if showGenerateModelsButton || isProcessing || results.length > 0}
	<section class="bg-white p-6 rounded-lg shadow border border-gray-200 space-y-4">
        <h2 class="text-2xl font-bold text-gray-800">
            {#if results.length > 0}
                3. View Results
            {:else}
                2. Generate 3D Models
            {/if}
        </h2>

        {#if parsedWorldName && sceneData.length > 0 && !isProcessing && results.length === 0}
         <p class="text-gray-600">Generated description for <strong class="text-gray-800">"{parsedWorldName}"</strong> with {sceneData.length} object types. Now, generate the 3D assets.</p>
        {/if}

		<!-- Control Buttons: Generate Models & View World -->
		<div class="flex flex-col sm:flex-row sm:space-x-4 space-y-3 sm:space-y-0 items-start sm:items-center">
            {#if showGenerateModelsButton || isProcessing}
			<button
				on:click={startProcessing}
				disabled={isProcessing || !showGenerateModelsButton}
				class="w-full sm:w-auto px-6 py-3 text-white font-semibold rounded-md shadow-md transition duration-200 ease-in-out flex items-center justify-center
                       {isProcessing || !showGenerateModelsButton
					    ? 'bg-gray-400 cursor-not-allowed'
					    : 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50'}"
				title={!showGenerateModelsButton ? 'Generate a world description first' : 'Generate 3D models for the description'}
			>
				{#if isProcessing}
					<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
					Processing {processingCount} / {sceneData.length}...
				{:else if showGenerateModelsButton}
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
					Generate Models ({sceneData.length} objects)
				{/if}
			</button>
            {/if}

			<!-- View World Button -->
			{#if showViewWorldButton && !isProcessing}
				<button
					on:click={openWorldViewer}
					disabled={worldViewerProps.length === 0}
					class="w-full sm:w-auto px-6 py-3 text-white font-semibold rounded-md shadow-md transition duration-200 ease-in-out flex items-center justify-center
                           {worldViewerProps.length === 0
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50'}"
					title={worldViewerProps.length === 0 ? "No models were successfully generated" : `View ${parsedWorldName || 'the generated world'} in 3D`}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
						<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
						<path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
					</svg>
					View World ({worldViewerProps.length} models)
				</button>
			{/if}
		</div>

		<!-- Progress Log -->
		{#if progressLog.length > 1 || isProcessing} <!-- Show if processing or if there are logs post-generation -->
			<div class="mt-6 border border-gray-200 rounded-lg shadow-sm overflow-hidden">
				<h3 class="text-lg font-semibold text-gray-700 p-4 bg-gray-100 border-b border-gray-200">
					Generation Log:
				</h3>
				<ul class="max-h-60 overflow-y-auto p-4 space-y-1 text-xs sm:text-sm font-mono text-gray-600 bg-gray-50">
					{#each progressLog as logEntry, i (i)}
						<li class="whitespace-pre-wrap pb-1 mb-1 border-b border-gray-100 last:border-b-0 last:pb-0 last:mb-0">
							{logEntry}
						</li>
					{/each}
                    {#if isProcessing && progressLog.length > 0}
                     <li class="text-purple-600 animate-pulse">Processing...</li>
                    {/if}
				</ul>
			</div>
		{/if}

		<!-- Results Table -->
		{#if results.length > 0}
			<div class="mt-8">
				<h3 class="text-lg font-semibold text-gray-700 mb-4">Asset Generation Results:</h3>
				<div class="overflow-x-auto shadow-md rounded-lg border border-gray-200">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-100">
							<tr>
								<th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prop Name</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">Error</th>
								<!-- <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th> -->
							</tr>
						</thead>
						<tbody class="bg-white divide-y divide-gray-200">
							{#each results as result, i (result?.propName || i)}
								{#if result}
									<tr class="{result.status === 'success' ? 'bg-green-50 hover:bg-green-100' : (result.status.includes('failed') ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50')} transition-colors duration-150 text-sm">
										<td class="px-4 py-4 whitespace-nowrap text-gray-500">{i + 1}</td>
										<td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{result.propName}</td>
										<td class="px-6 py-4 whitespace-nowrap font-semibold {result.status === 'success' ? 'text-green-700' : (result.status.includes('failed') ? 'text-red-700' : 'text-gray-600')}">
                                            {#if result.status === 'success'}
                                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"> Success </span>
                                            {:else if result.status.includes('failed')}
                                                 <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"> Failed </span>
                                            {:else}
                                                 <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"> {result.status.replace('_', ' ').toUpperCase()} </span>
                                            {/if}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-gray-500">
											{#if result.imagePublicUrl}
												<button
													on:click={() => openImageModal(result.imagePublicUrl!, result.propName)}
													class="text-blue-600 hover:text-blue-800 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
													disabled={!result.imagePublicUrl}
													aria-label="View generated image for {result.propName}"
												>
													View Image
												</button>
											{:else if result.status === 'success' || result.status === 'model_failed' || result.status === 'model_pending'}
												<!-- Image might have been generated even if model failed -->
												<span class="text-gray-400 italic">N/A</span>
											{:else}
												-
											{/if}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-gray-500">
											{#if result.modelPublicUrl}
												<button
													on:click={() => openModelModal(result.modelPublicUrl!, result.propName)}
													class="text-blue-600 hover:text-blue-800 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
													disabled={!result.modelPublicUrl}
													aria-label="View generated 3D model for {result.propName}"
												>
													View Model
												</button>
											{:else if result.status === 'success'}
												<!-- Should have a URL if success, maybe log error if missing -->
                                                <span class="text-gray-400 italic">Missing URL</span>
											{:else}
												-
											{/if}
										</td>
										<td class="px-6 py-4 text-red-700 text-xs break-words">{result.error || ''}</td>
										<!-- <td class="px-6 py-4 text-xs text-gray-500 break-all">{result.errorDetails || ''}</td> -->
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
    </section>
    {/if}

</div>

<!-- Render Modals Conditionally (Only one should be visible at a time) -->
{#if showImageModal}
	<ImageModal {modalImageUrl} altText="Generated image for {currentPropNameForModal || 'prop'}" on:close={closeModals} />
{/if}

{#if showModelModal}
	<ModelViewer {modalModelUrl} on:close={closeModals} />
{/if}

{#if showWorldViewerModal}
	<WorldViewerModal props={worldViewerProps} on:close={closeModals} />
{/if}