import { objectStore } from '$lib/stores/objectStore';
import type { GeneratedObject } from '$lib/types/GeneratedObject';
import {
	IMAGE_GENERATION_ENDPOINT_URL,
	MODEL_GENERATION_ENDPOINT_URL,
	R2_PUBLIC_URL_BASE_URL,
	MAX_IMAGE_POLL_ATTEMPTS,
	MAX_MODEL_POLL_ATTEMPTS,
	POLLING_INTERVAL_MS
} from '$lib/config';
import { get } from 'svelte/store';
import { sessionStore, supabaseStore } from '$lib/stores/authStore';
import { saveGeneratedImageDetails, saveGeneratedModelDetails } from './objectDBService';


const activePollingIntervals = new Map<string, number>();
const activeModelPollingIntervals = new Map<string, number>();

function clearPolling(generationId: string, type: 'image' | 'model') {
	const intervalMap = type === 'image' ? activePollingIntervals : activeModelPollingIntervals;
	if (intervalMap.has(generationId)) {
		clearInterval(intervalMap.get(generationId)!);
		intervalMap.delete(generationId);
	}
}

export async function enqueueImageGenerationRequest(
	prompt: string,
	userId: string,
	worldId: string,
	originalImageId?: string
): Promise<GeneratedObject | null> {
	if (!prompt.trim()) return null;
	if (!R2_PUBLIC_URL_BASE_URL || !IMAGE_GENERATION_ENDPOINT_URL) {
		alert('Configuration error prevents image generation.');
		return null;
	}

	const provisionalObject = objectStore.addProvisionalObject(prompt, userId, worldId, originalImageId);
    const generationId = provisionalObject.id;

	const requestBody = {
		inputPrompt: prompt,
		userID: userId,
		worldID: worldId,
		propID: generationId,
		imageFormat: 'jpg'
	};

	try {
		const response = await fetch(IMAGE_GENERATION_ENDPOINT_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestBody)
		});
		if (!response.ok) {
			let errorBody = `HTTP ${response.status}: ${response.statusText}`;
			try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) {  }
			throw new Error(`Failed to enqueue image: ${errorBody}`);
		}
		const result: any = await response.json();
		if (!result.statusKey) throw new Error("Image enqueue response missing 'statusKey'.");

		const fullStatusUrl = `${R2_PUBLIC_URL_BASE_URL}/${result.statusKey}`;
		objectStore.updateObjectState(generationId, { status: 'polling', statusUrl: fullStatusUrl, statusMessage: 'Image Queued. Waiting...' });
		startImagePolling(generationId, fullStatusUrl, userId);
		return provisionalObject;
	} catch (err: any) {
		objectStore.updateObjectState(generationId, { status: 'error_enqueue', statusMessage: `Enqueue failed: ${err.message}`, isGenerating: false });
		return null;
	}
}

function startImagePolling(generationId: string, statusUrl: string, userId: string) {
	clearPolling(generationId, 'image');
	const intervalId = window.setInterval(() => {
		pollImageStatus(generationId, statusUrl, userId);
	}, POLLING_INTERVAL_MS);
	activePollingIntervals.set(generationId, intervalId);
}

