// src/routes/mvp/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getSession }, url }) => {
	const session = await getSession();

	if (!session) {
		// Redirect to the homepage AND add a query parameter
		throw redirect(303, '/?showLogin=true');
	}

	// User is logged in
	return {
		user: session.user,
		message: "Welcome to the MVP area!"
	};
};