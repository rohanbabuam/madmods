// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types'; // Correct type for server layout load
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const load: LayoutServerLoad = async ({ locals: { getSession } }) => {
    // Get the session from the helper function we defined in hooks.server.ts
    const session = await getSession();

	return {
        // Pass session and Supabase details to the client-side layout
        session,
		supabaseUrl: PUBLIC_SUPABASE_URL,
		supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
	};
};