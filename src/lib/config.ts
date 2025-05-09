// File: lib/config.ts
export const MAX_MODEL_POLL_ATTEMPTS = 60;
export const MAX_IMAGE_POLL_ATTEMPTS = 40;
export const POLLING_INTERVAL_MS = 3000;
export const WORLD_ID = 'default-world';

// Ensure these are correctly sourced, perhaps from environment variables in a real app
export const PUBLIC_MODEL_GENERATION_ENDPOINT = "https://modelgeneration.madmods.world";
export const PUBLIC_IMAGE_GENERATION_ENDPOINT = "https://imagegeneration.madmods.world";
export const PUBLIC_R2_PUBLIC_URL_BASE = "https://pub-48572794ea984ea9976e5d5856e58593.r2.dev";

// These will be used by the generation service
export const IMAGE_GENERATION_ENDPOINT_URL = PUBLIC_IMAGE_GENERATION_ENDPOINT || 'http://localhost:8787/generate';
export const MODEL_GENERATION_ENDPOINT_URL = PUBLIC_MODEL_GENERATION_ENDPOINT;
export const R2_PUBLIC_URL_BASE_URL = PUBLIC_R2_PUBLIC_URL_BASE || '';