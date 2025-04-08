<script lang="ts">
    import { onMount } from "svelte";
	import { fade } from "svelte/transition";
	import { page } from '$app/stores';
	import {loadScene, generateImages } from '$lib/babylon/AIGame1'

	let el:HTMLCanvasElement;

	let World_JsonURL:string = "https://pub-48572794ea984ea9976e5d5856e58593.r2.dev/worlds/testuser/world1/json/world.json"
	let sceneData:any;
	async function loadWorld(){
		console.log('loading world json')
		sceneData = await loadScene(World_JsonURL);
		console.log(sceneData);
	}

	async function genImages(){
		console.log('generating images')
		await generateImages(sceneData);
	}

	async function testPOST(){
		let dev:any;
		if (window.location.port === "") {
			dev = false;
		} else {
			dev = true;
		}
		let postEndpoint:any;
		if(0){
			postEndpoint = "https://madmods.world/api/test/post"
		}else{
			postEndpoint = "/api/test/post"
		}

		const PostResult:any = await fetch(postEndpoint, {
			method: 'POST',
		});
		const uploadResultJSON = await PostResult.json()
		let uploadFileResponse = JSON.stringify(uploadResultJSON);
		console.log(uploadFileResponse);
	}
	
	onMount(async () => {
		//const { makeGame, loadScene, generateImages } = await import('$lib/babylon/AIGame1');
		//makeGame();
	});


</script>

<svelte:head>
	<title>Madmods World</title>
	<meta name="description" content="Madmods World" />
</svelte:head>

<div class="flex flex-wrap justify-bottom items-center gap-2 absolute bottom-16">

	<button type="button" id="parseJSON" class="border" on:click = {(e:any)=>{ loadWorld() } }>
		Parse JSON
	</button>
	
	<button type="button" id="parseJSON" class="border" on:click = {(e:any)=>{ genImages() } }>
		Generate Images
	</button>

	<!-- <button type="button" id="parseJSON" class="border" on:click = {(e:any)=>{ testGET() } }>
		Test GET
	</button> -->

	<button type="button" id="parseJSON" class="border" on:click = {(e:any)=>{ testPOST() } }>
		Test POST
	</button>
</div>





