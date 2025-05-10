<script lang="ts">
  import ProjectHeader from '$lib/components/creatorPage/ProjectHeader.svelte';
  import ActionPanel from '$lib/components/creatorPage/ActionPanel.svelte';
  import PromptInput from '$lib/components/creatorPage/PromptInput.svelte';
  import LibraryPanel from '$lib/components/creatorPage/LibraryPanel.svelte';
  import ToolsPanel from '$lib/components/creatorPage/ToolsPanel.svelte';
  import type { Tool as CreatorTool } from '$lib/components/creatorPage/ToolsPanel.svelte';
  import { activeThreeDToolStore } from '$lib/stores/toolStore'; // Import the store
  import type { ToolName as ThreeDToolName } from '$lib/blockly/3d'; // Actual tool type from engine

  import { sessionStore, loginModalConfigStore, requestLogin, supabaseStore, handleLogout } from '$lib/stores/authStore';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import { onMount, onDestroy, tick } from 'svelte'; // Added tick
  import { get } from 'svelte/store';

  // Services and stores for new functionality
  import { objectStore } from '$lib/stores/objectStore';
  import { fetchUserObjects } from '$lib/services/objectDBService';
  import { enqueueImageGenerationRequest, cleanupAllPolling, enqueueModelGenerationRequest } from '$lib/services/generationService';
  import {
    initializeThreeD,
    getThreeDInstance,
    spawnObjectInScene,
    togglePhysicsInScene,
    toggleInspector,
    cleanupThreeDService,
    resizeEngine,
    setActiveTool,
    loadStaticMeshesFromSessionData
  } from '$lib/services/threeDService';


  import type { GeneratedObject } from '$lib/types/GeneratedObject';
  import { WORLD_ID } from '$lib/config';

  // Import new saveloadService
  import * as saveloadService from '$lib/state/saveload'; // USE THIS IMPORT
  import type { SavedProjectData } from '$lib/state/saveload'; // USE THIS IMPORT for the type

  let { data } = $props<{ data: PageData }>();

  // Original state variables
  let currentProjectName = $state("Dino Park");
  let currentPromptText = $state("");
  let currentActiveTool = $derived($activeThreeDToolStore as CreatorTool | null);

  // Auth state
  let user = $derived($sessionStore?.user);
  let isLoadingClientAuth = $state(true);
  let loginRequested = $state(false);

  // New state for 3D canvas and initialization
  let threeDCanvasElement: HTMLCanvasElement | undefined = $state();
  let isThreeDInitialized = $state(false);
  let isInitializingThreeD = $state(false);
  let currentPhysicsState = $state(false);

  // --- Authentication Effects ---
  $effect(() => {
    if (browser) {
      isLoadingClientAuth = false;
    }
  });

  $effect(() => {
    const localUser = $sessionStore?.user;
    const localSupabase = get(supabaseStore);

    if (browser && !isLoadingClientAuth) {
      if (!localUser) {
        if (data.requiresAuth) {
          if (!$loginModalConfigStore.visible && !loginRequested) {
            requestLogin($page.url.pathname + $page.url.search, true);
            loginRequested = true;
          }
        }
      } else {
        loginRequested = false;
        if (localSupabase) {
           fetchUserObjects(localSupabase, localUser.id);
        }
      }
    }
  });

  $effect(() => {
    const localUser = $sessionStore?.user;
    if (browser && !isLoadingClientAuth && !localUser && data.requiresAuth && !$loginModalConfigStore.visible) {
      if ($page.url.pathname === '/create') {
         goto('/', { replaceState: true });
      }
    }
  });
  // --- End Authentication Effects ---

   async function handleToolSelectionFromPanel(selectedToolKey: CreatorTool) { // Use string here for now, or Tool type
    console.log(`[+page.svelte handleToolSelectionFromPanel] UI selected tool: ${selectedToolKey}`);

    // Update the active tool state here
    currentActiveTool = selectedToolKey; // This will re-render ToolsPanel with the correct active button

    setActiveTool(selectedToolKey as ThreeDToolName); // This calls the service to enable/disable the actual tool logic

    // Handle other tool-specific UI logic if needed (e.g., inspector toggle)
    const threeD = getThreeDInstance();
    if (!threeD) return;

    // switch (selectedToolKey) {
    //     case 'inspector-toggle':
    //         toggleInspector();
    //         break;
    //     case 'physics-toggle':
    //         currentPhysicsState = !currentPhysicsState;
    //         await togglePhysicsInScene(currentPhysicsState);
    //         break;
    //     // 'select' and 'clone' tool activation is handled by setActiveTool directly.
    // }
  }


  async function handlePromptGenerate(event: CustomEvent<{ prompt: string }>) {
    const prompt = event.detail.prompt;
    if (!prompt.trim()) {
      alert("Please enter a prompt!");
      return;
    }
    const localUser = user;
    if (!localUser) {
        requestLogin($page.url.pathname + $page.url.search, false);
        return;
    }
    await enqueueImageGenerationRequest(prompt, localUser.id, WORLD_ID);
    currentPromptText = '';
  }

  async function handlePlayAction() {
    const threeD = getThreeDInstance();
    if (!threeD) {
        alert("3D environment not ready.");
        return;
    }
    if (!currentPhysicsState) {
        currentPhysicsState = true;
        await togglePhysicsInScene(true);
        // currentActiveTool = 'physics-on'; // Update if ToolsPanel reflects this directly
        // For simplicity, ToolsPanel can query physics state from threeDService or a store if needed
    }
  }

  async function handleResetAction() {
    const threeD = getThreeDInstance();
    if (!threeD) return;

    // Clear mesh registry and session data before resetting scene
    // This ensures a truly fresh start for the session.
    // MeshRegistry.clearRegistry(); // threeDService.createScene should handle clearing dynamic meshes. Static meshes for session are handled by load.
    saveloadService.clearSessionData(); // Clear saved session state

    await threeD.createScene(true, currentPhysicsState);
    await threeD.createCamera();

    // After reset, there are no static objects from session to load.
    // If you have default objects to load on reset, do it here.

    alert("Scene has been reset and session data cleared.");
  }

  function handleShareAction() {
    alert("Share action triggered on page!");
  }

  function handleUserProfileAction(event: CustomEvent<{action: string}>) {
    if (event.detail.action === 'logout'){
        handleLogout();
    } else {
        alert(`Profile action: ${event.detail.action}`);
    }
  }

  function handleCanvasDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			if (event.dataTransfer.types.includes('application/madmods-object+json')) {
				event.dataTransfer.dropEffect = 'copy';
                threeDCanvasElement?.classList.add('dragging-over');
			} else {
				event.dataTransfer.dropEffect = 'none';
			}
		}
	}

  function handleCanvasDragLeave(event: DragEvent) {
      if (event.relatedTarget === null || !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
          threeDCanvasElement?.classList.remove('dragging-over');
      }
  }

	async function handleCanvasDrop(event: DragEvent) {
		event.preventDefault();
        threeDCanvasElement?.classList.remove('dragging-over');
		const objectJson = event.dataTransfer?.getData('application/madmods-object+json');
		if (!objectJson || !threeDCanvasElement) return;

		try {
			const droppedObject: GeneratedObject = JSON.parse(objectJson);
            if (droppedObject.modelStatus !== 'success' || !droppedObject.modelUrl) {
				alert(`Object "${droppedObject.objectName}" doesn't have a ready 3D model.`);
				return;
			}
			const rect = threeDCanvasElement.getBoundingClientRect();
			const screenX = event.clientX - rect.left;
			const screenY = event.clientY - rect.top;

			await spawnObjectInScene(droppedObject, screenX, screenY);

            // After successful drop and spawn, save the project state
            saveloadService.saveProjectToSession(null); // Pass null for blocklyWorkspace

		} catch (error) {
			console.error('Error processing dropped object:', error);
			alert('Failed to place the dropped object. Check console for details.');
		}
	}

  onMount(async () => {
    if (browser) {
        // Add resize listener once
        window.addEventListener('resize', resizeEngine);
    }
  });

  // Effect for 3D initialization, depends on user being logged in
  $effect(() => {
    async function init3D() {
      if (browser && user && !isThreeDInitialized && !isInitializingThreeD) {
        console.log("[+page.svelte $effect init3D] Starting 3D initialization process...");
        isInitializingThreeD = true;
        try {
          // 1. Initialize the basic 3D scene and engine
          await initializeThreeD('threeDViewportCanvas');
          isThreeDInitialized = true;
          console.log("[+page.svelte $effect init3D] 3D engine initialized. Setting initial tool.");
          setActiveTool('select'); // This will also update the activeThreeDToolStore

          // 2. Attempt to load project data from session storage
          console.log("[+page.svelte $effect init3D] Attempting to load project data from session storage (key: madmodsProjectData)...");
          const projectSessionData = saveloadService.loadProjectFromSession(null); // Pass null for Blockly workspace

          if (projectSessionData) {
            console.log("[+page.svelte $effect init3D] Successfully retrieved projectSessionData object.");
            if (projectSessionData.scene && projectSessionData.scene.length > 0) {
              console.log(`[+page.svelte $effect init3D] Found ${projectSessionData.scene.length} static objects in session. Loading them into the scene...`);
              await loadStaticMeshesFromSessionData(projectSessionData.scene);
              console.log("[+page.svelte $effect init3D] Finished loading static meshes from session.");
            } else {
              console.log("[+page.svelte $effect init3D] No static scene objects found in session data (scene array is empty or missing).");
            }
            // Here you would also load Blockly data if projectSessionData.code exists and workspace is available
            // if (projectSessionData.code && get(blocklyWorkspaceStore)) { /* Load Blockly blocks */ }
          } else {
            console.log("[+page.svelte $effect init3D] No project data found in session storage by saveloadService, or data was invalid.");
          }

        } catch (error: any) {
          console.error(
            "ERROR during 3D initialization or session loading on /create page:",
            error.message || String(error),
            error
          );
        } finally {
          isInitializingThreeD = false;
          console.log("[+page.svelte $effect init3D] Finished 3D initialization and loading attempt.");
        }
      } else {
        // Optional log for why init isn't running
        // console.log(`[+page.svelte $effect init3D] Skipping 3D initialization. Conditions: browser=${browser}, user=${!!user}, !isThreeDInitialized=${!isThreeDInitialized}, !isInitializingThreeD=${!isInitializingThreeD}`);
      }
    }
    init3D();
  });


  onDestroy(() => {
    if (browser) {
        cleanupAllPolling();
        cleanupThreeDService();
        window.removeEventListener('resize', resizeEngine);
    }
  });
