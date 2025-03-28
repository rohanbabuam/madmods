<script lang="ts">
    import { onMount } from "svelte";
	import { fade } from "svelte/transition";
	import { page } from '$app/stores';


	let el:HTMLCanvasElement;

	onMount(async () => {
        const { init } = await import('$lib/three/scene');
		init();
	});


</script>

<svelte:head>
	<title>Madmods World</title>
	<meta name="description" content="Madmods World" />
</svelte:head>
