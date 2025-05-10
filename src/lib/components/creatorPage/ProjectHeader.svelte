<!-- File: lib/components/creatorPage/ProjectHeader.svelte -->
<script lang="ts">
  import { Bot, ChevronDown } from "lucide-svelte"; // Removed SquarePen as it wasn't used
  import { onMount, onDestroy } from "svelte"; // onDestroy for cleanup
  import { browser } from '$app/environment';

  // Using $props for Svelte 5
  let { projectName = $bindable("My Awesome Project") } : { projectName?: string } = $props();
  // For bind:projectName, we'd need a callback prop if parent needs to update it back
  // or use $bindable() for projectName if it's truly two-way from child.
  // For now, assuming projectName is primarily set by parent, child can modify its local copy.
  // If you need two-way binding on projectName from parent to child, let me know.
  // For this scenario, the original bind:projectName would work if ProjectHeader was a class component
  // or if we manage a local copy and dispatch an event for changes.
  // Given $props(), simpler to treat projectName as one-way for now unless parent modifies it.

  let showProjectDropdown = $state(false);
  let dropdownContainerElement: HTMLElement | undefined = $state();

  function toggleProjectDropdown(event: MouseEvent) {
    event.stopPropagation(); // Keep stopPropagation
    showProjectDropdown = !showProjectDropdown;
  }

  function handleClickOutside(event: MouseEvent) {
    if (showProjectDropdown && dropdownContainerElement && !dropdownContainerElement.contains(event.target as Node)) {
      showProjectDropdown = false;
    }
  }

  let cleanupClickOutside: (() => void) | null = null;
  onMount(() => {
    if (browser) {
      document.addEventListener("click", handleClickOutside, true);
      cleanupClickOutside = () => {
        document.removeEventListener("click", handleClickOutside, true);
      };
    }
  });
  onDestroy(() => {
      cleanupClickOutside?.();
  });
</script>

<div bind:this={dropdownContainerElement} class="relative">
  <!-- This div already has p-2, which matches ActionPanel's outer padding -->
  <div class="flex items-center space-x-2 bg-gray-800 p-2 rounded-lg shadow-xl border border-gray-700">
    <!-- To better match ActionPanel button height, make Bot icon similar to h-5/h-6 -->
    <Bot class="h-6 w-6 text-blue-400" /> <!-- Adjusted from h-7 -->
    <input
      type="text"
      bind:value={projectName}
      class="bg-gray-700 text-gray-100 text-sm font-medium px-3 py-1.5 rounded-md focus:ring-0 focus:border-blue-500 outline-none w-48"
      placeholder="Project Name"
    />
    <button
      onclick={toggleProjectDropdown}
      class="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-0 focus:ring-blue-500"
      aria-label="Project options"
      aria-expanded={showProjectDropdown}
    >
      <ChevronDown
        class="h-5 w-5 transition-transform duration-200 {showProjectDropdown ? 'rotate-180' : ''}"
      />
    </button>
  </div>

  {#if showProjectDropdown}
    <div
      class="absolute left-0 mt-2 w-56 origin-top-left rounded-md bg-gray-800 shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none border border-gray-700 z-10"
      role="menu"
      aria-orientation="vertical"
      aria-labelledby="menu-button"
    >
      <div class="py-1" role="none">
        <a href="#new-project" class="text-gray-200 hover:bg-gray-700 block px-4 py-2 text-sm" role="menuitem">New Project</a>
        <a href="#open-project" class="text-gray-200 hover:bg-gray-700 block px-4 py-2 text-sm" role="menuitem">Open Project</a>
        <a href="#save-project" class="text-gray-200 hover:bg-gray-700 block px-4 py-2 text-sm" role="menuitem">Save Project</a>
        <hr class="border-gray-700 my-1"/>
        <a href="#delete-project" class="text-red-400 hover:bg-gray-700 hover:text-red-300 block px-4 py-2 text-sm" role="menuitem">Delete Project</a>
      </div>
    </div>
  {/if}
</div>

<style>
  .rotate-180 {
    transform: rotate(180deg);
  }
</style>
