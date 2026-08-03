import { auth } from '$lib/stores/auth.svelte.js';
import { ApiError } from '$lib/api/client.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

export function useProfileForm() {
	let displayName = $state(auth.user?.displayName ?? '');
	let username = $state(auth.user?.username ?? '');
	let email = $state(auth.user?.email ?? '');
	let status = $state(auth.user?.status ?? '');
	let error = $state('');
	let success = $state('');
	let submitting = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		success = '';
		submitting = true;

		try {
			await auth.updateProfile({
				displayName: displayName || undefined,
				username: username || undefined,
				email: email || null,
				status: status || null,
			});
			success = i18n.t.account.profileUpdated;
		} catch (err) {
			if (err instanceof ApiError) {
				error = err.message;
			} else {
				error = i18n.t.errors.somethingWentWrong;
			}
		} finally {
			submitting = false;
		}
	}

	return {
		get displayName() { return displayName; },
		set displayName(v: string) { displayName = v; },
		get username() { return username; },
		set username(v: string) { username = v; },
		get email() { return email; },
		set email(v: string) { email = v; },
		get status() { return status; },
		set status(v: string) { status = v; },
		get error() { return error; },
		set error(v: string) { error = v; },
		get success() { return success; },
		get submitting() { return submitting; },
		handleSubmit,
	};
}
