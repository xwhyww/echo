import { getMe, updateMe, logout as logoutApi, type User } from '$lib/api/auth.js';
import { setTokenResolver, setAuthReadyWaiter } from '$lib/api/client.js';
import { unregisterDevice } from '$lib/api/pushService.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
import { friendsStore } from '$lib/stores/friends.svelte.js';

const TOKEN_KEY = 'echo_token';

class AuthStore {
	user: User | null = $state(null);
	token: string | null = $state(null);
	loading: boolean = $state(true);
	/**
	 * The APNs token this install registered, set by `usePushRegistration`.
	 * Kept here only so `logout()` has something to unregister — nothing reads
	 * it, and it stays null on every platform without the native plugin.
	 */
	pushToken: string | null = null;

	private _resolveReady!: () => void;
	ready: Promise<void> = new Promise((r) => { this._resolveReady = r; });

	get isAuthenticated() {
		return !!this.token && !!this.user;
	}

	setAuth(user: User, token: string) {
		this.user = user;
		this.token = token;
		localStorage.setItem(TOKEN_KEY, token);
	}

	async updateProfile(data: Parameters<typeof updateMe>[0]) {
		const { user } = await updateMe(data);
		this.user = { ...this.user!, ...user };
		return this.user;
	}

	logout() {
		// Before the token is cleared: unregistering is an authenticated call,
		// and without it this phone keeps receiving notifications for an account
		// that is no longer signed in on it.
		if (this.pushToken) {
			unregisterDevice(this.pushToken).catch(() => {});
			this.pushToken = null;
		}
		logoutApi().catch(() => {});
		this.user = null;
		this.token = null;
		localStorage.removeItem(TOKEN_KEY);
		personalChatsStore.reset();
		friendsStore.reset();
	}

	async init() {
		const saved = localStorage.getItem(TOKEN_KEY);

		if (!saved) {
			this.loading = false;
			this._resolveReady();
			return;
		}

		this.token = saved;

		try {
			const { user } = await getMe(saved);
			this.user = user;
		} catch {
			this.logout();
		}

		this.loading = false;
		this._resolveReady();
	}
}

export const auth = new AuthStore();

setTokenResolver(() => auth.token);
setAuthReadyWaiter(() => auth.ready);
