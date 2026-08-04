<script lang="ts">
  import type { Snippet } from 'svelte';
  import { gotoKeepSearch } from '$lib/utils.js';
  import { routes } from '$lib/routes.js';

  let { children }: { children: Snippet } = $props();

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') gotoKeepSearch(routes.chats.root);
  }
</script>

<svelte:window onkeydown={onKeydown} />

{@render children()}
