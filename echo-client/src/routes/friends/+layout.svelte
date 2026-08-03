<script lang="ts">
  import type { Snippet } from 'svelte';
  import { setContext } from 'svelte';
  import { useFriends, FRIENDS_KEY } from '$lib/hooks/friends/useFriends.svelte.js';

  let { children }: { children: Snippet } = $props();

  const friends = useFriends();
  setContext(FRIENDS_KEY, friends);
</script>

<div class="wrapper">
  <div class="body">
    {@render children()}
  </div>
</div>


<style lang="scss">
  .wrapper {
    display: flex;
    flex-direction: row;
    width: 100%;

    .body {
      width: 100%;
      display: flex;
      height: 100vh;
    }
  }
</style>