async function pollImageStatus(generationId: string, statusUrl: string, userId: string) {
	let currentObject = objectStore.getObjectById(generationId);
	if (!currentObject || !currentObject.isGenerating) {
		clearPolling(generationId, 'image');
		return;
	}

	const currentAttempts = currentObject.attempts + 1;
	objectStore.updateObjectState(generationId, { attempts: currentAttempts });
    currentObject = objectStore.getObjectById(generationId);
    if (!currentObject) { clearPolling(generationId, 'image'); return; }


	if (currentAttempts > MAX_IMAGE_POLL_ATTEMPTS) {
		objectStore.updateObjectState(generationId, { status: 'failed', statusMessage: `Polling timed out.`, isGenerating: false });
		clearPolling(generationId, 'image');
		return;
	}

	try {
		const response = await fetch(statusUrl, { cache: 'no-store' });
		if (response.status === 404) {
			if (currentObject.status === 'polling' || currentObject.status === 'queued') {
				objectStore.updateObjectState(generationId, { statusMessage: `Waiting for image status... (Attempt ${currentAttempts})` });
			}
			return;
		}
		if (!response.ok) throw new Error(`HTTP error ${response.status}`);
		const statusReport: any = await response.json();

        currentObject = objectStore.getObjectById(generationId);
        if (!currentObject || !currentObject.isGenerating) { clearPolling(generationId, 'image'); return; }


		switch (statusReport.status) {
			case 'success':
				if (!statusReport.r2ImagePath) throw new Error("Image status 'success' but missing 'r2ImagePath'.");
				const fullImageUrl = `${R2_PUBLIC_URL_BASE_URL}/${statusReport.r2ImagePath}`;
				objectStore.updateObjectState(generationId, {
					status: 'success',
					imageUrl: fullImageUrl,
					image_url: fullImageUrl,
					statusMessage: 'Image generated.'

				});
				clearPolling(generationId, 'image');

                const supabase = get(supabaseStore);
                if (supabase && currentObject.prompt && currentObject.objectName) {
                    const saved = await saveGeneratedImageDetails(supabase, userId, {
                        id: generationId,
                        prompt: currentObject.prompt,
                        imageUrl: fullImageUrl,
                        objectName: currentObject.objectName,
                        worldId: currentObject.world_id!,
                        originalImageId: currentObject.original_image_id ?? undefined
                    });
                    if (saved) {


                    }
                } else {
                     objectStore.updateObjectState(generationId, { status: 'db_error', statusMessage: 'Image generated, but DB save failed (missing info).' });
                }
				break;
			case 'failure': case 'error':
				const failureMsg = statusReport.message || statusReport.errorDetails || 'Unknown error from image worker';
				objectStore.updateObjectState(generationId, { status: 'failed', statusMessage: `Image Failed: ${failureMsg}`, isGenerating: false });
				clearPolling(generationId, 'image');
				break;

            case 'processing': case 'generating':
                objectStore.updateObjectState(generationId, { status: 'generating', statusMessage: `Generating image... (Attempt ${currentAttempts})` });
                break;
            case 'queued':
                objectStore.updateObjectState(generationId, { status: 'queued', statusMessage: `Image in queue... (Attempt ${currentAttempts})` });
                break;
			default:
				objectStore.updateObjectState(generationId, { statusMessage: `Unknown status: ${statusReport.status} (Attempt ${currentAttempts})` });
				break;
		}
	} catch (err: any) {
        currentObject = objectStore.getObjectById(generationId);
		if (!currentObject || !currentObject.isGenerating) { clearPolling(generationId, 'image'); return; }

		if (err instanceof SyntaxError) {
			objectStore.updateObjectState(generationId, { statusMessage: `Reading status... (Attempt ${currentAttempts})` });
		} else {
			objectStore.updateObjectState(generationId, { status: 'failed', statusMessage: `Polling error: ${err.message}`, isGenerating: false });
			clearPolling(generationId, 'image');
		}
	}
}


