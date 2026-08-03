import { friendsStore } from '$lib/stores/friends.svelte.js';
import { friendsService } from '$lib/api/friendsService.js';

export function useFriendship(getUserId: () => string | undefined) {
	let acting = $state(false);
	let loading = $state(true);

	$effect(() => {
		const userId = getUserId();
		if (!userId) { loading = false; return; }
		const cached = friendsStore.getStatus(userId);
		if (cached) { loading = false; return; }
		loading = true;
		friendsStore.loadStatus(userId).finally(() => { loading = false; });
	});

	const status = $derived.by(() => {
		const userId = getUserId();
		if (!userId) return 'none' as const;
		return friendsStore.getStatus(userId)?.status ?? 'none';
	});

	const direction = $derived.by(() => {
		const userId = getUserId();
		if (!userId) return null;
		const s = friendsStore.getStatus(userId);
		return s && s.status === 'pending' ? s.direction ?? null : null;
	});

	async function sendRequest() {
		const userId = getUserId();
		if (!userId || acting) return;
		acting = true;
		try {
			const res = await friendsService.sendRequest(userId);
			if (res.status === 'accepted') {
				friendsStore.setStatus(userId, { status: 'friends' });
			} else {
				friendsStore.setStatus(userId, { status: 'pending', direction: 'outgoing' });
			}
		} catch {
			// ignore
		}
		acting = false;
	}

	async function acceptRequest() {
		const userId = getUserId();
		if (!userId || acting) return;
		acting = true;
		try {
			await friendsService.acceptRequest(userId);
			friendsStore.setStatus(userId, { status: 'friends' });
		} catch {
			// ignore
		}
		acting = false;
	}

	async function declineRequest() {
		const userId = getUserId();
		if (!userId || acting) return;
		acting = true;
		try {
			await friendsService.declineRequest(userId);
			friendsStore.removeStatus(userId);
		} catch {
			// ignore
		}
		acting = false;
	}

	async function cancelRequest() {
		const userId = getUserId();
		if (!userId || acting) return;
		acting = true;
		try {
			await friendsService.cancelRequest(userId);
			friendsStore.removeStatus(userId);
		} catch {
			// ignore
		}
		acting = false;
	}

	async function removeFriend() {
		const userId = getUserId();
		if (!userId || acting) return;
		acting = true;
		try {
			await friendsService.removeFriend(userId);
			friendsStore.removeStatus(userId);
		} catch {
			// ignore
		}
		acting = false;
	}

	return {
		get status() { return status; },
		get direction() { return direction; },
		get loading() { return loading; },
		get acting() { return acting; },
		sendRequest,
		acceptRequest,
		declineRequest,
		cancelRequest,
		removeFriend,
	};
}
