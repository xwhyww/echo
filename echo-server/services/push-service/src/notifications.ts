import type { ApnsNotification } from './apns.js';

/**
 * Event → banner copy.
 *
 * The strings are English-only for now. Proper localisation has to happen here
 * rather than on the device, because a push arrives as finished text — the app
 * may not even be running to translate it — which means the server needs to
 * know each user's language before this can be done properly.
 *
 * Whether a banner may quote the message is decided per recipient and passed
 * in, not read from config here: it is the user's own setting, falling back to
 * the server default only when they have never expressed one.
 */

const MAX_PREVIEW = 120;

function preview(content: string, attachmentCount: number, allowed: boolean): string | null {
	if (!allowed) return null;
	const text = content.trim();
	if (!text) return attachmentCount > 0 ? 'Sent an attachment' : null;
	return text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW - 1)}…` : text;
}

function displayName(author: { displayName: string | null; username: string }): string {
	return author.displayName?.trim() || author.username;
}

export function dmMessage(
	author: { displayName: string | null; username: string },
	chatId: string,
	content: string,
	attachmentCount: number,
	showPreview: boolean,
): ApnsNotification {
	const name = displayName(author);
	return {
		title: name,
		body: preview(content, attachmentCount, showPreview) ?? 'Sent you a message',
		// One banner per conversation rather than one per message: twenty messages
		// while the phone is in a pocket should not be twenty notifications.
		collapseId: `dm:${chatId}`,
		threadId: `dm:${chatId}`,
		data: { type: 'dm', chatId },
	};
}

/**
 * Titled with the author rather than the group, because `GroupMessageEvent`
 * carries no group name — only `groupId`. Naming the group would mean either
 * groups-service including it in the event (a field on the shared type and one
 * extra column in the query it already runs) or this service keeping a group
 * cache. The former is the better trade if the copy matters.
 */
export function groupMessage(
	author: { displayName: string | null; username: string },
	groupId: string,
	content: string,
	attachmentCount: number,
	showPreview: boolean,
): ApnsNotification {
	const name = displayName(author);
	const text = preview(content, attachmentCount, showPreview);
	return {
		title: name,
		body: text ?? 'Sent a message in a group',
		collapseId: `group:${groupId}`,
		threadId: `group:${groupId}`,
		data: { type: 'group', groupId },
	};
}

/**
 * Friend events carry only user ids — no names — so the copy stays generic
 * rather than the service taking on a user-name cache purely for one line of
 * text. Tapping it opens the requests screen, which has the names.
 */
export function friendRequest(): ApnsNotification {
	return {
		title: 'New friend request',
		body: 'Someone wants to connect with you',
		collapseId: 'friend-requests',
		threadId: 'friends',
		data: { type: 'friend_request' },
	};
}

export function friendAccepted(): ApnsNotification {
	return {
		title: 'Friend request accepted',
		body: 'You have a new friend',
		threadId: 'friends',
		data: { type: 'friend_accepted' },
	};
}

export function groupInvite(groupName: string, inviterUsername: string): ApnsNotification {
	return {
		title: 'Group invitation',
		body: `${inviterUsername} invited you to ${groupName}`,
		threadId: 'invites',
		data: { type: 'group_invite' },
	};
}
