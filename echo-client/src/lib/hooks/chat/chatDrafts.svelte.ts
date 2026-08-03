// Per-companion message drafts, kept at module scope so they survive component
// teardown and chat-cache eviction. Shared by usePersonalChat (which reads and
// writes them) and the chat-list sidebars (which show a "Draft: …" label).
//
// `draftsVersion` is a reactive counter bumped on every mutation so consumers
// re-render when a draft changes from a different component. Raw `draftsMap`
// reads/writes that intentionally skip the reactive bump stay possible via the
// exported map.

export const draftsMap = new Map<string, string>();
let draftsVersion = $state(0);

// The companion whose draft the user is actively editing right now — set when
// the live textfield value diverges from the saved draft, cleared when it
// matches again or the user leaves the chat. Lets the sidebar hide the
// "Draft: …" label while typing is still in progress.
let editingDraftFor = $state<string | null>(null);

export function setDraftFor(companionId: string, text: string) {
	if (text) draftsMap.set(companionId, text);
	else draftsMap.delete(companionId);
	draftsVersion++;
}

/** Get the draft for a companion (used by the chat-list sidebar).
 * Touches `draftsVersion` so Svelte tracks this call reactively — the sidebar
 * re-renders when any draft is saved/cleared, even from another component. */
export function getDraft(companionId: string): string {
	void draftsVersion;
	return draftsMap.get(companionId) ?? '';
}

/** True if the user is currently editing this chat's draft (live textfield
 * value differs from the persisted draft). Used by the sidebar to hide the
 * "Draft: …" label while typing is in progress. */
export function isEditingDraft(companionId: string): boolean {
	return editingDraftFor === companionId;
}

export function setEditingDraft(companionId: string | null) {
	editingDraftFor = companionId;
}
