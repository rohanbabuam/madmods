import type { LayoutServerLoad } from './$types';
import { PRIVATE_SUPABASE_URL as STATIC_SUPABASE_URL, PRIVATE_SUPABASE_ANON_KEY as STATIC_SUPABASE_ANON_KEY } from '$env/static/private';


export const load: LayoutServerLoad = async ({ platform, locals: { getSession } }) => {

  let supabaseUrl = platform?.env?.PRIVATE_SUPABASE_URL;
  let supabaseKey = platform?.env?.PRIVATE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
      supabaseUrl = STATIC_SUPABASE_URL;
      console.log('[Layout Server] Using static Supabase URL.');
  } else {
       console.log('[Layout Server] Using platform Supabase URL.');
  }
  if (!supabaseKey) {
      supabaseKey = STATIC_SUPABASE_ANON_KEY;
       console.log('[Layout Server] Using static Supabase Key.');
  } else {
       console.log('[Layout Server] Using platform Supabase Key.');
  }


    const session = await getSession();

	return {

        session,
		supabaseUrl: supabaseUrl,
		supabaseKey: supabaseKey,
	};
};