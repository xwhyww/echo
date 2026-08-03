import { api } from './client.js';

export type VisibilityOption = 'all' | 'friends' | 'nobody';
export type MessagingOption = 'all' | 'friends' | 'existing';

export interface PrivacySettings {
	onlineStatus: VisibilityOption;
	phone: VisibilityOption;
	email: VisibilityOption;
	messaging: MessagingOption;
	profile: VisibilityOption;
	photo: VisibilityOption;
	groupInvite: VisibilityOption;
}

class PrivacyService {
	get() {
		return api<{ privacy: PrivacySettings }>('/auth/me/privacy');
	}

	update(settings: Partial<PrivacySettings>) {
		return api<{ privacy: Partial<PrivacySettings> }>('/auth/me/privacy', {
			method: 'PATCH',
			body: settings,
		});
	}
}

export const privacyService = new PrivacyService();
