<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChannelSidebar from '$lib/components/sidebar/ChannelSidebar.svelte'
  import { gotoKeepSearch } from '$lib/utils.js';

  let { children }: { children: Snippet } = $props();

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') gotoKeepSearch('/chats/perschat');
  }
</script>

<svelte:window onkeydown={onKeydown} />

{@render children()}