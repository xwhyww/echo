<script lang="ts">
	let { message }: { message: string } = $props();
</script>

<div class="error-alert body-sm text-error">{message}</div>

<style>
	.error-alert {
		background: rgba(224, 72, 72, 0.1);
		padding: var(--sp-3);
		border-radius: var(--radius-md);
	}
</style>
