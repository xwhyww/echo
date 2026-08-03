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
    height: 100vh;
    overflow-y: auto;
    padding: var(--sp-6) var(--sp-3);
    padding-bottom: 92px;
    width: 100vw;
  }

  /* Clear the fixed mobile header so page content starts below it. */
  @media (max-width: 767px) {
    .body {
      padding-top: calc(var(--bottom-nav-h) + 20px + env(safe-area-inset-top, 0px));
    }
  }
</style>
