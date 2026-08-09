<script lang="ts">
	import { Check, CheckCheck } from 'lucide-svelte';
	import { formatTime } from '$lib/utils/datetime.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		time: string;
		own?: boolean;
		read?: boolean;
		isEdited?: boolean;
	}

	let { time, own = false, read = false, isEdited = false }: Props = $props();

	const formattedTime = $derived(formatTime(time, i18n.locale));
</script>

<span class="time body-xxs">
	{#if isEdited}<span class="edited-label">{t.chat.edited}</span>{/if}
	
	{formattedTime}
	{#if own}
		<span class="check" class:text-accent={read}>
			{#if read}
				<CheckCheck size={14} />
			{:else}
				<Check size={14} />
			{/if}
		</span>
	{/if}
</span>

<style>
	.time {
		background: transparent;
		color: rgba(255, 255, 255, 0.5);
		border-radius: var(--radius-sm);
		display: flex;
		flex-direction: row;
		align-items: center;
		pointer-events: none;
		white-space: nowrap;
		word-break: keep-all;
		flex-shrink: 0;
	}

	/* No `color` of its own: unread it inherits the timestamp's dim white, read
	   it takes `.text-accent` from the markup. A scoped `color` here would sit at
	   a higher specificity than the utility class and win over it. */
	.check {
		display: inline-flex;
		vertical-align: middle;
		margin-left: 2px;
	}

	.edited-label {
		opacity: 1;
		margin-right: 8px;
	}
</style>
