<script lang="ts">
	// Props and Bindings
	let { value = '', isGenerating = false }: { value?: string; isGenerating?: boolean } = $props();
	let { onSubmit }: { onSubmit: (prompt: string) => void } = $props();

	function handleSubmit() {
		if (value.trim() && !isGenerating) {
			onSubmit(value);
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSubmit();
		}
	}
</script>

<div id="prompt-container">
	<textarea
		id="prompt-input"
		placeholder="a green and yellow colored robotic dog"
		bind:value={value}
		onkeydown={handleKeyDown}
		disabled={isGenerating}
	>
    </textarea>
	<button
		id="prompt-submit"
		onclick={handleSubmit}
		disabled={!value.trim() || isGenerating}
	>
		{#if isGenerating}
			Generating...
		{:else}
			Create
		{/if}
	</button>
</div>

<style>
	#prompt-container {
		position: absolute; /* Kept absolute positioning relative to its parent (#runArea) */
		bottom: 15px;
		right: 15px;
		display: flex;
		align-items: flex-end; /* Align items to bottom */
		gap: 5px;
		background-color: rgba(112, 92, 204, 0.75);
		padding: 8px;
		border-radius: 6px;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
		z-index: 11; /* Ensure it's above the canvas */
	}

	#prompt-input {
		width: 300px;
		height: 45px; /* Fixed height */
		min-height: 45px; /* Ensure it doesn't shrink */
		background-color: #f0f0f0;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 8px 10px;
		font-family: sans-serif;
		font-size: 13px;
		line-height: 1.4;
		resize: none; /* Prevent manual resize */
		box-sizing: border-box;
		color: #333;
		/* Allow text selection */
		user-select: text;
		-webkit-user-select: text;
		-moz-user-select: text;
		-ms-user-select: text;
	}
    #prompt-input:disabled {
        background-color: #e0e0e0;
        cursor: not-allowed;
    }

	#prompt-submit {
		height: 45px; /* Match textarea height */
		padding: 0 12px;
		background-color: #705ccc;
		color: #fff;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 13px;
		font-weight: 700;
		box-sizing: border-box;
		white-space: nowrap; /* Prevent text wrapping */
		transition: background-color 0.2s ease;
		flex-shrink: 0; /* Prevent shrinking */
	}
	#prompt-submit:disabled {
		background-color: #675ba0;
		cursor: not-allowed;
		opacity: 0.7;
	}
	#prompt-submit:hover:not(:disabled) {
		background-color: #8970f8;
	}
</style>