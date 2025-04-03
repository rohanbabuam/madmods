<script lang="ts">
	import '../app.css';
	import { afterNavigate } from "$app/navigation";

	let { children } = $props();

	afterNavigate(() => {
    window.HSStaticMethods.autoInit();
  });
</script>




<header id="navbar" class="fixed flex flex-wrap sm:justify-start sm:flex-nowrap w-full text-sm py-3 z-100
bg-black/10 backdrop-blur-lg
aos opacity-0 transition-opacity duration-500 ease-in-out"
	 data-animstage-1="opacity-100"
	 >
	<nav class="max-w-[85rem] w-full mx-auto px-4 sm:flex sm:items-center sm:justify-between">
  <div class="flex items-center justify-between">
	<a class="flex-none text-xl font-semibold dark:text-white focus:outline-hidden focus:opacity-80" href="." aria-label="Brand" onclick={() => (location.reload())}>
	  <!-- <img class="w-10 h-auto" src="../assets/img/logo/logo-short.png" alt="Logo"> -->
	  <img class="rounded-lg w-30 h-auto" src="/logos/madmods-logo1.svg" alt="logo"/>
	</a>
	<div class="sm:hidden">
	  <button type="button" class="hs-collapse-toggle relative size-9 flex justify-center items-center gap-x-2 rounded-lg text-gray-800 shadow-2xs 
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
	 <a class="font-medium text-white focus:outline-hidden" href="#" aria-current="page">Discord</a>
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
