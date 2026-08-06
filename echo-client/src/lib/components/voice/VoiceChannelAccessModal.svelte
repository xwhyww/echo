<script lang="ts">
	import { Lock, Loader, Globe } from 'lucide-svelte';
	import { voiceService } from '$lib/api/voiceService.js';
	import Button from '$lib/components/ui/Button.svelte';
	import { portal } from '$lib/actions/portal.js';
	import type { VoiceRole, VoiceChannel } from '$lib/api/voice.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		channel: VoiceChannel;
		groupId: string;
		onclose: () => void;
		// Notified when the server confirms a save. The page can patch its
		// local roleIds-per-channel cache if it keeps one. (The /voice list
		// re-fetches via WS, so this is informational.)
		onsaved?: (roleIds: string[]) => void;
	}

	let { channel, groupId, onclose, onsaved }: Props = $props();

	let loading = $state(true);
	let saving = $state(false);
	let loadError = $state<string | null>(null);
	let selected = $state<Set<string>>(new Set());
	let roles = $state<VoiceRole[]>([]);

	$effect(() => {
		const id = channel.id;
		void load(id);
	});

	async function load(channelId: string) {
		loading = true;
		loadError = null;
		try {
			// Fetch both in parallel — the access list is small (a few role-ids)
			// and the role list rarely exceeds a dozen, so a single round-trip
			// each at modal-open time is cheaper than wiring shared state.
			const [access, rolesRes] = await Promise.all([
				voiceService.getChannelAccess(channelId),
				voiceService.listRoles(groupId),
			]);
			selected = new Set(access.roleIds);
			roles = rolesRes.roles;
		} catch (err) {
			console.error('[VoiceChannelAccessModal] load failed', err);
			loadError = t.voice.access.loadFailed;
		} finally {
			loading = false;
		}
	}

	function toggle(roleId: string) {
		const next = new Set(selected);
		if (next.has(roleId)) next.delete(roleId);
		else next.add(roleId);
		selected = next;
	}

	function makeOpen() {
		selected = new Set();
	}

	async function save() {
		if (saving) return;
		saving = true;
		try {
			const roleIds = Array.from(selected);
			await voiceService.replaceChannelAccess(channel.id, roleIds);
			onsaved?.(roleIds);
			onclose();
		} catch (err) {
			console.error('[VoiceChannelAccessModal] save failed', err);
			loadError = (err as Error).message ?? t.voice.access.saveFailed;
		} finally {
			saving = false;
		}
	}

	const isOpenChannel = $derived(selected.size === 0);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" use:portal onclick={() => !saving && onclose()}>
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<div class="modal-icon text-accent">
			{#if isOpenChannel}
				<Globe size={22} />
			{:else}
				<Lock size={22} />
			{/if}
		</div>
		<h2 class="heading-md">{t.voice.access.title}</h2>
		<p class="modal-desc body-sm text-muted">
			{t.voice.access.channelLabel.before}<strong class="fw-semibold">{channel.name}</strong>{t.voice.access.channelLabel.after}
			{#if isOpenChannel}
				{t.voice.access.openDesc.before}<strong class="fw-semibold">{t.voice.access.openDesc.word}</strong>{t.voice.access.openDesc.after}
			{:else}
				{t.voice.access.restrictedDesc.before}<strong class="fw-semibold">{t.voice.access.restrictedDesc.word}</strong>{t.voice.access.restrictedDesc.after}
			{/if}
		</p>

		{#if loading}
			<p class="acc-hint body-sm text-faint"><Loader size={14} /> {t.common.loading}</p>
		{:else if loadError}
			<p class="acc-error body-sm text-error">{loadError}</p>
		{:else if roles.length === 0}
			<p class="acc-empty body-sm italic text-muted">{t.voice.access.noRoles}</p>
		{:else}
			<ul class="acc-list">
				{#each roles as r (r.id)}
					<li>
						<label class="acc-row body-sm text-default" class:checked={selected.has(r.id)}>
							<input
								type="checkbox"
								checked={selected.has(r.id)}
								onchange={() => toggle(r.id)}
								disabled={saving}
							/>
							<span class="acc-name">{r.name}</span>
							<span class="acc-meta body-xs text-faint">{t.voice.access.memberCount(r.members.length)}</span>
						</label>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="modal-actions">
			{#if !loading && !isOpenChannel}
				<Button variant="ghost" onclick={makeOpen} disabled={saving}>{t.voice.access.makeOpen}</Button>
			{/if}
			<Button variant="ghost" onclick={onclose} disabled={saving}>{t.common.cancel}</Button>
			<Button variant="primary" onclick={save} disabled={saving || loading}>
				{saving ? t.common.saving : t.common.saveShort}
			</Button>
		</div>
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/modal.mixin' as *;

	.modal-backdrop {
		@include modal-backdrop;
		animation: fadeIn var(--duration-base) var(--ease-default);
	}
	@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

	.modal {
		@include modal-surface;
		position: relative;
		padding: var(--sp-6);
		width: 100%;
		max-width: 460px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		animation: slideUp var(--duration-slow) var(--ease-default);
		overflow: hidden;
	}
	@keyframes slideUp { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

	.modal h2 { margin: 0; }

	.modal-icon {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--c-accent-subtle);
	}

	.modal-desc {
		margin: 0;
	}
	.modal-desc strong {
		color: var(--c-text);
	}

	.acc-hint,
	.acc-error,
	.acc-empty {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		margin: 0;
	}

	.acc-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		overflow-y: auto;
	}

	.acc-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		background: var(--c-bg-3);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}
	.acc-row.checked {
		background: var(--c-accent-subtle);
		color: var(--c-accent-text);
	}

	.acc-name { flex: 1; }

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
	}
</style>
