<script lang="ts">
    import { onMount } from "svelte";

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
</div>

<div class="absolute w-full h-screen flex flex-col gap-2 items-center justify-start pt-40 z-10 border-0 border-red-500
aos transition-all duration-500 ease-in-out"
data-animstage-3="-translate-y-250 delay-400">
	<img id="hero-banner" 
	class="w-4/10 h-auto object-cover
	aos transition-all duration-500 ease-in-out" 
	data-animstage-3="-translate-y-150 opacity-0"
	src="/logos/madmods-logo6.svg" alt="logo"/>

	<div id="hero-text" class="text-center
	aos transition-all duration-500 ease-in-out" 
	data-animstage-3="-translate-y-150 opacity-0">
		<h1 class="mb-4 font-bold leading-none text-center 
		w-full tracking-tight text-white text-3xl md:text-5xl lg:text-7xl dark:text-white">
		Build 3D Worlds in Seconds</h1>
		<p class="mb-6 
		 text-white text-center text-xl font-normal lg:text-4xl 
		sm:px-16 xl:px-48 dark:white">
			Play & Share with your Friends Instantly
	</div>
</div>



<div id="dummy-promptbox" 
     class="fixed left-1/2 transform -translate-x-1/2 w-full max-w-md
            aos transition-all -bottom-80 delay-200 duration-500 ease-out opacity-95
			z-100
			"
     data-animstage-1="bottom-36 delay-10 duration 250"
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
			flex justify-center items-center rounded-sm px-2
			bg-gradient-to-br from-purple-500 to-[#420085] text-white
			shadow-[0_0_8px_2px_rgba(168,85,247,0.6)] hover:shadow-[0_0_12px_4px_rgba(168,85,247,0.8)]
			transition-all duration-300
			group relative overflow-hidden">


			<!-- Star Rating Icon -->
			GENERATE
			<!-- <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-stars" viewBox="0 0 16 16">
				<path d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.829l-.645 1.936a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.828zM3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387A1.73 1.73 0 0 0 4.593 5.69l-.387 1.162a.217.217 0 0 1-.412 0L3.407 5.69A1.73 1.73 0 0 0 2.31 4.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387A1.73 1.73 0 0 0 3.407 2.31zM10.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.16 1.16 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.16 1.16 0 0 0-.732-.732L9.1 2.137a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732z"/>
			</svg> -->
		</button>
      </div>
    </div>
  </div>
</div>


<!-- <div id="getWaitlistContainer" data-waitlist_id="27059" data-widget_type="WIDGET_1"
class="absolute z-100"></div> -->

<div id="waitlist-container" 
class = "z-10 border-0 border-red-500 opacity-100 collapse center origin-center">
	<button id="waitlist-close" 
	class="
	flex items-center justify-center opacity-60
	absolute z-200 right-4 top-8 border-4 
	border-white rounded-full 
	bg-gray-200 hover:bg-white text-gray-700 shadow-md" onclick={(e)=>{
		let waitlist = document.getElementById('waitlist-container');
		if(waitlist){
			waitlist.classList.add('collapse')
		}
	}}>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
		<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
		</svg>
	</button>
	<div id="getWaitlistContainer" data-waitlist_id="27059" data-widget_type="WIDGET_1" 
	class=""></div>
</div>

  <!-- <div class="absolute border-4 border-green-500 z-100 opacity-90 w-150 h-180 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 invisible" id="waitlist-widget">

	<div id="getWaitlistContainer" 
		 data-waitlist_id="26970" 
		 data-widget_type="WIDGET_1" 
		 class="absolute h-full w-full top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
	</div>
  
	<button class="absolute z-200 right-4 top-4 border-4 border-black rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 shadow-md">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
		<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
		</svg>
	</button>

  </div>  -->
  

  <div id="scroll-indicator" class="scroll-downs absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 text-center">
	<span class=' absolute z-100 text-white text-xl text-center border-0 pl-[8px] border-yellow-500 center-h text-center bottom-16
	'>Scroll</span>
	<div class="mousey text-center">
	  <div class="scroller text-center"></div>
	</div>
</div>


<style>

#waitlist-container {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    /* Optional styling for modal container */
    width: 100%;
    max-width: 500px; /* Adjust as needed */
    padding: 20px;
  }
  
  #getWaitlistContainer {
    position: relative; /* This makes it the positioning context for absolute children */
    width: 100%;
    height: auto; /* Adjust as needed */
    background: transparent; /* Just for visualization */
    border-radius: 8px; /* Optional */
  }
  
  #waitlist-close {
    position: absolute;
    top: 48px; /* Adjust to position correctly relative to the box */
    right: 32px; /* Adjust to position correctly relative to the box */
    width: 30px;
    height: 30px;
    /* background: #ff0000; */
    border-radius: 50%; /* Makes it circular */
    cursor: pointer;
  }


	body,html  {
  background-color: #000;
  width: 100%;
  min-height: 100%;
  padding: 0;
  margin: 0;
}

.center {
  margin: 0;
  position: absolute;
  top: 50%;
  left: 50%;
  -ms-transform: translate(-50%, -50%);
  transform: translate(-50%, -50%);
}

.center-h {
  margin: 0;
  position: absolute;
  left: 50%;
  -ms-transform: translate(-50%, 0%);
  transform: translate(-50%, 0%);
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