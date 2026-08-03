<script lang="ts">
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import AvatarCarousel from '$lib/components/user/AvatarCarousel.svelte';
	import AvatarCropModal from '$lib/components/user/AvatarCropModal.svelte';
	import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
	import SuccessAlert from '$lib/components/ui/SuccessAlert.svelte';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { useProfileAvatar } from '$lib/hooks/user/useProfileAvatar.svelte.js';
	import { useProfileForm } from '$lib/hooks/user/useProfileForm.svelte.js';
	import { usePasswordForm } from '$lib/hooks/auth/usePasswordForm.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const avatar = useProfileAvatar();
	const form = useProfileForm();
	const passwordForm = usePasswordForm();

	const t = $derived(i18n.t);
	const error = $derived(avatar.error || form.error);
</script>

<PageColumn gap="var(--sp-6)" maxWidth="560px">
	<div class="profile-header">
		<AvatarCarousel
			avatars={avatar.avatars}
			activeUrl={auth.user?.avatarUrl ?? null}
			disabled={form.submitting}
			onUpload={avatar.handleUpload}
			onSelect={avatar.handleSelect}
			onDelete={avatar.handleDelete}
			onClear={avatar.handleClear}
			username={auth.user?.displayName ?? auth.user?.username}
		/>
	</div>

	{#if error}
		<ErrorAlert message={error} />
	{/if}

	{#if form.success}
		<SuccessAlert message={form.success} />
	{/if}

	<form onsubmit={form.handleSubmit}>
		<Field label={t.account.phone} hint={t.account.phoneHint} for="phone" variant="page">
			<Input id="phone" value={auth.user?.phone ?? ''} disabled />
		</Field>

		<Field label={t.account.username} for="username" variant="page">
			<Input id="username" bind:value={form.username} placeholder={t.account.usernamePlaceholder} minlength={3} maxlength={32} />
		</Field>

		<Field label={t.account.email} note={t.common.optional} for="email" variant="page">
			<Input id="email" type="email" bind:value={form.email} placeholder={t.account.emailPlaceholder} />
		</Field>

		<Field label={t.account.displayName} for="displayName" variant="page">
			<Input id="displayName" bind:value={form.displayName} placeholder={t.account.displayNamePlaceholder} maxlength={64} />
		</Field>

		<Field label={t.account.status} for="status" variant="page">
			<Input id="status" bind:value={form.status} placeholder={t.account.statusPlaceholder} maxlength={128} />
		</Field>

		<Button variant="primary" type="submit" disabled={form.submitting}>
			{form.submitting ? t.common.saving : t.common.save}
		</Button>
	</form>

	<div class="section">
		<h2 class="heading-lg">{passwordForm.hasPassword ? t.account.changePassword : t.account.setPassword}</h2>
		<p class="body-sm text-muted">
			{passwordForm.hasPassword ? t.account.passwordSetHint : t.account.passwordUnsetHint}
		</p>

		{#if passwordForm.error}
			<ErrorAlert message={passwordForm.error} />
		{/if}

		{#if passwordForm.success}
			<SuccessAlert message={passwordForm.success} />
		{/if}

		<form onsubmit={passwordForm.handleSubmit}>
			{#if passwordForm.hasPassword}
				<Field label={t.account.currentPassword} for="currentPassword" variant="page">
					<Input id="currentPassword" type="password" bind:value={passwordForm.currentPassword} placeholder="••••••••" required />
				</Field>
			{/if}

			<Field label={t.account.newPassword} for="newPassword" variant="page">
				<Input id="newPassword" type="password" bind:value={passwordForm.newPassword} placeholder="••••••••" minlength={6} maxlength={128} required />
			</Field>

			<div class="password-actions">
				<Button variant="primary" type="submit" disabled={passwordForm.submitting}>
					{passwordForm.submitting
						? t.common.saving
						: passwordForm.hasPassword
							? t.account.changePassword
							: t.account.setPasswordAction}
				</Button>
				{#if passwordForm.hasPassword}
					<Button variant="ghost" onclick={passwordForm.handleRemove} disabled={passwordForm.submitting}>
						{t.account.removePassword}
					</Button>
				{/if}
			</div>
		</form>
	</div>
</PageColumn>

{#if avatar.cropImageUrl}
	<AvatarCropModal
		imageUrl={avatar.cropImageUrl}
		onSave={avatar.handleCropSave}
		onClose={avatar.closeCropModal}
	/>
{/if}

<style>
	.profile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.password-actions {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}

	p {
		margin: 0;
	}
</style>
