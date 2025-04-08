import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export function POST(event: RequestEvent) {
	const cacheKey = new Request(event.url.href.toString());

	let whitelistedOrigins = [
		'app://-',
		'https://localhost:5173',
		'https://127.0.0.1:5173',
		'http://localhost:5173',
		'http://127.0.0.1:5173',
	];

	let showOrigin: string = 'http://localhost:5173';

	let requestOrigin = event.request.headers.get('Origin')?.toString();

	if (requestOrigin && whitelistedOrigins.includes(requestOrigin)) {
		showOrigin = 'showOrigin = ' + requestOrigin;
	}
	// console.log(event.url.href);
	console.log("showOrigin = ", showOrigin);

	// --- 1. Check for R2 Binding ---
		if (!event.platform?.env.MADMODS_R2) {
			console.error("R2 binding 'MADMODS_R2' not found.");
			throw error(500, "Server configuration error: R2 bucket not available.");
		}
	const bucket = event.platform?.env.MADMODS_R2;

	return new Response(JSON.stringify(showOrigin), {
		status: 200
	});
}
