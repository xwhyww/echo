<script lang="ts">
	import { Mic, MicOff, Video, VideoOff, PhoneOff, Minimize2 } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import { call } from '$lib/stores/call.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const client = call.client;
	const peer = $derived(call.peer);
	const name = $derived(peer?.displayName ?? peer?.username ?? '');

	// Attach LiveKit video tracks to their <video> elements. The track objects
	// live in the media store; we (de)attach whenever they change.
	let remoteVideoEl = $state<HTMLVideoElement>();
	let localVideoEl = $state<HTMLVideoElement>();

	$effect(() => {
		const rv = client.remoteVideo;
		const el = remoteVideoEl;
		if (rv && el) {
			rv.track.attach(el);
			return () => rv.track.detach(el);
		}
	});

	$effect(() => {
		const lv = client.localVideoTrack;
		const el = localVideoEl;
		if (lv && el) {
			lv.attach(el);
			return () => lv.detach(el);
		}
	});

	const statusLabel = $derived(
		call.status === 'outgoing' ? t.call.ringing : call.status === 'active' ? t.call.inCall : '',
	);
</script>

{#if call.showScreen}
	<div class="cs">
		<div class="cs-topbar">
			<div class="cs-id lh-tight">
				<span class="cs-name heading-md fw-semibold text-default">{name}</span>
				<span class="cs-status body-xs text-muted">{statusLabel}</span>
			</div>
			<button class="cs-min text-muted" onclick={() => call.collapse()} title={t.call.minimize} aria-label={t.call.minimizeCall}>
				<Minimize2 size={20} />
			</button>
		</div>

		<div class="cs-stage">
			{#if client.remoteVideo}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video class="cs-remote-video" bind:this={remoteVideoEl} autoplay playsinline></video>
			{:else}
				<div class="cs-remote-avatar">
					<Avatar name={name} avatarUrl={peer?.avatarUrl ?? null} size={132} />
					<span class="cs-big-name heading-lg text-default">{name}</span>
					<span class="cs-big-status body-sm text-muted">{statusLabel}</span>
				</div>
			{/if}

			{#if client.isVideoOn}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video class="cs-local-video" bind:this={localVideoEl} autoplay playsinline muted></video>
			{/if}
		</div>

		<div class="cs-controls">
			<button
				class="cs-ctrl text-muted"
				class:active={client.isMuted}
				onclick={() => client.toggleMute()}
				title={client.isMuted ? t.call.unmute : t.call.mute}
				aria-label={client.isMuted ? t.call.unmute : t.call.mute}
			>
				{#if client.isMuted}<MicOff size={20} />{:else}<Mic size={20} />{/if}
			</button>
			<button
				class="cs-ctrl text-muted"
				class:active={client.isVideoOn}
				onclick={() => client.toggleVideo()}
				title={client.isVideoOn ? t.call.cameraOff : t.call.cameraOn}
				aria-label={client.isVideoOn ? t.call.cameraOff : t.call.cameraOn}
			>
				{#if client.isVideoOn}<Video size={20} />{:else}<VideoOff size={20} />{/if}
			</button>
			<button
				class="cs-ctrl cs-hangup text-muted"
				onclick={() => (call.status === 'outgoing' ? call.cancel() : call.hangUp())}
				title={t.call.hangUp}
				aria-label={t.call.hangUp}
			>
				<PhoneOff size={20} />
			</button>
		</div>
	</div>
{/if}

<style>
	/* Fills the main content column, sitting over the chat body. The sidebars
	 * stay visible (and host the minimized dock), so navigation keeps working. */
	.cs {
		position: absolute;
		inset: 0;
		z-index: 50;
		display: flex;
		flex-direction: column;
		background: var(--c-bg-1, #000);
	}

	.cs-topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: var(--header-h);
		padding: 0 var(--sp-5);
		border-bottom: 1px solid var(--c-border);
		flex-shrink: 0;
	}

	.cs-id {
		display: flex;
		flex-direction: column;
	}

	.cs-min {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		background: transparent;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
	}
	.cs-min:hover { background: var(--c-bg-3); color: var(--c-text); }

	.cs-stage {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.cs-remote-video {
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #000;
	}

	.cs-remote-avatar {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
	}

	.cs-local-video {
		position: absolute;
		right: var(--sp-4);
		bottom: var(--sp-4);
		width: 180px;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border-radius: var(--radius-md);
		border: 1px solid var(--c-border);
		background: #000;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		transform: scaleX(-1); /* mirror self-view */
	}

	.cs-controls {
		display: flex;
		justify-content: center;
		gap: var(--sp-4);
		padding: var(--sp-5);
		flex-shrink: 0;
	}

	.cs-ctrl {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		border: none;
		background: var(--c-bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
	}
	.cs-ctrl:hover { background: var(--c-bg-2); color: var(--c-text); }
	.cs-ctrl.active { background: var(--c-accent-subtle-2); color: var(--c-accent-text); }

	.cs-hangup { background: var(--c-error, #ef4444); color: #fff; }
	.cs-hangup:hover { background: var(--c-error, #ef4444); opacity: 0.85; color: #fff; }
</style>
