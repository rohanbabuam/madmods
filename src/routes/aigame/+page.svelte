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
		console.log([sceneData[0]])
		let sceneData0 = [sceneData[0]];
		await generateImages(sceneData0);
	}

	async function testPOST(){
		let dev:any;
		if (window.location.port === "") {
			dev = false;
		} else {
			dev = true;
		}
		let postEndpoint:any;
		let uploadObject = {
			'fileURL_toUpload' : 'https://replicate.delivery/xezq/cOhjxtTbDeTbTaOhqiGBLtifBu4UYt2ejrfGRkbes5t9eFPIF/out-0.jpg',
			'r2key' : 'worlds/testuser/world1/props/dino1.jpg'
		}

		if(dev){
			postEndpoint = "https://madmods.world/api/test/post"
		}else{
			postEndpoint = "/api/test/post"
		}

		const PostResult:any = await fetch(postEndpoint, {
			method: 'POST',
			headers: {
				// VITAL: Tell the server you're sending JSON
				'Content-Type': 'application/json',
				// Add any other necessary headers like Authorization if needed
				// 'Authorization': 'Bearer your_token_here'
			},
			body: JSON.stringify(uploadObject)
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

<div class="h-screen w-full border-2 border-red-500">
1
</div>
<div class="h-screen w-full border-2 border-red-500">
	2
</div>





