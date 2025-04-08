import type { RequestEvent } from '@sveltejs/kit';

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
		showOrigin = requestOrigin;
	}
	// console.log(event.url.href);
	console.log(showOrigin);

	return new Response(JSON.stringify(showOrigin), {
		status: 200
	});
}
