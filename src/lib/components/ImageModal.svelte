<!-- src/lib/components/ImageModal.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// --- Props ---
	export let imageUrl: string = '';
	export let altText: string = 'Generated Image';
	export let onClose: () => void;

	// --- Event Handlers ---
	function handleOverlayKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
			onClose();
		}
	}
    function handleGlobalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}
	function preventClose(event: MouseEvent | KeyboardEvent) {
        if (event.currentTarget !== event.target) {
             event.stopPropagation();
        }
	}

	// --- Lifecycle ---
	let modalContainer: HTMLElement;
	onMount(() => {
		window.addEventListener('keydown', handleGlobalKeydown);
        modalContainer?.focus();
	});
	onDestroy(() => {
		window.removeEventListener('keydown', handleGlobalKeydown);
	});
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
	bind:this={modalContainer}
	class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4 outline-none"
	on:click={onClose}
    on:keydown={handleOverlayKeydown}
	role="dialog"
	aria-modal="true"
	aria-labelledby="image-modal-title"
	tabindex="-1"
>
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="relative bg-white rounded-lg shadow-xl overflow-hidden
               max-w-xl max-h-[75vh]  /* <-- ADJUSTED: Made smaller */
               w-auto /* Allow width to shrink if image is narrow */
              "
		on:click|stopPropagation={preventClose}
	>
 		<h2 id="image-modal-title" class="sr-only">{altText}</h2>
		<!-- Image still uses max-h/max-w to fit *within* the container -->
        <img src={imageUrl} alt={altText} class="block max-w-full max-h-[calc(75vh-4rem)] object-contain" />

		<button
			on:click={onClose}
			class="absolute top-2 right-2 p-2 text-gray-600 bg-white bg-opacity-70 rounded-full hover:bg-opacity-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 transition"
			aria-label="Close image viewer"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>
</div>