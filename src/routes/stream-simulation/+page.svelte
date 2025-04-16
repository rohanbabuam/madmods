<!-- src/routes/stream-demo/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	// Import the static JSON data
	// Make sure the path is correct relative to your project structure.
	// Using $lib alias requires setup in tsconfig.json/jsconfig.json if not default.

	// Reactive variable to hold the content being "streamed"
	let displayedContent = '';
	// Reactive variable to track the streaming status
	let isStreaming = false;
	let statusMessage = 'Waiting to load data...';

	// Configuration for the streaming simulation
	const STREAM_DELAY_MS = 10; // Milliseconds between characters. Adjust for speed.

    let WorldJsonURLs: string[] = [
        'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/worlds/testuser/dino-world/dino-world.json'
    ];

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
    async function loadJSON(index:number) {
		console.log('loading world json');
		let worldJson = await fetchJSON(WorldJsonURLs[index]);
        return worldJson;
	}

	onMount(() => {
        
        let jsonData = loadJSON(0);
		statusMessage = 'Data loaded. Starting simulation...';
		isStreaming = true;

		// Convert the loaded JSON object into a nicely formatted string
		const fullJsonString = JSON.stringify(jsonData, null, 2); // null, 2 for pretty printing

		let currentIndex = 0;

		function streamCharacter() {
			if (currentIndex < fullJsonString.length) {
				// Append the next character to the displayed content
				displayedContent += fullJsonString[currentIndex];
				currentIndex++;

				// Schedule the next character append
				setTimeout(streamCharacter, STREAM_DELAY_MS);
			} else {
				// Streaming finished
				isStreaming = false;
				statusMessage = 'Streaming simulation complete!';
				console.log('Streaming finished.');
			}
		}

		// Start the streaming simulation
		streamCharacter();

        // Cleanup function (optional but good practice if timeouts could leak)
        // Svelte's onMount cleanup handles basic cases, but for complex async:
        let timeoutId: number; // Store timeout id if needed for cancellation
        // function streamCharacter() { ... timeoutId = setTimeout(...) }
        // return () => { clearTimeout(timeoutId); }
	});
</script>

<svelte:head>
	<title>JSON Stream Simulation</title>
</svelte:head>

<div class="container">
	<h1>Simulated LLM JSON Stream</h1>

	<p>Status: <strong>{statusMessage}</strong></p>

	{#if isStreaming}
		<div class="spinner"></div>
		<p><em>Simulating stream...</em></p>
	{/if}

	<div class="output-area">
		<h2>Streamed Output:</h2>
		<!-- Use <pre> and <code> for preserving formatting and monospace font -->
		<pre><code>{displayedContent}</code></pre>
		<!-- Blinking cursor effect -->
		{#if isStreaming}
			<span class="cursor"></span>
		{/if}
	</div>

</div>

<style>
	.container {
		font-family: sans-serif;
		max-width: 800px;
		margin: 2em auto;
		padding: 1em;
		border: 1px solid #ccc;
		border-radius: 8px;
		background-color: #f9f9f9;
	}

	h1, h2 {
		color: #333;
		border-bottom: 1px solid #eee;
		padding-bottom: 0.3em;
	}

    strong {
        color: #005e9e;
    }

	.output-area {
		margin-top: 1.5em;
		background-color: #282c34; /* Dark background for code */
		color: #abb2bf; /* Light text */
		padding: 1em;
		border-radius: 5px;
		overflow-x: auto; /* Handle long lines */
		position: relative; /* Needed for cursor positioning */
        min-height: 100px; /* Ensure area is visible initially */
	}

	pre {
		margin: 0;
		white-space: pre-wrap; /* Wrap long lines within the pre block */
    	word-wrap: break-word; /* Break words if necessary */
	}

	code {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.95em;
        display: block; /* Ensure code takes block display for wrapping */
	}

	/* Simple loading spinner */
	.spinner {
		border: 4px solid rgba(0, 0, 0, 0.1);
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border-left-color: #09f;
		margin-bottom: 0.5em;
		animation: spin 1s ease infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	/* Blinking cursor effect */
	.cursor {
		display: inline-block;
		width: 10px;
		height: 1.2em; /* Match line height */
		background-color: #abb2bf; /* Match text color */
		animation: blink 1s step-end infinite;
		vertical-align: bottom; /* Align with text */
        margin-left: 2px; /* Small space after text */
	}

	@keyframes blink {
		from, to { background-color: transparent }
		50% { background-color: #abb2bf; }
	}
</style>