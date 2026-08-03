<script lang="ts">
	interface Props {
		status: 'online' | 'idle' | 'dnd' | 'offline';
		size?: number;
	}

	let { status, size = 10 }: Props = $props();
</script>

<span
	class="status-dot status-{status}"
	style:width="{size}px"
	style:height="{size}px"
></span>

<style>
	.status-dot {
		display: inline-block;
		border-radius: var(--radius-full);
	}

	.status-online  { background: var(--c-online); }
	.status-idle    { background: var(--c-idle); }
	.status-dnd     { background: var(--c-error); }
	.status-offline { background: var(--c-offline); }
</style>
