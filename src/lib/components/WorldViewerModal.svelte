<script context="module" lang="ts">
	// --- Module-level imports (run once) ---
	// Import core BabylonJS and necessary loaders/materials
	// These are loaded once when this .svelte file is imported.

	// --- Exported Types (defined once at module level) ---
	interface TransformData {
		translation: [number, number, number];
		rotation: [number, number, number];
		scale: [number, number, number];
	}

	// This type needs to be exported so the parent page can use it.
	export interface WorldPropData {
		name: string;
		url: string; // URL to the glb model
		description?: string; // Optional
		colors?: { [key: string]: string }[]; // Optional
		transforms: TransformData[];
	}
</script>

<script lang="ts">
	// --- Instance-level imports (used by each component instance) ---
	import { onMount } from 'svelte'; // Lifecycle function
	// Import BabylonJS classes needed for instance logic
	import {
		Engine,
		Scene,
		ArcRotateCamera,
		HemisphericLight,
		MeshBuilder,
		SceneLoader,
        // Import types/classes used within instance logic if not imported above
        Vector3,
        Color3,
        Quaternion,
        Angle,
	} from '@babylonjs/core';
	import '@babylonjs/loaders/glTF'; // Import GLTF loader side effect
	import { GridMaterial } from "@babylonjs/materials/grid/gridMaterial"; // Correct path
	import { SkyMaterial } from "@babylonjs/materials/sky/skyMaterial";   // Correct path
    // WorldPropData type is available from the module script above

	// --- Props (instance-specific) ---
	export let props: WorldPropData[] = [];
	export let onClose: () => void;

	// --- BabylonJS State (instance-specific) ---
	let canvasElement: HTMLCanvasElement;
	let engine: Engine | null = null;
	let scene: Scene | null = null;

	// --- Lifecycle Hook (runs for each instance) ---
	onMount(() => {
		if (!canvasElement) {
            console.error("Canvas element not found on mount.");
            return;
        }

		console.log("WorldViewerModal: onMount started");
		engine = new Engine(canvasElement, true, {
			preserveDrawingBuffer: true,
			stencil: true
		});
		scene = new Scene(engine);
        console.log("BabylonJS Engine and Scene initialized.");

		// --- Camera ---
		const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2.5, 500, Vector3.Zero(), scene); // Start further back
		camera.attachControl(canvasElement, true);
		camera.wheelPrecision = 10;
		camera.minZ = 1;
		camera.maxZ = 10000;
        console.log("Camera created.");

		// --- Light ---
		new HemisphericLight('light', new Vector3(0, 1, 0), scene);
        console.log("Light created.");

		// --- Ground ---
		const groundSize = 2000;
		const ground = MeshBuilder.CreateGround('ground', { width: groundSize, height: groundSize }, scene);
		const gridMaterial = new GridMaterial('gridMaterial', scene);
		gridMaterial.mainColor = Color3.FromHexString('#008000');
		gridMaterial.lineColor = Color3.FromHexString('#333333');
		gridMaterial.gridRatio = 10;
		gridMaterial.opacity = 0.95;
		ground.material = gridMaterial;
		ground.position.y = -0.01;
        console.log("Ground created.");

		// --- Skybox ---
		const skyMaterial = new SkyMaterial("skyMaterial", scene);
		skyMaterial.backFaceCulling = false;
		skyMaterial.turbidity = 5;
		skyMaterial.luminance = 1.0;
		skyMaterial.inclination = 0.49;
		skyMaterial.azimuth = 0.25;
		skyMaterial.useSunPosition = true;
		skyMaterial.sunPosition = new Vector3(0, 100, 0);
		const skybox = MeshBuilder.CreateBox("skyBox", { size: groundSize * 2 }, scene);
		skybox.material = skyMaterial;
        console.log("Skybox created.");

		// --- Load Props ---
		loadProps(scene); // Call the instance-specific function

		// --- Render Loop ---
        console.log("Starting render loop.");
		engine.runRenderLoop(() => {
			if (scene?.isReady()) { // Optional: check if scene is ready
				scene.render();
			}
		});

		// --- Resize Handling ---
		const resizeHandler = () => {
            console.log("Resizing BabylonJS canvas.");
            engine?.resize();
        };
		window.addEventListener('resize', resizeHandler);

		// --- Cleanup (acts like onDestroy for this instance) ---
		return () => {
			console.log('WorldViewerModal: Cleaning up BabylonJS instance...');
			window.removeEventListener('resize', resizeHandler);
            engine?.stopRenderLoop(); // Stop the loop
            scene?.dispose();
			engine?.dispose();
			engine = null;
			scene = null;
			console.log('BabylonJS scene and engine disposed');
		};
	}); // End of onMount

	// --- Instance Helper Functions ---
	async function loadProps(sceneInstance: Scene) {
		console.log('Loading props into Babylon scene:', props);
		if (!props || props.length === 0 || !sceneInstance) {
			console.log('No props to load or scene not ready.');
			return;
		}

        let loadedCount = 0;
		for (const prop of props) {
			if (!prop.url || !prop.transforms || prop.transforms.length === 0) {
				console.warn(`Skipping prop "${prop.name}" due to missing URL or transforms.`);
				continue;
			}

            // --- Process ALL transforms for this prop ---
            for (let i = 0; i < prop.transforms.length; i++) {
                const transform = prop.transforms[i];
                const instanceName = `${prop.name}_instance_${i}`;

                try {
                    // BabylonJS uses meters, source data is in cm. Divide by 100.
                    const position = new Vector3(
                        transform.translation[0] / 100,
                        transform.translation[1] / 100,
                        transform.translation[2] / 100
                    );
                    // BabylonJS uses radians, source data is in degrees. Convert.
                    const rotationQuaternion = Quaternion.FromEulerAngles(
                        Angle.FromDegrees(transform.rotation[0]).radians(),
                        Angle.FromDegrees(transform.rotation[1]).radians(),
                        Angle.FromDegrees(transform.rotation[2]).radians()
                    );
                    // BabylonJS uses meters for scale units, source data is in cm. Divide by 100.
                    // Ensure scale is never zero to avoid issues. Use a small epsilon.
                    const epsilon = 0.0001;
                    const scale = new Vector3(
                        Math.max(epsilon, transform.scale[0] / 100),
                        Math.max(epsilon, transform.scale[1] / 100),
                        Math.max(epsilon, transform.scale[2] / 100)
                    );

                    console.log(`Loading model for "${instanceName}" from ${prop.url}`);
                    const result = await SceneLoader.ImportMeshAsync(
                        null, // Load all meshes from the file
                        '',   // Root URL (usually empty if URL is absolute)
                        prop.url, // The actual URL to the .glb file
                        sceneInstance
                    );

                    if (result.meshes.length > 0) {
                        // Often the first mesh (index 0) is the root node for GLBs
                        const rootMesh = result.meshes[0];
                        rootMesh.name = instanceName; // Assign unique name for debugging/identification
                        rootMesh.position = position;
                        rootMesh.rotationQuaternion = rotationQuaternion; // Use quaternion for precise rotation
                        rootMesh.scaling = scale;

                        // Disable meshes we don't want (like __root__) if necessary
                        result.meshes.forEach(mesh => {
                            if (mesh !== rootMesh && mesh.name === "__root__") {
                                mesh.setEnabled(false); // Don't render the extra root if it exists
                            }
                            // Make sure all parts of the model are visible
                             mesh.isVisible = true;
                        });

                        console.log(`Successfully loaded and positioned "${instanceName}"`);
                        loadedCount++;
                    } else {
                        console.warn(`No meshes found in the loaded file for "${instanceName}" at ${prop.url}`);
                    }

                } catch (error) {
                    console.error(`Error loading model for "${instanceName}" from ${prop.url}:`, error);
                }
            } // End loop through transforms
		} // End loop through props
        console.log(`Finished loading ${loadedCount} prop instances.`);
	}

	// Handle Escape key to close (instance-specific)
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}
</script>

<!-- Template remains the same -->
<svelte:window on:keydown={handleKeydown} />

<!-- Modal Background -->
<div
	class="fixed inset-0 z-40 bg-black bg-opacity-60 flex items-center justify-center p-4"
	on:click|self={onClose}
	role="dialog"
	aria-modal="true"
	aria-labelledby="world-viewer-title"
>
	<!-- Modal Content -->
	<div class="bg-white rounded-lg shadow-xl overflow-hidden w-full h-[85vh] max-w-6xl flex flex-col">
		<div class="p-4 border-b border-gray-200 flex justify-between items-center">
			<h2 id="world-viewer-title" class="text-xl font-semibold text-gray-800">World Viewer</h2>
			<button
				on:click={onClose}
				class="text-gray-500 hover:text-gray-700 text-2xl font-bold leading-none"
				aria-label="Close world viewer"
			>
				×
			</button>
		</div>
		<div class="flex-grow relative">
			<!-- Bind canvas element to the instance script variable -->
			<canvas bind:this={canvasElement} class="absolute top-0 left-0 w-full h-full outline-none" touch-action="none"></canvas> <!-- Added touch-action for better mobile -->
		</div>
	</div>
</div>