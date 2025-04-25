<!-- src/routes/+page.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores'; // Import the page store
	import oboe from 'oboe';

	// --- BabylonJS Imports ---
	import {
		Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder, Color3, Color4, StandardMaterial, Texture, SceneLoader, Quaternion, Tools,
        Mesh, BoundingInfo, CubeTexture
	} from '@babylonjs/core';
	import '@babylonjs/loaders/glTF'; // Import the GLTF loader plugin (for GLB)
	import '@babylonjs/core/Loading/loadingScreen'; // Optional: Default loading screen
    import '@babylonjs/core/Materials/standardMaterial'; // Ensure standard material is included
    import '@babylonjs/materials'; // Ensure GridMaterial is included
    import {
        GridMaterial
    } from '@babylonjs/materials';


	// --- Configuration ---
	const R2_PUBLIC_URL_BASE = 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev';
	const IMAGE_GENERATION_ENDPOINT = 'https://imagegeneration.madmods.world';
	const MODEL_GENERATION_ENDPOINT = 'https://modelgeneration.madmods.world';
	const POLLING_INTERVAL_MS = 1000;
	const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
	const MAX_POLL_ATTEMPTS = Math.round(MAX_POLL_DURATION_MS / POLLING_INTERVAL_MS);
	const MAX_MODEL_POLL_ATTEMPTS = MAX_POLL_ATTEMPTS * 2;
    const USER_ID_FOR_UPLOADS = 'frontendUser';
    const MODEL_SCALE_DIVISOR = 10.0; // Factor to divide incoming scale by

	// --- Interfaces ---
	interface PropData {
		name: string;
		description?: string;
		colors?: any[];
		transforms?: {
            translation: [number, number, number];
            rotation: [number, number, number]; // Expected in degrees
            scale: [number, number, number];
        }[];
        propImage?: string;
        propModel?: string;
	}

	interface PropState {
		id: string;
		propData: PropData;
		imageStatus: 'idle' | 'queued' | 'generating' | 'polling' | 'success' | 'failed' | 'error_enqueue';
		imageStatusUrl?: string;
		imageUrl?: string;
		imageStatusMessage?: string;
		imageAttempts: number;
		modelStatus: 'idle' | 'queued' | 'generating' | 'polling' | 'success' | 'failed' | 'error_enqueue' | 'skipped_image_failed';
		modelStatusUrl?: string;
		modelUrl?: string;
		modelStatusMessage?: string;
		modelAttempts: number;
        modelLoadedInScene: boolean; // NEW: Track if model is loaded
	}

    type TerminalStatus = 'success' | 'failed' | 'error_enqueue' | 'skipped_image_failed';
    const terminalImageStatuses: Extract<PropState['imageStatus'], 'success' | 'failed' | 'error_enqueue'>[] = ['success', 'failed', 'error_enqueue'];
    const terminalModelStatuses: TerminalStatus[] = ['success', 'failed', 'error_enqueue', 'skipped_image_failed'];

	// --- Reactive State Variables ---
	let receivedProps: PropState[] = [];
	let metadata: any | null = null;
	let isLoading: boolean = false; // Claude stream loading
	let error: string | null = null;
	let isComplete: boolean = false; // Claude stream complete flag
	let userPrompt: string = 'a sci-fi research outpost on a red planet'; // Default prompt
	let activeImagePollingIntervals: Map<string, number | NodeJS.Timeout> = new Map();
	let activeModelPollingIntervals: Map<string, number | NodeJS.Timeout> = new Map();

	// Modal State (Only Image Modal kept)
	let showImageModal = false;
	let selectedImageUrl = '';
	let selectedPropName = ''; // For modal titles

    // Final JSON Upload State
    let uploadStatus: 'idle' | 'pending' | 'uploading' | 'success' | 'failed' | 'skipped' = 'idle';
    let uploadMessage: string = '';
    let finalJsonUrl: string | null = null;

	// --- API URLs ---
	let claudeApiUrl: string = '';
    let uploadApiUrl: string = '';

    // --- BabylonJS State ---
    let babylonEngine: Engine | null = null;
    let babylonScene: Scene | null = null;
    let babylonCanvas: HTMLCanvasElement | null = null;

    var matCap:any;
    let isBBVisible: boolean = true;


    // debug boundingbox material
    let vizMaterial:any;

	// --- Lifecycle ---
	onMount(() => {
		const hostname = $page.url.hostname;
		const dev = hostname.includes('localhost') || hostname === '127.0.0.1';
		claudeApiUrl = dev ? 'https://madmods.world/api/ai/claude-streaming' : '/api/ai/claude-streaming';
        uploadApiUrl = dev ? 'https://madmods.world/api/storage/upload' : '/api/storage/upload';
		console.log('Claude API URL set to:', claudeApiUrl);
		console.log('Upload API URL set to:', uploadApiUrl);

        // Initialize BabylonJS
        if (babylonCanvas) {
            createScene(babylonCanvas);
        } else {
            console.error("BabylonJS Canvas not found on mount!");
            error = "Failed to initialize 3D view.";
        }
	});

	onDestroy(() => {
		console.log("Component destroying. Cleaning up...");
		// Clear polling intervals
		activeImagePollingIntervals.forEach(clearInterval);
		activeImagePollingIntervals.clear();
		activeModelPollingIntervals.forEach(clearInterval);
		activeModelPollingIntervals.clear();
        // Dispose BabylonJS engine and scene
        babylonEngine?.dispose();
        babylonScene?.dispose();
        console.log("BabylonJS engine disposed.");
        // Remove resize listener
        //window.removeEventListener('resize', handleResize);
	});

    // --- BabylonJS Scene Creation ---
    function createScene(canvas: HTMLCanvasElement) {
        console.log("Creating BabylonJS scene...");
        babylonEngine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        babylonScene = new Scene(babylonEngine);

        // Sky color
        //babylonScene.clearColor = new Color4(7/255, 22/255, 48/255, 1.0); // Light blue sky
        babylonScene.clearColor = new Color4(0.4, 0.6, 0.9, 1.0);

        // Camera
        const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 50, Vector3.Zero(), babylonScene);
        camera.attachControl(canvas, true);
        camera.wheelPrecision = 50; // Adjust zoom speed
        camera.lowerRadiusLimit = 5; // Prevent zooming too close
        camera.upperRadiusLimit = 5000; // Allow zooming out

        // Lights
        const light = new HemisphericLight("light", new Vector3(0, 1, 0), babylonScene);
        light.intensity = 0.8;

        const HDRURL = 'https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/static/textures/equirectangular/sky.env'
        // Import the .env file as a CubeTexture
        const texture = new CubeTexture(HDRURL, babylonScene);
        // Create a skybox mesh using this texture
        const skybox = babylonScene.createDefaultSkybox(texture, true, 10000, 0);

        
        // Ground Plane
        const ground = MeshBuilder.CreateGround("ground", { width: 10000, height: 10000 }, babylonScene);


        const gridMaterial = new GridMaterial("groundGridMaterial", babylonScene);
        gridMaterial.majorUnitFrequency = 8;
        gridMaterial.minorUnitVisibility = 0.2;
        gridMaterial.gridRatio = 5;
        gridMaterial.mainColor = new Color3(86/255,130/255,3/255);
        gridMaterial.lineColor = new Color3(1,1,1);


        // const gridMaterial = new GridMaterial("gridMaterial", babylonScene);
        // gridMaterial.majorUnitFrequency = 10;
        // gridMaterial.minorUnitVisibility = 0.45;
        // gridMaterial.gridRatio = 10; // Size of each grid square
        // gridMaterial.mainColor = new Color3(1, 1, 1); // White lines
        // gridMaterial.lineColor = new Color3(0.8, 0.8, 0.8); // Lighter grid lines
        // gridMaterial.opacity = 0.98; // Slightly transparent
        // gridMaterial.backFaceCulling = false;

        ground.material = gridMaterial;
        ground.position.y = -0.01; // Slightly below origin to avoid z-fighting if models are exactly at y=0

        // Render loop
        babylonEngine.runRenderLoop(() => {
            if (babylonScene) {
                babylonScene.render();
            }
        });


        matCap = new StandardMaterial("", babylonScene);
        matCap.disableLighting = true;

        var matCapTexture = new Texture("https://i.imgur.com/Or6RuF1.jpg", babylonScene);
        matCapTexture.coordinatesMode = Texture.SPHERICAL_MODE;

        matCap.reflectionTexture = matCapTexture;

        // Resize handler
        window.addEventListener('resize', handleResize);
        console.log("BabylonJS scene created successfully.");

        setupKeyboardControls(babylonScene);
    }

    function handleResize() {
        babylonEngine?.resize();
    }

	// --- Update Prop State Helper (Modified to include modelLoadedInScene) ---
	function updatePropState(propId: string, updates: Partial<PropState> & { propDataUpdates?: Partial<PropData> }) {
		const index = receivedProps.findIndex(p => p.id === propId);
		if (index !== -1) {
			const existingProp = receivedProps[index];
            const updatedPropData = updates.propDataUpdates ? { ...existingProp.propData, ...updates.propDataUpdates } : existingProp.propData;
            const { propDataUpdates, ...restUpdates } = updates;
			receivedProps[index] = { ...existingProp, ...restUpdates, propData: updatedPropData };
			receivedProps = [...receivedProps]; // Trigger Svelte reactivity
		} else {
			console.warn(`Attempted to update non-existent prop with ID: ${propId}`);
		}
	}


    // --- Function to setup keyboard controls ---
