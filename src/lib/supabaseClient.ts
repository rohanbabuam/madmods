// src/lib/supabaseClient.ts
import { createBrowserClient, type SupabaseClient } from '@supabase/ssr';
import type { Database } from '$lib/database.types';

// Type helper (can stay or use SupabaseClient directly)
export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Creates a Supabase client for browser-side operations.
 * Requires Supabase URL and Anon Key to be passed explicitly.
 */
export const createSupabaseBrowserClient = (
    supabaseUrl: string,
    supabaseKey: string
): TypedSupabaseClient => { // Added return type alias
    if (!supabaseUrl || !supabaseKey) {
        console.error("Supabase URL or Anon Key not provided to createSupabaseBrowserClient.");
        // Consider returning null or a specific error state if preferred over throwing
        throw new Error("Browser Supabase configuration is missing.");
    }

    return createBrowserClient<Database>(supabaseUrl, supabaseKey, {
        global: { fetch }, // fetch is globally available in modern browsers
        auth: {
            flowType: 'pkce',
            autoRefreshToken: true,
            detectSessionInUrl: true,
        }
    });
};