<script lang="ts">
    import { onMount } from "svelte";
	import { fade } from "svelte/transition";
	import { page } from '$app/stores';


	let el:HTMLCanvasElement;

	onMount(async () => {
        const { init } = await import('$lib/three/ThreeScene');
		init();

		addEventListener("scroll", (event:any) => {});
		let scrollCounter = 0;
		onscroll = (event) => {
		};
	});


</script>

<svelte:head>
	<title>Madmods World</title>
	<meta name="description" content="Madmods World" />
</svelte:head>

<div class="absolute w-full h-screen flex items-center justify-center
aos transition-all duration-500 ease-in-out"
data-animstage-3="-translate-y-full delay-400">
	<img id="hero-bg" 
	class="fixed w-full h-screen object-cover" 
	src="/images/hero-bg.png" alt="logo"/>

	<img id="hero-banner" 
	class="fixed w-full h-auto opacity-100 object-cover object-bottom
	aos transition-all duration-500 ease-in-out transform" 
	data-animstage-1="opacity-0 -translate-y-150"
	src="/images/hero-elm-1.svg" alt="logo"/>
</div>



<div id="dummy-promptbox" 
     class="fixed left-1/2 transform -translate-x-1/2 w-full max-w-md
            aos transition-all -bottom-100 delay-200 duration-500 ease-out opacity-90"
     data-animstage-1="bottom-36"
     data-animstage-3="translate-y-120">
  
  <!-- Game-themed textarea with filled background -->
  <textarea id="dummy-text" class="
    p-4 pb-14 block w-full h-[250px] bg-[#420085] text-white text-xl
    rounded-lg border-4 border-white/20 focus:border-white/50 
    placeholder-white/50 font-mono text-sm shadow-lg
    transition-all duration-200 ease-out
    dark:bg-[#5a00b5] dark:border-white/30"
    placeholder="Enter your command...">
  </textarea>
  
  <!-- Game-themed toolbar -->
  <div class="absolute bottom-px inset-x-px p-2 rounded-b-md bg-[#300061] border-4 border-white/20">
    <div class="flex flex-wrap justify-between items-center gap-2">
      
      <!-- Left Button Group -->
      <div class="flex items-center space-x-2">
        <!-- Cancel Button (X) -->
		<button type="button" class="
		flex justify-center items-center size-8 rounded-lg 
		bg-[#420085] text-white hover:bg-[#5a00b5]
		border border-white/20 transition-colors duration-150">
		
		<!-- Return/Back Icon -->
		<svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		  <path d="M9 14L4 9l5-5"/>
		  <path d="M4 9h11a4 4 0 0 1 0 8h-1"/>
		</svg>
	  </button>
	  
        <!-- <button type="button" class="
          flex justify-center items-center size-8 rounded-lg 
          bg-red-500/90 text-white hover:bg-red-600
          transition-colors duration-150 shadow-sm">
          <svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button> -->
        
        <!-- Attach Button -->
        <!-- <button type="button" class="
          flex justify-center items-center size-8 rounded-lg 
          bg-[#420085] text-white hover:bg-[#5a00b5]
          border border-white/20 transition-colors duration-150">
          <svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
        </button> -->
      </div>

	  	


		<!-- Text Prompt Button -->
		
      
      <!-- Right Button Group -->
      <div class="flex items-center space-x-2">
		<!-- Text Button -->
		<button type="button" class="
			flex justify-center items-center size-8 rounded-lg 
			bg-[#420085] text-white hover:bg-[#5a00b5]
			border border-white/20 transition-all duration-150
			group relative overflow-hidden">

			<!-- Text Bubble Icon SVG -->
			<svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
			<line x1="8" y1="10" x2="16" y2="10"/>
			<line x1="8" y1="14" x2="14" y2="14"/>
			</svg>
		</button>

		<!-- Scribble Mode Button -->
			<button type="button" class="
			flex justify-center items-center size-8 rounded-lg 
			bg-[#420085] text-white hover:bg-[#5a00b5]
			border border-white/20 transition-all duration-150
			group relative overflow-hidden">

			<!-- Pencil Scribble Icon SVG -->
			<svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 19l7-7 3 3-7 7-3-3z"/>
			<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
			<path d="M2 2l7.586 7.586"/>
			<circle cx="11" cy="11" r="2"/>
			</svg>
			</button>

		<!-- Image Import Button -->
		<button type="button" class="
			flex justify-center items-center size-8 rounded-lg 
			bg-[#420085] text-white hover:bg-[#5a00b5]
			border border-white/20 transition-all duration-150
			group relative overflow-hidden">


			<!-- Image Icon SVG -->
			<svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
			<circle cx="8.5" cy="8.5" r="1.5"/>
			<path d="M21 15l-3.5-3.5L12 18l-2-2-4.5 4.5"/>
			</svg>
		</button>

        <!-- Mic Button -->
        <button type="button" class="
          flex justify-center items-center size-8 rounded-lg 
          bg-[#420085] text-white hover:bg-[#5a00b5]
          border border-white/20 transition-colors duration-150">
          <svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        </button>
        
        <!-- Send Button (Primary Action) -->
        <button type="button" class="
  flex justify-center items-center size-8 rounded-lg 
  bg-gradient-to-br from-purple-500 to-[#420085] text-white
  shadow-[0_0_8px_2px_rgba(168,85,247,0.6)] hover:shadow-[0_0_12px_4px_rgba(168,85,247,0.8)]
  transition-all duration-300
  group relative overflow-hidden">
  
  <!-- Sparkle Particles (hidden until hover) -->
  <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
    <div class="absolute top-1 left-3 w-0.5 h-0.5 bg-white rounded-full animate-sparkle-1"></div>
    <div class="absolute top-2 right-2 w-0.5 h-0.5 bg-white rounded-full animate-sparkle-2"></div>
    <div class="absolute bottom-2 left-4 w-0.5 h-0.5 bg-white rounded-full animate-sparkle-3"></div>
  </div>

  <!-- Star Rating Icon -->
  <svg class="size-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
  </svg>
  
  <!-- Add this to your CSS -->
  <style>
    @keyframes sparkle-1 {
      0% { transform: translateY(0) scale(1); opacity: 0; }
      50% { opacity: 1; }
      100% { transform: translateY(-8px) scale(0.5); opacity: 0; }
    }
    @keyframes sparkle-2 {
      0% { transform: translateY(0) scale(1); opacity: 0; }
      50% { opacity: 1; }
      100% { transform: translateY(-6px) translateX(2px) scale(0.3); opacity: 0; }
    }
    @keyframes sparkle-3 {
      0% { transform: translateY(0) scale(1); opacity: 0; }
      50% { opacity: 1; }
      100% { transform: translateY(-4px) translateX(-1px) scale(0.4); opacity: 0; }
    }
    .animate-sparkle-1 { animation: sparkle-1 1.5s infinite; }
    .animate-sparkle-2 { animation: sparkle-2 1.8s infinite 0.3s; }
    .animate-sparkle-3 { animation: sparkle-3 1.6s infinite 0.6s; }
  </style>
</button>
      </div>
    </div>
  </div>
</div>

<div id="scroll-indicator" class="scroll-downs absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50">
	<div class="mousey">
	  <div class="scroller"></div>
	</div>
</div>


<style>
	body,html  {
  background-color: #000;
  width: 100%;
  min-height: 100%;
  padding: 0;
  margin: 0;
}
.scroll-downs { 
  width :34px;
  height: 55px;
}
.mousey {
  width: 3px;
  padding: 10px 15px;
  height: 35px;
  border: 4px solid #fff;
  border-radius: 25px;
  opacity: 0.75;
  box-sizing: content-box;
}
.scroller {
  width: 4px;
  height: 16px;
  border-radius: 25%;
  background-color: #fff;
  animation-name: scroll;
  animation-duration: 1s;
  animation-timing-function: cubic-bezier(.15,.41,.69,.94);
  animation-iteration-count: infinite;
}
@keyframes scroll {
  0% { opacity: 0; }
  10% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(16px); opacity: 1.0;}
}
</style>