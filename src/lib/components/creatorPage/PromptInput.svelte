<script lang="ts">
    import { Sparkles as Sparkles } from "lucide-svelte";
    import { createEventDispatcher } from "svelte";

     let {
        value = $bindable(""), // For bind:value
        disabled = false,      // Add the disabled prop
        onGenerate = (detail: { prompt: string }) => {} // Callback prop for generate
    }: {
        value?: string,
        disabled?: boolean,
        onGenerate?: (detail: { prompt: string }) => void
    } = $props();

    const dispatch = createEventDispatcher();

    function handleSubmit() {
      if (!value.trim()) {
        // Optionally handle empty prompt client-side or let parent decide
        // alert("Please enter a prompt!");
        return;
      }
      dispatch("generate", { prompt: value });
      // Parent component can decide whether to clear the prompt:
      // value = ""; // Example: clear prompt after submission
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    }
  </script>

    <!-- center align -->
    <div class="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10">

    <!-- <div class="fixed bottom-6 left-2 w-full max-w-xl px-2 z-10"> -->
    <div class="flex items-center space-x-2 bg-gray-800 p-3 rounded-xl shadow-xl border border-gray-700">
      <textarea
        bind:value
        rows="1"
        class="flex-grow bg-gray-700 text-gray-100 p-3 rounded-lg focus:ring-0 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none placeholder-gray-400"
        placeholder="Enter your prompt here..."
        on:keydown={handleKeyDown}
      ></textarea>
      <button
        on:click={handleSubmit}
        class="bg-blue-600 hover:bg-blue-700 text-white font-semibold p-3 rounded-lg focus:outline-none focus:ring-0 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 flex items-center justify-center"
        aria-label="Generate"
        disabled={!value.trim()}
      >
        <Sparkles class="h-5 w-5" />
      </button>
    </div>
  </div>

  <style>
    textarea {
      min-height: calc(1.5em + 1.5rem + 2px); /* Based on p-3 and font size */
      max-height: 150px; /* Adjust as needed */
    }
  </style>