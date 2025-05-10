// lib/stores/toolStore.ts
import { writable } from 'svelte/store';
import type { ToolName } from '$lib/blockly/3d'; // Assuming ToolName is exported from 3d/index.ts

export const activeThreeDToolStore = writable<ToolName>(null);