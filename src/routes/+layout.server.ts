// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types'; // Correct type for server layout load

let supabase_url, supabase_key;


export const load: LayoutServerLoad = async ({ platform, locals: { getSession } }) => {
    try{
        const { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } = await import('$env/static/public');
        // const { PRIVATE_GEMINI_API_KEY } = await import('$env/static/private');
        supabase_url = PUBLIC_SUPABASE_URL;
        supabase_key = PUBLIC_SUPABASE_ANON_KEY;
      }
      catch (err:any) {
        console.error("Error during env var import:", err);
        // geminiToken = event.platform?.env.PRIVATE_GEMINI_API_KEY;
        supabase_url = platform?.env.PUBLIC_SUPABASE_URL;
        supabase_key = platform?.env.PUBLIC_SUPABASE_ANON_KEY;
      }

    // Get the session from the helper function we defined in hooks.server.ts
    const session = await getSession();

	return {
        // Pass session and Supabase details to the client-side layout
        session,
		supabaseUrl: supabase_url,
		supabaseKey: supabase_key,
	};
};