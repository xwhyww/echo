import { onDestroy, untrack } from 'svelte';
import { auth } from '$lib/stores/auth.svelte.js';
import { personalChatsService } from '$lib/api/personalChatsService.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
import { page } from '$app/state';

export function usePerschatLayout() {
	$effect(() => {
		const userId = page.params.id;
		const isAuth = auth.isAuthenticated;
		const isLoaded = personalChatsStore.loaded;
		if (!userId || !isAuth || !isLoaded) return;

		untrack(async () => {
			personalChatsStore.removeTemp();

			const existing = personalChatsStore.findByUserId(userId);
			if (existing) return;

			if (auth?.user?.id !== userId) {
				try {
					const res = await personalChatsService.getByCompanionId(userId);
					const user = res.chat?.user ?? res.user;
					if (user) {
						personalChatsStore.addTemp(user);
					}
				} catch (e) {
					console.error('Failed to load user:', e);
				}
			}
		});
	});

	onDestroy(() => {
		personalChatsStore.removeTemp();
	});
}
