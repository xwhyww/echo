export const routes = {
	login: '/login',
	register: '/register',

	chats: {
		perschat: '/chats/perschat',
		perschatUser: (id: string) => `/chats/perschat/${id}`,
		perschatInfo: (id: string) => `/chats/perschat/${id}/info`,
		perschatMedia: (id: string, kind: 'photos' | 'videos' | 'gifs' | 'audio' | 'files' | 'links') =>
			`/chats/perschat/${id}/media?kind=${kind}`,
		groups: '/chats/groups',
		groupsInvites: '/chats/groups/invites',
		group: (id: string) => `/chats/groups/${id}`,
		groupInfo: (id: string) => `/chats/groups/${id}/info`,
		groupSettings: (id: string) => `/chats/groups/${id}/settings`,
		groupVoice: (id: string) => `/chats/groups/${id}/voice`,
		groupVoiceSettings: (id: string) => `/chats/groups/${id}/voice/settings`,
		groupVoiceRoles: (id: string) => `/chats/groups/${id}/voice/settings/roles`,
		groupMedia: (id: string, kind: 'photos' | 'videos' | 'gifs' | 'audio' | 'files' | 'links') =>
			`/chats/groups/${id}/media?kind=${kind}`,
		allchats: '/chats/allchats',
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

export const HOME = routes.chats.perschat;
export const PUBLIC_PAGES: string[] = [routes.login, routes.register, '/ui'];

/**
 * Route ids of the open-chat screens. These are fullscreen surfaces: no header
 * and no sidebar, so anything that normally docks against the app chrome has to
 * lay itself out differently here.
 */
export const CHAT_ROUTE_IDS: string[] = [
	'/chats/perschat/[id]',
	'/chats/allchats/perschat/[id]',
	'/chats/groups/[id]',
	'/chats/allchats/groups/[id]',
	'/chats/allchats/groups/[id]/voice/[channelId]',
	'/chats/groups/[id]/voice/[channelId]'
];

export const VOICE_CHAT_ROUTE_IDS: string[] = [
	'/chats/allchats/groups/[id]/voice/[channelId]',
	'/chats/groups/[id]/voice/[channelId]'
];

export function isChatRoute(routeId: string | null): boolean {
	return !!routeId && CHAT_ROUTE_IDS.includes(routeId);
}

export function isVoiceChannelRoute (routeId: string | null): boolean {
	return !!routeId && VOICE_CHAT_ROUTE_IDS.includes(routeId);
}
