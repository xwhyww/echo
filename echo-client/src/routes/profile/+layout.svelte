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
  }
</style>
