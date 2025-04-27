// src/lib/stores/authStore.ts
import { writable, type Writable } from 'svelte/store';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '$lib/supabaseClient'; // Adjust path if needed

// Store for the Supabase client instance (initialized in layout)
export const supabaseStore: Writable<TypedSupabaseClient | null> = writable(null);

// Reactive store for the session
export const sessionStore: Writable<Session | null> = writable(null);

// Store for controlling the login modal visibility
export const showLoginModal: Writable<boolean> = writable(false);

// Logout function (needs Supabase client)
export async function handleLogout() {
    let supabase: SupabaseClient | null = null;
    const unsubscribe = supabaseStore.subscribe(client => {
        supabase = client;
    })(); // Immediately subscribe and unsubscribe to get current value

    if (!supabase) {
        console.error('Logout failed: Supabase client not available.');
        alert('Logout failed: Client not ready.');
        return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Error logging out:', error.message);
        alert(`Logout failed: ${error.message}`);
    } else {
        // Session store will update via onAuthStateChange in layout
        console.log('Logged out successfully (triggered from store function)');
        showLoginModal.set(false); // Ensure modal is closed if somehow open
    }
}

// Function to close the modal (can be called from anywhere)
export function handleModalClose() {
    console.log("Store: Closing login modal");
    showLoginModal.set(false);
}