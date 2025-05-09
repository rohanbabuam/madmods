<!-- File: lib/components/creatorPage/LibraryPanel.svelte -->
<script lang="ts">
  import { LayoutGrid, Shapes } from 'lucide-svelte';
  import { onMount, onDestroy, tick } from 'svelte';
  import { browser } from '$app/environment';

  import { objectStore } from '$lib/stores/objectStore';
  import ObjectCard from '$lib/components/ObjectCard.svelte';
  import EditableObjectModal from '$lib/components/EditableObjectModal.svelte';
  import type { GeneratedObject } from '$lib/types/GeneratedObject';
  import { sessionStore, supabaseStore } from '$lib/stores/authStore';
  import { enqueueModelGenerationRequest, enqueueImageGenerationRequest } from '$lib/services/generationService';
  import { updateObjectNameInDb, fetchUserObjects } from '$lib/services/objectDBService';
  import { WORLD_ID } from '$lib/config';
  import { get } from 'svelte/store';

  let activeTab: 'Library' | 'Scene' | null = $state(null);
  let libraryContainerElement: HTMLElement | undefined = $state();
  let libraryPanelElement: HTMLElement | undefined = $state();
  let tabsRowElement: HTMLElement | undefined = $state();
  let isResizing = $state(false);
  let currentPanelWidthPx = $state(420);
  let startResizeX = $state(0);
  let initialPanelWidthOnResizeStart = $state(0);
  let selectedObjectForModal = $state<GeneratedObject | null>(null);
  let renamingObjectId = $state<string | null>(null);
  let renameValue = $state('');

  const MIN_PANEL_WIDTH_PX = 400;
  const MAX_PANEL_WIDTH_PX = 600;

  const libraryObjects = $derived($objectStore.objects);
  const isLoadingLibrary = $derived($objectStore.isLoading);
  const libraryError = $derived($objectStore.error);

  const currentUserId = $derived($sessionStore?.user?.id);
  const currentSupabaseClient = $derived(get(supabaseStore));

  const panelStyleWidth = $derived(activeTab ? `${currentPanelWidthPx}px` : 'auto');

  const objectGridColsClass = $derived(currentPanelWidthPx > 500 ? 'grid-cols-3' : 'grid-cols-2');


  // const objectGridColsClass = $derived(() => {
  //   if (!activeTab) return 'grid-cols-2';
  //   if (currentPanelWidthPx <= 350) return 'grid-cols-1';
  //   if (currentPanelWidthPx <= 550) return 'grid-cols-2';
  //   return 'grid-cols-3';
  // });

  const VIEWPORT_TOP_MARGIN_REM = 1;
  const VIEWPORT_BOTTOM_MARGIN_REM = 1;
  const panelTotalVerticalMarginPx = (VIEWPORT_TOP_MARGIN_REM + VIEWPORT_BOTTOM_MARGIN_REM) * 16;
  const openPanelTotalHeightStyle = $derived(`calc(100vh - ${panelTotalVerticalMarginPx}px)`);
  const panelStyleHeight = $derived(activeTab ? openPanelTotalHeightStyle : 'auto');

  function startResize(event: MouseEvent | TouchEvent) {
    if (!browser || !libraryPanelElement) return;
    isResizing = true;
    const currentX = (event instanceof MouseEvent) ? event.clientX : event.touches[0].clientX;
    startResizeX = currentX;
    initialPanelWidthOnResizeStart = libraryPanelElement.offsetWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('touchmove', handleResize, { passive: false });
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchend', stopResize);
  }

  function handleResize(event: MouseEvent | TouchEvent) {
    if (!isResizing || !browser) return;
    if (event.cancelable) event.preventDefault();
    const currentX = (event instanceof MouseEvent) ? event.clientX : event.touches[0].clientX;
    const dx = currentX - startResizeX;
    let newWidth = initialPanelWidthOnResizeStart - dx;
    if (newWidth < MIN_PANEL_WIDTH_PX) newWidth = MIN_PANEL_WIDTH_PX;
    else if (newWidth > MAX_PANEL_WIDTH_PX) newWidth = MAX_PANEL_WIDTH_PX;
    currentPanelWidthPx = newWidth;
  }

  function stopResize() {
    if (!isResizing || !browser) return;
    isResizing = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('touchmove', handleResize);
    window.removeEventListener('mouseup', stopResize);
    window.removeEventListener('touchend', stopResize);
  }

  const TABS = [
    { id: 'Library' as const, label: 'Library', icon: LayoutGrid },
    { id: 'Scene' as const, label: 'Scene', icon: Shapes },
  ];

  async function toggleTabPanel(tabId: 'Library' | 'Scene') {
    if (activeTab === tabId) {
      activeTab = null;
    } else {
      const previouslyActive = activeTab !== null;
      activeTab = tabId;
      if (!previouslyActive && tabsRowElement) {
        await tick();
        let initialOpenWidth = Math.max(tabsRowElement.offsetWidth + 4, MIN_PANEL_WIDTH_PX);
        currentPanelWidthPx = initialOpenWidth > currentPanelWidthPx ? initialOpenWidth : currentPanelWidthPx;
      } else if (!previouslyActive && !tabsRowElement) {
        currentPanelWidthPx = currentPanelWidthPx < MIN_PANEL_WIDTH_PX ? MIN_PANEL_WIDTH_PX : currentPanelWidthPx;
      }
    }
  }

  function handleCardWasClicked(objectFromCard: GeneratedObject) {
      if (objectFromCard && typeof objectFromCard.id === 'string') {
      selectedObjectForModal = objectFromCard;
      } else {
          console.warn("Received click from ObjectCard with unexpected data:", objectFromCard);
      }
}

