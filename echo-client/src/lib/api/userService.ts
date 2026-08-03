import { api } from './client.js';
import type { User, Avatar } from './auth.js';

class UserService {
	search(query: string) {
		return api<{ users: User[] }>(
			`/users/search?q=${encodeURIComponent(query)}`,
		);
	}

	getMe() {
		return api<{ user: User }>('/users/me');
	}

	getById(id: string) {
		return api<{ user: User }>(`/users/${id}`);
	}

	getAvatars(userId: string) {
		return api<{ avatars: Avatar[] }>(`/auth/users/${userId}/avatars`);
	}

	getBulk(userIds: string[]) {
		return api<{ users: User[] }>('/users/bulk', {
			method: 'POST',
			body: { userIds },
		});
	}
}

export const userService = new UserService();
