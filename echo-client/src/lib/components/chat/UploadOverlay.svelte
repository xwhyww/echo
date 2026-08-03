<script lang="ts">
	import { RotateCcw, Trash2, X } from 'lucide-svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// What sits over a media tile while its file is still on the way: a progress
	// ring that doubles as the cancel target, an indeterminate spin once the
	// server has it and is transcoding, or the retry/discard pair when it failed.
	interface Props {
		/** 0–100. Ignored while `processing`, which has no measurable end. */
		progress: number;
		processing?: boolean;
		failed?: boolean;
		oncancel: () => void;
		onretry?: () => void;
		onremove?: () => void;
	}

	let { progress, processing = false, failed = false, oncancel, onretry, onremove }: Props =
		$props();

	const RADIUS = 20;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	const dashOffset = $derived(CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE);
</script>

<div class="upload-overlay" class:failed>
	{#if failed}
		<div class="failed">
			<div class="failed-actions">
				<button class="round-btn retry" onclick={onretry} aria-label={t.chat.retryUpload}>
					<RotateCcw size={16} />
				</button>
				<button class="round-btn remove" onclick={onremove} aria-label={t.chat.removeUpload}>
					<Trash2 size={16} />
				</button>
			</div>
			<span class="error-text body-xs text-error">{t.chat.uploadFailed}</span>
		</div>
	{:else}
		<div class="progress-ring" class:spinning={processing}>
			<svg viewBox="0 0 48 48">
				<circle class="ring-bg" cx="24" cy="24" r={RADIUS} />
				<circle
					class="ring-fill"
					cx="24"
					cy="24"
					r={RADIUS}
					stroke-dasharray={CIRCUMFERENCE}
					stroke-dashoffset={processing ? CIRCUMFERENCE * 0.7 : dashOffset}
				/>
			</svg>
			{#if !processing}
				<button class="cancel-btn" onclick={oncancel} aria-label={t.chat.cancelUpload}>
					<X size={14} />
				</button>
			{/if}
		</div>
		<span class="progress-text body-xs fw-semibold">
			{processing ? t.chat.processing : `${Math.round(progress)}%`}
		</span>
	{/if}
</div>

<style>
	.upload-overlay {
		position: absolute;
		inset: 0;
		/* Above the tile's own skeleton, which claims a stacking level of its own. */
		z-index: 2;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-1);
	}

	.upload-overlay.failed {
		background: rgba(0, 0, 0, 0.55);
	}

	.progress-ring {
		position: relative;
		width: 48px;
		height: 48px;
	}

	.progress-ring svg {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.ring-bg {
		fill: none;
		stroke: rgba(255, 255, 255, 0.2);
		stroke-width: 3;
	}

	.ring-fill {
		fill: none;
		stroke: white;
		stroke-width: 3;
		stroke-linecap: round;
		transition: stroke-dashoffset 0.15s ease;
	}

	/* Processing has no percentage to animate towards, so the arc spins instead. */
	.spinning svg {
		animation: spin 1s linear infinite;
	}

	.spinning .ring-fill {
		transition: none;
	}

	@keyframes spin {
		to {
			transform: rotate(270deg);
		}
	}

	.cancel-btn {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: 0;
	}

	.cancel-btn:hover {
		color: var(--c-error);
	}

	.progress-text {
		color: white;
	}

	.failed {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.failed-actions {
		display: flex;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}

	.error-text {
		margin-top: var(--sp-2);
	}

	.round-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.15);
		color: white;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.round-btn.retry:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.round-btn.remove:hover {
		background: var(--c-error);
	}
</style>
