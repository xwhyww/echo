<script lang="ts">
	import { ChevronRight } from 'lucide-svelte';

	interface Props {
		/** Points right when closed, rotates down when open. */
		open?: boolean;
		size?: number;
	}

	let { open = false, size = 14 }: Props = $props();
</script>

<span class="chevron" class:open>
	<ChevronRight {size} />
</span>

<style>
	.chevron {
		display: flex;
		align-items: center;
		transition: transform var(--duration-base) var(--ease-default);
	}

	.chevron.open {
		transform: rotate(90deg);
	}
</style>