</script>

{#if user}
  <div class="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center justify-center p-4 relative overflow-hidden">
    <div class="fixed top-4 left-4 z-20 flex items-start space-x-2">
      <ProjectHeader bind:projectName={currentProjectName} />
      <ActionPanel
        on:play={handlePlayAction}
        on:reset={handleResetAction}
        on:share={handleShareAction}
        on:profileAction={handleUserProfileAction}
      />
    </div>

    <ToolsPanel
      activeTool={currentActiveTool}
      onToolSelect={handleToolSelectionFromPanel}
    />

    <LibraryPanel />
    <PromptInput
      bind:value={currentPromptText}
      on:generate={handlePromptGenerate}
      disabled={!isThreeDInitialized || isLoadingClientAuth || !user}
    />

    <div
        class="absolute inset-0 w-full h-full z-0"
        ondragover={handleCanvasDragOver}
        ondrop={handleCanvasDrop}
        ondragleave={handleCanvasDragLeave}
        role="region"
        aria-label="3D Viewport and Object Drop Zone"
        aria-describedby={isInitializingThreeD && !isThreeDInitialized ? "loading-message" : undefined}
    >
        {#if isInitializingThreeD && !isThreeDInitialized}
            <div class="absolute inset-0 flex items-center justify-center bg-gray-800 z-10">
                <p class="text-xl text-gray-400">Initializing 3D Viewport...</p>
            </div>
        {/if}
        <canvas
            id="threeDViewportCanvas"
            bind:this={threeDCanvasElement}
            class="w-full h-full block outline-none {isThreeDInitialized ? '' : 'opacity-0'}"
        ></canvas>
    </div>
  </div>
{:else if isLoadingClientAuth && data.requiresAuth}
  <div class="min-h-screen bg-gray-800 text-gray-400 flex flex-col items-center justify-center p-4">
    <p class="text-xl">Loading and Authenticating...</p>
  </div>
{:else if data.requiresAuth && $loginModalConfigStore.visible && $loginModalConfigStore.intendedPath?.startsWith($page.url.pathname)}
  <div class="min-h-screen bg-gray-800 text-gray-400 flex flex-col items-center justify-center p-4">
    <p class="text-xl mb-4">Login Required</p>
    <p>Please log in to access the Create page.</p>
  </div>
{:else if data.requiresAuth}
  <div class="min-h-screen bg-gray-800 text-gray-400 flex flex-col items-center justify-center p-4">
    <p class="text-xl">Verifying access...</p>
  </div>
{:else if !data.user && !data.requiresAuth}
  <!-- This case might indicate the user just logged out or accessed /create directly without auth -->
  <!-- Depending on your app flow, you might want to redirect or show a public landing -->
  <div class="min-h-screen bg-gray-800 text-gray-400 flex flex-col items-center justify-center p-4">
      <p class="text-xl">Welcome! You can view public content or log in to create.</p>
      <!-- Optionally, show a login button or a redirect -->
      <!-- <button on:click={() => requestLogin($page.url.pathname + $page.url.search, false)} class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Login</button> -->
  </div>
{/if}

<style>
	#threeDViewportCanvas.dragging-over {
 		outline: 3px dashed #7C00FE; /* Or var(--color-primary) if you use CSS vars */
 		outline-offset: -3px;
        box-shadow: 0 0 15px rgba(124, 0, 254, 0.5); /* Or var(--color-primary-shadow) */
	}
</style>