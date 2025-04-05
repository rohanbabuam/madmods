<script lang="ts">
	import '../app.css';
	import { afterNavigate } from "$app/navigation";

	let { children } = $props();


	afterNavigate(() => {

  });
</script>




<header id="navbar" class="fixed flex flex-wrap sm:justify-start sm:flex-nowrap w-full text-sm py-3 z-100
bg-black/20 backdrop-blur-lg
aos opacity-0 transition-opacity duration-500 ease-in-out"
	 data-animstage-1="opacity-100"
	 >
	<nav class="max-w-[85rem] w-full mx-auto px-4 sm:flex sm:items-center sm:justify-between">
  <div class="flex items-center justify-between">
	<a class="flex-none text-xl font-semibold dark:text-white focus:outline-hidden focus:opacity-80" href="." aria-label="Brand" onclick={() => (location.reload())}>
	  <!-- <img class="w-10 h-auto" src="../assets/img/logo/logo-short.png" alt="Logo"> -->
	  <img class="rounded-lg w-30 h-auto" src="/logos/madmods-logo7.svg" alt="logo"/>
	</a>
	<div class="sm:hidden">
	  <button type="button" class="hs-collapse-toggle relative size-9 flex justify-center items-center gap-x-2 rounded-lg text-white shadow-2xs 
	  hover:bg-white/10 focus:outline-hidden focus:bg-white/10 focus:backdrop-blur-md
	  disabled:opacity-50 disabled:pointer-events-none dark:bg-transparent dark:border-neutral-700 dark:text-white dark:hover:bg-white/10 dark:focus:bg-white/10" id="hs-navbar-example-collapse" aria-expanded="false" aria-controls="hs-navbar-example" aria-label="Toggle navigation" data-hs-collapse="#hs-navbar-example">
		<svg class="hs-collapse-open:hidden shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/></svg>
		<svg class="hs-collapse-open:block hidden shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
		<span class="sr-only">Toggle navigation</span>
	  </button>
	</div>
  </div>
  <div id="hs-navbar-example" class="hidden hs-collapse overflow-hidden transition-all duration-300 basis-full grow sm:block" aria-labelledby="hs-navbar-example-collapse">
	<div class="flex flex-col gap-5 mt-5 sm:flex-row sm:items-center sm:justify-end sm:mt-0 sm:ps-5">
		<a class="font-medium text-white focus:outline-hidden" href="#" aria-current="page">

			<button type="button" class="py-3 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border 
				border-transparent bg-[#5500aa] opacity-100 text-white/80 hover:text-white focus:outline-hidden focus:opacity-100 
				disabled:opacity-50 disabled:pointer-events-none" onclick={(e)=>{
					let waitlist = document.getElementById('waitlist-container');
					if(waitlist){
						if(waitlist.classList.contains('collapse')){
							waitlist.classList.remove('collapse')
						}
						else{
							waitlist.classList.add('collapse')
						}
					}
				}}>
				Join Waitlist
			  </button>
		</a>

		<a class="font-medium text-white focus:outline-hidden" href="https://discord.gg/9KQmAPdaq5" aria-current="page">

			<button type="button" class="py-3 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border 
				border-transparent bg-[#5500aa] opacity-100 text-white/80 hover:text-white focus:outline-hidden focus:opacity-100 
				disabled:opacity-50 disabled:pointer-events-none" onclick={(e)=>{
					//alert('discord')
				}}>
				<span>
					<!-- <svg xmlns="http://www.w3.org/2000/svg" 
					width="16" height="16" fill="white" 
					class="bi bi-discord" viewBox="0 0 16 16">
						<path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612"/>
					  </svg> -->
					  <img class="h-4" src="/social-logos/discord.svg" alt="logo"/>
				</span>
				<span>
					Discord
				</span>

			  </button>
		</a>
	   <!-- <a class="font-medium text-gray-600 hover:text-gray-400 focus:outline-hidden focus:text-gray-400 dark:text-neutral-400 dark:hover:text-neutral-500 dark:focus:text-neutral-500" href="#">Account</a>
	  <a class="font-medium text-gray-600 hover:text-gray-400 focus:outline-hidden focus:text-gray-400 dark:text-neutral-400 dark:hover:text-neutral-500 dark:focus:text-neutral-500" href="#">Work</a>
	  <a class="font-medium text-gray-600 hover:text-gray-400 focus:outline-hidden focus:text-gray-400 dark:text-neutral-400 dark:hover:text-neutral-500 dark:focus:text-neutral-500" href="#">Blog</a> -->
	</div>
  </div>
</nav>
</header>


<!-- ========== HEADER ========== -->
<!-- <header class="absolute top-0 inset-x-0 flex flex-wrap md:justify-start md:flex-nowrap z-50 w-full text-sm bg-opacity-0">
	<nav class="mt-4 relative max-w-2xl w-full border border-gray-300 border-opacity-50 rounded-full mx-2 py-2.75 bg-white/300 backdrop-blur-lg 
	md:flex md:items-center md:justify-between md:px-4 md:mx-auto dark:bg-neutral-900 dark:border-neutral-700">
	  <div class="px-4 md:px-0 flex justify-between items-center">
		<div class="flex items-center">
		  <a class="flex-none text-xl inline-block font-semibold focus:outline-hidden focus:opacity-80" href="../templates/personal/index.html" aria-label="Preline">
			
			<img class="rounded-full" src="/logos/madmods-logo1.svg" alt="log" height="30" width="125"/>
		  </a>
  
		  <div class="ms-1 sm:ms-2">
  
		  </div>
		</div>
  
		<div class="md:hidden">
		  <button type="button" class="hs-collapse-toggle flex justify-center items-center size-7 border border-gray-200 text-white rounded-full hover:bg-gray-200 focus:outline-hidden focus:bg-gray-200 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:focus:bg-neutral-700" id="hs-navbar-header-floating-collapse" aria-expanded="false" aria-controls="hs-navbar-header-floating" aria-label="Toggle navigation" data-hs-collapse="#hs-navbar-header-floating">
			<svg class="hs-collapse-open:hidden shrink-0 size-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/></svg>
			<svg class="hs-collapse-open:block hidden shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
		  </button>
		</div>
	  </div>

	</nav>
</header> -->
<!-- ========== END HEADER ========== -->

{@render children()}
