<script lang="ts">
import FriendsSidebar from '$lib/components/sidebar/FriendsSidebar.svelte'
</script>

<div class="empty-state">
	<FriendsSidebar />
</div>


<style>
	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		width: 100%;
	}
</style>
