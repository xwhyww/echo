import { changePassword } from '$lib/api/auth.js';
import { auth } from '$lib/stores/auth.svelte.js';
import { ApiError } from '$lib/api/client.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

// Password is an optional second factor on top of SMS login: setting one adds
// a password step after the OTP; removing it goes back to SMS-only.
export function usePasswordForm() {
	let currentPassword = $state('');
	let newPassword = $state('');
	let error = $state('');
	let success = $state('');
	let submitting = $state(false);

	const hasPassword = $derived(auth.user?.hasPassword ?? false);

	function applyResult(user: NonNullable<typeof auth.user>, message: string) {
		auth.user = { ...auth.user!, ...user };
		currentPassword = '';
		newPassword = '';
		success = message;
	}

	async function run(fn: () => Promise<void>) {
		error = '';
		success = '';
		submitting = true;
		try {
			await fn();
		} catch (err) {
			error = err instanceof ApiError ? err.message : i18n.t.errors.somethingWentWrong;
		} finally {
			submitting = false;
		}
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		await run(async () => {
			const { user } = await changePassword({
				currentPassword: currentPassword || undefined,
				newPassword,
			});
			applyResult(user, hasPassword ? i18n.t.account.passwordChanged : i18n.t.account.passwordSetDone);
		});
	}

	async function handleRemove() {
		await run(async () => {
			const { user } = await changePassword({
				currentPassword: currentPassword || undefined,
				newPassword: null,
			});
			applyResult(user, i18n.t.account.passwordRemoved);
		});
	}

	return {
		get hasPassword() { return hasPassword; },
		get currentPassword() { return currentPassword; },
		set currentPassword(v: string) { currentPassword = v; },
		get newPassword() { return newPassword; },
		set newPassword(v: string) { newPassword = v; },
		get error() { return error; },
		get success() { return success; },
		get submitting() { return submitting; },
		handleSubmit,
		handleRemove,
	};
}
