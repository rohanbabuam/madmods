<!-- src/lib/components/ModelViewer.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Engine,
		Scene,
		ArcRotateCamera,
		Vector3,
		HemisphericLight,
		SceneLoader,
		Color4,
	} from '@babylonjs/core';
	// Import the GLTF loader side effect to register it with SceneLoader
	import '@babylonjs/loaders/glTF'; // Crucial for loading .glb/.gltf files

	// --- Props ---
	export let modelUrl: string; // URL of the .glb or .gltf file
	export let onClose: () => void; // Function to call when closing the modal

	// --- Internal State ---
	let canvasElement: HTMLCanvasElement; // Reference to the canvas element
	let engine: Engine | null = null;
	let scene: Scene | null = null;
	let isLoading = true;
	let loadingError: string | null = null;

	// --- Babylon.js Setup ---
	onMount(() => {
		console.log(`ModelViewer: Mounting. Loading model from: ${modelUrl}`);

		if (!canvasElement || !modelUrl) {
			console.error('ModelViewer: Canvas element or modelUrl not available on mount.');
			loadingError = 'Initialization failed: Missing canvas or model URL.';
			isLoading = false;
			return;
		}

		// --- Initialize En gine & Scene ---
		try {
			engine = new Engine(canvasElement, true, { // Enable antialiasing
				preserveDrawingBuffer: true,
				stencil: true
			});

			scene = new Scene(engine);
			scene.clearColor = new Color4(0.1, 0.1, 0.15, 1); // Dark background

			// --- Camera ---
			// Parameters: name, alpha, beta, radius, target position, scene
			const camera = new ArcRotateCamera(
				'camera',
				-Math.PI / 2, // Initial horizontal rotation (radians)
				Math.PI / 2.5, // Initial vertical rotation (radians)
				5, // Initial distance from target
				Vector3.Zero(), // Target point (center of the scene)
				scene
			);
			camera.attachControl(canvasElement, true); // Allow user interaction
			camera.wheelPrecision = 50; // Adjust zoom speed
			camera.lowerRadiusLimit = 1; // Prevent zooming too close
			camera.upperRadiusLimit = 20; // Prevent zooming too far
            camera.minZ = 0;

			// --- Light ---
			// Parameters: name, direction, scene
			const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
			light.intensity = 0.9; // Adjust light brightness

			// --- Load Model ---
			// Use SceneLoader to import the model
			// Parameters: mesh names (null for all), path/url, filename (use "" if url includes it), scene, onSuccess, onProgress, onError
			SceneLoader.ImportMeshAsync(null, modelUrl, '', scene)
				.then((result) => {
					if (result.meshes.length === 0) {
						console.error('ModelViewer: No meshes found in the loaded model.');
						loadingError = 'Failed to load model: No meshes found.';
						return;
					}
					console.log(`ModelViewer: Successfully loaded ${result.meshes.length} meshes.`);

					// Optional: Auto-center and frame the model
					// This can be complex depending on the model structure.
					// A simple approach might be to adjust the camera target/radius based on bounding box,
					// but Vector3.Zero() target is often okay for centered models.
					// Example (might need refinement):
					// const boundingInfo = scene.createBoundingBoxRenderer().renderList[0].boundingBox;
					// camera.target = boundingInfo.centerWorld;
					// camera.radius = boundingInfo.boundingSphere.radiusWorld * 1.5; // Adjust radius based on size

					isLoading = false;
				})
				.catch((error) => {
					console.error('ModelViewer: Error loading model:', error);
					loadingError = `Failed to load model: ${error.message || error}`;
					isLoading = false;
				});

			// --- Render Loop ---
			engine.runRenderLoop(() => {
				if (scene) {
					scene.render();
				}
			});

			// --- Resize Handling ---
			const resizeHandler = () => {
				if (engine) {
					engine.resize();
				}
			};
			window.addEventListener('resize', resizeHandler);

			// Store cleanup function for onDestroy
			return () => {
				console.log('ModelViewer: Cleaning up resize listener.');
				window.removeEventListener('resize', resizeHandler);
			};

		} catch (error: any) {
			console.error('ModelViewer: Error initializing Babylon.js:', error);
			loadingError = `Initialization failed: ${error.message || error}`;
			isLoading = false;
			if (engine) {
				engine.dispose();
				engine = null;
			}
		}
	});

	// --- Cleanup ---
	onDestroy(() => {
		console.log('ModelViewer: Destroying component, disposing Babylon engine.');
		if (engine) {
			engine.stopRenderLoop(); // Stop the render loop
			scene?.dispose();      // Dispose the scene and its resources
			engine.dispose();      // Dispose the engine
			engine = null;
			scene = null;
		}
	});

	// --- Close Function ---
	function handleClose() {
		if (onClose) {
			onClose();
		}
	}
</script>

<!-- Modal Structure (using Tailwind for styling) -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
	aria-labelledby="model-viewer-title"
	role="dialog"
	aria-modal="true"
	on:click|self={handleClose}
>
	<div class="relative w-full max-w-4xl aspect-video overflow-hidden rounded-lg bg-gray-800 shadow-xl">
		<!-- Close Button -->
		<button
			on:click={handleClose}
			class="absolute top-2 right-2 z-10 rounded-full bg-gray-600 bg-opacity-50 p-1 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white transition-colors"
			aria-label="Close model viewer"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>

		<!-- Loading/Error State -->
		{#if isLoading || loadingError}
			<div class="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
				{#if isLoading}
					<svg
						class="animate-spin h-10 w-10 text-white mb-3"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					<p>Loading 3D Model...</p>
				{:else if loadingError}
					<p class="text-red-400 font-semibold">Error:</p>
					<p class="mt-1 text-center text-sm">{loadingError}</p>
					<button
						on:click={handleClose}
						class="mt-4 rounded bg-red-600 px-4 py-1 text-white hover:bg-red-700"
					>
						Close
					</button>
				{/if}
			</div>
		{/if}

		<!-- Babylon.js Canvas -->
		<canvas
			bind:this={canvasElement}
			class="absolute inset-0 h-full w-full block {isLoading || loadingError ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300"
		></canvas>
	</div>
</div>