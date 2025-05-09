import { writable, get, type Writable } from 'svelte/store';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '$lib/supabaseClient';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';

export const supabaseStore: Writable<TypedSupabaseClient | null> = writable(null);
export const sessionStore: Writable<Session | null> = writable(null);

interface LoginModalConfig {
    visible: boolean;
    intendedPath: string | null;
    sourcePageRequiresAuth: boolean;
}

export const loginModalConfigStore: Writable<LoginModalConfig> = writable({
    visible: false,
    intendedPath: null,
    sourcePageRequiresAuth: false
});

export async function handleLogout() {
    let supabase: SupabaseClient | null = null;
    const unsubscribe = supabaseStore.subscribe(client => {
        supabase = client;
    })();

    if (!supabase) {
        console.error('Logout failed: Supabase client not available.');
        alert('Logout failed: Client not ready.');
        return;
    }
    const { error } = await supabase.auth.signOut();

    loginModalConfigStore.set({ visible: false, intendedPath: null, sourcePageRequiresAuth: false });
    if (error) {
        console.error('Error logging out:', error.message);
        alert(`Logout failed: ${error.message}`);
    }
}

export function requestLogin(pathToGoToAfterLogin?: string, fromProtectedRoute: boolean = false) {
    const currentConfig = get(loginModalConfigStore);

    loginModalConfigStore.set({
        visible: true,
        intendedPath: pathToGoToAfterLogin || null,
        sourcePageRequiresAuth: fromProtectedRoute
    });
}

export function handleModalClose() {
    const previousConfig = get(loginModalConfigStore);
    const currentSession = get(sessionStore);

    loginModalConfigStore.set({ visible: false, intendedPath: null, sourcePageRequiresAuth: false });

    if (previousConfig.sourcePageRequiresAuth && !currentSession && browser) {
        goto('/', { replaceState: true });
    }
}