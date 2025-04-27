// src/lib/supabaseClient.ts
import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '$lib/database.types'; // Import generated types
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestEvent } from '@sveltejs/kit';

// Type helper for the Supabase client instance
export type TypedSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

/**
 * Creates a Supabase client for server-side operations.
 * Uses cookies from the RequestEvent for session management.
 */
export const createSupabaseServerClient = (event: RequestEvent) => {
	return createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			get: (key) => event.cookies.get(key),
			set: (key, value, options) => {
				event.cookies.set(key, value, { ...options, path: '/' }); // Ensure path is '/'
			},
			remove: (key, options) => {
				event.cookies.delete(key, { ...options, path: '/' }); // Ensure path is '/'
			}
		}
	});
};


/**
 * Creates a Supabase client for browser-side operations.
 * Requires initial serverSession for hydration if available.
 */
export const createSupabaseBrowserClient = (
    // Pass the initial session from the server load function
    serverSession: Awaited<ReturnType<TypedSupabaseClient['auth']['getSession']>>['data']['session'] | null = null
) => {
	return createBrowserClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
        global: {
            fetch: fetch // Use the global fetch
        },
        auth: {
            // Flow type recommended by Supabase docs for SSR environments
            flowType: 'pkce',
            // autoRefreshToken is true by default
            // detectSessionInUrl is true by default (handles magic links, OAuth)
        }
    });
};