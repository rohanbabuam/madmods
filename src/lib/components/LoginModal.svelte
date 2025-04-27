<script lang="ts">
	import type { TypedSupabaseClient } from '$lib/supabaseClient';

	// --- Props ---
	let { show, supabase, onClose }: {
        show: boolean;
        supabase: TypedSupabaseClient | null;
        onClose: () => void;
    } = $props();

	// --- State ---
    type Tab = 'login' | 'signup';
	let activeTab = $state<Tab>('login'); // Default to login tab
	let email = $state('');
	let password = $state('');
    let confirmPassword = $state(''); // For signup
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
    let successMessage = $state<string | null>(null); // For signup success feedback

    // --- Tab Switching ---
    function switchTab(tab: Tab) {
        if (loading) return; // Prevent switching while busy
        activeTab = tab;
        // Reset form state when switching tabs
        email = '';
        password = '';
        confirmPassword = '';
        errorMessage = null;
        successMessage = null;
    }

    // --- Modal Closing ---
	function closeModalInternal() {
		// Reset internal state on close
		email = '';
		password = '';
        confirmPassword = '';
		errorMessage = null;
        successMessage = null;
		loading = false;
        activeTab = 'login'; // Reset to default tab
		// Call the callback prop passed by the parent
		onClose();
	}

    // --- Form Handlers ---
	async function handleLogin(event: SubmitEvent) {
		event.preventDefault();
		if (!supabase || loading) return;

		loading = true;
		errorMessage = null;
        successMessage = null;

		try {
			const { error } = await supabase.auth.signInWithPassword({
				email: email,
				password: password,
			});

			if (error) {
				console.error('Login error:', error);
				errorMessage = error.message;
			} else {
                // Login successful. Parent's onAuthStateChange handles session.
				closeModalInternal(); // Close the modal
			}
		} catch (err: any) {
			console.error('Unexpected login error:', err);
			errorMessage = 'An unexpected error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}

    async function handleSignup(event: SubmitEvent) {
        event.preventDefault();
        if (!supabase || loading) return;

        if (password !== confirmPassword) {
            errorMessage = "Passwords do not match.";
            return;
        }

        loading = true;
        errorMessage = null;
        successMessage = null;

        try {
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                // You can add options here if needed, like redirect URL or metadata
                // options: {
                //   emailRedirectTo: `${location.origin}/auth/callback`
                // }
            });

            if (error) {
                console.error('Sign up error:', error);
                errorMessage = error.message;
            } else if (data.user) {
                // Check if email verification is required
                if (data.user.identities?.length === 0) {
                     // This state usually means email confirmation is needed
                     successMessage = "Signup successful! Please check your email to verify your account.";
                     // Don't close modal immediately, let user see the message
                     // Optionally, reset fields after a delay or upon closing
                     // email = ''; // Keep email for potential resend?
                     password = '';
                     confirmPassword = '';
                } else {
                    // User might be auto-confirmed (depending on Supabase settings)
                    // or already exists but signup was called again (should be rare with proper checks)
                    // Assume success and let onAuthStateChange handle it
                    successMessage = "Signup successful!"; // Simple success
                     // We can close here, as onAuthStateChange should take over
                    setTimeout(closeModalInternal, 1500); // Close after short delay
                }

                console.log('Sign up successful:', data);

            } else {
                 // Fallback case if no user and no error (unlikely)
                 errorMessage = 'An unexpected issue occurred during sign up.';
            }
        } catch (err: any) {
            console.error('Unexpected sign up error:', err);
            errorMessage = 'An unexpected error occurred. Please try again.';
        } finally {
            // Keep loading true slightly longer if showing success message before close
            if (!successMessage?.includes("verify")) {
                 loading = false;
            } else {
                // If verification needed, stop loading so user can interact/close
                loading = false;
            }
        }
    }

	// --- Keyboard Handling ---
	function handleKeydown(event: KeyboardEvent) {
        if (!show) return;
		if (event.key === 'Escape') {
			closeModalInternal();
		}
        // Note: Enter key typically submits the form, no special handling needed here
        // Space on backdrop still handled by onclick
	}

</script>

<svelte:window on:keydown={handleKeydown}/>

