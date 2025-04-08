// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { IStaticMethods } from "preline/dist";

declare namespace App {
	// interface Locals {}

	interface Platform {
		env: {
			MADMODS_R2: R2Bucket;
		};
		context: {
			waitUntil(promise: Promise<any>): void;
		};
		caches: CacheStorage & { default: Cache };
	}

	// interface PrivateEnv {}

	// interface PublicEnv {}
}

declare global {
    interface Window {
        // Preline UI
        HSStaticMethods: IStaticMethods;
    }
	namespace App {
        interface Platform {
            env: Env
            cf: CfProperties
            ctx: ExecutionContext
        }
    }
}

export {};