async function handleRegenerateFromModal(newPrompt: string) {
  if (!selectedObjectForModal || !currentUserId || !currentSupabaseClient) return;
  const originalId = selectedObjectForModal.original_image_id ?? selectedObjectForModal.id;
  const objToRegen = selectedObjectForModal;
      selectedObjectForModal = null;
  await enqueueImageGenerationRequest(newPrompt, currentUserId, objToRegen.world_id || WORLD_ID, originalId);
}

async function handleMake3DFromModal() {
  if (!selectedObjectForModal || !currentUserId || !currentSupabaseClient) return;
      const objectToProcess = objectStore.getObjectById(selectedObjectForModal.id);
  selectedObjectForModal = null;
  if (objectToProcess) {
          if (objectToProcess.status === 'success' && objectToProcess.imageUrl &&
              (objectToProcess.modelStatus === 'idle' || objectToProcess.modelStatus === 'skipped_image_failed' || objectToProcess.modelStatus === 'error_enqueue' || objectToProcess.modelStatus === 'failed')
          ) {
               await enqueueModelGenerationRequest(objectToProcess.id, currentUserId, objectToProcess.world_id || WORLD_ID);
          } else if (objectToProcess.modelStatus === 'success' && objectToProcess.modelUrl) {
              alert(`Object "${objectToProcess.objectName}" already has a 3D model.`);
          } else if (objectToProcess.modelStatus === 'queued' || objectToProcess.modelStatus === 'polling' || objectToProcess.modelStatus === 'generating') {
              alert(`Model generation for "${objectToProcess.objectName}" is already in progress: ${objectToProcess.modelStatusMessage}`);
          } else if (objectToProcess.status !== 'success' || !objectToProcess.imageUrl) {
              alert(`Cannot make 3D model for "${objectToProcess.objectName}" as the image is not ready or failed.`);
          }
  }
}

  function handleStartRename(object: GeneratedObject, event?: MouseEvent) {
      if (event) event.stopPropagation();
      renamingObjectId = object.id;
      renameValue = object.objectName;
      setTimeout(() => {
          const inputEl = document.getElementById(`rename-input-${object.id}`);
          inputEl?.focus();
          (inputEl as HTMLInputElement)?.select();
      }, 0);
  }

  async function submitRename(object: GeneratedObject) {
      if (!currentUserId || !currentSupabaseClient || !renamingObjectId) return;
      const newName = renameValue.trim();
      const originalName = object.objectName;
      renamingObjectId = null;
      if (newName && newName !== originalName) {
          objectStore.updateObjectState(object.id, { objectName: newName });
          const success = await updateObjectNameInDb(currentSupabaseClient, currentUserId, object.id, newName);
          if (!success) {
              objectStore.updateObjectState(object.id, { objectName: originalName });
              alert("Failed to save name change.");
          }
      }
  }
  function cancelRename() { renamingObjectId = null; }

  function handleRenameKeyDown(event: KeyboardEvent, object: GeneratedObject) {
      if (event.key === 'Enter') { event.preventDefault(); submitRename(object); }
      else if (event.key === 'Escape') { cancelRename(); }
  }

  // Effect for fetching data
  $effect(() => {
      if (activeTab === 'Library' && currentUserId && currentSupabaseClient) {
          fetchUserObjects(currentSupabaseClient, currentUserId);
      } else if (activeTab === 'Library' && !currentUserId && currentSupabaseClient) {
          fetchUserObjects(currentSupabaseClient, null);
      }
  });

  // ADDED: Effect for debugging grid class
  $effect(() => {
      if (browser && activeTab === 'Library'){ // Only log when relevant
        console.log(`Panel Resize Debug - Width: ${currentPanelWidthPx}px, Grid Class: ${objectGridColsClass}`);
      }
  });


  onMount(() => {
    if (browser) {
      if (!activeTab && tabsRowElement) {
      } else if (activeTab && tabsRowElement) {
          let initialOpenWidth = Math.max(tabsRowElement.offsetWidth + 4, MIN_PANEL_WIDTH_PX);
          currentPanelWidthPx = initialOpenWidth;
      }
    }
  });

  onDestroy(() => {
    if (browser) {
      if (isResizing) stopResize();
    }
  });
