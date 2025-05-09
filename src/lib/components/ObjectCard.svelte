<script lang="ts">
	import type { GeneratedObject } from '$lib/types/GeneratedObject';

	// Svelte 5: Define props using $props, including the callback for card click
	let {
		object,
		// This is the callback prop the parent will provide
		onCardClicked // Changed name slightly for clarity from onCardClick (prop name) vs on:cardClick (event name)
	}: {
		object: GeneratedObject;
		onCardClicked?: (obj: GeneratedObject) => void; // The callback function type
	} = $props();


	function formatDate(dateString: string | null | undefined): string {
		if (!dateString) return 'Unknown date';
		try {
			return new Date(dateString).toLocaleDateString(undefined, {
				year: 'numeric', month: 'short', day: 'numeric'
			});
		} catch (e) {
			console.error('Error formatting date:', e);
			return 'Invalid date';
		}
	}

	function getUserDisplay(userId: string | null | undefined): string {
        if (!userId) return 'Unknown User';
		return `User: ${userId.substring(0, 6)}...`;
	}

	function handleInternalClick() {
		console.log('ObjectCard internal click detected for:', object.objectName);
		// Call the callback prop if it was provided by the parent
		if (onCardClicked) {
			onCardClicked(object);
		} else {
            console.warn('ObjectCard clicked, but no onCardClicked callback was provided by the parent.');
        }
	}

	function handleDragStart(event: DragEvent) {
		if (object.modelStatus === 'success' && object.modelUrl) {
			console.log(`Dragging started for: ${object.objectName}`);
			event.dataTransfer?.setData('application/madmods-object+json', JSON.stringify(object));
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'copy';
			}
		} else {
			console.log(`Preventing drag for ${object.objectName}, model not ready.`);
			event.preventDefault();
		}
	}
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div
	class="object-card"
	onclick={handleInternalClick}
	draggable={object.modelStatus === 'success' && !!object.modelUrl}
	ondragstart={handleDragStart}
	role="button"
	tabindex="0"
	aria-label={`View details for ${object.objectName || 'object'}`}
>
	<div class="card-thumbnail">
		{#if object.imageUrl}
			<img src={object.imageUrl} alt={object.prompt || 'Generated Object'} loading="lazy" />
		{:else if object.isGenerating || object.status === 'generating' || object.status === 'polling' || object.status === 'queued'}
            <div class="thumbnail-placeholder generating">
                 <svg class="animate-spin h-5 w-5 text-gray-400 mb-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle> <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                 <span class="text-xs mt-1">{object.statusMessage ?? 'Processing...'}</span>
            </div>
		{:else}
			<div class="thumbnail-placeholder">No Image</div>
		{/if}
	</div>
	<div class="card-content">
		<p class="card-prompt" title={object.prompt ?? ''}>{object.prompt || 'No prompt'}</p>
		<div class="card-meta">
			<span class="card-user" title={`User ID: ${object.user_id}`}>{getUserDisplay(object.user_id)}</span>
			<span class="card-date">{formatDate(object.created_at)}</span>
		</div>
		{#if object.modelStatus === 'success' && object.modelUrl}
			<span class="card-badge model-ready" title="3D Model Available">3D Ready</span>
		{:else if object.modelStatus && object.modelStatus !== 'idle' && object.modelStatus !== 'skipped_image_failed'}
			 <span class="card-badge model-processing" title={`3D Status: ${object.modelStatusMessage ?? object.modelStatus}`}>
				{object.modelStatus === 'queued' || object.modelStatus === 'polling' ? '3D Queued' :
				 object.modelStatus === 'generating' ? '3D Generating' :
				 object.modelStatus === 'failed' || object.modelStatus === 'error_enqueue' ? '3D Failed' :
				 '3D...'}
			</span>
		{:else if object.status === 'success'}
            <span class="card-badge image-ready" title="Image Ready">Image</span>
		{/if}
        {#if object.status === 'failed' || object.status === 'error_enqueue' || object.status === 'db_error'}
             <span class="card-badge image-failed" title={`Image Failed: ${object.statusMessage ?? object.status}`}>Failed</span>
        {/if}
	</div>
</div>

<style>
	/* Styles remain the same */
	.object-card {
		background-color: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
		position: relative;
        cursor: pointer;
	}
	.object-card:hover,
    .object-card:focus-visible
     {
		transform: translateY(-2px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
		border-color: rgba(255, 255, 255, 0.3);
        outline: none;
	}
    .object-card:focus-visible {
         border-color: #8970f8;
         box-shadow: 0 0 0 2px rgba(137, 112, 248, 0.5);
    }
	.card-thumbnail {
		width: 100%;
		aspect-ratio: 1 / 1;
		background-color: rgba(0, 0, 0, 0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
        position: relative;
	}
	.card-thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.thumbnail-placeholder {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.5);
        text-align: center;
        padding: 5px;
	}
    .thumbnail-placeholder.generating {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
	.card-content {
		padding: 8px;
		background-color: rgba(0, 0, 0, 0.1);
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-height: 60px;
	}
	.card-prompt {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.9);
		margin: 0 0 6px 0;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
		min-height: calc(1.3em * 2);
        word-break: break-word;
	}
	.card-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: auto;
	}
	.card-user,
	.card-date {
		font-size: 9px;
		color: rgba(255, 255, 255, 0.6);
		white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
	}
    .card-user { max-width: 60%; }
    .card-badge {
        position: absolute;
        top: 6px;
        right: 6px;
        color: white;
        font-size: 9px;
        font-weight: 600;
        padding: 2px 5px;
        border-radius: 3px;
        line-height: 1;
        border: 1px solid rgba(255, 255, 255, 0.3);
        background-color: rgba(0,0,0,0.4);
        z-index: 1;
    }
    .object-card[draggable="true"] { cursor: grab; }
    .object-card[draggable="true"]:active { cursor: grabbing; }
    .object-card[draggable="false"] { cursor: pointer; opacity: 0.8; }
    .card-badge.model-ready { background-color: rgba(76, 175, 80, 0.8); }
    .card-badge.model-processing { background-color: rgba(255, 193, 7, 0.8); color: #333;}
    .card-badge.image-ready { background-color: rgba(33, 150, 243, 0.8); }
    .card-badge.image-failed { background-color: rgba(244, 67, 54, 0.8); }
</style>