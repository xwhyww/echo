<script lang="ts">
	let { message }: { message: string } = $props();
</script>

<div class="success-alert body-sm text-success">{message}</div>

<style>
	.success-alert {
		background: rgba(72, 199, 142, 0.1);
		padding: var(--sp-3);
		border-radius: var(--radius-md);
	}
</style>
