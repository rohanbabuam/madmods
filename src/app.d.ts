// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { IStaticMethods } from "preline/dist";
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