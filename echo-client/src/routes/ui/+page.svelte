<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Status from '$lib/components/user/Status.svelte';
	import Input from '$lib/components/ui/Input.svelte';
</script>

<div class="preview">
	<h1 class="logo heading-2xl text-accent">Echo</h1>
	<p class="tagline heading-lg text-muted">Your space. Your voice.</p>

	<div class="palette">
		<h2 class="body-xs overline fw-semibold">Color Palette</h2>
		<div class="swatches body-xs">
			<div class="swatch" style="background: var(--c-bg-0)"><span>bg-0</span></div>
			<div class="swatch" style="background: var(--c-bg-1)"><span>bg-1</span></div>
			<div class="swatch" style="background: var(--c-bg-2)"><span>bg-2</span></div>
			<div class="swatch" style="background: var(--c-bg-3)"><span>bg-3</span></div>
			<div class="swatch" style="background: var(--c-bg-4)"><span>bg-4</span></div>
			<div class="swatch accent" style="background: var(--c-accent)"><span>accent</span></div>
		</div>
	</div>

	<div class="section">
		<h2 class="body-xs overline fw-semibold">Typography</h2>
		<p class="heading-2xl">Heading 2XL</p>
		<p class="heading-xl">Heading XL</p>
		<p class="heading-lg">Heading LG</p>
		<p class="body-base">Body text — messages look like this.</p>
		<p class="body-sm text-muted">Secondary text — labels, timestamps.</p>
		<p class="body-xs text-faint">Faint text — badges, micro labels.</p>
	</div>

	<div class="section">
		<h2 class="body-xs overline fw-semibold">Components</h2>
		<div class="components">
			<Button variant="primary">Send Message</Button>
			<Button variant="secondary">Cancel</Button>
			<Button variant="ghost">Settings</Button>
			<Button variant="primary" disabled>Disabled</Button>
		</div>
		<div class="input-demo">
			<Input placeholder="Message #general" />
		</div>
		<div class="badges">
			<Badge>3</Badge>
			<Badge variant="mention">@2</Badge>
			<Status status="online" />
			<Status status="idle" />
			<Status status="dnd" />
			<Status status="offline" />
		</div>
	</div>
</div>

<style>
	.preview {
		max-width: 640px;
		margin: var(--sp-16) auto;
		padding: var(--sp-8);
		display: flex;
		flex-direction: column;
		gap: var(--sp-8);
	}

	.logo {
		letter-spacing: -0.02em;
	}

	.tagline {
		margin-top: var(--sp-1);
	}

	h2 {
		color: var(--c-text-muted);
		margin-bottom: var(--sp-4);
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	/* Swatches */
	.palette .swatches {
		display: flex;
		gap: var(--sp-2);
	}

	.swatch {
		width: 72px;
		height: 72px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: flex-end;
		padding: var(--sp-2);
		border: 1px solid var(--c-border);
	}

	.swatch span {
		color: var(--c-text-muted);
	}

	.swatch.accent span {
		color: var(--c-text-inverse);
	}

	.components {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
	}

	.input-demo {
		margin-top: var(--sp-2);
	}

	/* Badges */
	.badges {
		display: flex;
		gap: var(--sp-4);
		align-items: center;
		margin-top: var(--sp-2);
	}

</style>
