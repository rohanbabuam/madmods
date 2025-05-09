<script lang="ts">
    import { MousePointer2, WandSparkles, SquareStack, Copy } from 'lucide-svelte';
    import { createEventDispatcher } from 'svelte';

    type Tool = 'select' | 'wand' | 'scatter' | 'duplicate';
    export let activeTool: Tool | null = 'select'; // Default to select tool, prop for parent to control

    const dispatch = createEventDispatcher<{ selectTool: Tool }>();

    const TOOLS = [
      { id: 'select' as Tool, label: 'Select Tool', icon: MousePointer2 },
      { id: 'wand' as Tool, label: 'Wand Tool', icon: WandSparkles },
      { id: 'duplicate' as Tool, label: 'Duplicate Tool', icon: Copy },
      { id: 'scatter' as Tool, label: 'Scatter Tool', icon: SquareStack },
    ];

    function selectTool(toolId: Tool) {
      activeTool = toolId;
      dispatch('selectTool', toolId);
      // console.log(`Tool selected: ${toolId}`);
    }
  </script>

  <div
    class="fixed left-4 top-1/2 -translate-y-1/2 z-20 bg-gray-800 p-2 rounded-lg shadow-xl border border-gray-700 flex flex-col space-y-2"
    role="toolbar"
    aria-label="Main tools"
  >
    {#each TOOLS as tool (tool.id)}
      <button
        on:click={() => selectTool(tool.id)}
        class="p-2 rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800"
        class:bg-blue-600={activeTool === tool.id}
        class:text-white={activeTool === tool.id}
        class:hover:bg-gray-700={activeTool !== tool.id}
        class:text-gray-300={activeTool !== tool.id}
        class:hover:text-gray-100={activeTool !== tool.id}
        class:focus:ring-blue-500={activeTool !== tool.id}
        class:focus:ring-blue-300={activeTool === tool.id}
        aria-pressed={activeTool === tool.id}
        aria-label={tool.label}
        title={tool.label}
      >
        <svelte:component this={tool.icon} class="h-6 w-6" />
      </button>
    {/each}
  </div>