import { api } from './client.js';

export interface CallConnectInfo {
	url: string;
	token: string;
	roomName: string;
}

// 1-to-1 call signalling. invite/accept return LiveKit connect info; the other
// three are fire-and-forget notifications routed to the peer over the gateway.
class CallsService {
	invite(targetUserId: string, video: boolean) {
		return api<CallConnectInfo>('/voice/calls/invite', {
			method: 'POST',
			body: { targetUserId, video },
		});
	}

	accept(peerUserId: string) {
		return api<CallConnectInfo>('/voice/calls/accept', {
			method: 'POST',
			body: { peerUserId },
		});
	}

	decline(peerUserId: string) {
		return api<{ success: boolean }>('/voice/calls/decline', {
			method: 'POST',
			body: { peerUserId },
		});
	}

	cancel(peerUserId: string) {
		return api<{ success: boolean }>('/voice/calls/cancel', {
			method: 'POST',
			body: { peerUserId },
		});
	}

	end(peerUserId: string) {
		return api<{ success: boolean }>('/voice/calls/end', {
			method: 'POST',
			body: { peerUserId },
		});
	}
}

export const callsService = new CallsService();
