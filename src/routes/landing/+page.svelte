<script lang="ts">
    import { onMount } from "svelte";
	import { fade } from "svelte/transition";
	import { page } from '$app/stores';
	// Preline UI
	//import("preline/dist");


	let el:HTMLCanvasElement;

	onMount(async () => {
        //const { init } = await import('$lib/babylon/Landing');
		//init();
	});


</script>

<svelte:head>
	<title>Madmods World</title>
	<meta name="description" content="Madmods World" />
</svelte:head>

<canvas id="BabylonCanvas" style="width:100%; height:100%" class="fixed z-100 border-0 outline-0"></canvas>


<div id="mainContainer" class="bg-blue-500/0 w-100vw opacity-100">
    <!-- <div class="w-full h-screen flex items-center justify-center">
        <img id="hero-bg" 
        class="w-full h-screen object-cover" 
        src="/images/hero-bg.png" alt="logo"/>

        <img id="hero-banner" 
        class="w-full h-auto object-cover"
        src="/images/hero-elm-1.svg" alt="logo"/>
    </div> -->
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
	<p class="py-100 text-3xl">hello </p>
</div>