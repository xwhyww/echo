<script lang="ts">
  import type { Snippet } from 'svelte';
  import MobileHeader from '$lib/components/layouts/MobileHeader.svelte';
  import { routes } from '$lib/routes.js';

  let { children }: { children: Snippet } = $props();
</script>

<div class="body">
  {@render children()}
</div>

<style>
  .body {
    flex: 1;
    height: 100%;
    overflow-y: auto;
    width: 100vw;
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
