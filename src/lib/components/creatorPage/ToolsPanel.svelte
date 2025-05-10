<!-- File: lib/components/creatorPage/ToolsPanel.svelte -->
<script module lang="ts">
  export type Tool = 'select' | 'wand' | 'scatter' | 'clone';
</script>

<script lang="ts">
  import type { ComponentType } from 'svelte'; // Import ComponentType for icon type safety
  import { MousePointer2, WandSparkles, SquareStack, Copy } from 'lucide-svelte';

  // Define a more specific type for the TOOLS array elements
  interface ToolDefinition {
    id: Tool;
    label: string;
    icon: ComponentType; // Use ComponentType for the icon
  }

  let {
    activeTool = $bindable('select' as Tool | null),
    onToolSelect = (toolId: Tool) => {}
  }: {
    activeTool?: Tool | null,
    onToolSelect?: (toolId: Tool) => void
  } = $props();

  const TOOLS: ToolDefinition[] = [ // Apply the ToolDefinition type
    { id: 'select', label: 'Select Tool', icon: MousePointer2 },
    { id: 'clone', label: 'Clone Tool', icon: Copy },
    { id: 'wand', label: 'Wand Tool (Not Implemented)', icon: WandSparkles },
    { id: 'scatter', label: 'Scatter Tool (Not Implemented)', icon: SquareStack },
  ];

  function handleToolButtonClick(toolId: Tool) {
    console.log(`[ToolsPanel] Tool button clicked: ${toolId}. Calling onToolSelect.`);
    if (onToolSelect) {
        onToolSelect(toolId);
    }
  }
</script>

<div
  class="fixed left-4 top-1/2 -translate-y-1/2 z-20 bg-gray-800 p-2 rounded-lg shadow-xl border border-gray-700 flex flex-col space-y-2"
  role="toolbar"
  aria-label="Main tools"
>
  {#each TOOLS as tool (tool.id)}
    {@const IconComponent = tool.icon} <!-- Assign component to a variable with a capital letter -->
    <button
      onclick={() => handleToolButtonClick(tool.id)}
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
      <!-- Use the component constructor directly as a tag -->
      <IconComponent class="h-6 w-6" />
    </button>
  {/each}
</div>