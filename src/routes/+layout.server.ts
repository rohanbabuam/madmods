// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types'; // Correct type for server layout load
import { PRIVATE_SUPABASE_URL as STATIC_SUPABASE_URL, PRIVATE_SUPABASE_ANON_KEY as STATIC_SUPABASE_ANON_KEY } from '$env/static/private'; 


export const load: LayoutServerLoad = async ({ platform, locals: { getSession } }) => {
  // --- Determine URL and Key for the Browser ---
  let supabaseUrl = platform?.env?.PRIVATE_SUPABASE_URL;
  let supabaseKey = platform?.env?.PRIVATE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
      supabaseUrl = STATIC_SUPABASE_URL;
      console.log('[Layout Server] Using static Supabase URL.'); // Log fallback
  } else {
       console.log('[Layout Server] Using platform Supabase URL.'); // Log platform usage
  }
  if (!supabaseKey) {
      supabaseKey = STATIC_SUPABASE_ANON_KEY;
       console.log('[Layout Server] Using static Supabase Key.'); // Log fallback
  } else {
       console.log('[Layout Server] Using platform Supabase Key.'); // Log platform usage
  }
  // --- End Determine URL and Key ---
    // Get the session from the helper function we defined in hooks.server.ts
    const session = await getSession();

	return {
        // Pass session and Supabase details to the client-side layout
        session,
		supabaseUrl: supabaseUrl,
		supabaseKey: supabaseKey,
	};
};