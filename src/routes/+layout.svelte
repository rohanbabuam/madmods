<script lang="ts">
    import '../app.css';
    import { afterNavigate } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { createSupabaseBrowserClient, type TypedSupabaseClient } from '$lib/supabaseClient';
    import type { LayoutData } from './$types';
    import LoginModal from '$lib/components/LoginModal.svelte';
    import { sessionStore, supabaseStore, loginModalConfigStore, handleModalClose, handleLogout, requestLogin } from '$lib/stores/authStore';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';

    let { data, children } = $props<{ data: LayoutData; children: any }>();

    const PagesExcludingNavbar = ["/blockly", "/create"];
    let shouldHideNavbar = $derived(PagesExcludingNavbar.includes($page.route.id ?? ''));

    function cleanShowLoginParamFromUrl() {
        if (!browser) return;
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has('showLogin')) {
            currentUrl.searchParams.delete('showLogin');
            history.replaceState(history.state, '', currentUrl.toString());
        }
    }

    onMount(() => {
        let supabase: TypedSupabaseClient | null = null;

        if (data.supabaseUrl && data.supabaseKey) {
            try {
                supabase = createSupabaseBrowserClient(data.supabaseUrl, data.supabaseKey);
                supabaseStore.set(supabase);
            } catch (error) {
                 console.error('[Layout] Error creating Supabase browser client:', error);
                 supabaseStore.set(null);
            }
        } else {
            console.error('[Layout] Supabase URL or Key missing. Cannot initialize client.');
            supabaseStore.set(null);
        }

        sessionStore.set(data.session); // Initialize session from server data

        let subscription: { unsubscribe: () => void } | null = null;
        if (supabase) {
            const { data: authListener } = supabase.auth.onAuthStateChange((event:any, newSession:any) => {
                const oldClientSession = $sessionStore; // Read current client session state
                sessionStore.set(newSession); // Update the session store immediately

                const currentModalConfig = $loginModalConfigStore; // Read current modal config

                if (event === 'SIGNED_IN' || (event === 'USER_UPDATED' && newSession && !oldClientSession)) {
                    if (currentModalConfig.visible) { // Modal was open during this auth event
                        const pathToRedirect = currentModalConfig.intendedPath;
                        // Always close and reset modal config after a successful sign-in that involved it
                        loginModalConfigStore.set({ visible: false, intendedPath: null, sourcePageRequiresAuth: false });
                        
                        if (pathToRedirect && browser) {
                            goto(pathToRedirect, { replaceState: true });
                        }
                    }
                } else if (event === 'SIGNED_OUT') {
                    // Clear modal config if user signs out
                    loginModalConfigStore.set({ visible: false, intendedPath: null, sourcePageRequiresAuth: false });
                    // Individual protected pages should react to $sessionStore becoming null
                    // Example: /create/+page.svelte has logic to redirect if user becomes null.
                    // No global redirect from here to allow non-protected pages to function after logout.
                }
            });
            subscription = authListener.subscription;
        }

        if (browser) {
            cleanShowLoginParamFromUrl();
            const initialUrl = new URL(window.location.href);
            if (initialUrl.searchParams.has('showLogin')) {
                if (!$sessionStore) { // Only request login if not already logged in
                    requestLogin(undefined, false);
                }
            }
        }

        return () => {
            if (subscription) {
                subscription.unsubscribe();
            }
        };
    });

    afterNavigate(({ type, from, to }) => {
        if (browser) {
            cleanShowLoginParamFromUrl();
            if (to?.url.searchParams.has('showLogin')) {
                if (!$sessionStore) { // Only request login if not already logged in
                    requestLogin(undefined, false);
                }
            }
        }
    });

    let isHomePage = $derived($page.route.id === '/');
    let headerElement: HTMLElement | null = null;

    function handleLogoClick(event: MouseEvent) {
        if ($page.route.id === '/') {
            event.preventDefault();
            location.reload();
        }
    }

    function toggleWaitlist() {
        let waitlist = document.getElementById('waitlist-container');
        if(waitlist){
            waitlist.classList.toggle('collapse');
        }
    }
</script>

{#if $loginModalConfigStore.visible && $supabaseStore}
  <LoginModal
    show={$loginModalConfigStore.visible}
    supabase={$supabaseStore}
    onClose={handleModalClose}
  />
{:else if $loginModalConfigStore.visible && !$supabaseStore}
  <div class="modal-backdrop" role="dialog" aria-modal="true" onclick={handleModalClose}>
    <div class="modal-content" style="background-color: #f8d7da; color: #721c24; padding: 1rem; text-align: center;" onclick={(event) => event.stopPropagation()}>
      <p>Error: Cannot display login form.</p>
      <p>Supabase client failed to initialize. Check console.</p>
      <button onclick={handleModalClose} style="margin-top: 1rem; padding: 0.5rem 1rem; border: 1px solid; border-radius: 0.25rem; cursor: pointer;">Close</button>
    </div>
  </div>
{/if}

{#if !shouldHideNavbar}
<header
    bind:this={headerElement}
    id="navbar"
    class="fixed flex flex-wrap sm:justify-start sm:flex-nowrap w-full text-sm py-3 z-[100] top-0 bg-[#5500aa]/90 backdrop-blur-lg transition-all duration-500 ease-in-out"
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

                {#if !isHomePage}
                  <a class="font-medium text-white focus:outline-hidden" href="/create" aria-current={$page.route.id === '/create' ? 'page' : undefined}>
                      <button type="button" class="py-3 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-transparent bg-[#5500aa] opacity-100 text-white/80 hover:text-white focus:outline-hidden focus:opacity-100 disabled:opacity-50 disabled:pointer-events-none">
                          <span>Create</span>
                      </button>
                  </a>

                  {#if $sessionStore?.user}
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
                        {:else if user.email}
                            <span
                                class="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white text-sm font-semibold border-2 border-white/50"
                                title={user.email ?? 'User Profile'}
                            >
                                {user.email[0].toUpperCase()}
                            </span>
                        {:else}
                             <span
                                class="flex items-center justify-center h-8 w-8 rounded-full bg-gray-500 text-white text-sm font-semibold border-2 border-white/50"
                                title={'User Profile'}
                            >?</span>
                        {/if}
                    </div>
                  {:else}
                    <button
                        onclick={() => requestLogin(undefined, false)}
                        class="py-3 px-4 inline-flex items-center gap-x-2 text-md font-bold rounded-lg border border-transparent bg-[#ffbf00] opacity-100 text-white/80 hover:text-white focus:outline-hidden focus:opacity-100 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        Login
                    </button>
                  {/if}
                {/if}
            </div>
        </div>
    </nav>
</header>
{/if}

<main class:pt-16={!shouldHideNavbar}>
    {@render children()}
</main>

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