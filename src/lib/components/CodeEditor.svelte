<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import * as Blockly from 'blockly/core';

	// Props coming from parent
	let {
		active,
		blocklyContainerId,
		runAreaCanvasId,
		initializeApp,
		getModelUrlForId
	}: {
		active: boolean;
		blocklyContainerId: string;
		runAreaCanvasId: string;
		initializeApp: (
			blocklyDivId: string,
			runAreaCanvasId: string,
			resolver: (name: string) => string | null
		) => Promise<{ workspace: Blockly.WorkspaceSvg; threeD: any }>; // Assuming initializeApp returns this structure
		getModelUrlForId: (name: string) => string | null;
	} = $props();

	// Exports for parent component interaction
	const api = { resize };
	$inspect(api); // Make api available for parent via bind:this={codeEditorRef}

	// Internal state
	let isLoading = $state(true);
	let errorMsg: string | null = $state(null);
	let blocklyWorkspace: Blockly.WorkspaceSvg | null = $state(null);
	let threeDInstance: any | null = $state(null); // Store the threeD instance if needed for cleanup

	function resize() {
		if (blocklyWorkspace && browser && active) {
			// Ensure the container is actually visible and has dimensions before resizing
			const blocklyDivElement = document.getElementById(blocklyContainerId);
			if (blocklyDivElement && blocklyDivElement.offsetParent !== null && blocklyDivElement.offsetWidth > 0) {
				console.log("CodeEditor: Resizing Blockly workspace...");
				Blockly.svgResize(blocklyWorkspace);
				blocklyWorkspace.render();
			} else {
				console.log("CodeEditor: Skipping resize, container not ready or visible.");
			}
		}
	}

	// Effect to resize Blockly when the tab becomes active
	$effect(() => {
		if (browser && active && blocklyWorkspace) {
			// Use tick to ensure DOM is updated after visibility change
			tick().then(() => {
				resize();
			});
		}
	});

	onMount(async () => {
		if (!browser) return;

		isLoading = true;
		errorMsg = null;
		console.log('CodeEditor: Mounting, initializing Blockly...');

		try {
			// Wait for the parent layout to be stable might not be necessary if parent ensures elements exist
			// await tick(); // Consider if needed

			const blocklyDiv = document.getElementById(blocklyContainerId);
			const runAreaCanvas = document.getElementById(runAreaCanvasId);

			if (blocklyDiv && runAreaCanvas) {
				const { workspace, threeD } = await initializeApp(blocklyContainerId, runAreaCanvasId, getModelUrlForId);
				blocklyWorkspace = workspace;
				threeDInstance = threeD; // Store for potential cleanup
				console.log('CodeEditor: Blockly initialized successfully.');
			} else {
				throw new Error(`Required elements not found: #${blocklyContainerId}, #${runAreaCanvasId}`);
			}
		} catch (error: any) {
			console.error('CodeEditor: Failed to initialize Blockly:', error);
			errorMsg = `Failed to initialize Code Editor: ${error.message || error}`;
		} finally {
			isLoading = false;
		}
	});

	onDestroy(() => {
		if (!browser) return;
		console.log('CodeEditor: Destroying, disposing Blockly workspace...');
		blocklyWorkspace?.dispose();
		// Optionally dispose Three.js resources if CodeEditor solely manages them
		// threeDInstance?.engine?.dispose(); // Consider if parent should handle this
		blocklyWorkspace = null;
		threeDInstance = null;
		console.log('CodeEditor: Cleanup complete.');
	});

</script>

<div id="blocklyArea" class="code-editor-root" class:hidden={!active}>
	{#if isLoading}
		<div class="loading-placeholder">Loading Workspace...</div>
	{:else if errorMsg}
		<div class="init-error-message">Error: {errorMsg}</div>
	{:else}
		<div id={blocklyContainerId} class="blockly-div-element"></div>
	{/if}
</div>

<style>
	.code-editor-root {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		background-color: #fff; /* Moved from #blocklyArea */
	}
	.blockly-div-element {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}
	.hidden {
		display: none !important;
	}
	.loading-placeholder {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%;
		font-size: 14px;
		padding: 20px;
		text-align: center;
		color: #555; /* Adjusted color slightly */
	}
    .init-error-message {
        position: absolute; /* Position within its container */
        top: 10px;
        left: 10px;
        right: 10px; /* Take available width */
        background: rgba(239, 68, 68, 0.9);
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        z-index: 10; /* Ensure visibility over blockly */
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        font-size: 14px;
        text-align: center;
    }
	/* Inherited global styles for Blockly elements */
	:global(.blocklyTreeLabel) { font-size: 12px !important; }
	:global(.blocklyText) { font-size: 10px; }
</style>