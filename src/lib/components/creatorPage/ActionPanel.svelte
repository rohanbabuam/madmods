<script lang="ts">
  // --- Script section remains the same as the previous version ---
  import { Play, Share2, User, Settings, LogOut, LogIn } from "lucide-svelte";
  import { browser } from '$app/environment';
  import { sessionStore, requestLogin, handleLogout as performLogout } from '$lib/stores/authStore';
  import { page } from '$app/stores';
  import { createEventDispatcher } from 'svelte'; // Using this as per your original code

  type ActionPanelEvents = {
      play: void;
      share: void;
      profileAction: { action: string };
  }
  const dispatch = createEventDispatcher<ActionPanelEvents>();

  let showProfileDropdown = $state(false);
  let actionPanelVisualBoxElement: HTMLElement | undefined = $state();

  function toggleProfileDropdown(event?: MouseEvent) {
    event?.stopPropagation();
    showProfileDropdown = !showProfileDropdown;
  }

  function handlePlay() { dispatch('play'); }
  function handleShare() { dispatch('share'); }

  function handleProfileItemClick(action: string) {
    dispatch('profileAction', { action });
    showProfileDropdown = false;
  }

  function handleSignOut() {
    performLogout();
    showProfileDropdown = false;
  }

  function openLoginModal() {
    const currentPath = $page.url.pathname + $page.url.search;
    requestLogin(currentPath, false);
  }

  function handleClickOutside(event: MouseEvent) {
    // Check if the click is outside the main ActionPanel div OR the dropdown itself if it's open
    // Since dropdown is now positioned relative to main div, checking main div is sufficient
    if (actionPanelVisualBoxElement && !actionPanelVisualBoxElement.contains(event.target as Node)) {
        // Check added: only close if the dropdown is actually shown
        if (showProfileDropdown) {
            showProfileDropdown = false;
        }
    }
  }

  $effect(() => {
    if (browser) { // No need to check showProfileDropdown here, add/remove is cheap
        const handler = (event: MouseEvent) => handleClickOutside(event);
        document.addEventListener("click", handler, true);
        return () => {
            document.removeEventListener("click", handler, true);
        };
    }
  });

</script>

<div
  bind:this={actionPanelVisualBoxElement}
  class="relative flex items-center space-x-2 bg-gray-800 p-2 rounded-lg shadow-xl border border-gray-700"
>
  <button
    onclick={handlePlay}
    class="p-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-0 focus:ring-blue-500"
    aria-label="Play"
  >
    <Play class="h-5 w-5 text-green-400" />
  </button>
  <button
    onclick={handleShare}
    class="p-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-0 focus:ring-blue-500"
    aria-label="Share"
  >
    <Share2 class="h-5 w-5 text-purple-400" />
  </button>

  {#if $sessionStore?.user}
    {@const user = $sessionStore.user}
    {@const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture}
    <!-- Removed class="relative" from this div -->
    <div>
      <button
        onclick={toggleProfileDropdown}
        class="p-1.5 rounded-full hover:bg-gray-700 focus:outline-none focus:ring-0 focus:ring-blue-500 flex items-center justify-center"
        aria-label="User profile"
        aria-expanded={showProfileDropdown}
      >
        {#if avatarUrl}
          <img src={avatarUrl} alt="User avatar" class="h-6 w-6 rounded-full object-cover" referrerpolicy="no-referrer" />
        {:else if user.email}
          <span class="flex items-center justify-center h-6 w-6 rounded-full bg-gray-600 text-xs font-semibold text-white">
            {user.email[0].toUpperCase()}
          </span>
        {:else}
          <User class="h-6 w-6 text-gray-300" />
        {/if}
      </button>

      {#if showProfileDropdown}
        <!-- Dropdown is still absolute right-0, but now relative to actionPanelVisualBoxElement -->
        <div
          class="absolute right-0 mt-4 w-56 origin-top-right rounded-md bg-gray-800 shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none border border-gray-700 z-10"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu-button"
        >
          <div class="py-1" role="none">
            <button onclick={() => handleProfileItemClick('profile')} class="w-full text-left text-gray-200 hover:bg-gray-700 block px-4 py-2 text-sm flex items-center space-x-2" role="menuitem">
              <User class="h-4 w-4"/>
              <span>Profile</span>
            </button>
            <button onclick={() => handleProfileItemClick('settings')} class="w-full text-left text-gray-200 hover:bg-gray-700 block px-4 py-2 text-sm flex items-center space-x-2" role="menuitem">
              <Settings class="h-4 w-4"/>
              <span>Settings</span>
            </button>
            <hr class="border-gray-700 my-1"/>
            <button onclick={handleSignOut} class="w-full text-left text-red-400 hover:bg-gray-700 hover:text-red-300 block px-4 py-2 text-sm flex items-center space-x-2" role="menuitem">
              <LogOut class="h-4 w-4"/>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <button
      onclick={openLoginModal}
      class="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-0 focus:ring-blue-500 flex items-center space-x-1_5"
      aria-label="Login"
    >
      <LogIn class="h-5 w-5 text-gray-300" />
      <span class="text-sm text-gray-200 pl-1">Login</span>
    </button>
  {/if}
</div>