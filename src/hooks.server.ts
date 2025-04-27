// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabaseClient'; // Import helper
import { sequence } from '@sveltejs/kit/hooks'; // Helper to chain hooks

// --- Configuration ---
const allowedOrigins: string[] = [
    'app://-',
    'https://localhost:5173',
    'https://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];
const allowedMethods = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
const allowedHeaders = 'Content-Type, Authorization, X-Requested-With, apikey, x-client-info'; // Added Supabase headers

if (allowedOrigins.length > 0) {
    console.info(`[CORS Hook] Allowed Origins (hardcoded): ${allowedOrigins.join(', ')}`);
} else {
    console.warn("[CORS Hook] allowedOrigins array is empty. CORS headers might not be applied correctly.");
}


// --- Supabase Auth Hook ---
const supabaseHandle: Handle = async ({ event, resolve }) => {
    // Create a Supabase client specific to this server request
    event.locals.supabase = createSupabaseServerClient(event);

    // Helper function to get the session
    event.locals.getSession = async () => {
        const {
            data: { session },
        } = await event.locals.supabase.auth.getSession();
        return session;
    };

    // IMPORTANT: Add filterSerializedResponseHeaders from @supabase/ssr
    // This ensures Supabase auth cookies are properly set/removed
    return resolve(event, {
        filterSerializedResponseHeaders(name) {
            // Supabase needs to control the Content-Range header for storage downloads
            // It also needs to control the Set-Cookie header for auth
            return name === 'content-range' || name === 'x-supabase-api-version' || name === 'set-cookie';
        },
    });
};


// --- CORS Hook ---
const corsHandle: Handle = async ({ event, resolve }) => {
    const requestOrigin:any = event.request.headers.get('Origin');
    let isOriginAllowed = false;

    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        isOriginAllowed = true;
    }

    // --- CORS Preflight Handling (OPTIONS Requests) ---
    if (event.request.method === 'OPTIONS') {
        if (isOriginAllowed) {
            const headers = new Headers();
            headers.set('Access-Control-Allow-Origin', requestOrigin);
            headers.set('Access-Control-Allow-Methods', allowedMethods);

            const requestedHeaders = event.request.headers.get('Access-Control-Request-Headers');
            headers.set('Access-Control-Allow-Headers', requestedHeaders || allowedHeaders);

            headers.set('Access-Control-Allow-Credentials', 'true'); // Often needed with auth
            headers.set('Access-Control-Max-Age', '86400');
            headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');

            console.log(`[CORS Hook - OPTIONS] Allowed preflight from ${requestOrigin}`);
            return new Response(null, {
                status: 204,
                headers: headers
            });
        } else {
            console.warn(`[CORS Hook - OPTIONS] Denied preflight from ${requestOrigin || 'N/A'}`);
            return new Response(null, { status: 204 });
        }
    }

    // --- Regular Request Handling (Add CORS Headers to Actual Responses) ---
    const response = await resolve(event); // Resolve happens *after* Supabase hook sets up locals

    if (isOriginAllowed) {
        console.log(`[CORS Hook - ${event.request.method}] Adding CORS headers for allowed origin ${requestOrigin}`);
        response.headers.set('Access-Control-Allow-Origin', requestOrigin);
        response.headers.set('Access-Control-Allow-Credentials', 'true'); // Often needed with auth
        response.headers.append('Vary', 'Origin');
    } else if (requestOrigin) {
        console.warn(`[CORS Hook - ${event.request.method}] Origin ${requestOrigin} not in allowed list. Not adding CORS headers.`);
    }

    return response;
};


// --- Chain the hooks ---
// Supabase handle runs first to set up event.locals.supabase and event.locals.getSession
// CORS handle runs next to add CORS headers based on the origin
export const handle = sequence(supabaseHandle, corsHandle);