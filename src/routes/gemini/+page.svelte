<script lang="ts">
    import { onMount } from "svelte";
	import { fade } from "svelte/transition";
	import { page } from '$app/stores';
    import { SSE } from 'sse.js';
	// Preline UI
	//import("preline/dist");


	let el:HTMLCanvasElement;
    let handleSubmit:any;
    let inputText:any, loading:any, answer:any;
	onMount(async () => {
        //const { init } = await import('$lib/babylon/BabylonScene');
		//init();

        loading = false;
        let error = false;

        inputText = 'one';

        answer = '';

        handleSubmit = async () => {
            loading = true;
            error = false;

            answer = '';

            const eventSource = new SSE('/api/ai/gemini', {
                headers: {
                    'Content-Type': 'application/json'
                },
                payload: JSON.stringify({ inputText })
            });

            inputText = '';

            eventSource.addEventListener('error', (e:any) => {
                console.log('error', e);
                error = true;
                loading = false;

                console.log('An error occured');
            });

            eventSource.addEventListener('message', (e:any) => {
                try {
                    loading = false;
                    const data = JSON.parse(e.data);
                    console.log(data);

                    // if (data.choices[0].finish_reason === 'stop') {
                    //     // End of Stream
                    //     return;
                    // }

                    //const { content } = data;
                    answer = (answer ?? '') + data;
                } catch (err) {
                    error = true;
                    loading = false;

                    console.error(err);
                    console.log('Failed to read message');
                }
            });
        };

	});


</script>

<svelte:head>
	<title>Madmods World</title>
	<meta name="description" content="Madmods World" />
</svelte:head>

<!-- <canvas id="BabylonCanvas" style="width:100%; height:100%" class="fixed"></canvas> -->

<!-- <h1 class="text-5xl text-center py-6 mb-10">Say hello to Garbis👋</h1> -->

<div class="flex justify-center">
	<form class="flex flex-col w-[520px] shrink" on:submit|preventDefault={handleSubmit}>
		<label class="pb-2" for="userInput">Write your text here:</label>
		<textarea class="h-48 resize-none rounded-md" name="userInput" bind:value={inputText}></textarea>

		{#if !loading}
			<button class="btn btn-primary mt-4">Prompt</button>
		{/if}

		{#if loading}
			<button class="btn btn-primary mt-4" disabled
				>GENERATING <span class="spinner">⚡</span></button
			>
		{/if}
		<div class="mt-4">
			<h2>Answer:</h2>
			{#if answer}
				<p>{answer}</p>
			{/if}
		</div>
	</form>
</div>