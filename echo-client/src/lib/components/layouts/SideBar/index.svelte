<script lang="ts">
	import type { Snippet } from 'svelte';
	import CallDock from '$lib/components/call/CallDock.svelte';

	// The scrolling column that lists chats, groups or settings, with the
	// collapsed-call bar pinned to its foot.
	interface Props {
		children?: Snippet;
		onSidebarScroll?: (e: Event) => void;
		/** Accepted but not rendered — the sidebars draw their own headings. */
		title?: string;
	}

	let { children, onSidebarScroll }: Props = $props();
</script>

<div class="channel-sidebar">
	<div class="sidebar-content" onscroll={onSidebarScroll}>
		{@render children?.()}
	</div>
	<!-- The voice status bar used to sit here, but it floats over the whole
	     app and shared a slot with the audio player; both now live in the root
	     layout's bar stack. -->
	<!-- Minimized 1-to-1 call bar. Self-hides unless a call is open and collapsed. -->
	<CallDock />
</div>

<style lang="scss">
	.channel-sidebar {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;

		.sidebar-content {
			padding-top: var(--header-h-padding-l);
			flex: 1;
			overflow-y: auto;
			display: flex;
			flex-direction: column;
			gap: var(--sp-2);
		}
	}
</style>