export async function enqueueModelGenerationRequest(
    objectId: string,
    userId: string,
    worldId: string
): Promise<boolean> {
    const objectState = objectStore.getObjectById(objectId);
    if (!objectState) {
        console.error("Cannot start model generation: object not found in store.");
        return false;
    }

    if (objectState.status !== 'success' || !objectState.imageUrl) {
        if (objectState.modelStatus !== 'skipped_image_failed') {
            objectStore.updateObjectState(objectId, { modelStatus: 'skipped_image_failed', modelStatusMessage: 'Skipped: Image not successful.', isGenerating: false });
        }
        return false;
    }

    if (!MODEL_GENERATION_ENDPOINT_URL || !R2_PUBLIC_URL_BASE_URL) {
        alert("Configuration error prevents model generation.");
        objectStore.updateObjectState(objectId, { modelStatus: 'error_enqueue', modelStatusMessage: 'Config error.', isGenerating: false });
        return false;
    }

    const requestBody = {
        imagePublicUrl: objectState.imageUrl,
        userID: userId,
        worldID: worldId,
        propID: objectId
    };

    objectStore.updateObjectState(objectId, { modelStatus: 'queued', modelStatusMessage: 'Sending request to model queue...', modelAttempts: 0, isGenerating: true });

    try {
        const response = await fetch(MODEL_GENERATION_ENDPOINT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        if (!response.ok) {
            let errorBody = `HTTP ${response.status}: ${response.statusText}`;
            try { const errorJson: any = await response.json(); errorBody = errorJson.message || errorJson.error || JSON.stringify(errorJson); } catch (e) {  }
            throw new Error(`Failed to enqueue model: ${errorBody}`);
        }
        const result: any = await response.json();
        if (!result.statusKey) throw new Error("Model enqueue response missing 'statusKey'.");
        const fullModelStatusUrl = `${R2_PUBLIC_URL_BASE_URL}/${result.statusKey}`;
        objectStore.updateObjectState(objectId, { modelStatus: 'polling', modelStatusUrl: fullModelStatusUrl, modelStatusMessage: 'Model Queued. Waiting...' });
        startModelPolling(objectId, fullModelStatusUrl, userId);
        return true;
    } catch (err: any) {
        objectStore.updateObjectState(objectId, { modelStatus: 'error_enqueue', modelStatusMessage: `Model Enqueue failed: ${err.message}`, isGenerating: false });
        return false;
    }
}

function startModelPolling(generationId: string, statusUrl: string, userId: string) {
	clearPolling(generationId, 'model');
	const intervalId = window.setInterval(() => {
		pollModelStatus(generationId, statusUrl, userId);
	}, POLLING_INTERVAL_MS);
	activeModelPollingIntervals.set(generationId, intervalId);
}

async function pollModelStatus(generationId: string, statusUrl: string, userId: string) {
	let currentObject = objectStore.getObjectById(generationId);
	if (!currentObject || !currentObject.isGenerating) {
		clearPolling(generationId, 'model');
		return;
	}

	let currentAttempts = (currentObject.modelAttempts ?? 0) + 1;
	objectStore.updateObjectState(generationId, { modelAttempts: currentAttempts });
    currentObject = objectStore.getObjectById(generationId);
    if (!currentObject) { clearPolling(generationId, 'model'); return; }


	if (currentAttempts > MAX_MODEL_POLL_ATTEMPTS) {
		objectStore.updateObjectState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model polling timed out.`, isGenerating: false });
		clearPolling(generationId, 'model');
		return;
	}

	try {
		const response = await fetch(statusUrl, { cache: 'no-store' });
		if (response.status === 404) {
			if (currentObject.modelStatus === 'polling' || currentObject.modelStatus === 'queued') {
				objectStore.updateObjectState(generationId, { modelStatusMessage: `Waiting for model status... (Attempt ${currentAttempts})` });
			}
			return;
		}
		if (!response.ok) throw new Error(`HTTP error ${response.status}`);
		const statusReport: any = await response.json();

        currentObject = objectStore.getObjectById(generationId);
		if (!currentObject || !currentObject.isGenerating) { clearPolling(generationId, 'model'); return; }


		switch (statusReport.status) {
			case 'success':
				if (!statusReport.r2ModelPath) throw new Error("Model status 'success' but missing 'r2ModelPath'.");
				if (!statusReport.r2ModelPath.toLowerCase().endsWith('.glb')) {
					throw new Error(`Model success but path is not a .glb: ${statusReport.r2ModelPath}`);
				}
				const fullModelUrl = `${R2_PUBLIC_URL_BASE_URL}/${statusReport.r2ModelPath}`;
				objectStore.updateObjectState(generationId, {
					modelStatus: 'success',
					modelUrl: fullModelUrl,
                    model_url: fullModelUrl,
					modelStatusMessage: 'Model generated.',
					isGenerating: false
				});
				clearPolling(generationId, 'model');
                const supabase = get(supabaseStore);
                if (supabase) {
				    await saveGeneratedModelDetails(supabase, userId, generationId, fullModelUrl);
                } else {
                    objectStore.updateObjectState(generationId, { modelStatus: 'db_error', modelStatusMessage: 'Model generated, but DB save failed (no connection).' });
                }
				break;
			case 'failure': case 'error':
				const modelFailureMsg = statusReport.message || statusReport.errorDetails || 'Unknown error from model worker';
				objectStore.updateObjectState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model Failed: ${modelFailureMsg}`, isGenerating: false });
				clearPolling(generationId, 'model');
				break;

            case 'processing': case 'generating':
                objectStore.updateObjectState(generationId, { modelStatus: 'generating', modelStatusMessage: `Generating model... (Attempt ${currentAttempts})` });
                break;
            case 'queued':
                objectStore.updateObjectState(generationId, { modelStatus: 'queued', modelStatusMessage: `Model in queue... (Attempt ${currentAttempts})` });
                break;
			default:
				objectStore.updateObjectState(generationId, { modelStatusMessage: `Unknown model status: ${statusReport.status} (Attempt ${currentAttempts})` });
				break;
		}
	} catch (err: any) {
        currentObject = objectStore.getObjectById(generationId);
		if (!currentObject || !currentObject.isGenerating) { clearPolling(generationId, 'model'); return; }

		if (err instanceof SyntaxError) {
			objectStore.updateObjectState(generationId, { modelStatusMessage: `Reading status... (Attempt ${currentAttempts})` });
		} else {
			objectStore.updateObjectState(generationId, { modelStatus: 'failed', modelStatusMessage: `Model polling error: ${err.message}`, isGenerating: false });
			clearPolling(generationId, 'model');
		}
	}
}

export function cleanupAllPolling() {
    activePollingIntervals.forEach(id => clearInterval(id));
    activePollingIntervals.clear();
    activeModelPollingIntervals.forEach(id => clearInterval(id));
    activeModelPollingIntervals.clear();
    console.log("All active polling intervals cleared.");
}