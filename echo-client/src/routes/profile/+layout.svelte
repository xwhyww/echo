<script lang="ts">
  import type { Snippet } from 'svelte';

  // No header of its own: the app header in the root layout names these pages
  // and carries the way back. This wraps them only to give the section an
  // opaque surface — see the background below.
  let { children }: { children: Snippet } = $props();
</script>

<div class="body">
  {@render children()}
</div>

<style>
  .body {
    flex: 1;
    height: 100%;
    /* Opaque, and the same treatment the shell already paints behind it — so
       this looks unchanged, while giving the back gesture something solid to
       slide off the settings menu underneath. Transparent, it would show that
       menu through the page at rest. */
    background-image: linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)),
      url('/chat-bg/chat-bg-1.jpg');
    background-size: cover, 200%;
    background-position: center, center;
    background-repeat: no-repeat, repeat;
  }
</style>