function setupKeyboardControls(scene: Scene) {
    // Track if ground is visible (start with visible by default)
    let isGroundVisible = true;
    
    // Add keyboard event listener
    window.addEventListener("keydown", (event) => {
        // Check if 'g' key was pressed
        if (event.key === 'g' || event.key === 'G') {
            // Toggle ground visibility
            isGroundVisible = !isGroundVisible;
            
            // Find the ground mesh and update its visibility
            const ground = scene.getMeshByName("ground");
            if (ground) {
                ground.setEnabled(isGroundVisible);
                console.log(`Ground ${isGroundVisible ? 'visible' : 'hidden'}`);
            } else {
                console.warn("Ground mesh not found!");
            }
        }
        // Check if 'g' key was pressed
        if (event.key === 'h' || event.key === 'H') {
            // Toggle bb visibility
            isBBVisible = !isBBVisible;

            if(vizMaterial){
                vizMaterial.alpha = isBBVisible == true ? 0.2 : 0; 
            }
        }

    });
    
    console.log("Keyboard controls initialized. Press 'g' to toggle ground visibility.");
}

let boundingBoxMaterial: StandardMaterial | null = null;
function getBoundingBoxMaterial(scene: Scene): StandardMaterial {
    if (!boundingBoxMaterial) {
        boundingBoxMaterial = new StandardMaterial("boundingBoxMat", scene);
        boundingBoxMaterial.diffuseColor = new Color3(0, 1, 0); // Green
        boundingBoxMaterial.alpha = 0.16; // Translucent
        boundingBoxMaterial.wireframe = true; // Optional: makes it look like a wireframe box
        // boundingBoxMaterial.emissiveColor = new Color3(0, 1, 0); // Use emissive if no scene lighting
        // boundingBoxMaterial.disableLighting = true; // Use if using emissiveColor
    }
    return boundingBoxMaterial;
}
    // --- Function to Load Model into BabylonJS Scene (NEW) ---
