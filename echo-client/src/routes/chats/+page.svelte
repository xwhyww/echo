<script lang="ts">
	import ChatsSidebar from '$lib/components/sidebar/ChatsSidebar.svelte';
	import { usePerschatLayout } from '$lib/hooks/chat/usePerschatLayout.svelte.js';

	usePerschatLayout();
</script>

<ChatsSidebar />
