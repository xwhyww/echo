<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    /** Any CSS padding value, e.g. `var(--sp-4)` or `var(--sp-2) var(--sp-4)`. */
    padding?: string;
    /** Any CSS border-radius value, e.g. `var(--radius-lg)`. */
    radius?: string;
  }

  let {
    children,
    padding = 'var(--sp-2)',
    radius = 'var(--radius-md)'
  }: Props = $props();
</script>


<div class="block-wrapper" style:--block-padding={padding} style:--block-radius={radius}>
  {@render children()}
</div>


<style lang="scss">
  @use '$lib/styles/glass.mixin' as *;

  .block-wrapper {
    padding: var(--block-padding);
    @include glass;
    border-radius: var(--block-radius);
  }
</style>
