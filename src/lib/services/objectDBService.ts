import type { TypedSupabaseClient } from '$lib/supabaseClient';
import type { GeneratedObject } from '$lib/types/GeneratedObject';
import type { Database } from '$lib/database.types.ts';
import { objectStore } from '$lib/stores/objectStore';
import { get } from 'svelte/store';

type DatabaseObject = Database['public']['Tables']['generated_objects']['Row'];

function mapDbObjectToGeneratedObject(dbObj: DatabaseObject): GeneratedObject {
    return {
        id: dbObj.id,
        user_id: dbObj.user_id,
        world_id: dbObj.world_id,
        created_at: dbObj.created_at,
        prompt: dbObj.prompt,
        objectName: dbObj.objectName || dbObj.prompt?.substring(0, 30) || dbObj.id,
        status: dbObj.status || (dbObj.image_url ? 'success' : 'idle'),
        statusMessage: dbObj.statusMessage,
        imageUrl: dbObj.image_url,
        attempts: dbObj.attempts || 0,
        originalImageId: dbObj.original_image_id,
        modelStatus: dbObj.model_status || (dbObj.model_url ? 'success' : (dbObj.image_url ? 'idle' : 'skipped_image_failed')),
        modelStatusMessage: dbObj.modelStatusMessage,
        modelUrl: dbObj.model_url,
        modelAttempts: dbObj.modelAttempts || 0,
        isGenerating: false,

        image_url: dbObj.image_url,
        model_url: dbObj.model_url,
        original_image_id: dbObj.original_image_id
    };
}


export async function fetchUserObjects(supabase: TypedSupabaseClient, userId: string | null) {
	if (!supabase) {
		objectStore.setError('Database connection not available.');
		console.error('Skipping object fetch: Supabase client not ready.');
		return;
	}

    if (get(objectStore).isLoading) {
        console.log("Object fetch already in progress, skipping.");
        return;
    }

	objectStore.setLoading(true);
	console.log('Fetching objects from database...');

	try {
		let query = supabase
			.from('generated_objects')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(100);

		if (userId) {
			query = query.eq('user_id', userId);
		} else {



             objectStore.setObjects([]);
             console.log("No user logged in or only public objects requested. Adjust query if public objects needed.");
             return;
		}

		const { data: dbData, error } = await query;

		if (error) throw error;

        const fetchedItems = dbData?.map(mapDbObjectToGeneratedObject) || [];
		objectStore.setObjects(fetchedItems);
		console.log(`Fetched ${fetchedItems.length} objects for user: ${userId || 'anonymous/public'}.`);

	} catch (err: any) {
		console.error('Error fetching objects:', err);
		objectStore.setError(`Failed to load objects: ${err.message || 'Unknown error'}`);
	}
}

export async function saveGeneratedImageDetails(
    supabase: TypedSupabaseClient,
    userId: string,
    imageData: {
        id: string;
        prompt: string;
        imageUrl: string;
        objectName: string;
        worldId: string;
        originalImageId?: string;
    }
) {
    if (!supabase) {
        objectStore.updateObjectState(imageData.id, { status: 'db_error', statusMessage: 'DB connection lost before saving.' });
        return false;
    }
    try {
        const { error } = await supabase.from('generated_objects').insert({
            id: imageData.id,
            prompt: imageData.prompt,
            image_url: imageData.imageUrl,
            objectName: imageData.objectName,
            user_id: userId,
            world_id: imageData.worldId,
            original_image_id: imageData.originalImageId,
            status: 'success',
            model_status: 'idle'
        });
        if (error) throw error;
        console.log(`[Gen ID: ${imageData.id}] Object (image) saved successfully to DB.`);
        return true;
    } catch (error: any) {
        console.error(`[Gen ID: ${imageData.id}] Error saving object (image) to DB:`, error);
        objectStore.updateObjectState(imageData.id, { status: 'db_error', statusMessage: `DB save failed: ${error.message}` });
        return false;
    }
}

export async function saveGeneratedModelDetails(
    supabase: TypedSupabaseClient,
    userId: string,
    objectId: string,
    modelUrl: string
) {
    if (!supabase) {
        objectStore.updateObjectState(objectId, { modelStatus: 'db_error', modelStatusMessage: 'DB connection lost before saving model URL.' });
        return false;
    }
    try {
        const { error } = await supabase
            .from('generated_objects')
            .update({ model_url: modelUrl, model_status: 'success' })
            .eq('id', objectId)
            .eq('user_id', userId);
        if (error) throw error;
        console.log(`[Gen ID: ${objectId}] Model URL saved successfully to DB object.`);

        await fetchUserObjects(supabase, userId);
        return true;
    } catch (error: any) {
        console.error(`[Gen ID: ${objectId}] Error saving model URL to DB object:`, error);
        objectStore.updateObjectState(objectId, { modelStatus: 'db_error', modelStatusMessage: `Model DB save error: ${error.message}` });
        return false;
    }
}

export async function updateObjectNameInDb(
    supabase: TypedSupabaseClient,
    userId: string,
    objectId: string,
    newName: string
): Promise<boolean> {
    if (!supabase) {
        console.error(`[Gen ID: ${objectId}] Cannot update object name in DB: Supabase client not available.`);

        return false;
    }
    try {
        const { error } = await supabase
            .from('generated_objects')
            .update({ objectName: newName })
            .eq('id', objectId)
            .eq('user_id', userId);
        if (error) throw error;
        console.log(`Object name for ${objectId} updated to "${newName}" in DB.`);
        return true;
    } catch (dbError) {
        console.error(`Failed to update object name in DB for ${objectId}:`, dbError);
        return false;
    }
}


