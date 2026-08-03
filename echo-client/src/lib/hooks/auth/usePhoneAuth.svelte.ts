import { goto } from '$app/navigation';
import { requestOtp, verifyOtp, verifyPassword, type User } from '$lib/api/auth.js';
import { auth } from '$lib/stores/auth.svelte.js';
import { ApiError } from '$lib/api/client.js';
import { HOME } from '$lib/routes.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

export type AuthStep = 'phone' | 'code' | 'password';

// One flow for both sign-in and sign-up: phone → SMS code → (password, only
// when the account has one set).
export function usePhoneAuth() {
	let step = $state<AuthStep>('phone');
	let phone = $state('');
	let code = $state('');
	let password = $state('');
	let error = $state('');
	let submitting = $state(false);
	// Dev convenience: outside production the server echoes the code back
	// because no real SMS is sent.
	let devCode = $state('');
	let resendLeft = $state(0);
	let pendingToken = '';
	let timer: ReturnType<typeof setInterval> | null = null;

	function startResendTimer(seconds: number) {
		if (timer) clearInterval(timer);
		resendLeft = seconds;
		timer = setInterval(() => {
			resendLeft -= 1;
			if (resendLeft <= 0 && timer) {
				clearInterval(timer);
				timer = null;
			}
		}, 1000);
	}

	function fail(err: unknown) {
		error = err instanceof ApiError ? err.message : i18n.t.errors.somethingWentWrong;
	}

	function finish(user: User, token: string) {
		auth.setAuth(user, token);
		goto(HOME);
	}

	async function sendCode() {
		error = '';
		submitting = true;
		try {
			const res = await requestOtp(phone);
			devCode = res.devCode ?? '';
			startResendTimer(res.resendIn ?? 60);
			code = '';
			step = 'code';
		} catch (err) {
			fail(err);
		} finally {
			submitting = false;
		}
	}

	async function submitPhone(e: SubmitEvent) {
		e.preventDefault();
		await sendCode();
	}

	// Callable without a form event: OtpInput auto-continues through this
	// as soon as the last digit is entered.
	async function verifyCode() {
		if (submitting || code.length < 6) return;
		error = '';
		submitting = true;
		try {
			const res = await verifyOtp(phone, code);
			if (res.passwordRequired) {
				pendingToken = res.pendingToken;
				password = '';
				step = 'password';
			} else {
				finish(res.user, res.token);
			}
		} catch (err) {
			fail(err);
		} finally {
			submitting = false;
		}
	}

	async function submitCode(e: SubmitEvent) {
		e.preventDefault();
		await verifyCode();
	}

	async function submitPassword(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		submitting = true;
		try {
			const res = await verifyPassword(pendingToken, password);
			finish(res.user, res.token);
		} catch (err) {
			fail(err);
		} finally {
			submitting = false;
		}
	}

	function backToPhone() {
		step = 'phone';
		code = '';
		password = '';
		devCode = '';
		error = '';
	}

	return {
		get step() { return step; },
		get phone() { return phone; },
		set phone(v: string) { phone = v; },
		get code() { return code; },
		set code(v: string) { code = v; },
		get password() { return password; },
		set password(v: string) { password = v; },
		get error() { return error; },
		get submitting() { return submitting; },
		get devCode() { return devCode; },
		get resendLeft() { return resendLeft; },
		submitPhone,
		submitCode,
		verifyCode,
		submitPassword,
		resend: sendCode,
		backToPhone,
	};
}
