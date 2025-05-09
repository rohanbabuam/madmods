<script lang="ts">
	// --- Existing Imports ---
	import { onMount, onDestroy, tick } from 'svelte'; // Add tick here
	import type { Snippet } from 'svelte';

	// --- BabylonJS Imports ---
	import {
		Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, SceneLoader, Color4, Tools, Mesh, MeshBuilder
	} from '@babylonjs/core';
	import '@babylonjs/loaders/glTF'; // Ensure GLTF loader is registered
	import { DebugLayer } from '@babylonjs/core/Debug/debugLayer';
//import '@babylonjs/inspector'; // Required for DebugLayer

	// --- Props ---
	let {
		imageUrl = '',
		prompt = '',
		altText = 'Generated Image',
		modelStatus = 'idle',
		modelUrl = undefined,
		onClose,
		onRegenerate,
		onMake3D,
        children
	}: {
		imageUrl?: string;
		prompt?: string;
		altText?: string;
		modelStatus?: 'idle' | 'queued' | 'polling' | 'generating' | 'success' | 'failed' | 'error_enqueue' | 'skipped_image_failed';
		modelUrl?: string | undefined;
		onClose: () => void;
		onRegenerate: (newPrompt: string) => void;
		onMake3D: () => void;
        children?: Snippet;
	} = $props();

	// --- Component State ---
    let editablePrompt = $state(prompt);
	let activeTab = $state<'image' | 'model'>('image');

	// --- Derived State ---
	const isModelReady = $derived(modelStatus === 'success' && !!modelUrl);

	// --- BabylonJS Viewer State ---
	let canvasElement: HTMLCanvasElement | undefined = $state();
	let engine: Engine | null = $state(null);
	let scene: Scene | null = $state(null);
	let isLoadingModel = $state(false);
	let modelLoadingError: string | null = $state(null);

	// --- Event Handlers ---
	function handleOverlayKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
            if (event.target === event.currentTarget) { event.preventDefault(); onClose(); }
		}
	}
    function handleGlobalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') { onClose(); }
	}

	// --- Lifecycle ---
	let modalContainer: HTMLElement;
	let promptTextarea: HTMLTextAreaElement;

	onMount(() => {
		window.addEventListener('keydown', handleGlobalKeydown);
        promptTextarea?.focus();
		activeTab = 'image';
	});
	onDestroy(() => {
		window.removeEventListener('keydown', handleGlobalKeydown);
	});

    function handleRegenerateClick() {
		if (isModelReady) return;
        onRegenerate(editablePrompt);
    }
    function handleMake3DClick() {
		if (isModelReady) return;
        onMake3D();
    }
	function switchTab(tabName: 'image' | 'model') {
		if (tabName === 'model' && !isModelReady) return;
		activeTab = tabName;
	}

	$effect(() => {
		// --- Local, non-reactive variables for BJS instance ---
		let _engine: Engine | null = null;
		let _scene: Scene | null = null;
		let resizeHandler: (() => void) | null = null;
		let isEngineRunning = false;
		let isCleanupScheduled = false; // Prevent premature cleanup if effect re-runs quickly

		const initAndLoad = async (currentCanvas: HTMLCanvasElement, currentModelUrl: string) => {
			// Check if already initialized or canvas/url mismatch (robustness)
			if (_engine || !currentCanvas || !currentModelUrl) {
				console.log('Babylon init skipped (already exists or missing args)');
				return;
			}
			console.log('Starting Babylon initialization and model loading...');
			isLoadingModel = true; // $state update is fine
			modelLoadingError = null; // $state update is fine

			let tempEngine: Engine | null = null;
			let tempScene: Scene | null = null;

			try {
				tempEngine = new Engine(currentCanvas, true, { preserveDrawingBuffer: true, stencil: true });
				tempEngine.renderEvenInBackground = true;
				tempScene = new Scene(tempEngine);
				tempScene.clearColor = new Color4(0.15, 0.16, 0.2, 1);

				// --- Camera Setup ---
				const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2.5, 3, Vector3.Zero(), tempScene);
				camera.attachControl(currentCanvas, true);
				camera.wheelPrecision = 50;
				camera.lowerRadiusLimit = 0.1;
				camera.upperRadiusLimit = 1000;
				camera.minZ = 0.1;
				camera.maxZ = 10000;

				// --- Light Setup ---
				const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), tempScene);
				hemiLight.intensity = 1.0;
				const dirLight = new DirectionalLight('dirLight', new Vector3(-0.5, -1, -0.3), tempScene);
				dirLight.position = new Vector3(5, 10, 3);
				dirLight.intensity = 0.8;

				console.log(`Loading model from: ${currentModelUrl}`);
				await SceneLoader.ImportMeshAsync(null, currentModelUrl, '', tempScene);

				var debugLayer = await tempScene.debugLayer.show();
				// Keep the rest (executeWhenReady, camera centering etc.)
				// The camera centering might need adjusting or simplifying for just a box
				camera.radius = 3; // Set a fixed radius for the box test
				camera.target = Vector3.Zero(); // Center on origin

				// Then wait for ready:
				await tempScene.whenReadyAsync();

				console.log('Model imported, waiting for scene to be ready...');

				// --- Scene Ready Callback ---
                // Use .then() for executeWhenReady promise for clearer async flow
				await tempScene.whenReadyAsync();

                // --- Check if cleanup was scheduled while waiting ---
                if (isCleanupScheduled) {
                    console.warn("Cleanup scheduled while scene was loading. Aborting setup.");
                    tempScene?.dispose();
                    tempEngine?.dispose();
                    isLoadingModel = false;
                    return; // Don't proceed with setup
                }

				console.log('Scene is ready.');
				// --- Assign to LOCAL variables ---
				_engine = tempEngine;
				_scene = tempScene;

                // --- Update $state variables (optional, if needed externally) ---
				// This assignment no longer causes the effect loop because the effect's
				// core logic now depends on the local _engine/_scene.
                engine = _engine;
                scene = _scene;

				// --- Center Camera Logic ---
				if (!_scene) { console.error("Scene is null during camera centering"); return; }
				let boundingCenter = Vector3.Zero();
				let cameraRadius = 10;
				let min = new Vector3(Infinity, Infinity, Infinity);
				let max = new Vector3(-Infinity, -Infinity, -Infinity);
				let hasValidGeometry = false;

				_scene.meshes.forEach(mesh => {
					if (mesh instanceof Mesh && mesh.isEnabled() && mesh.getTotalVertices() > 0 && mesh.name !== "__root__") {
						mesh.computeWorldMatrix(true);
						const boundingInfo = mesh.getBoundingInfo();
						if (boundingInfo && boundingInfo.boundingBox) {
							const meshMin = boundingInfo.boundingBox.minimumWorld;
							const meshMax = boundingInfo.boundingBox.maximumWorld;
							if (isFinite(meshMin.x) && isFinite(meshMin.y) && isFinite(meshMin.z) &&
								isFinite(meshMax.x) && isFinite(meshMax.y) && isFinite(meshMax.z))
							{
								min = Vector3.Minimize(min, meshMin);
								max = Vector3.Maximize(max, meshMax);
								hasValidGeometry = true;
							}
						}
					}
				});

				if (hasValidGeometry) {
					boundingCenter = Vector3.Center(min, max);
					const size = max.subtract(min);
					const maxDim = Math.max(size.x, size.y, size.z);
					cameraRadius = Math.max(maxDim * 1.5, 1.0);
					console.log('Calculated BBox Center:', boundingCenter, 'Radius:', cameraRadius);
				} else {
					console.warn("No valid mesh geometry found. Using default camera target/radius.");
					boundingCenter = Vector3.Zero();
					cameraRadius = 10;
				}
				camera.target = boundingCenter;
				camera.radius = cameraRadius;
				// --- End Camera Logic ---

				console.log('Babylon setup complete, starting BJS render loop...');

				if (!_engine) { console.error("Engine is null before runRenderLoop"); return; }

				_engine.runRenderLoop(() => {
					if (_scene && _engine && !_engine.isDisposed && !_scene.isDisposed) { // Add checks
						_scene.render();
					}
				});
				isEngineRunning = true;

				resizeHandler = () => {
					// console.log('Resize event triggered');
					_engine?.resize(); // Use local engine
				}
				window.addEventListener('resize', resizeHandler);

				console.log('Forcing initial engine resize.');
				_engine.resize();

				isLoadingModel = false; // Update $state
				console.log('BabylonJS setup successful.');


			} catch (error: any) {
				console.error('BabylonJS Initialization or Loading Error:', error);
				modelLoadingError = `Failed to load/initialize viewer: ${error.message || String(error)}`;
				isLoadingModel = false;
				tempScene?.dispose();
				tempEngine?.dispose();
				_engine = null; // Ensure local vars are nulled on error
				_scene = null;
                engine = null; // Keep $state consistent
                scene = null;
			}
		};

		// --- Effect Trigger Logic ---
		// Capture dependencies locally to pass to async function if needed
		const currentCanvas = canvasElement;
		const currentModelUrl = modelUrl;
		let initTimeoutId: number | null = null; // Store timeout ID

		if (activeTab === 'model' && isModelReady && currentCanvas && currentModelUrl) {
    if (!_engine) { // Check local engine variable
        console.log("Effect triggered: Conditions met, scheduling init.");
        // --- Introduce a short delay ---
        initTimeoutId = window.setTimeout(() => {
            console.log("Timeout finished, attempting init.");
            // Check conditions AGAIN in case they changed during timeout
            if (activeTab === 'model' && isModelReady && canvasElement === currentCanvas && modelUrl === currentModelUrl && !_engine) {
                 void initAndLoad(currentCanvas, currentModelUrl);
            } else {
                console.log("Conditions changed during timeout, aborting init.");
            }
            initTimeoutId = null; // Clear ID after execution
        }, 100); // Delay by 100ms
    } else {
         console.log("Effect triggered: Conditions met, local engine exists.");
    }
}

		// --- Cleanup Function ---
		return () => {
    // --- Add clearing the timeout to the cleanup ---
    if (initTimeoutId !== null) {
        console.log("Clearing pending init timeout during cleanup.");
        clearTimeout(initTimeoutId);
        initTimeoutId = null;
    }
            isCleanupScheduled = true; // Signal that cleanup is intended
			console.log('Cleaning up modal BabylonJS engine (using local references)...');
			// Use the local variables captured when the cleanup function was DEFINED
			const engineToDispose = _engine;
			const handlerToRemove = resizeHandler;

            // Stop render loop FIRST
			if (engineToDispose && isEngineRunning) {
				console.log('Stopping BJS render loop.');
				engineToDispose.stopRenderLoop();
				isEngineRunning = false; // Reset flag for this scope
			}

            // Remove resize listener
			if (handlerToRemove) {
				window.removeEventListener('resize', handlerToRemove);
				resizeHandler = null; // Clear the variable in the outer scope
			}

            // Dispose engine (implicitly disposes scene)
			if (engineToDispose) {
				console.log('Disposing Babylon engine.');
                // Check if already disposed for safety, although dispose() handles this
                if (!engineToDispose.isDisposed) {
				    engineToDispose.dispose();
                }
			}

			// Nullify local references
			_engine = null;
			_scene = null;

			// Reset $state variables if they were used
			engine = null;
			scene = null;
			isLoadingModel = false; // Ensures loading indicator is off
			modelLoadingError = null;

			console.log('BabylonJS cleanup complete.');
		};
	}); // End $effect

