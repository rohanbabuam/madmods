<script lang="ts">
	import '../app.css';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/stores'; // To access current route and URL params
	import { createSupabaseBrowserClient, type TypedSupabaseClient } from '$lib/supabaseClient'; // Correct client creator
	import type { LayoutData } from './$types'; // Type for the data prop
	import LoginModal from '$lib/components/LoginModal.svelte';
    // Import stores and handlers
    import { sessionStore, supabaseStore, showLoginModal, handleModalClose, handleLogout } from '$lib/stores/authStore';

    // --- Props ---
	// Standard way to receive props in Svelte components/layouts
	// export let data: LayoutData;
    // export let children: any; // For rendering the slot content

    // --- Props (Runes Mode) ---
    // Access props using the $props() rune in Svelte 5 Runes mode
	let { data, children } = $props<{ data: LayoutData; children: any }>();

    // --- Function to clean the URL ---
    function cleanShowLoginParam() {
        const currentUrl = new URL($page.url); // Use $page store for reactivity
        if (currentUrl.searchParams.has('showLogin')) {
            currentUrl.searchParams.delete('showLogin');
            // Use replaceState to change URL without reloading or adding history entry
            history.replaceState(history.state, '', currentUrl.toString());
             console.log('[Layout] Cleaned showLogin URL parameter.');
        }
    }

	// --- Initialization and Auth ---
	onMount(() => {
        let supabase: TypedSupabaseClient | null = null;

        // 1. Validate configuration received from the server
        if (data.supabaseUrl && data.supabaseKey) {
            console.log('[Layout] Valid Supabase config received. Initializing client...');
            try {
                // 2. Create the Supabase client using the correct function and parameters
                supabase = createSupabaseBrowserClient(data.supabaseUrl, data.supabaseKey);
                supabaseStore.set(supabase); // Set the client in the shared store
                 console.log('[Layout] Supabase browser client created and stored.');
            } catch (error) {
                 console.error('[Layout] Error creating Supabase browser client:', error);
                 supabaseStore.set(null); // Ensure store is null on error
            }
        } else {
            console.error('[Layout] Supabase URL or Key missing in layout data. Cannot initialize client.', { url: !!data.supabaseUrl, key: !!data.supabaseKey, error: data.error });
            supabaseStore.set(null); // Ensure store is null if config is missing
        }

        // 3. Set initial session state from server data
        console.log('[Layout] Setting initial session state from server data:', data.session);
        sessionStore.set(data.session);

        // 4. Subscribe to auth changes IF the client was successfully created
        let subscription: { unsubscribe: () => void } | null = null;
        if (supabase) {
            const { data: authData } = supabase.auth.onAuthStateChange((event, newSession) => {
                console.log('[Layout] Auth state changed:', event, newSession);
                // Update our session store regardless of event type
                sessionStore.set(newSession);

                // Handle specific events if needed
                if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    // Check if modal is open and close it
                    if ($showLoginModal) {
                        console.log('[Layout] Closing login modal due to:', event);
                        handleModalClose(); // Use the store handler
                    }
                     // Clean URL just in case (might have been missed if login happened quickly)
                    cleanShowLoginParam();
                }
                if (event === 'SIGNED_OUT') {
                     console.log('[Layout] User signed out.');
                    // Optionally redirect or clear user-specific data here
                }
            });
            subscription = authData.subscription;
            console.log('[Layout] Subscribed to Supabase auth state changes.');
        }

        // 5. Initial check for 'showLogin' parameter on mount (covers first load)
        const initialUrlParams = new URLSearchParams(window.location.search);
        if (initialUrlParams.has('showLogin')) {
            console.log('[Layout] showLogin param detected on initial load.');
             // Check store value directly after setting it
             if (!$sessionStore) { // Check if user is NOT logged in
                showLoginModal.set(true);
             }
             // Clean parameter regardless of login state after check
            cleanShowLoginParam();
        }

        // 6. Cleanup subscription on component destroy
        return () => {
            if (subscription) {
                console.log('[Layout] Unsubscribing from Supabase auth state changes.');
                subscription.unsubscribe();
            }
        };
	}); // End of onMount

    // --- Navigation Hook for URL Parameter ---
	afterNavigate(({ type, from, to }) => {
        // Check after client-side navigations or initial load (type 'load')
        // Note: onMount handles the very first load, this catches subsequent ones
        // or potentially races if navigation happens fast.

        // Only check if the destination URL actually has the parameter
        if (to?.url.searchParams.has('showLogin')) {
             console.log('[Layout] afterNavigate detected showLogin param.');
            // Only open if not already logged in
            if (!$sessionStore) {
                showLoginModal.set(true);
            }
            // IMPORTANT: Clean the param immediately after checking
            cleanShowLoginParam();
        }
	});


	// --- Header Logic ---
	let isBlocklyPage = $derived($page.route.id === '/blockly'); // Check if on blockly page
	let headerElement: HTMLElement | null = null;
	// Scroll logic variables (if needed later)
	// let lastScrollTop = 0;
	// function handleScroll() { ... }
    // onMount(() => { /* add scroll listener */ });
    // beforeNavigate(() => { /* remove scroll listener */ });

	// --- Logo Click Handler ---
	function handleLogoClick(event: MouseEvent) {
		if ($page.route.id === '/') {
			event.preventDefault();
			location.reload(); // Force reload if already on home
		}
		// Otherwise, let the standard SvelteKit link navigation handle it (href="/")
	}

	// --- Waitlist Button Handler ---
	function toggleWaitlist() {
		let waitlist = document.getElementById('waitlist-container');
		if(waitlist){
			waitlist.classList.toggle('collapse');
		}
	}

