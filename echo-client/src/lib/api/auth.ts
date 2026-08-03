import { api, apiUpload } from './client.js';

export interface User {
	id: string;
	email: string | null;
	username: string;
	displayName: string | null;
	avatarUrl?: string | null;
	phone?: string | null;
	status?: string | null;
	isOnline?: boolean;
	privacyMessaging?: string;
	hasPassword?: boolean;
}

interface AuthResponse {
	user: User;
	token: string;
	isNewUser?: boolean;
}

// Sign-in and sign-up are one flow: request an SMS code for the phone, then
// verify it. An unknown phone becomes a new account. If the account has a
// password, verify returns a pending token for the extra password step.

export function requestOtp(phone: string) {
	return api<{ ok: true; expiresIn: number; resendIn: number; devCode?: string }>(
		'/auth/otp/request',
		{ method: 'POST', body: { phone } },
	);
}

export type OtpVerifyResponse =
	| (AuthResponse & { passwordRequired?: undefined })
	| { passwordRequired: true; pendingToken: string };

export function verifyOtp(phone: string, code: string) {
	return api<OtpVerifyResponse>('/auth/otp/verify', { method: 'POST', body: { phone, code } });
}

export function verifyPassword(pendingToken: string, password: string) {
	return api<AuthResponse>('/auth/otp/password', {
		method: 'POST',
		body: { pendingToken, password },
	});
}

// newPassword: null removes the password; currentPassword is required
// whenever a password is already set.
export function changePassword(data: { currentPassword?: string; newPassword: string | null }) {
	return api<{ user: User }>('/auth/me/password', { method: 'PUT', body: data });
}

export function logout() {
	return api<{ ok: true }>('/auth/logout', { method: 'POST', skipAuthWait: true });
}

export function getMe(_token: string) {
	return api<{ user: User }>('/auth/me', { skipAuthWait: true });
}

export function updateMe(data: {
	displayName?: string;
	username?: string;
	email?: string | null;
	status?: string | null;
}) {
	return api<{ user: User }>('/auth/me', { method: 'PATCH', body: data });
}

export interface Avatar {
	id: string;
	url: string;
	createdAt: string;
}

export function getAvatars() {
	return api<{ avatars: Avatar[] }>('/auth/me/avatars');
}

export function uploadAvatar(file: File) {
	const formData = new FormData();
	formData.append('avatar', file);
	return apiUpload<{ user: User; avatar: Avatar }>('/auth/me/avatar', formData);
}

export function setActiveAvatar(avatarId: string) {
	return api<{ user: User }>('/auth/me/avatar', { method: 'PATCH', body: { avatarId } });
}

export function clearAvatar() {
	return api<{ user: User }>('/auth/me/avatar', { method: 'PATCH', body: { avatarId: null } });
}

export function deleteAvatar(avatarId: string) {
	return api<{ user: User }>(`/auth/me/avatars/${avatarId}`, { method: 'DELETE' });
}