</script>


<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
	bind:this={modalContainer}
	class="fixed inset-0 z-50000 flex items-center justify-center bg-black/20 p-4 outline-none backdrop-blur-xs"
	onclick={onClose}
    onkeydown={handleOverlayKeydown}
	role="dialog"
	aria-modal="true"
	aria-labelledby="image-modal-title"
	tabindex="-1"
>
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div
		class="relative bg-gray-800 text-white rounded-lg shadow-xl overflow-hidden
               max-w-3xl max-h-[90vh] w-full
               flex flex-col
              "
		onclick={(e)=>e.stopPropagation()}
	>
 		<h2 id="image-modal-title" class="sr-only">{altText}</h2>

        <!-- Top Bar with Title and Close Button -->
        <div class="flex justify-between items-center p-3 border-b border-gray-700 flex-shrink-0">
            <span class="text-lg font-semibold pl-2">Object Details</span>
            <button
                onclick={onClose}
                class="p-1 text-gray-400 bg-transparent rounded-full hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-500 transition"
                aria-label="Close viewer"
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>

		<!-- Tab Buttons -->
		<div class="flex border-b border-gray-700 bg-gray-850 flex-shrink-0">
			<button
				class="px-4 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none"
				class:text-white={activeTab === 'image'}
				class:bg-gray-750={activeTab === 'image'}
				class:text-gray-400={activeTab !== 'image'}
				class:hover:text-white={activeTab !== 'image'}
				class:hover:bg-gray-700={activeTab !== 'image'}
				onclick={() => switchTab('image')}
				aria-selected={activeTab === 'image'}
				role="tab"
			>
				Image
			</button>
			{#if isModelReady}
				<button
					class="px-4 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none"
					class:text-white={activeTab === 'model'}
					class:bg-gray-750={activeTab === 'model'}
					class:text-gray-400={activeTab !== 'model'}
					class:hover:text-white={activeTab !== 'model'}
				    class:hover:bg-gray-700={activeTab !== 'model'}
					onclick={() => switchTab('model')}
					aria-selected={activeTab === 'model'}
					role="tab"
				>
					3D Model
				</button>
			{/if}
		</div>

		<!-- Tab Content Area -->
        <div class="flex-grow overflow-hidden p-0 flex justify-center items-center bg-gray-900 min-h-[300px] relative">
			{#if activeTab === 'image'}
				<div class="p-4 w-full h-full flex justify-center items-center">
					<img
						src={imageUrl}
						alt={altText}
						class="block max-w-full max-h-full object-contain rounded"
					/>
				</div>
			{:else if activeTab === 'model' && isModelReady}
				<!-- Model Viewer Container -->
				<div class="w-full h-full relative">
					<!-- Loading/Error Overlay -->
					{#if isLoadingModel || modelLoadingError}
						<div class="absolute inset-0 flex flex-col items-center justify-center text-white z-20 bg-gray-900 bg-opacity-80">
							{#if isLoadingModel}
								<svg class="animate-spin h-8 w-8 text-white mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle> <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
								<p class="text-sm">Loading 3D Model...</p>
							{:else if modelLoadingError}
								<p class="text-red-400 font-semibold text-sm mb-1">Error Loading Model</p>
								<p class="mt-1 text-center text-xs max-w-xs">{modelLoadingError}</p>
								<button	onclick={onClose} class="mt-3 rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"> Close </button>
							{/if}
						</div>
					{/if}

					<!-- Babylon Canvas -->
					<canvas
						bind:this={canvasElement}
						class="absolute inset-0 h-full w-full block outline-none z-10 {isLoadingModel || modelLoadingError ? 'opacity-30' : 'opacity-100'} transition-opacity duration-300"
						aria-label="3D Model Viewer Canvas"
						tabindex="0"
					></canvas>
				</div>
			{/if}
        </div>

        <!-- Prompt and Actions Container -->
        <div class="p-4 border-t border-gray-700 bg-gray-800 space-y-3 flex-shrink-0">
            <div>
                <label for="modal-prompt-input" class="block text-sm font-medium text-gray-300 mb-1">Prompt:</label>
                <textarea
                    bind:this={promptTextarea}
                    id="modal-prompt-input"
                    bind:value={editablePrompt}
                    rows={3}
                    class="w-full p-2 bg-gray-700 border border-gray-600 rounded shadow-sm text-white focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-y disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Enter image prompt"
					disabled={isModelReady}
                ></textarea>
            </div>

            <div class="flex justify-end space-x-3">
                 <button
                    onclick={handleMake3DClick}
                    class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
					disabled={isModelReady}
                 >
                    Make 3D
                 </button>
                 <button
                    onclick={handleRegenerateClick}
                    disabled={!editablePrompt.trim() || isModelReady}
                    class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    Regenerate
                 </button>
            </div>
        </div>

	</div> <!-- End of modal content div -->
</div> <!-- End of backdrop div -->

<style>
    /* Add Tailwind directives if not globally included */
    /* @tailwind base; */
    /* @tailwind components; */
    /* @tailwind utilities; */

	/* Add custom background colors for tabs if needed */
	.bg-gray-850 { background-color: #1f2937; }
	.bg-gray-750 { background-color: #374151; }


    /* Optional: Style scrollbars for better dark mode appearance */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    ::-webkit-scrollbar-track {
        background: #2d3748; /* gray-800 */
    }
    ::-webkit-scrollbar-thumb {
        background: #4a5568; /* gray-600 */
        border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: #718096; /* gray-500 */
    }



    /* Optional: Style scrollbars for better dark mode appearance */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    ::-webkit-scrollbar-track {
        background: #2d3748; /* gray-800 */
    }
    ::-webkit-scrollbar-thumb {
        background: #4a5568; /* gray-600 */
        border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: #718096; /* gray-500 */
    }
</style>