</script>

<!-- Login Modal Rendered Conditionally -->
{#if $showLoginModal && $supabaseStore}
	<LoginModal
        show={$showLoginModal}
        supabase={$supabaseStore} 
        onClose={handleModalClose}
    />
{:else if $showLoginModal && !$supabaseStore}
    <!-- Optional: Show an error if modal should show but client failed -->
     <div class="modal-backdrop">
        <div class="modal-content" style="background-color: #f8d7da; color: #721c24;">
            <p>Error: Cannot display login form. Supabase client failed to initialize. Check console.</p>
            <button onclick={handleModalClose} style="margin-top: 1rem; padding: 0.5rem 1rem; border: 1px solid;">Close</button>
        </div>
    </div>
{/if}

<!-- Header Rendered Conditionally -->
{#if !isBlocklyPage}
<header
	bind:this={headerElement}
	id="navbar"
	class="fixed flex flex-wrap sm:justify-start sm:flex-nowrap w-full text-sm py-3 z-[100] top-0 bg-[#5500aa]/90 backdrop-blur-lg transition-all duration-500 ease-in-out"
>
	<nav class="max-w-[85rem] w-full mx-auto px-4 sm:flex sm:items-center sm:justify-between" aria-label="Global">
		<!-- Logo -->
        <div class="flex items-center justify-between">
			<a
                class="flex-none text-xl font-semibold dark:text-white focus:outline-hidden focus:opacity-80"
                href="/"
                aria-label="Brand"
                onclick={handleLogoClick}
            >
				<img class="rounded-lg w-30 h-auto" src="/logos/madmods-logo7.svg" alt="logo"/>
			</a>
			<!-- Mobile Menu Toggle -->
            <div class="sm:hidden">
				<button type="button" class="hs-collapse-toggle p-2 inline-flex justify-center items-center gap-x-2 rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-transparent dark:border-neutral-700 dark:text-white dark:hover:bg-white/10" data-hs-collapse="#hs-navbar-example" aria-controls="hs-navbar-example" aria-label="Toggle navigation">
                  <svg class="hs-collapse-open:hidden flex-shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/></svg>
                  <svg class="hs-collapse-open:block hidden flex-shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
				</button>
			</div>
		</div>
        <!-- Navigation Links & Auth Section -->
		<div id="hs-navbar-example" class="hidden hs-collapse overflow-hidden transition-all duration-300 basis-full grow sm:block">
			<div class="flex flex-col gap-5 mt-5 sm:flex-row sm:items-center sm:justify-end sm:mt-0 sm:ps-5">
                <!-- Waitlist Button -->
				<div class="font-medium text-white focus:outline-hidden">
					<button
                        type="button"
                        class="py-3 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-transparent bg-[#5500aa] opacity-100 text-white/80 hover:text-white focus:outline-hidden focus:opacity-100 disabled:opacity-50 disabled:pointer-events-none"
                        onclick={toggleWaitlist}
                    >
						Join Waitlist
					</button>
				</div>
                <!-- Create Button -->
				<a class="font-medium text-white focus:outline-hidden" href="/blockly" target="_blank" aria-current="page">
					<button type="button" class="py-3 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-transparent bg-[#5500aa] opacity-100 text-white/80 hover:text-white focus:outline-hidden focus:opacity-100 disabled:opacity-50 disabled:pointer-events-none">
						<span>Create</span>
					</button>
				</a>

                <!-- Auth Section: Login/Logout + Avatar -->
                {#if $sessionStore?.user}
                    <!-- User is logged in -->
                    {@const user = $sessionStore.user}
                    {@const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture}

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
                                alt="{user.email ?? 'User'} avatar"
                                referrerpolicy="no-referrer"
                                title={user.email ?? 'User Profile'}
                            />
                        {:else}
                            <span
                                class="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white text-sm font-semibold border-2 border-white/50"
                                title={user.email ?? 'User Profile'}
                            >
                                {user.email?.[0]?.toUpperCase() ?? '?'}
                            </span>
                        {/if}
                    </div>

                {:else}
                    <!-- User is logged out -->
                    <button
                        onclick={() => showLoginModal.set(true)}
                        class="py-3 px-4 inline-flex items-center gap-x-2 text-md font-bold rounded-lg border border-transparent bg-[#ffbf00] opacity-100 text-white/80 hover:text-white focus:outline-hidden focus:opacity-100 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        Login
                    </button>
                {/if} <!-- End Auth Section -->
			</div>
		</div>
	</nav>
</header>
{/if} <!-- End Conditional Header -->

<!-- Main Content Area -->
<main class:pt-16={!isBlocklyPage}> <!-- Apply padding if header is shown -->
    {@render children()}
</main>

<!-- Global Styles (Keep as is) -->
<style>
	svg[display="none"] { display: none !important; }
    .collapse { display: none; }
	:global(.modal-backdrop) {
		position: fixed; top: 0; left: 0; width: 100%; height: 100%;
		background-color: rgba(0, 0, 0, 0.5); z-index: 1040;
		display: flex; justify-content: center; align-items: center;
	}
	:global(.modal-content) {
		background-color: #fff; padding: 2rem; border-radius: 0.5rem;
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); z-index: 1050;
        min-width: 300px; max-width: 500px;
	}
</style>