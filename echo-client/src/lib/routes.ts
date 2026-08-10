/** How the single chat list is narrowed. No filter means "everything". */
export type ChatsFilter = 'personal' | 'groups';

export const routes = {
	login: '/login',
	register: '/register',

	chats: {
		// One list page. The rail's tabs narrow it with `?filter=`; they are not
		// routes of their own.
		root: '/chats',
		list: (filter?: ChatsFilter) => (filter ? `/chats?filter=${filter}` : '/chats'),
		perschatUser: (id: string) => `/chats/perschat/${id}`,
		perschatInfo: (id: string) => `/chats/perschat/${id}/info`,
		perschatMedia: (id: string, kind: 'photos' | 'videos' | 'gifs' | 'audio' | 'files' | 'links') =>
			`/chats/perschat/${id}/media?kind=${kind}`,
		groupsInvites: '/chats/groups/invites',
		group: (id: string) => `/chats/groups/${id}`,
		groupInfo: (id: string) => `/chats/groups/${id}/info`,
		groupSettings: (id: string) => `/chats/groups/${id}/settings`,
		groupVoice: (id: string) => `/chats/groups/${id}/voice`,
		groupVoiceChannel: (id: string, channelId: string) =>
			`/chats/groups/${id}/voice/${channelId}`,
		/** The channel's text chat — a screen of its own, not a panel beside it. */
		groupVoiceChat: (id: string, channelId: string) =>
			`/chats/groups/${id}/voice/${channelId}/chat`,
		groupVoiceSettings: (id: string) => `/chats/groups/${id}/voice/settings`,
		groupVoiceRoles: (id: string) => `/chats/groups/${id}/voice/settings/roles`,
		groupMedia: (id: string, kind: 'photos' | 'videos' | 'gifs' | 'audio' | 'files' | 'links') =>
			`/chats/groups/${id}/media?kind=${kind}`,
	},

	friends: {
		root: '/friends',
		contacts: '/friends/contacts',
		incoming: '/friends/incoming',
		outgoing: '/friends/outgoing',
	},

	// Settings landing: on mobile the settings menu itself is the screen;
	// on desktop it shows the menu plus an empty-state main pane.
	settings: '/settings',

	profile: {
		root: '/profile',
		privacy: '/profile/privacy',
		notifications: '/profile/notifications',
		groups: '/profile/groups',
		audio: '/profile/audio',
		language: '/profile/language',
	},

	user: (id: string) => `/user/${id}`,
} as const;

/**
 * Where `/` sends you, and where signing in lands: the unfiltered chat list —
 * personal chats and groups together, the rail's "all chats" tab.
 */
export const HOME = routes.chats.list();
export const PUBLIC_PAGES: string[] = [routes.login, routes.register, '/ui'];

/**
 * Route ids of the open-chat screens. These are fullscreen surfaces: no header
 * and no sidebar, so anything that normally docks against the app chrome has to
 * lay itself out differently here.
 */
export const CHAT_ROUTE_IDS: string[] = [
	'/chats/perschat/[id]',
	'/chats/groups/[id]',
	'/chats/groups/[id]/voice/[channelId]',
	'/chats/groups/[id]/voice/[channelId]/chat',
];

export const VOICE_CHAT_ROUTE_IDS: string[] = ['/chats/groups/[id]/voice/[channelId]'];

const VOICE_CHANNEL_CHAT_ROUTE_ID = '/chats/groups/[id]/voice/[channelId]/chat';

export function isChatRoute(routeId: string | null): boolean {
	return !!routeId && CHAT_ROUTE_IDS.includes(routeId);
}

export function isVoiceChannelRoute (routeId: string | null): boolean {
	return !!routeId && VOICE_CHAT_ROUTE_IDS.includes(routeId);
}

/**
 * The channel's chat screen. Called out on its own because it is the one chat
 * surface with nothing to reveal behind it: back leads to the channel stage,
 * and a stage is a live LiveKit connection that cannot be mounted a second time
 * as a backdrop.
 */
export function isVoiceChannelChatRoute(routeId: string | null): boolean {
	return routeId === VOICE_CHANNEL_CHAT_ROUTE_ID;
}

/**
 * Where the back arrow leads from a screen that belongs to one conversation —
 * its info, its settings, its media. These are "up one level" arrows: the page
 * is about a single chat, so the arrow returns to that chat whether you arrived
 * from it, from a deep link or from a reload.
 *
 * Without an entry here a route falls through to HOME, which drops you out of
 * the conversation entirely instead of stepping up inside it.
 *
 * Media goes back to the info screen rather than the chat, because that is the
 * screen that lists the media and thus the only place you can arrive from.
 */
export function chatDetailBackHref(
	routeId: string | null,
	id: string | undefined,
): string | null {
	if (!routeId || !id) return null;
	switch (routeId) {
		case '/chats/perschat/[id]/info':
			return routes.chats.perschatUser(id);
		case '/chats/perschat/[id]/media':
			return routes.chats.perschatInfo(id);
		case '/chats/groups/[id]/info':
		case '/chats/groups/[id]/settings':
			return routes.chats.group(id);
		case '/chats/groups/[id]/media':
			return routes.chats.groupInfo(id);
		default:
			return null;
	}
}
