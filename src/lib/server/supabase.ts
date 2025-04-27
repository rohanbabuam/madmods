import { createServerClient, type CookieOptions, type SupabaseClient } from '@supabase/ssr';
import type { Database } from '$lib/database.types';
import type { RequestEvent } from '@sveltejs/kit';
// Import static env vars as a fallback - SAFE here as it's server-only
import { PRIVATE_SUPABASE_URL as STATIC_SUPABASE_URL, PRIVATE_SUPABASE_ANON_KEY as STATIC_SUPABASE_ANON_KEY } from '$env/static/private';

/**
 * Creates a Supabase client for server-side operations.
 * Prioritizes runtime environment variables from event.platform.env (e.g., Cloudflare).
 * Falls back to static environment variables ($env/static/private) for local dev/builds.
 */
export const createSupabaseServerClient = (event: RequestEvent): SupabaseClient<Database> => {
    // --- Determine URL and Key ---
    let supabaseUrl = event.platform?.env?.PRIVATE_SUPABASE_URL;
    let supabaseKey = event.platform?.env?.PRIVATE_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
        supabaseUrl = STATIC_SUPABASE_URL;
    }
    if (!supabaseKey) {
        supabaseKey = STATIC_SUPABASE_ANON_KEY;
    }
    // --- End Determine URL and Key ---

    if (!supabaseUrl || !supabaseKey) {
        console.error("Server Supabase URL or Anon Key could not be determined from platform.env or $env/static/private.");
        throw new Error("Server Supabase configuration is missing.");
    }

    return createServerClient<Database>(supabaseUrl, supabaseKey, {
        cookies: {
            get: (key) => event.cookies.get(key),
            set: (key, value, options: CookieOptions) => {
                event.cookies.set(key, value, { ...options, path: '/' });
            },
            remove: (key, options: CookieOptions) => {
                event.cookies.delete(key, { ...options, path: '/' });
            }
        }
    });
};