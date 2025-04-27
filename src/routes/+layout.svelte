<script lang="ts">
	import '../app.css';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/stores'; // To access current route
	import { createSupabaseBrowserClient, type TypedSupabaseClient } from '$lib/supabaseClient';
	import type { LayoutData } from './$types'; // Type for the data prop
	import LoginModal from '$lib/components/LoginModal.svelte'; // Import the modal component
    // Import from the new store file
    import { sessionStore, supabaseStore, showLoginModal, handleModalClose, handleLogout } from '$lib/stores/authStore';

	let { children, data }: { children: any; data: LayoutData } = $props();

    // --- Function to clean the URL ---
    function cleanShowLoginParam() {
        const currentUrl = new URL($page.url);
        if (currentUrl.searchParams.has('showLogin')) {
            currentUrl.searchParams.delete('showLogin');
            // Use replaceState to change URL without reloading or adding history
            history.replaceState(history.state, '', currentUrl);
        }
    }

	onMount(() => {
        // Initialize client-side Supabase client
        const supabase = createSupabaseBrowserClient(data.session);
        supabaseStore.set(supabase); // Set the client in the shared store

        // Set initial session state in the store
        sessionStore.set(data.session);

        // Listen for Supabase auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, newSession) => {
            console.log('Auth state changed:', event, newSession);
            // Update our session store
            sessionStore.set(newSession);

            // Handle specific events if needed
            if (event === 'SIGNED_IN') {
                showLoginModal.set(false); // Close modal on successful sign in
            }
             if (event === 'SIGNED_OUT') {
                // Optionally redirect or clear user-specific data
             }
        });

        // Cleanup subscription on component destroy
        return () => {
            subscription.unsubscribe();
        };
	});

    // --- Navigation & Header Logic ---
	let isHomePage = $derived($page.route.id === '/'); // Check if on home page
	let headerElement: HTMLElement | null = null;
	let lastScrollTop = 0;

	function handleScroll() {
        // Your existing scroll logic can go here...
        // Example: hide/show header on scroll
		// const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
		// if (headerElement) {
		// 	if (currentScroll > lastScrollTop && currentScroll > 80) {
		// 		// Scroll Down
		// 		headerElement.style.top = '-100px'; // Or adjust based on header height
		// 	} else {
		// 		// Scroll Up or near top
		// 		headerElement.style.top = '0';
		// 	}
		// }
		// lastScrollTop = currentScroll <= 0 ? 0 : currentScroll; // For Mobile or negative scrolling
	}

	// --- Check for showLogin parameter AFTER navigation ---
	afterNavigate(({ type }) => {
        // 'load' happens on initial page load or after server redirects
        // 'link' happens on client-side navigation
        // We care most about the 'load' after our redirect
        const urlParams = $page.url.searchParams;
        if (urlParams.has('showLogin')) {
            // Only open if not already logged in (edge case safeguard)
            // Check the store value
            if (!$sessionStore) {
                 showLoginModal.set(true); // Use store's setter
            } else {
                // If somehow logged in but param is there, just clean it
                 cleanShowLoginParam();
            }
            // IMPORTANT: Clean the param immediately after checking
            // otherwise refreshing the homepage would reopen the modal.
            // Do this *after* setting showLoginModal = true.
            // But delay slightly to ensure Svelte renders the modal first?
            // Testing needed. Let's try immediate cleanup first.
            // Update: Immediate cleanup is usually fine.
            cleanShowLoginParam();
        }
	});

    beforeNavigate(() => {
        // Cleanup scroll listener before navigating away
        // window.removeEventListener('scroll', handleScroll);
    })

	onMount(() => {
        // Initial scroll listener setup
		// window.addEventListener('scroll', handleScroll, { passive: true });
        // return () => window.removeEventListener('scroll', handleScroll); // Cleanup
	});


	// --- Logo Click Handler ---
	function handleLogoClick(event: MouseEvent) {
		if ($page.route.id === '/') {
			// Already on home page, force reload
			event.preventDefault(); // Prevent default link behavior
			location.reload();
		}
		// Otherwise, let the standard SvelteKit navigation handle it (href=".")
	}

	// --- Waitlist Button Handler ---
	function toggleWaitlist() {
		let waitlist = document.getElementById('waitlist-container');
		if(waitlist){
			waitlist.classList.toggle('collapse'); // Simplified toggle
		}
	}

</script>

