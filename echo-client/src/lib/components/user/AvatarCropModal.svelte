<script lang="ts">
	import Cropper from 'cropperjs';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		imageUrl: string;
		onSave: (file: File) => void;
		onClose: () => void;
	}

	let { imageUrl, onSave, onClose }: Props = $props();

	let imgEl = $state<HTMLImageElement>();
	let cropper = $state<Cropper | null>(null);
	let saving = $state(false);

	$effect(() => {
		if (!imgEl) return;

		const c = new Cropper(imgEl, {
			template: `
				<cropper-canvas background>
					<cropper-image skewable scalable translatable rotatable></cropper-image>
					<cropper-shade hidden></cropper-shade>
					<cropper-handle action="select" plain></cropper-handle>
					<cropper-selection initial-coverage="0.6" aspect-ratio="1" movable resizable outlined>
						<cropper-grid role="grid" covered></cropper-grid>
						<cropper-crosshair centered></cropper-crosshair>
						<cropper-handle action="move" theme-color="rgba(255,255,255,0.35)"></cropper-handle>
						<cropper-handle action="n-resize"></cropper-handle>
						<cropper-handle action="e-resize"></cropper-handle>
						<cropper-handle action="s-resize"></cropper-handle>
						<cropper-handle action="w-resize"></cropper-handle>
						<cropper-handle action="ne-resize"></cropper-handle>
						<cropper-handle action="nw-resize"></cropper-handle>
						<cropper-handle action="se-resize"></cropper-handle>
						<cropper-handle action="sw-resize"></cropper-handle>
					</cropper-selection>
				</cropper-canvas>
			`,
		});

		cropper = c;
		return () => c.destroy();
	});

	async function handleSave() {
		if (!cropper) return;
		saving = true;

		try {
			const selection = cropper.getCropperSelection();
			if (!selection) return;

			const srcCanvas = await selection.$toCanvas({ width: 512, height: 512 });

			const blob = await new Promise<Blob | null>((resolve) =>
				srcCanvas.toBlob(resolve, 'image/webp', 0.9)
			);

			if (blob) {
				const file = new File([blob], 'avatar.webp', { type: 'image/webp' });
				onSave(file);
			}
		} finally {
			saving = false;
		}
	}
</script>

<Modal title={t.account.cropAvatar} onclose={onClose} closeDisabled={saving} maxWidth="480px">
	<!-- data-no-swipe-back: the crop box and the image under it are both dragged
	     sideways. -->
	<div class="cropper-wrap" data-no-swipe-back>
		<img bind:this={imgEl} src={imageUrl} alt="" crossorigin="anonymous" />
	</div>

	{#snippet actions()}
		<Button variant="ghost" onclick={onClose} disabled={saving}>{t.common.cancel}</Button>
		<Button variant="primary" onclick={handleSave} disabled={saving}>
			{saving ? t.common.saving : t.account.saveAvatar}
		</Button>
	{/snippet}
</Modal>

<style>
	.cropper-wrap {
		height: 400px;
		max-height: 60vh;
		overflow: hidden;
	}

	.cropper-wrap img {
		display: block;
		max-width: 100%;
	}

	/* Cropper canvas fills the container */
	.cropper-wrap :global(cropper-canvas) {
		width: 100%;
		height: 100%;
	}

	/* Image fully contained inside the canvas */
	.cropper-wrap :global(cropper-image) {
		object-fit: contain;
		width: 100%;
		height: 100%;
	}

	/* Round selection area */
	.cropper-wrap :global(cropper-selection) {
		border-radius: 50%;
		outline: none;
	}

	/* Round grid overlay inside selection */
	.cropper-wrap :global(cropper-selection cropper-grid) {
		border-radius: 50%;
	}

	/* Round move handle inside selection */
	.cropper-wrap :global(cropper-selection cropper-handle[action='move']) {
		border-radius: 50%;
	}

	/* Round crosshair area */
	.cropper-wrap :global(cropper-selection cropper-crosshair) {
		border-radius: 50%;
	}

	/* Round resize handles */
	.cropper-wrap :global(cropper-handle[action$='-resize']) {
		border-radius: 50%;
	}
</style>
