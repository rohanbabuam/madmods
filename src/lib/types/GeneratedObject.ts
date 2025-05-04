// src/lib/types/objects.ts

export interface GeneratedObject {
    // Core identifiers
    id: string;
    user_id: string | null;
    world_id: string | null;
    created_at: string | null;

    // Input & Naming
    prompt: string | null;
    objectName: string;

    // Image Generation State
    status: 'idle' | 'queued' | 'polling' | 'generating' | 'success' | 'failed' | 'error_enqueue' | 'db_error' | 'skipped_image_failed';
    statusMessage: string | null;
    statusUrl?: string | null;
    imageUrl?: string | null; // Primary URL for display
    attempts: number;
    originalImageId?: string | null; // Regeneration tracking ID

    // Model Generation State
    modelStatus?: 'idle' | 'queued' | 'polling' | 'generating' | 'success' | 'failed' | 'error_enqueue' | 'skipped_image_failed';
    modelStatusMessage?: string | null;
    modelStatusUrl?: string | null;
    modelUrl?: string | null; // Primary URL for loading
    modelAttempts?: number;

    // UI State Flags
    isGenerating?: boolean;

    // Include raw DB fields if merging strategy requires them temporarily,
    // but ideally, the mapping in fetchObjects populates the fields above.
    // e.g., if needed during mapping:
    image_url?: string | null;
    model_url?: string | null;
    original_image_id?: string | null;
}