{#if $showLoginModal}
	<LoginModal
        show={$showLoginModal}
        supabase={$supabaseStore}
        onClose={handleModalClose}
    />
{/if}

{#if $page.route.id !== '/blockly'}
<header
	bind:this={headerElement}
	id="navbar"
	class="fixed flex flex-wrap sm:justify-start sm:flex-nowrap w-full text-sm py-3 z-[100] top-0 
    bg-[#5500aa]/90 backdrop-blur-lg transition-all duration-500 ease-in-out"
	class:opacity-100={true}
	data-animstage-1="opacity-100"
>
	<nav class="max-w-[85rem] w-full mx-auto px-4 sm:flex sm:items-center sm:justify-between" aria-label="Global">
		<div class="flex items-center justify-between">
			<a
                class="flex-none text-xl font-semibold dark:text-white focus:outline-hidden focus:opacity-80"
                href="/"
                aria-label="Brand"
                onclick={handleLogoClick}
            >
				<img class="rounded-lg w-30 h-auto" src="/logos/madmods-logo7.svg" alt="logo"/>
			</a>
			<div class="sm:hidden">
				<button type="button" class="hs-collapse-toggle p-2 inline-flex justify-center items-center gap-x-2 rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-transparent dark:border-neutral-700 dark:text-white dark:hover:bg-white/10" data-hs-collapse="#hs-navbar-example" aria-controls="hs-navbar-example" aria-label="Toggle navigation">
                  <svg class="hs-collapse-open:hidden flex-shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/></svg>
                  <svg class="hs-collapse-open:block hidden flex-shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
				</button>
			</div>
		</div>
		<div id="hs-navbar-example" class="hidden hs-collapse overflow-hidden transition-all duration-300 basis-full grow sm:block">
			<div class="flex flex-col gap-5 mt-5 sm:flex-row sm:items-center sm:justify-end sm:mt-0 sm:ps-5">
				<div class="font-medium text-white focus:outline-hidden">
					<button
                        type="button"
                        class="py-3 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-transparent bg-[#5500aa] opacity-100 text-white/80 hover:text-white focus:outline-hidden focus:opacity-100 disabled:opacity-50 disabled:pointer-events-none"
                        onclick={toggleWaitlist}
                    >
						Join Waitlist
					</button>
				</div>
				<a class="font-medium text-white focus:outline-hidden" href="/blockly" target="_blank" aria-current="page">
					<button type="button" class="py-3 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-transparent bg-[#5500aa] opacity-100 text-white/80 hover:text-white focus:outline-hidden focus:opacity-100 disabled:opacity-50 disabled:pointer-events-none">
						<span>Create</span>
					</button>
				</a>

                {#if $sessionStore?.user}
                {@const avatarUrl = $sessionStore.user.user_metadata?.avatar_url || $sessionStore.user.user_metadata?.picture}
                <button
                    onclick={handleLogout}
                    class="ml-4 px-3 py-1.5 text-sm font-medium text-white/80 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800"
                    style="background-color:#ffbf00"
                    >
                    Logout
                </button>

                <div class="flex items-center ml-3">
                    {#if avatarUrl}
                        <img
                            class="h-8 w-8 rounded-full object-cover border-2 border-white/50"
                            src={avatarUrl}
                            alt="{$sessionStore.user.email ?? 'User'} avatar"
                            referrerpolicy="no-referrer"
                            title={$sessionStore.user.email ?? 'User Profile'}
                        />
                    {:else}
                        <span
                            class="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white text-sm font-semibold border-2 border-white/50"
                            title={$sessionStore.user.email ?? 'User Profile'}
                        >
                            {$sessionStore.user.email?.[0]?.toUpperCase() ?? '?'}
                        </span>
                    {/if}
                </div>

                {:else}
                <button
                    onclick={() => showLoginModal.set(true)}
                    class="py-3 px-4 inline-flex items-center gap-x-2 text-md font-bold rounded-lg border border-transparent bg-[#ffbf00] opacity-100 text-white/80 hover:text-white focus:outline-hidden focus:opacity-100 disabled:opacity-50 disabled:pointer-events-none"
                >
                    Login
                </button>
                {/if}
			</div>
		</div>
	</nav>
</header>
{/if}

<main class:pt-16={$page.route.id !== '/blockly'}>
    {@render children()}
</main>

<style>
	svg[display="none"] {
		display: none !important;
	}
    .collapse {
        display: none;
    }
	:global(.modal-backdrop) {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		z-index: 1040;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	:global(.modal-content) {
		background-color: #fff;
		padding: 2rem;
		border-radius: 0.5rem;
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
		z-index: 1050;
        min-width: 300px;
        max-width: 500px;
	}


</style>