<script lang="ts">
    import { onMount } from "svelte";
	import { fade } from "svelte/transition";
	import { page } from '$app/stores';
	// Preline UI
	import("preline/dist");


	let el:HTMLCanvasElement;

	onMount(async () => {
        const { init } = await import('$lib/babylon/BabylonScene');
		init();
	});


</script>

<svelte:head>
	<title>Madmods World</title>
	<meta name="description" content="Madmods World" />
</svelte:head>

<canvas id="BabylonCanvas" style="width:100%; weight:100%">

</canvas>