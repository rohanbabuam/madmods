<script lang="ts">
	import ObjectCard from '$lib/components/ObjectCard.svelte';
	import type { GeneratedObject } from '$lib/types/GeneratedObject';
	import { createEventDispatcher } from 'svelte';

	// Props from parent
	let {
		active,
		objects,
		isLoading,
		error
	}: {
		active: boolean;
		objects: GeneratedObject[];
		isLoading: boolean;
		error: string | null;
	} = $props();

    // Define the event dispatcher - needed for Svelte 4 style events or manual dispatch
    // For Svelte 5, passing handlers like `onCardClick` as props is more typical,
    // but let's stick to the original event pattern for ObjectCard for now.
    // If ObjectCard uses `dispatch`, this component needs to forward it.

    // Event handler to forward the click from ObjectCard
    function handleCardClick(event: CustomEvent<{ object: GeneratedObject }>) {
        // Forward the original event detail
		// This assumes the parent component listens with `on:viewObject`
		// We need to define `dispatch` if using Svelte 4 patterns
		// In Svelte 5, we'd typically just call a prop function passed from the parent
		// Let's modify ObjectCard's call to be `on:view={handleCardClick}` instead of `onCardClick={...}`
		// And this component will just call the handler passed from the parent.
		// Reverting to the original structure's direct prop call for simplicity:
		// Parent passes `onObjectCardClick` prop which is the handler function.
    }

	// Let's adjust to use the prop-based approach expected in the parent's structure
	let { onObjectCardClick }: { onObjectCardClick: (object: GeneratedObject) => void } = $props();

</script>

<div id="objectsArea" class="object-library-root" class:hidden={!active}>
	{#if isLoading && objects.length === 0}
		<div class="loading-placeholder">Loading Objects...</div>
	{:else if error}
		<div class="error-placeholder">Error: {error}</div>
	{:else if objects.length === 0 && !isLoading}
		<div class="empty-placeholder">No objects found. Create some!</div>
	{:else}
		<div id="object-grid">
			{#each objects as object (object.id)}
				<ObjectCard
					{object}
					onCardClick={() => onObjectCardClick(object)}
                    <!-- TODO: Add on:rename event handling if ObjectCard emits it -->
                    <!-- on:rename={(e) => dispatch('renameObject', e.detail)} -->
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.object-library-root {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		background-color: #4a4a4a;
		padding: 10px;
		scrollbar-width: thin;
		scrollbar-color: #8970f8 rgba(0, 0, 0, 0.2);
	}
	.object-library-root::-webkit-scrollbar { width: 8px; }
	.object-library-root::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.1); }
	.object-library-root::-webkit-scrollbar-thumb { background-color: #8970f8; border-radius: 4px; border: 2px solid #4a4a4a; }

	.hidden {
		display: none !important;
	}

	#object-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 10px;
	}

	.loading-placeholder,
	.error-placeholder,
	.empty-placeholder {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%; /* Ensure it takes full height if grid is empty */
		min-height: 100px; /* Give some minimum height */
		font-size: 14px;
		padding: 20px;
		text-align: center;
		color: #aaa;
	}
	.error-placeholder {
		color: #ffc8c8;
	}
</style>