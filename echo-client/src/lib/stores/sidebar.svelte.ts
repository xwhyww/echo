import { page } from '$app/state';

export type SidebarId = 'pc' | 'gr' | 'ac' | 'friends' | 'settings' | null;

export function getActiveSidebar(): SidebarId {
	const path = page.url.pathname;
	// Everything chat-related lives under one page; which rail tab is lit comes
	// from the filter in the query, which `gotoKeepSearch` carries into the open
	// chat as well.
	if (path.startsWith('/chats')) {
		const filter = page.url.searchParams.get('filter');
		if (filter === 'personal') return 'pc';
		if (filter === 'groups') return 'gr';
		return 'ac';
	}
	if (path.startsWith('/friends')) return 'friends';
	if (path.startsWith('/profile')) return 'settings';
	if (path.startsWith('/settings')) return 'settings';
	return null;
}
