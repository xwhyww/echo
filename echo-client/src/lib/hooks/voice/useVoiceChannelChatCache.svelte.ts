import type { ChatPanelCache } from '$lib/chat/types.js';

// Module-level Map keyed by channelId. ChatPanel writes/reads to this on
// mount/unmount so flipping between voice channels feels instant.
export const voiceChannelChatCaches = new Map<string, ChatPanelCache>();
