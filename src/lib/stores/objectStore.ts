import { writable, get } from 'svelte/store';
import type { GeneratedObject } from '$lib/types/GeneratedObject';
import { v4 as uuidv4 } from 'uuid';

export interface ObjectStoreState {
	objects: GeneratedObject[];
	isLoading: boolean;
	error: string | null;
}

const initialState: ObjectStoreState = {
	objects: [],
	isLoading: false,
	error: null
};

const { subscribe, set, update } = writable<ObjectStoreState>(initialState);

function generateDefaultObjectName(existingObjects: GeneratedObject[]): string {
    let i = 1;
    let name = `object-${i}`;
    while (existingObjects.some(obj => obj.objectName === name)) {
        i++;
        name = `object-${i}`;
    }
    return name;
}

export const objectStore = {
	subscribe,
	set,
	update,

	setLoading: (loading: boolean) => {
		update((state) => ({ ...state, isLoading: loading, error: null }));
	},

	setError: (errorMessage: string) => {
		update((state) => ({ ...state, isLoading: false, error: errorMessage }));
	},

	setObjects: (fetchedObjects: GeneratedObject[]) => {
		update((state) => {
            const generatingItems = state.objects.filter(obj => obj.isGenerating);
            const generatingMap = new Map(generatingItems.map(item => [item.id, item]));

            const combinedList = [
                ...generatingItems,
                ...fetchedObjects.filter(item => !generatingMap.has(item.id))
            ];

            combinedList.sort((a, b) => {
                if (a.isGenerating && !b.isGenerating) return -1;
                if (!a.isGenerating && b.isGenerating) return 1;
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
            });
			return { ...state, objects: combinedList, isLoading: false };
		});
	},

    addProvisionalObject: (prompt: string, userId: string, worldId: string, originalImageId?: string): GeneratedObject => {
        const generationId = uuidv4();
        const defaultObjectName = generateDefaultObjectName(get(objectStore).objects);

        const newObjectEntry: GeneratedObject = {
            id: generationId,
            prompt: prompt,
            objectName: defaultObjectName,
            status: 'queued',
            statusMessage: 'Sending request...',
            attempts: 0,
            modelAttempts: 0,
            imageUrl: null,
            modelUrl: null,
            user_id: userId,
            world_id: worldId,
            created_at: new Date().toISOString(),
            modelStatus: 'idle',
            isGenerating: true,
            statusUrl: null,
            modelStatusMessage: null,
            modelStatusUrl: null,
            original_image_id: originalImageId
        };

        update(state => ({
            ...state,
            objects: [newObjectEntry, ...state.objects]
        }));
        return newObjectEntry;
    },

	updateObjectState: (id: string, updates: Partial<GeneratedObject>) => {
		update((state) => {
			const index = state.objects.findIndex((obj) => obj.id === id);
			if (index !== -1) {
				const newObjects = [...state.objects];
				newObjects[index] = { ...newObjects[index], ...updates };
				return { ...state, objects: newObjects };
			}
			return state;
		});
	},

    getObjectById: (id: string): GeneratedObject | undefined => {
        return get(objectStore).objects.find(obj => obj.id === id);
    },

    getObjects: (): GeneratedObject[] => {
        return get(objectStore).objects;
    }
};