// --- Function to Load Model into BabylonJS Scene (MODIFIED for Multiple Transforms) ---
async function loadModelIntoScene(propState: PropState, scene: Scene) {
    // --- Initial Checks ---
    if (!propState.modelUrl || !propState.propData.transforms || propState.propData.transforms.length === 0) {
        console.error(`[Prop: ${propState.id}] Cannot load model: Missing model URL or transform data.`);
        updatePropState(propState.id, { modelStatusMessage: 'Load Error: Missing URL/transform' });
        return;
    }
    if (propState.modelLoadedInScene) {
        console.log(`[Prop: ${propState.id}] Model already loaded or load initiated, skipping.`);
        return;
    }

    updatePropState(propState.id, { modelLoadedInScene: true, modelStatusMessage: 'Loading model...' });

    const modelUrl = propState.modelUrl;
    const modelName = propState.id;

    console.log(`[Prop: ${modelName}] Loading GLB from: ${modelUrl}`);
    let result: any; // Declare result outside try to potentially use in finally/catch for cleanup

    try {
        result = await SceneLoader.ImportMeshAsync(null, "", modelUrl, scene, undefined, ".glb");

        if (!result.meshes || result.meshes.length === 0) {
            throw new Error("Loaded GLB contained no meshes.");
        }

        // --- Find the Mesh with Actual Geometry ---
        let geometryMeshTemplate: Mesh | null = null;
        for (const mesh of result.meshes) {
            if (mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
                mesh.material = matCap;
                geometryMeshTemplate = mesh;
                console.log(`[Prop: ${modelName}] Found mesh with geometry to use as template: ${mesh.name}`);
                break;
            }
        }

        if (!geometryMeshTemplate) {
            console.error(`[Prop: ${modelName}] Loaded model from ${modelUrl} contains no meshes with geometry. Meshes found:`, result.meshes.map((m: AbstractMesh) => ({ name: m.name, type: m.getClassName(), vertices: m.getTotalVertices() })));
            throw new Error("No mesh with renderable geometry found in the loaded model.");
        }

        geometryMeshTemplate.name = `${modelName}_geometry_template`;
        geometryMeshTemplate.isVisible = false; // Hide the template

        // --- Instance Creation and Transformation ---
        const transforms = propState.propData.transforms;
        const transformCount = transforms.length;
        vizMaterial = getBoundingBoxMaterial(scene); // Get the shared material

        console.log(`[Prop: ${modelName}] Creating ${transformCount} instance(s) from template '${geometryMeshTemplate.name}'.`);

        transforms.forEach((transform, index) => {
            const [tx, ty, tz] = transform.translation;
            const [rx, ry, rz] = transform.rotation; // Degrees
            const [sx, sy, sz] = transform.scale;

            const instanceName = `${modelName}_instance_${index}`;
            let instance: InstancedMesh | null = null;

            try {
                instance = geometryMeshTemplate!.createInstance(instanceName); // Use non-null assertion as we checked geometryMeshTemplate
            } catch (instanceError) {
                console.error(`[Prop: ${modelName}] Failed to create instance ${index} from template '${geometryMeshTemplate?.name}'. Error:`, instanceError);
                return; // Skip this instance
            }

            if (instance) {
                console.log(`[Prop: ${modelName}] Applying transform ${index}: T[${tx},${ty},${tz}] R[${rx},${ry},${rz}] S[${sx},${sy},${sz}]`);

                // Apply transformations to the instance
                instance.scaling = new Vector3(sx / MODEL_SCALE_DIVISOR, sy / MODEL_SCALE_DIVISOR, sz / MODEL_SCALE_DIVISOR);
                instance.position = new Vector3(tx / MODEL_SCALE_DIVISOR, ty / MODEL_SCALE_DIVISOR, tz / MODEL_SCALE_DIVISOR);
                const yawRad = Tools.ToRadians(ry);
                const pitchRad = Tools.ToRadians(rx);
                const rollRad = Tools.ToRadians(rz);
                instance.rotationQuaternion = Quaternion.RotationYawPitchRoll(yawRad, pitchRad, rollRad);
                instance.isVisible = true;
                instance.setEnabled(true);

                // --- Bounding Box Calculation and Visualization ---
                try {
                    // CRITICAL: Ensure world matrix is up-to-date *after* setting transforms
                    instance.computeWorldMatrix(true);

                    // Get the bounding info which now reflects the world matrix
                    const boundingInfo = instance.getBoundingInfo();

                    // Check if boundingInfo is valid (it might not be immediately after creation in rare cases)
                    if (!boundingInfo) {
                         console.warn(`[Prop: ${modelName}] Instance ${index} ('${instance.name}') has no bounding info after computeWorldMatrix.`);
                         return; // Skip bounding box creation for this instance
                    }

                    const boundingBox = boundingInfo.boundingBox;

                    // Dimensions of the bounding box in world space
                    const worldExtend = boundingBox.extendSizeWorld;
                    const worldWidth = worldExtend.x * 2;
                    const worldHeight = worldExtend.y * 2;
                    const worldDepth = worldExtend.z * 2;

                    // Center of the bounding box in world space
                    const worldCenter = boundingBox.centerWorld;

                     // Check for invalid dimensions (can happen if model is scaled to zero or has issues)
                    if (worldWidth <= 0 || worldHeight <= 0 || worldDepth <= 0 || !isFinite(worldWidth) || !isFinite(worldHeight) || !isFinite(worldDepth)) {
                        console.warn(`[Prop: ${modelName}] Instance ${index} ('${instance.name}') has invalid bounding box dimensions: W=${worldWidth}, H=${worldHeight}, D=${worldDepth}. Skipping bounding box mesh.`);
                        return;
                    }

                    console.log(`[Prop: ${modelName}] Instance ${index} World BBox - Center: ${worldCenter.toString()}, Size: W=${worldWidth.toFixed(2)}, H=${worldHeight.toFixed(2)}, D=${worldDepth.toFixed(2)}`);


                    // Create the visualization box mesh
                    const boxViz = MeshBuilder.CreateBox(`${instanceName}_bbox`, {
                        width: worldWidth,
                        height: worldHeight,
                        depth: worldDepth
                    }, scene);

                    // Position the visualization box at the center of the instance's world bounding box
                    boxViz.position = worldCenter;

                    // IMPORTANT: The world bounding box is Axis-Aligned (AABB).
                    // If you want the box to rotate *exactly* with the instance (Oriented Bounding Box - OBB),
                    // it's more complex. For an AABB visualization, we don't apply the instance's rotation to the box.
                    // If OBB is needed, you'd typically create a box of size 1, apply the instance's rotationQuaternion,
                    // scale it appropriately, and position it at the instance's pivot or calculated center.
                    // Let's stick to AABB for now as it's usually what's needed for debugging bounds.
                    // boxViz.rotationQuaternion = instance.rotationQuaternion.clone(); // Uncomment ONLY if you need OBB *and* understand implications

                    // Apply the translucent material
                    boxViz.material = vizMaterial;

                    // Make sure it's visible and enabled
                    boxViz.isVisible = true;
                    boxViz.setEnabled(true);

                    instance.position.y += worldHeight/2;

                    // Optional: Parent the bounding box to the instance so it moves with it
                    // boxViz.parent = instance;
                    // If parented, the position might need adjustment depending on the instance's pivot location relative to its bounding box center.
                    // For simplicity and clear world-space representation, we'll leave it unparented for now.

                    // Store reference for later cleanup

                } catch (bboxError) {
                     console.error(`[Prop: ${modelName}] Error creating bounding box for instance ${index}:`, bboxError);
                }

            } else {
                 console.warn(`[Prop: ${modelName}] Instance ${index} creation returned null or failed unexpectedly.`);
            }
        });

        console.log(`[Prop: ${modelName}] Model processing complete. ${transformCount} instance(s) placed.`);
        updatePropState(propState.id, { modelStatusMessage: `Model loaded with ${transformCount} instance(s).` });

    } catch (err: any) {
        console.error(`[Prop: ${modelName}] Error during model load or instancing process:`, err);
        updatePropState(propState.id, {
            modelStatusMessage: `Load/Instance Error: ${err.message}`,
            modelLoadedInScene: false
        });
        // Cleanup partially loaded assets and any created bounding boxes
        result?.meshes?.forEach((m:any) => m.dispose());
        result?.skeletons?.forEach((s: any) => s.dispose());
    }
}


	// --- Function to Trigger Image Generation ---
	async function triggerImageGeneration(propState: PropState) {
		if (!metadata || !metadata.worldName) {
			console.error("Cannot trigger image generation: Metadata (with worldName) not yet received.");
			updatePropState(propState.id, { imageStatus: 'failed', imageStatusMessage: 'Error: Missing world metadata.', modelStatus: 'skipped_image_failed' });
			return;
		}
		const worldID = metadata.worldName.replace(/\s+/g, '-').toLowerCase();
		const propID = propState.id.replace(/\s+/g, '-').toLowerCase();
		const inputPrompt = propState.propData.description || propState.propData.name;
		if (!inputPrompt) {
			console.error(`Cannot trigger image generation for prop ${propID}: No description or name found.`);
			updatePropState(propState.id, { imageStatus: 'failed', imageStatusMessage: 'Error: Missing prompt data.', modelStatus: 'skipped_image_failed' });
			return;
		}
		const requestBody = { inputPrompt, userID: USER_ID_FOR_UPLOADS, worldID, propID, imageFormat: 'png' }; // Use PNG for potential transparency
		console.log(`[Prop: ${propID}] Enqueuing image generation...`, requestBody);
		updatePropState(propState.id, { imageStatus: 'queued', imageStatusMessage: 'Sending request to image queue...' });
		try {
			const response = await fetch(IMAGE_GENERATION_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
			if (!response.ok) { let errorBody = `HTTP ${response.status}: ${response.statusText}`; try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* ignore */ } throw new Error(`Failed to enqueue image: ${errorBody}`); }
			const result: any = await response.json(); if (!result.statusKey) throw new Error("Image enqueue response missing 'statusKey'.");
			const fullStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`; console.log(`[Prop: ${propID}] Image task enqueued. Status URL: ${fullStatusUrl}`);
			updatePropState(propState.id, { imageStatus: 'polling', imageStatusUrl: fullStatusUrl, imageStatusMessage: 'Image Queued. Waiting...', imageAttempts: 0 });
			startImagePolling(propState.id, fullStatusUrl);
		} catch (err: any) {
			console.error(`[Prop: ${propID}] Error enqueuing image generation:`, err);
			updatePropState(propState.id, { imageStatus: 'error_enqueue', imageStatusMessage: `Image Enqueue failed: ${err.message}`, modelStatus: 'skipped_image_failed' });
		}
	}

	// --- Function to Start Image Polling ---
	function startImagePolling(propId: string, statusUrl: string) {
		clearPollingInterval(propId, 'image');
		console.log(`[Prop: ${propId}] Starting IMAGE polling for status at ${statusUrl}`);
		const intervalId = setInterval(() => { pollImageStatus(propId, statusUrl); }, POLLING_INTERVAL_MS);
		activeImagePollingIntervals.set(propId, intervalId);
	}

	// --- Function to Poll Image Status ---
	async function pollImageStatus(propId: string, statusUrl: string) {
		const propIndex = receivedProps.findIndex(p => p.id === propId);
		if (propIndex === -1) { console.warn(`[Prop: ${propId}] Image polling stopped: Prop not found.`); clearPollingInterval(propId, 'image'); return; }
		let currentAttempts = receivedProps[propIndex].imageAttempts + 1; updatePropState(propId, { imageAttempts: currentAttempts });
		if (currentAttempts > MAX_POLL_ATTEMPTS) { console.warn(`[Prop: ${propId}] Image polling timed out.`); updatePropState(propId, { imageStatus: 'failed', imageStatusMessage: 'Polling timed out.', modelStatus: 'skipped_image_failed' }); clearPollingInterval(propId, 'image'); return; }
		console.log(`[Prop: ${propId}] IMAGE Polling attempt ${currentAttempts}...`);
		try {
			const response = await fetch(statusUrl, { cache: 'no-store' });
			if (response.status === 404) { if(receivedProps[propIndex].imageStatus === 'polling') { updatePropState(propId, { imageStatusMessage: `Waiting for image status... (Attempt ${currentAttempts})` }); } return; }
			if (!response.ok) throw new Error(`HTTP error ${response.status} fetching image status`);
			const statusReport: any = await response.json(); 
            console.log(`[Prop: ${propId}] Received IMAGE status:`, statusReport.status);
            const latestPropState = receivedProps[propIndex];
			switch (statusReport.status) {
				case 'success':
					if (!statusReport.r2ImagePath) throw new Error("Image status 'success' but missing 'r2ImagePath'.");
					const fullImageUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ImagePath}`; 
                    console.log(`[Prop: ${propId}] Image generation successful! URL: ${fullImageUrl}`);
					updatePropState(propId, { imageStatus: 'success', imageUrl: fullImageUrl, imageStatusMessage: 'Image generated.', propDataUpdates: { propImage: fullImageUrl } });
					clearPollingInterval(propId, 'image');
                    const finalPropStateForModel = receivedProps.find(p => p.id === propId);
                    if (finalPropStateForModel) { triggerModelGeneration(finalPropStateForModel); }
                    else { console.error(`[Prop: ${propId}] Prop vanished before triggering model generation!`); updatePropState(propId, { modelStatus: 'failed', modelStatusMessage: 'Internal error: Prop data lost.' }); }
					break;
				case 'failure': case 'error':
                console.error(`[Prop: ${propId}] Image generation failed. Reason: ${statusReport.message}${statusReport.errorDetails ? ` -- Details: ${statusReport.errorDetails}` : ''}`);
					updatePropState(propId, { imageStatus: 'failed', imageStatusMessage: `Image Failed: ${statusReport.message || 'Unknown error'}`, modelStatus: 'skipped_image_failed' }); clearPollingInterval(propId, 'image'); break;
				case 'processing': case 'generating':
					updatePropState(propId, { imageStatus: 'generating', imageStatusMessage: `Generating image... (Attempt ${currentAttempts})` }); break;
                case 'queued':
                    updatePropState(propId, { imageStatus: 'queued', imageStatusMessage: `Image in queue... (Attempt ${currentAttempts})` }); break;
				default: console.warn(`[Prop: ${propId}] Unknown IMAGE status: ${statusReport.status}.`); updatePropState(propId, { imageStatusMessage: `Unknown status: ${statusReport.status} (Attempt ${currentAttempts})` }); break;
			}
		} catch (err: any) {
			console.error(`[Prop: ${propId}] Error during image polling:`, err);
			if (err instanceof SyntaxError) { console.warn(`[Prop: ${propId}] JSON parsing error during image poll. Retrying...`); updatePropState(propId, { imageStatusMessage: `Reading status... (Attempt ${currentAttempts})` }); }
            else { updatePropState(propId, { imageStatus: 'failed', imageStatusMessage: `Polling error: ${err.message}`, modelStatus: 'skipped_image_failed' }); clearPollingInterval(propId, 'image'); }
		}
	}

	// --- Function to Trigger Model Generation ---
	async function triggerModelGeneration(propState: PropState) {
		if (propState.imageStatus !== 'success' || !propState.imageUrl) { console.warn(`[Prop: ${propState.id}] Skipping model generation: Image failed or URL missing.`); if (propState.modelStatus !== 'skipped_image_failed') { updatePropState(propState.id, { modelStatus: 'skipped_image_failed', modelStatusMessage: 'Skipped: Image failed.' }); } return; }
		if (!metadata || !metadata.worldName) { console.error(`[Prop: ${propState.id}] Cannot trigger model generation: Metadata missing.`); updatePropState(propState.id, { modelStatus: 'failed', modelStatusMessage: 'Error: Missing world metadata.' }); return; }
		const worldID = metadata.worldName.replace(/\s+/g, '-').toLowerCase(); const propID = propState.id.replace(/\s+/g, '-').toLowerCase();
		const requestBody = { imagePublicUrl: propState.imageUrl, userID: USER_ID_FOR_UPLOADS, worldID, propID };
		console.log(`[Prop: ${propID}] Enqueuing 3D model generation...`, requestBody);
		updatePropState(propState.id, { modelStatus: 'queued', modelStatusMessage: 'Sending request to model queue...' });
		try {
			const response = await fetch(MODEL_GENERATION_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
			if (!response.ok) { let errorBody = `HTTP ${response.status}: ${response.statusText}`; try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) { /* ignore */ } throw new Error(`Failed to enqueue model: ${errorBody}`); }
			const result: any = await response.json(); if (!result.statusKey) throw new Error("Model enqueue response missing 'statusKey'.");
			const fullModelStatusUrl = `${R2_PUBLIC_URL_BASE}/${result.statusKey}`; 
            console.log(`[Prop: ${propID}] Model task enqueued. Status URL: ${fullModelStatusUrl}`);
			updatePropState(propState.id, { modelStatus: 'polling', modelStatusUrl: fullModelStatusUrl, modelStatusMessage: 'Model Queued. Waiting...', modelAttempts: 0 });
			startModelPolling(propState.id, fullModelStatusUrl);
		} catch (err: any) {
			console.error(`[Prop: ${propID}] Error enqueuing model generation:`, err);
			updatePropState(propState.id, { modelStatus: 'error_enqueue', modelStatusMessage: `Model Enqueue failed: ${err.message}` });
		}
	}

	// --- Function to Start Model Polling ---
	function startModelPolling(propId: string, statusUrl: string) {
		clearPollingInterval(propId, 'model');
		console.log(`[Prop: ${propId}] Starting MODEL polling for status at ${statusUrl}`);
		const intervalId = setInterval(() => { pollModelStatus(propId, statusUrl); }, POLLING_INTERVAL_MS);
		activeModelPollingIntervals.set(propId, intervalId);
	}

	// --- Function to Poll Model Status (MODIFIED to trigger Babylon load) ---
	async function pollModelStatus(propId: string, statusUrl: string) {
		const propIndex = receivedProps.findIndex(p => p.id === propId);
		if (propIndex === -1) { console.warn(`[Prop: ${propId}] Model polling stopped: Prop not found.`); clearPollingInterval(propId, 'model'); return; }
		let currentAttempts = receivedProps[propIndex].modelAttempts + 1; updatePropState(propId, { modelAttempts: currentAttempts });
		if (currentAttempts > MAX_MODEL_POLL_ATTEMPTS) { console.warn(`[Prop: ${propId}] Model polling timed out.`); updatePropState(propId, { modelStatus: 'failed', modelStatusMessage: 'Model polling timed out.' }); clearPollingInterval(propId, 'model'); return; }
		//console.log(`[Prop: ${propId}] MODEL Polling attempt ${currentAttempts}...`);
		try {
			const response = await fetch(statusUrl, { cache: 'no-store' });
			if (response.status === 404) { if(receivedProps[propIndex].modelStatus === 'polling') { updatePropState(propId, { modelStatusMessage: `Waiting for model status... (Attempt ${currentAttempts})` }); } return; }
			if (!response.ok) throw new Error(`HTTP error ${response.status} fetching model status`);
			const statusReport: any = await response.json(); 
            //console.log(`[Prop: ${propId}] Received MODEL status:`, statusReport.status);
			switch (statusReport.status) {
				case 'success':
					if (!statusReport.r2ModelPath) throw new Error("Model status 'success' but missing 'r2ModelPath'.");
					if (!statusReport.r2ModelPath.toLowerCase().endsWith('.glb')) { throw new Error(`Model success but path is not a .glb file: ${statusReport.r2ModelPath}`); }
					const fullModelUrl = `${R2_PUBLIC_URL_BASE}/${statusReport.r2ModelPath}`; 
                    console.log(`[Prop: ${propId}] Model generation successful! URL: ${fullModelUrl}`);
					updatePropState(propId, { modelStatus: 'success', modelUrl: fullModelUrl, modelStatusMessage: 'Model generated.', propDataUpdates: { propModel: fullModelUrl } });
					clearPollingInterval(propId, 'model');

                    // --- TRIGGER BABYLONJS LOAD ---
                    const finalPropStateForLoading = receivedProps.find(p => p.id === propId);
                    if (finalPropStateForLoading && babylonScene) {
                        console.log(`[Prop: ${propId}] Attempting to load model into BabylonJS scene...`);
                        loadModelIntoScene(finalPropStateForLoading, babylonScene); // Pass the scene reference
                    } else if (!babylonScene) {
                        console.warn(`[Prop: ${propId}] Model ready, but BabylonJS scene is not initialized. Cannot load.`);
                        updatePropState(propId, { modelStatusMessage: 'Scene not ready for load.' });
                    } else {
                        console.warn(`[Prop: ${propId}] Model ready, but couldn't find final state. Cannot load.`);
                        updatePropState(propId, { modelStatusMessage: 'Internal error loading model.' });
                    }
                    // --- END BABYLONJS LOAD TRIGGER ---
					break;
				case 'failure': case 'error':
					console.error(`[Prop: ${propId}] Model generation failed. Reason: ${statusReport.message || statusReport.errorDetails || 'Unknown error'}`);
					updatePropState(propId, { modelStatus: 'failed', modelStatusMessage: `Model Failed: ${statusReport.message || 'Unknown error'}` }); clearPollingInterval(propId, 'model'); break;
				case 'processing': case 'generating':
					updatePropState(propId, { modelStatus: 'generating', modelStatusMessage: `Generating model... (Attempt ${currentAttempts})` }); break;
                case 'queued':
				    updatePropState(propId, { modelStatus: 'queued', modelStatusMessage: `Model in queue... (Attempt ${currentAttempts})` }); break;
				default: console.warn(`[Prop: ${propId}] Unknown MODEL status: ${statusReport.status}.`); updatePropState(propId, { modelStatusMessage: `Unknown model status: ${statusReport.status} (Attempt ${currentAttempts})` }); break;
			}
		} catch (err: any) {
			console.error(`[Prop: ${propId}] Error during model polling:`, err);
            if (err instanceof SyntaxError) { console.warn(`[Prop: ${propId}] JSON parsing error during model poll. Retrying...`); updatePropState(propId, { modelStatusMessage: `Reading status... (Attempt ${currentAttempts})` }); }
            else { updatePropState(propId, { modelStatus: 'failed', modelStatusMessage: `Model polling error: ${err.message}` }); clearPollingInterval(propId, 'model'); }
		}
	}


	// --- Helper to Clear Interval ---
	function clearPollingInterval(propId: string, type: 'image' | 'model') {
		const intervalMap = type === 'image' ? activeImagePollingIntervals : activeModelPollingIntervals;
		if (intervalMap.has(propId)) { clearInterval(intervalMap.get(propId)); intervalMap.delete(propId); console.log(`[Prop: ${propId}] Cleared ${type} polling interval.`); }
	}


	// --- Function to Start Streaming (Claude Data) ---
	function startStreaming() {
		if (!claudeApiUrl || !uploadApiUrl) { error = "Initialization error: API URLs not available."; return; }
		if (!userPrompt || userPrompt.trim() === '') { error = "Please enter a prompt before generating."; return; }
		console.log(`Starting stream to ${claudeApiUrl}...`);
		// Reset state
		receivedProps = []; metadata = null; error = null; isLoading = true; isComplete = false; uploadStatus = 'idle'; uploadMessage = ''; finalJsonUrl = null;
		activeImagePollingIntervals.forEach(clearInterval); activeImagePollingIntervals.clear();
		activeModelPollingIntervals.forEach(clearInterval); activeModelPollingIntervals.clear();

        // --- Clear existing models from BabylonJS scene ---
        if (babylonScene) {
            console.log("Clearing existing models from scene...");
            // Iterate backwards as removing items shifts indices
            for (let i = babylonScene.meshes.length - 1; i >= 0; i--) {
                const mesh = babylonScene.meshes[i];
                // Avoid removing ground, camera targets, etc. Check name prefix or type.
                if (mesh.name.endsWith("_root")) { // Only remove meshes loaded by our function
                    mesh.dispose(false, true); // Dispose mesh and its hierarchy
                     console.log(`Removed mesh: ${mesh.name}`);
                }
            }
        }

		const requestBody = { prompt: userPrompt }; console.log("Sending request body:", requestBody);
		oboe({ url: claudeApiUrl, method: 'POST', body: requestBody, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, cached: false, withCredentials: false })
			.node('metadata', (meta: any) => {
				console.log('Received Metadata:', meta);
				if (!metadata) { metadata = meta; if (!metadata?.worldName) { console.error("Metadata missing 'worldName'."); }
                    receivedProps.forEach(p => { if (p.imageStatus === 'idle' && p.imageStatusMessage?.includes('Waiting for metadata')) {
                        if (metadata && metadata.worldName) { console.log(`[Prop: ${p.id}] Triggering delayed image generation.`); triggerImageGeneration(p); }
                        else { console.error(`[Prop: ${p.id}] worldName still missing.`); updatePropState(p.id, { imageStatus: 'failed', imageStatusMessage: 'Failed: Required worldName missing.', modelStatus: 'skipped_image_failed' }); }
                    }});
				} else { console.warn("Received metadata chunk again, ignoring."); }
			})
			.node('propCategories.*.props[*]', (propObject: PropData) => {
                if (!propObject?.name) { console.warn('Received prop without a name, skipping:', propObject); return; }
                if (!receivedProps.some(p => p.id === propObject.name)) {
					console.log('Received Prop Object:', propObject.name);
					const newPropState: PropState = {
						id: propObject.name, propData: { ...propObject },
						imageStatus: 'idle', imageStatusMessage: 'Received. Pending image generation.', imageAttempts: 0,
						modelStatus: 'idle', modelStatusMessage: 'Waiting for image generation.', modelAttempts: 0,
                        modelLoadedInScene: false // Initialize flag
					};
					receivedProps = [...receivedProps, newPropState];
					if (metadata && metadata.worldName) { triggerImageGeneration(newPropState); }
                    else { console.warn(`[Prop: ${newPropState.id}] Delaying image gen (waiting for metadata).`); updatePropState(newPropState.id, { imageStatusMessage: 'Waiting for metadata...' }); }
				} else { console.warn(`Received duplicate prop name '${propObject.name}'. Skipping.`); }
			})
			.done((finalJson: any) => {
				console.log('Stream finished successfully.'); isLoading = false;
                console.log('finalJson::')
                console.log(finalJson);
                let metadataError = false;
                if (!metadata) { console.error("Stream finished, but no metadata received."); if (!error) error = "Stream completed, but failed to receive essential metadata."; metadataError = true; }
                else if (!metadata.worldName) { console.error("Stream finished, metadata received but missing worldName."); if (!error) error = "Stream completed, but metadata is missing required worldName."; metadataError = true; }
                if (metadataError) {
                    receivedProps.forEach(p => { if (p.imageStatus === 'idle' && p.imageStatusMessage?.includes('Waiting for metadata')) { updatePropState(p.id, { imageStatus: 'failed', imageStatusMessage: 'Failed: Critical metadata missing.', modelStatus: 'skipped_image_failed' }); } });
                    uploadStatus = 'failed'; uploadMessage = 'Cannot upload: Critical metadata missing.';
                }
                if (!error) { isComplete = true; }
                else { isComplete = false; if (uploadStatus === 'idle') { uploadStatus = 'failed'; uploadMessage = 'Cannot upload: Errors during data generation.'; } }
			})
			.fail((errorReport: any) => {
				console.error('Stream processing failed:', errorReport);
				isLoading = false; isComplete = false; uploadStatus = 'failed'; uploadMessage = 'Cannot upload: Main data stream failed.';
				let errorMessage = `json stream failed: ${errorReport.statusCode || 'Network Error'}. `;
				if (errorReport.body) { try { const parsedBody = JSON.parse(errorReport.body); errorMessage += parsedBody.error || parsedBody.message || parsedBody.details || errorReport.body; } catch (e) { errorMessage += errorReport.body; } }
				else if (errorReport.thrown) { errorMessage += (errorReport.thrown as Error).message || 'Client-side error'; }
				error = errorMessage;
				receivedProps.forEach(p => {
					if (!terminalImageStatuses.includes(p.imageStatus as any)) { updatePropState(p.id, { imageStatus: 'failed', imageStatusMessage: 'Failed: Stream error.' }); clearPollingInterval(p.id, 'image'); }
                    if (!terminalModelStatuses.includes(p.modelStatus as any)) { updatePropState(p.id, { modelStatus: 'failed', modelStatusMessage: 'Failed: Stream error.' }); clearPollingInterval(p.id, 'model'); }
				});
			});
	}

    // --- Check if all props have finished processing ---
    $: isAllProcessingComplete = receivedProps.length > 0 && receivedProps.every(p =>
        (terminalImageStatuses as ReadonlyArray<string>).includes(p.imageStatus) &&
        (terminalModelStatuses as ReadonlyArray<string>).includes(p.modelStatus)
    );

    // --- Trigger Final JSON Upload when Ready ---
    $: {
        if (isComplete && isAllProcessingComplete && uploadStatus === 'idle' && !error) {
             console.log("All generation processes complete. Triggering final JSON upload.");
             uploadStatus = 'pending'; uploadFinalSceneJson();
        } else if (isComplete && receivedProps.length === 0 && uploadStatus === 'idle' && !error) {
            console.log("Stream finished, no props generated. Skipping upload.");
            uploadStatus = 'skipped'; uploadMessage = 'No props generated, skipping upload.';
        }
    }

    // --- Function to Upload Final Scene JSON ---
    async function uploadFinalSceneJson() {
        if (!metadata || !metadata.worldName) { console.error("Cannot upload: Missing metadata."); uploadStatus = 'failed'; uploadMessage = 'Upload failed: Missing required metadata.'; return; }
        if (!uploadApiUrl) { console.error("Cannot upload: Upload API URL missing."); uploadStatus = 'failed'; uploadMessage = 'Upload failed: Config error (API URL).'; return; }
        uploadStatus = 'uploading'; uploadMessage = 'Uploading final scene JSON...'; finalJsonUrl = null;
        const worldID = metadata.worldName.replace(/\s+/g, '-').toLowerCase();
        const r2key = `worlds/${USER_ID_FOR_UPLOADS}/${worldID}/scene/${worldID}.json`;
        const finalSceneData = { metadata: metadata, props: receivedProps.map(p => p.propData) }; // Use updated propData
        try {
            const jsonString = JSON.stringify(finalSceneData, null, 2);
            const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
            const requestBody = { r2key: r2key, fileData: base64Data, contentType: 'application/json' };
            console.log(`Uploading final JSON to R2 key: ${r2key}`);
            const response = await fetch(uploadApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
            const result:any = await response.json();
            if (!response.ok) { console.error("Upload API call failed:", response.status, result); throw new Error(result?.error || result?.message || `Upload failed status ${response.status}`); }
            console.log("Final JSON uploaded successfully:", result);
            uploadStatus = 'success'; uploadMessage = `Scene JSON uploaded successfully!`; finalJsonUrl = result.publicUrl;
        } catch (err: any) {
            console.error("Error during final JSON upload:", err);
            uploadStatus = 'failed'; uploadMessage = `Upload failed: ${err.message}`;
        }
    }

    // --- Modal Control Functions ---
    function openImageModal(url: string, name: string) {
        selectedImageUrl = url; selectedPropName = name; showImageModal = true;
    }
    function closeImageModal() {
        showImageModal = false; selectedImageUrl = ''; selectedPropName = '';
    }
    // Model modal functions removed as we use the main scene now

</script>

<svelte:head>
	<title>BabylonJS World Builder</title>
</svelte:head>

<!-- Main Layout: Canvas + Bottom Control Bar -->
<div class="h-screen w-screen flex flex-col relative bg-gray-900">

    <!-- Top Area for Status Messages & Metadata -->
    <div class="absolute top-0 left-0 right-0 p-4 z-10 pointer-events-none">
        <div class="max-w-4xl mx-auto space-y-2">
            <!-- Status/Error Messages -->
            {#if error}
            <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative shadow-md pointer-events-auto" role="alert">
                <strong class="font-bold">Error!</strong>
                <span class="block sm:inline"> {error}</span>
            </div>
            {/if}
            {#if isComplete && !isAllProcessingComplete && receivedProps.length > 0 && !error && !['success', 'failed', 'skipped'].includes(uploadStatus) }
            <div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-2 rounded relative shadow-md pointer-events-auto" role="status">
                <strong class="font-bold">Processing...</strong>
                <span class="block sm:inline"> Waiting for all generation tasks to finish...</span>
            </div>
            {/if}
            {#if isLoading}
            <div class="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-2 rounded relative shadow-md pointer-events-auto flex items-center" role="status">
                 <svg class="animate-spin mr-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span class="block sm:inline"> Streaming data from Madmods AI...</span>
            </div>
            {/if}

            <!-- Display Metadata Briefly -->
            {#if metadata}
            <div class="p-2 border rounded-lg shadow-sm bg-gray-50 bg-opacity-80 text-xs pointer-events-auto">
                <p><strong>World:</strong> <span class:text-red-600={!metadata.worldName}>{metadata.worldName || 'ERR!'}</span> | <strong>Props:</strong> {receivedProps.length} | <strong>Status:</strong>
                    {#if uploadStatus === 'success'} <span class="text-green-600">Uploaded</span>
                    {:else if uploadStatus === 'uploading'} <span class="text-blue-600">Uploading...</span>
                    {:else if uploadStatus === 'failed'} <span class="text-red-600">Upload Failed</span>
                    {:else if uploadStatus === 'skipped'} <span class="text-gray-500">Upload Skipped</span>
                    {:else if isComplete && isAllProcessingComplete} <span class="text-green-600">Ready</span>
                    {:else if isLoading || (isComplete && !isAllProcessingComplete)} <span class="text-yellow-600">Generating...</span>
                    {:else} <span class="text-gray-500">Idle</span>
                    {/if}
                </p>
                {#if finalJsonUrl && uploadStatus === 'success'}
                     <a href={finalJsonUrl} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">View Final JSON</a>
                {/if}
                 {#if uploadStatus === 'failed'} <p class="text-red-600">{uploadMessage}</p> {/if}
            </div>
            {/if}

             <!-- Display progress for individual items (optional, can get busy) -->
             <!-- {#if receivedProps.length > 0 && !isAllProcessingComplete}
             <div class="p-2 border rounded-lg shadow-sm bg-gray-50 bg-opacity-80 text-xs pointer-events-auto max-h-24 overflow-y-auto">
                 <p class="font-semibold mb-1">Generation Status:</p>
                 <ul class="list-disc pl-4">
                 {#each receivedProps as prop (prop.id)}
                     <li class="text-xs">
                         {prop.id}:
                         Img: <span class:text-green-600={prop.imageStatus==='success'} class:text-red-600={prop.imageStatus==='failed'} class:text-yellow-600={prop.imageStatus!=='success' && prop.imageStatus!=='failed'}>{prop.imageStatus}</span> |
                         Mdl: <span class:text-green-600={prop.modelStatus==='success'} class:text-red-600={prop.modelStatus==='failed' || prop.modelStatus==='skipped_image_failed'} class:text-yellow-600={prop.modelStatus!=='success' && prop.modelStatus!=='failed' && prop.modelStatus!=='skipped_image_failed'}>{prop.modelStatus}</span>
                         {#if prop.modelStatus === 'success' && !prop.modelLoadedInScene}<span class="text-blue-500"> (Loading...)</span>{/if}
                         {#if prop.modelStatus === 'success' && prop.modelLoadedInScene}<span class="text-green-500"> (Loaded)</span>{/if}
                     </li>
                 {/each}
                 </ul>
             </div>
             {/if} -->

        </div>
    </div>

	<!-- BabylonJS Canvas -->
	<canvas id="renderCanvas" bind:this={babylonCanvas} class="flex-grow w-full h-full outline-none focus:outline-none"></canvas>

	<!-- Bottom Control Bar -->
	<div class="absolute bottom-0 left-0 right-0 p-4 bg-gray-800 bg-opacity-90 shadow-inner z-20">
        <div class="max-w-4xl mx-auto flex items-center gap-4">
            <!-- Prompt Input Area -->
            <textarea
                bind:value={userPrompt}
                rows="2"
                class="flex-grow p-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-white focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-500 resize-none placeholder-gray-400"
                placeholder="Describe your game world..."
                disabled={isLoading || uploadStatus === 'uploading'}
            ></textarea>

            <!-- Generate Button -->
            <button
                on:click={startStreaming}
                disabled={isLoading || !claudeApiUrl || !uploadApiUrl || uploadStatus === 'uploading'}
                class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out shadow-md disabled:cursor-not-allowed whitespace-nowrap"
            >
                {#if isLoading}
                    <svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Generating...
                {:else if !claudeApiUrl || !uploadApiUrl} Initializing...
                {:else if uploadStatus === 'uploading'}
                    <svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Uploading...
                {:else} Generate World
                {/if}
            </button>
        </div>
	</div>

</div> <!-- End Main Layout -->


<!-- Image Modal (Kept for viewing source images) -->
{#if showImageModal}
<div
	class="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-75 p-4"
	on:click|self={closeImageModal}
	role="dialog"
	aria-modal="true"
	aria-labelledby="image-modal-title"
>
	<div class="relative max-w-4xl max-h-[90vh] bg-white rounded-lg shadow-xl overflow-hidden">
		<button
			on:click={closeImageModal}
			class="absolute top-2 right-2 z-50 rounded-full bg-gray-600 bg-opacity-50 p-1 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white"
			aria-label="Close image viewer"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
		</button>
        <h3 id="image-modal-title" class="text-center py-2 text-sm font-semibold bg-gray-100">Image for: {selectedPropName}</h3>
		{#if selectedImageUrl}
			<img src={selectedImageUrl} alt="Full size for {selectedPropName}" class="block max-w-full max-h-[80vh] object-contain mx-auto p-2"/>
		{:else}
			<div class="p-8 text-center text-gray-500">Loading image...</div>
		{/if}
	</div>
</div>
{/if}

<!-- ModelViewer Modal removed -->

<style>
	/* Ensure canvas fills its container */
	#renderCanvas {
		width: 100%;
		height: 100%;
        display: block; /* Prevents potential extra space below canvas */
	}
    /* Allow touch interactions on canvas for camera control */
    canvas {
        touch-action: none; /* Prevents browser default touch actions like scrolling */
    }
    /* Basic body styles if needed */
	:global(body) {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        margin: 0;
        padding: 0;
        overflow: hidden; /* Prevent scrollbars on the body */
    }
</style>