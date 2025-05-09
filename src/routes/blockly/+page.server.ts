import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getSession }, url }) => {
	const session = await getSession();

	if (!session) {

		throw redirect(303, '/?showLogin=true');
	}


	return {
		user: session.user,
		message: "Welcome to the MVP area!"
	};
};