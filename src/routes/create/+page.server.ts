import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getSession } }) => {
	const session = await getSession();

	if (!session) {
		return {
			user: null,
			requiresAuth: true
		};
	}

	return {
		user: session.user,
		requiresAuth: false
	};
};