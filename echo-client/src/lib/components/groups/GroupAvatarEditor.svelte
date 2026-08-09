<script lang="ts">
	import { Camera, X } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import AvatarCropModal from '$lib/components/user/AvatarCropModal.svelte';
	import MediaViewer from '$lib/components/media/MediaViewer.svelte';
	import { confirm } from '$lib/stores/confirm.svelte.js';
	import { imageAsAttachment } from '$lib/utils/mediaGallery.js';
	import { useGroupAvatar } from '$lib/hooks/groups/useGroupAvatar.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { Group } from '$lib/api/groups.js';

	const t = $derived(i18n.t);

	// The group's picture wherever it is shown large enough to act on: opens a
	// fullscreen preview on click, and — for whoever the group's edit-info policy
	// allows — carries the badges that change or drop it.
	interface Props {
		group: Group;
		canEdit: boolean;
		size?: number;
		onchange: (group: Group) => void;
	}

	let { group, canEdit, size = 72, onchange }: Props = $props();

	// Both inputs stay closures: read eagerly, they would pin the group and the
	// callback this component happened to mount with.
	const avatar = useGroupAvatar({
		groupId: () => group.id,
		onchange: (next) => onchange(next),
	});

	let fileInput = $state<HTMLInputElement>();

	function chooseFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		// Cleared straight away so picking the same file twice in a row still
		// fires `change` the second time.
		input.value = '';
		if (file) void avatar.pick(file);
	}

	async function confirmRemove() {
		const ok = await confirm({
			title: t.groupSettings.removePhoto,
			message: t.groupSettings.removePhotoBody,
			tone: 'danger',
		});
		if (ok) await avatar.remove();
	}

	const asAttachment = $derived(
		group.avatarUrl
			? [imageAsAttachment(`group-avatar-${group.id}`, group.avatarUrl, group.name)]
			: [],
	);
</script>

<div class="group-avatar" style="--avatar-size: {size}px">
	{#if group.avatarUrl}
		<button
			type="button"
			class="preview-trigger"
			onclick={() => (avatar.previewOpen = true)}
			aria-label={t.groupSettings.viewPhoto}
		>
			<Avatar name={group.name} avatarUrl={group.avatarUrl} {size} />
		</button>
	{:else}
		<Avatar name={group.name} avatarUrl={null} {size} />
	{/if}

	{#if canEdit}
		{#if group.avatarUrl}
			<button
				type="button"
				class="badge badge-remove"
				onclick={confirmRemove}
				disabled={avatar.uploading}
				aria-label={t.groupSettings.removePhoto}
				title={t.groupSettings.removePhoto}
			>
				<X size={14} />
			</button>
		{/if}

		<button
			type="button"
			class="badge badge-change"
			onclick={() => fileInput?.click()}
			disabled={avatar.uploading}
			aria-label={group.avatarUrl ? t.groupSettings.changePhoto : t.groupSettings.addPhoto}
			title={group.avatarUrl ? t.groupSettings.changePhoto : t.groupSettings.addPhoto}
		>
			<Camera size={14} />
		</button>

		<input
			bind:this={fileInput}
			type="file"
			accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
			hidden
			onchange={chooseFile}
		/>
	{/if}
</div>

{#if avatar.cropImageUrl}
	<AvatarCropModal
		imageUrl={avatar.cropImageUrl}
		onSave={avatar.saveCrop}
		onClose={avatar.closeCrop}
	/>
{/if}

{#if avatar.previewOpen && asAttachment.length > 0}
	<MediaViewer
		attachments={asAttachment as never}
		onclose={() => (avatar.previewOpen = false)}
	/>
{/if}

<style>
	.group-avatar {
		position: relative;
		width: var(--avatar-size);
		height: var(--avatar-size);
		flex-shrink: 0;
	}

	.preview-trigger {
		display: block;
		padding: 0;
		border: none;
		background: none;
		cursor: zoom-in;
		border-radius: var(--radius-full);
	}

	/* Both badges are pinned to the avatar's corners rather than laid out around
	   it: the header is a flex row, and a badge that took part in it would shove
	   the name sideways. Opposite corners keep the destructive action away from
	   the one people reach for constantly. */
	.badge {
		position: absolute;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-full);
		border: 2px solid var(--c-bg-0);
		background: var(--c-bg-4);
		color: var(--c-text);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.badge-change {
		right: -2px;
		bottom: -2px;
	}

	.badge-remove {
		right: -2px;
		top: -2px;
	}

	.badge:hover:not(:disabled) {
		background: var(--c-surface-active);
	}

	.badge-remove:hover:not(:disabled) {
		background: var(--c-error);
		color: var(--c-text-inverse);
	}

	.badge:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
