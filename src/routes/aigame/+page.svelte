<script lang="ts">
    import { onMount } from "svelte";
	import { fade } from "svelte/transition";
	import { page } from '$app/stores';


	let el:HTMLCanvasElement;

	onMount(async () => {
		const { makeGame } = await import('$lib/three/AIGame3');
		makeGame();
	});


</script>

<svelte:head>
	<title>Madmods World</title>
	<meta name="description" content="Madmods World" />
</svelte:head>



