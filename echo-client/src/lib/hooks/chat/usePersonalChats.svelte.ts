import { auth } from '$lib/stores/auth.svelte.js';
import { ws } from '$lib/stores/ws.svelte.js';
import { onDestroy } from 'svelte';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { User as UserType } from '$lib/api/auth.js';
import type { PersonalChat } from '$lib/api/personalChats.js';
import { personalChatsService } from '$lib/api/personalChatsService.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
import { applyReactionsToCache } from '$lib/utils/personalChatCache.js';
import { routes } from '$lib/routes.js';

export function usePersonalChats() {
	async function loadChats() {
		if (!auth.token) return;
		await personalChatsStore.ensureLoaded();
	}

	async function loadMore() {
		if (!auth.token || !personalChatsStore.hasMore || !personalChatsStore.nextCursor || personalChatsStore.loadingMore) return;
		personalChatsStore.loadingMore = true;

		try {
			const res = await personalChatsService.getAll({
				cursor: personalChatsStore.nextCursor,
			});
			personalChatsStore.append(res.chats);
			personalChatsStore.hasMore = res.hasMore;
			personalChatsStore.nextCursor = res.nextCursor;
		} catch {
			console.error('Load more chats error');
		} finally {
			personalChatsStore.loadingMore = false;
		}
	}

	$effect(() => {
		if (auth.isAuthenticated && !personalChatsStore.loaded) loadChats();
	});

	const unsubscribe = ws.on((event) => {
		if (event.type === 'dm') {
			const chats = personalChatsStore.list;
			const idx = chats.findIndex((c) => c.id === event.chatId);
			const isViewingChat = chats[idx]?.user.id === page.params.id;

			if (idx >= 0) {
				const updated = chats.map((c, i) =>
					i === idx
						? {
							...c,
							lastMessage: {
								content: event.message.content,
								authorId: event.message.authorId,
								createdAt: event.message.createdAt,
								attachments: event.message.attachments?.map((a: any) => ({ mimeType: a.mimeType, voice: !!a.voice })),
							},
							unreadCount: isViewingChat ? 0 : (event.unreadCount ?? c.unreadCount + 1),
							isLastMessageRead: null,
							lastMessageReadAt: null,
						}
						: c
				);
				if (idx > 0) {
					const [chat] = updated.splice(idx, 1);
					updated.unshift(chat);
				}
				personalChatsStore.list = updated;
			} else if (event.message.authorId !== auth.user?.id || page.params.id !== auth.user?.id) {
				// Self-chat (Notes) is filtered out of GET /personal-chats, so refetching
				// for a dm authored by me while viewing my own id would loop forever.
				loadChats();
			}
		} else if (event.type === 'chat_read') {
			if (event.userId === auth.user?.id) return;
			personalChatsStore.list = personalChatsStore.list.map((c) => {
				if (c.id !== event.chatId) return c;
				const lastMsgIsMine = !!c.lastMessage && c.lastMessage.authorId === auth.user?.id;
				if (!lastMsgIsMine) return c;
				const readsLastMsg = new Date(c.lastMessage!.createdAt).getTime() <= new Date(event.lastReadAt).getTime();
				if (!readsLastMsg) return c;
				if (c.isLastMessageRead === true && c.lastMessageReadAt) return c;
				return { ...c, isLastMessageRead: true, lastMessageReadAt: event.lastReadAt };
			});
		} else if (event.type === 'dm_reaction') {
			applyReactionsToCache(event.chatId, event.messageId, event.reactions);
			const meId = auth.user?.id;
			if (!meId) return;
			if (event.messageAuthorId !== meId) return;
			const latest = [...event.reactions]
				.flatMap((r) => r.userIds.filter((uid) => uid !== meId).map((uid) => ({ emoji: r.emoji, uid })))
				.pop();
			if (!latest) {
				personalChatsStore.setUnseenReaction(event.chatId, null);
			} else {
				personalChatsStore.setUnseenReaction(event.chatId, {
					emoji: latest.emoji,
					messageId: event.messageId,
				});
			}
		} else if (event.type === 'presence') {
			personalChatsStore.list = personalChatsStore.list.map((c) =>
				c.user.id === event.userId
					? { ...c, user: { ...c.user, isOnline: event.online } }
					: c
			);
		}
	});

	onDestroy(unsubscribe);

	function handleUserSelect(user: UserType) {
		goto(routes.chats.perschatUser(user.id));
	}

	return {
		get personalChats() { return personalChatsStore.list; },
		get hasMore() { return personalChatsStore.hasMore; },
		get loadingMore() { return personalChatsStore.loadingMore; },
		handleUserSelect,
		loadMore,
		markRead(chatId: string) {
			personalChatsStore.list = personalChatsStore.list.map((c) =>
				c.id === chatId ? { ...c, unreadCount: 0 } : c
			);
		}
	};
}
