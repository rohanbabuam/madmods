// src/lib/supabaseClient.ts
import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '$lib/database.types'; // Import generated types
import type { RequestEvent } from '@sveltejs/kit';

// Type helper for the Supabase client instance
export type TypedSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;
let supabase_url:string, supabase_key:string;


/**
 * Creates a Supabase client for server-side operations.
 * Uses cookies from the RequestEvent for session management.
 */

export const createSupabaseServerClient = async (event: RequestEvent): Promise<SupabaseClient<Database>> => {
    try{
        const { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } = await import('$env/static/public');
        // const { PRIVATE_GEMINI_API_KEY } = await import('$env/static/private');
        supabase_url = PUBLIC_SUPABASE_URL;
        supabase_key = PUBLIC_SUPABASE_ANON_KEY;
      }
      catch (err:any) {
        console.error("Error during env var import:", err);
        // geminiToken = event.platform?.env.PRIVATE_GEMINI_API_KEY;
        supabase_url = event.platform?.env.PUBLIC_SUPABASE_URL;
        supabase_key = event.platform?.env.PUBLIC_SUPABASE_ANON_KEY;
      }

	try {
		// Attempt dynamic import (this is the async part)
		const { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } = await import('$env/static/public');
		supabase_url = PUBLIC_SUPABASE_URL;
		supabase_key = PUBLIC_SUPABASE_ANON_KEY;
        console.log("Successfully loaded Supabase config from $env/static/public");
	} catch (err: any) {
		// Fallback for environments where dynamic import might not work (like CF Workers)
		console.warn("Failed to dynamically import $env/static/public, falling back to event.platform.env:", err.message);
		supabase_url = event.platform?.env.PUBLIC_SUPABASE_URL;
		supabase_key = event.platform?.env.PUBLIC_SUPABASE_ANON_KEY;
        if (supabase_url && supabase_key) {
             console.log("Successfully loaded Supabase config from event.platform.env");
        } else {
             console.error("Failed to load Supabase config from event.platform.env as well.");
        }
	}

	// Validate that keys were successfully loaded
	if (!supabase_url || !supabase_key) {
		console.error("Supabase URL or Anon Key is missing. Check environment variables ($env/static/public or event.platform.env).");
		// Throw an error or handle this case as appropriate for your application
		throw new Error("Supabase configuration is missing.");
	}

	// createServerClient itself is synchronous, but the overall function is async
	return createServerClient<Database>(supabase_url, supabase_key, {
		cookies: {
			get: (key) => {
				return event.cookies.get(key);
			},
			// Add explicit type annotation for options based on Supabase SSR types
			set: (key, value, options: CookieOptions) => {
				event.cookies.set(key, value, { ...options, path: '/' }); // Ensure path is '/'
			},
			// Add explicit type annotation for options
			remove: (key, options: CookieOptions) => {
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
	return createBrowserClient<Database>(supabase_url, supabase_key, {
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