{#if show}
<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1" onclick={closeModalInternal}>
    <div class="modal-content text-black" onclick={(event) => event.stopPropagation()}>
		<button
            type="button"
            class="absolute top-2 right-2 text-gray-500 hover:text-gray-700 z-10"
            aria-label="Close"
            onclick={closeModalInternal}
            disabled={loading && successMessage?.includes("verify")}
        >×</button>

        <!-- Tabs -->
        <div class="border-b border-gray-200 mb-4">
            <nav class="-mb-px flex space-x-4" aria-label="Tabs">
                <button
                    type="button"
                    class="whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm {activeTab === 'login' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
                    aria-current={activeTab === 'login' ? 'page' : undefined}
                    onclick={() => switchTab('login')}
                    disabled={loading}
                >
                    Login
                </button>
                <button
                    type="button"
                    class="whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm {activeTab === 'signup' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
                    aria-current={activeTab === 'signup' ? 'page' : undefined}
                    onclick={() => switchTab('signup')}
                    disabled={loading}
                >
                    Sign Up
                </button>
            </nav>
        </div>

		<!-- Dynamic Title (Optional but good UX) -->
        <h2 id="modal-title" class="text-xl font-semibold mb-4">
            {activeTab === 'login' ? 'Login' : 'Create Account'}
        </h2>

		<!-- Error Message Display -->
		{#if errorMessage}
			<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
				<span class="block sm:inline">{errorMessage}</span>
			</div>
		{/if}

        <!-- Success Message Display -->
		{#if successMessage}
			<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
				<span class="block sm:inline">{successMessage}</span>
			</div>
		{/if}

        <!-- Login Form -->
        {#if activeTab === 'login'}
        <form onsubmit={handleLogin}>
            <!-- Email -->
			<div class="mb-4">
				<label for="login-email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
				<input
					type="email"
					id="login-email"
					name="email"
					bind:value={email}
					required
					autocomplete="username"
					class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={loading}
				/>
			</div>
            <!-- Password -->
			<div class="mb-6">
				<label for="login-password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
				<input
					type="password"
					id="login-password"
					name="password"
                    autocomplete="current-password"
					bind:value={password}
					required
					class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={loading}
				/>
			</div>
            <!-- Submit -->
			<button
				type="submit"
				class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
				disabled={loading}
			>
				{#if loading} <span>Loading...</span> {:else} <span>Login</span> {/if}
			</button>
		</form>
        {/if}

        <!-- Signup Form -->
        {#if activeTab === 'signup'}
        <form onsubmit={handleSignup}>
             <!-- Email -->
			<div class="mb-4">
				<label for="signup-email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
				<input
					type="email"
					id="signup-email"
					name="email"
					bind:value={email}
					required
                    autocomplete="email"
					class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={loading}
				/>
			</div>
             <!-- Password -->
			<div class="mb-4">
				<label for="signup-password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
				<input
					type="password"
					id="signup-password"
					name="password"
                    autocomplete="new-password"
					bind:value={password}
                    minlength="6"
					required
					class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={loading}
				/>
			</div>
            <!-- Confirm Password -->
			<div class="mb-6">
				<label for="signup-confirm-password" class="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
				<input
					type="password"
					id="signup-confirm-password"
					name="confirmPassword"
                    autocomplete="new-password"
					bind:value={confirmPassword}
                    minlength="6"
					required
					class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={loading}
				/>
			</div>
            <!-- Submit -->
			<button
				type="submit"
				class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
				disabled={loading}
			>
				{#if loading} <span>Creating Account...</span> {:else} <span>Sign Up</span> {/if}
			</button>
		</form>
        {/if}

	</div>
</div>
{/if}

<!-- Basic styling for modal (assuming you have global styles or Tailwind) -->
<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 50;
	}
	.modal-content {
		background-color: white;
		padding: 2rem;
		border-radius: 0.5rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		max-width: 400px; /* Adjust as needed */
		width: 90%;
		position: relative; /* Needed for absolute positioning of close button */
	}
    /* Ensure buttons are clickable even when disabled visually */
    button:disabled {
        cursor: not-allowed;
    }
</style>