// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { IStaticMethods } from "preline/dist";
import { SupabaseClient, Session } from '@supabase/supabase-js';

declare namespace App {
	// interface Locals {}

	interface Platform {
		env: {
			MADMODS_R2: R2Bucket;
			IMAGE_GENERATION_QUEUE: Queue;
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
		interface Locals {
			supabase: SupabaseClient;
			getSession(): Promise<Session | null>;
		}
		interface PageData {
			session: Session | null;
		}
    }
}

export {};