<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import OtpInput from '$lib/components/ui/OtpInput.svelte';
	import PhoneInput from '$lib/components/ui/PhoneInput.svelte';
	import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
	import { usePhoneAuth } from '$lib/hooks/auth/usePhoneAuth.svelte.js';
	import { formatPhone } from '$lib/utils/phone.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const form = usePhoneAuth();
</script>

<div class="auth-page">
	<div class="auth-card">
		{#if form.step === 'phone'}
			<h1 class="heading-xl">{t.login.welcome}</h1>
			<p class="body-sm text-muted">{t.login.welcomeDesc}</p>
		{:else if form.step === 'code'}
			<p class="body-sm text-muted">{t.login.smsSentTo} <strong>{formatPhone(form.phone)}</strong></p>
		{:else}
			<h1 class="heading-xl">{t.login.enterPassword}</h1>
			<p class="body-sm text-muted">{t.login.passwordProtected}</p>
		{/if}

		{#if form.error}
			<ErrorAlert message={form.error} />
		{/if}

		{#if form.step === 'phone'}
			<form onsubmit={form.submitPhone}>
				<Field label={t.login.phone} for="phone" variant="page">
					<PhoneInput id="phone" bind:value={form.phone} />
				</Field>

				<Button variant="primary" type="submit" disabled={form.submitting}>
					{form.submitting ? t.login.sendingCode : t.login.getCode}
				</Button>
			</form>
		{:else if form.step === 'code'}
			<!-- No submit button: `oncomplete` continues as soon as the last digit lands. -->
			<form onsubmit={form.submitCode}>
				<OtpInput id="code" bind:value={form.code} disabled={form.submitting} autofocus oncomplete={form.verifyCode} />
			</form>

			<div class="footer">
				{#if form.resendLeft > 0}
					<p class="body-sm text-muted">{t.login.resendIn(form.resendLeft)}</p>
				{:else}
					<Button variant="ghost" onclick={form.resend} disabled={form.submitting}>{t.login.resendCode}</Button>
				{/if}
				<Button variant="ghost" onclick={form.backToPhone}>{t.login.changePhone}</Button>
			</div>
		{:else}
			<form onsubmit={form.submitPassword}>
				<Field label={t.login.password} for="password" variant="page">
					<Input id="password" type="password" bind:value={form.password} placeholder="••••••••" required />
				</Field>

				<Button variant="primary" type="submit" disabled={form.submitting}>
					{form.submitting ? t.login.signingIn : t.login.signIn}
				</Button>
			</form>

			<div class="footer">
				<Button variant="ghost" onclick={form.backToPhone}>{t.login.startOver}</Button>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Mobile-first: edge-to-edge content pinned near the top (keeps the form
	   visible when the on-screen keyboard opens); the framed, centered card
	   appears from 480px up. */
	.auth-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		min-height: 100svh;
		padding: calc(var(--sp-10) + var(--safe-top)) var(--sp-4) var(--sp-4);
	}

	/* Mobile: the card stretches to the full screen height; the footer's
	   margin-top: auto pins it to the bottom edge, and the matching auto
	   margin on the first child keeps the form itself vertically centered.
	   Steps without a footer just center via justify-content. */
	.auth-card {
		width: 100%;
		max-width: 400px;
		align-self: stretch;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--sp-2);
	}

	.auth-card:has(.footer) > :first-child {
		margin-top: auto;
	}

	@media (min-width: 480px) {
		.auth-page {
			padding: var(--sp-4);
		}

		.auth-card {
			align-self: auto;
			justify-content: flex-start;
			background: var(--c-bg-1);
			border: 1px solid var(--c-border);
			border-radius: var(--radius-xl);
			padding: var(--sp-8);
		}

		.auth-card:has(.footer) > :first-child {
			margin-top: 0;
		}
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-1);
		text-align: center;
		margin-top: auto;
		padding-bottom: var(--safe-bottom);
	}

	@media (min-width: 480px) {
		.footer {
			margin-top: var(--sp-2);
			padding-bottom: 0;
		}
	}
</style>
