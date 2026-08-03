import { page } from '$app/state';

export type SidebarId = 'pc' | 'gr' | 'ac' | 'friends' | 'settings' | null;

export function getActiveSidebar(): SidebarId {
	const path = page.url.pathname;
	if (path.startsWith('/chats/perschat')) return 'pc';
	if (path.startsWith('/chats/groups')) return 'gr';
	if (path.startsWith('/chats/allchats')) return 'ac';
	if (path.startsWith('/friends')) return 'friends';
	if (path.startsWith('/profile')) return 'settings';
	if (path.startsWith('/settings')) return 'settings';
	return null;
}
