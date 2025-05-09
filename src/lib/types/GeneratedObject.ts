export interface GeneratedObject {

    id: string;
    user_id: string | null;
    world_id: string | null;
    created_at: string | null;


    prompt: string | null;
    objectName: string;


    status: 'idle' | 'queued' | 'polling' | 'generating' | 'success' | 'failed' | 'error_enqueue' | 'db_error' | 'skipped_image_failed';
    statusMessage: string | null;
    statusUrl?: string | null;
    imageUrl?: string | null;
    attempts: number;
    originalImageId?: string | null;


    modelStatus?: 'idle' | 'queued' | 'polling' | 'generating' | 'success' | 'failed' | 'error_enqueue' | 'skipped_image_failed';
    modelStatusMessage?: string | null;
    modelStatusUrl?: string | null;
    modelUrl?: string | null;
    modelAttempts?: number;


    isGenerating?: boolean;




    image_url?: string | null;
    model_url?: string | null;
    original_image_id?: string | null;
}
