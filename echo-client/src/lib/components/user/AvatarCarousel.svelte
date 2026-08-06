<script lang="ts">
	import type { Avatar as AvatarData } from '$lib/api/auth.js';
	import { resolveUrl, blobCrossOrigin } from '$lib/api/client.js';
	import { X, Plus, UserMinus } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		avatars: AvatarData[];
		activeUrl: string | null;
		disabled?: boolean;
		onUpload: (file: File) => void;
		onSelect: (avatar: AvatarData) => void;
		onDelete: (avatar: AvatarData) => void;
		onClear: () => void;
		username?: string;
	}

	let {
		avatars,
		activeUrl,
		disabled = false,
		onUpload,
		onSelect,
		onDelete,
		onClear,
		username = ''
	}: Props = $props();

	const clearAvatarSize = $derived(!activeUrl ? 78 : 68);

	let fileInput = $state<HTMLInputElement>();

	const SLOTS: { x: number; y: number }[] = [
		{ x: 18, y: 10 },
		{ x: 192, y: 22 },
		{ x: 370, y: 6 },
		{ x: 108, y: 118 },
		{ x: 460, y: 72 },
		{ x: 280, y: 106 },
		{ x: 24, y: 208 },
		{ x: 440, y: 196 },
		{ x: 168, y: 222 },
		{ x: 316, y: 228 }
	];

	const CLEAR_SLOT = SLOTS[9];
	const MAX_AVATARS = 9;
	const showUpload = $derived(avatars.length < MAX_AVATARS);
	const uploadPos = $derived(showUpload ? SLOTS[avatars.length] : null);

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		onUpload(file);
		input.value = '';
	}

	function handleDeleteAvatar(avatar: AvatarData) {
		onDelete(avatar);
	}
</script>

<div class="avatar-cloud">
	{#each avatars as avatar, i (avatar.id)}
		{@const isActive = avatar.url === activeUrl}
		{@const pos = SLOTS[i]}
		<div class="avatar-item" style="left: {pos.x}px; top: {pos.y}px;">
			<button
				class="avatar-btn"
				class:is-active={isActive}
				{disabled}
				onclick={() => onSelect(avatar)}
			>
				<img src={resolveUrl(avatar.url)} crossorigin={blobCrossOrigin} alt="" />
			</button>
			{#if isActive}
				<span class="username body-sm text-muted">{username}</span>
			{/if}
			<button
				class="delete-btn text-faint"
				{disabled}
				onclick={() => handleDeleteAvatar(avatar)}
				aria-label={t.account.deleteAvatar}
			>
				<X size={12} />
			</button>
		</div>
	{/each}
	
	{#if avatars?.length}
		<button
			class="avatar-btn clear-btn text-faint"
			class:is-active={!activeUrl}
			style="left: {CLEAR_SLOT.x}px; top: {CLEAR_SLOT.y}px;"
			{disabled}
			onclick={onClear}
			aria-label={t.account.removeAvatar}
		>
			<Avatar name={username || '?'} size={clearAvatarSize} />
		</button>
	{/if}

	{#if uploadPos}
		<button
			class="avatar-btn upload-btn text-faint"
			style="left: {uploadPos.x}px; top: {uploadPos.y}px;"
			{disabled}
			onclick={() => fileInput?.click()}
			aria-label={t.account.uploadAvatar}
		>
			<Plus size={20} />
		</button>
	{/if}
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		hidden
		onchange={handleFileChange}
	/>
</div>

<style>
	.avatar-cloud {
		position: relative;
		width: 100%;
		height: 300px;
	}

	.avatar-item {
		position: absolute;
		display: flex;
		justify-content: center;
		align-items: center;
		flex-direction: column;
	}

	.avatar-btn {
		width: 72px;
		height: 72px;
		border-radius: var(--radius-full);
		overflow: hidden;
		cursor: pointer;
		border: 2px solid var(--c-border);
		background: var(--c-bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color var(--duration-slow) var(--ease-default);
	}

	.avatar-btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.avatar-btn img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-btn.is-active {
		width: 84px;
		height: 84px;
		border: 3px solid var(--c-accent-solid);
	}

	.clear-btn {
		position: absolute;
	}

	.upload-btn {
		position: absolute;
		border-style: dashed;
	}

	.delete-btn {
		position: absolute;
		top: -2px;
		right: -2px;
		width: 18px;
		height: 18px;
		border-radius: var(--radius-full);
		background: var(--c-bg-1);
		border: 1px solid var(--c-border);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0;
		transition: opacity var(--duration-fast) var(--ease-default);
	}
</style>