</script>

<!-- Template remains exactly the same as the last version -->
<div bind:this={libraryContainerElement} class="fixed top-4 right-4 z-20">
  <div
    bind:this={libraryPanelElement}
    class="relative bg-gray-800 rounded-lg shadow-xl border border-gray-700 flex flex-col items-end transition-[height] duration-100 ease-in-out"
    style:width={panelStyleWidth}
    style:height={panelStyleHeight}
  >
    {#if activeTab}
      <div
        role="separator"
        aria-label="Resize library panel"
        tabindex="0"
        class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-10 bg-gray-600 hover:bg-blue-500 rounded-full cursor-ew-resize flex items-center justify-center z-10 group"
        onmousedown={startResize}
        ontouchstart={startResize}
      >
         <svg xmlns="http://www.w3.org/2000/svg" width="10" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 group-hover:text-white transition-colors"><line x1="9" y1="4" x2="9" y2="20"></line><line x1="15" y1="4" x2="15" y2="20"></line></svg>
      </div>
    {/if}

    <div bind:this={tabsRowElement} class="flex items-center justify-end p-2 space-x-1 w-full flex-shrink-0 bg-gray-850 rounded-t-lg">
      {#each TABS as tab (tab.id)}
        <button
          onclick={() => toggleTabPanel(tab.id)}
          class="flex items-center justify-center space-x-1.5 px-2.5 py-1.5
                 rounded-md text-sm font-medium transition-colors
                 focus:outline-none focus:z-10 h-full whitespace-nowrap"
          class:bg-gray-700={activeTab === tab.id}
          class:text-blue-400={activeTab === tab.id}
          class:hover:bg-gray-700={activeTab !== tab.id}
          class:text-gray-300={activeTab !== tab.id}
          aria-pressed={activeTab === tab.id}
          aria-label={`Toggle ${tab.label} panel`}
        >
          <svelte:component this={tab.icon} class="h-5 w-5" />
          <span>{tab.label}</span>
        </button>
      {/each}
    </div>

    {#if activeTab}
      <div class="w-full flex-grow overflow-hidden flex flex-co">
        <div class="p-3 overflow-y-auto flex-grow custom-scrollbar-container bg-gray-800">
          {#if activeTab === 'Library'}
            {#if libraryError}
                <div class="text-red-400 bg-red-900 p-2 rounded text-xs mb-2">
                    Error: {libraryError}
                    <button
                        onclick={() => fetchUserObjects(currentSupabaseClient!, currentUserId!)}
                        class="ml-2 underline"
                    >Retry</button>
                </div>
            {/if}
            {#if libraryObjects.length === 0 && !isLoadingLibrary && !libraryError}
                <p class="text-gray-500 text-sm text-center py-4">No objects in library. Create some!</p>
            {:else if libraryObjects.length > 0}
                <!-- Grid container -->
                <div class="grid {objectGridColsClass} gap-3">
                    {#each libraryObjects as obj (obj.id)}
                        <!-- Grid item wrapper -->
                        <div class="relative group">
                            {#if renamingObjectId === obj.id}
                                <input
                                    id="rename-input-{obj.id}"
                                    type="text"
                                    bind:value={renameValue}
                                    onkeydown={(e) => handleRenameKeyDown(e, obj)}
                                    onblur={() => submitRename(obj)}
                                    class="w-full p-1 text-xs bg-gray-900 text-white border border-blue-500 rounded absolute bottom-0 left-0 z-20"
                                />
                            {/if}
                            <ObjectCard
                                object={obj}
                                onCardClicked={handleCardWasClicked}
                            />
                            <button
                                title="Rename {obj.objectName}"
                                class="absolute top-1 left-1 bg-gray-700 hover:bg-blue-600 text-white p-1 rounded-full text-xs opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10 w-5 h-5 flex items-center justify-center"
                                onclick={(event) => handleStartRename(obj, event)}
                                aria-label="Rename {obj.objectName}"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
                            </button>
                        </div>
                    {/each}
                </div>
            {:else if isLoadingLibrary}
                 <p class="text-gray-500 text-sm text-center py-4">Loading objects...</p>
            {/if}
          {:else if activeTab === 'Scene'}
            <div>
              <div class="text-gray-400 space-y-3">
                <p>Scene objects will appear here.</p>
                {#each Array(5) as _, i}
                  <div class="p-2 bg-gray-750 rounded">
                    <p class="font-mono text-xs">Scene Object {i + 1}</p>
                    <p class="text-xs text-gray-500 mt-0.5">Properties for item {i + 1}.</p>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

{#if selectedObjectForModal}
<EditableObjectModal
  imageUrl={selectedObjectForModal.imageUrl ?? ''}
  prompt={selectedObjectForModal.prompt ?? ''}
  altText={`Details for object: ${selectedObjectForModal.objectName ?? 'Unnamed Object'}`}
  modelStatus={selectedObjectForModal.modelStatus}
  modelUrl={selectedObjectForModal.modelUrl ?? undefined}
  onClose={() => selectedObjectForModal = null}
  onRegenerate={handleRegenerateFromModal}
  onMake3D={handleMake3DFromModal}
/>
{/if}

<style>
  /* ... (styles remain the same) ... */
  .bg-gray-850 { background-color: #1f2937; }
  .bg-gray-750 { background-color: #374151; }
  .custom-scrollbar-container {
    scrollbar-width: thin;
    scrollbar-color: #4a5568 #2d3748;
  }
  .custom-scrollbar-container::-webkit-scrollbar { width: 8px; height: 8px; }
  .custom-scrollbar-container::-webkit-scrollbar-track { background: #222730; border-radius: 10px; }
  .custom-scrollbar-container::-webkit-scrollbar-thumb { background-color: #4b5563; border-radius: 10px; border: 2px solid #222730; }
  .custom-scrollbar-container::-webkit-scrollbar-thumb:hover { background-color: #6b7280; }
  .custom-scrollbar-container::-webkit-scrollbar-button { display: none; }
  .custom-scrollbar-container::-webkit-scrollbar-corner { background: transparent; }
</style>