/**
 * A sentence with one emphasised name in it — exactly the shape the i18n
 * `…Body(name)` helpers return, so they can be handed straight to `confirm`.
 */
export interface EmphasisedMessage {
	before: string;
	name: string;
	after: string;
}

export interface ConfirmOptions {
	title: string;
	message?: string | EmphasisedMessage;
	confirmLabel?: string;
	cancelLabel?: string;
	tone?: 'danger' | 'default';
	/** Demands the user type this exact string before the confirm button unlocks. */
	requireText?: string | null;
}

interface PendingConfirm extends ConfirmOptions {
	id: number;
	settle: (confirmed: boolean) => void;
}

let pending = $state<PendingConfirm | null>(null);
let nextId = 0;

/**
 * Ask the user a yes/no question and wait for the answer:
 *
 * ```ts
 * if (await confirm({ title, requireText: group.name, tone: 'danger' })) …
 * ```
 *
 * The dialog is rendered by `ConfirmHost` in the root layout, so the caller
 * needs no state and no markup of its own. Note that the caller may be gone by
 * the time this resolves — keep the `true` branch on stores and services rather
 * than on component-local state.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
	// Only one question at a time. A second one supersedes the first, which
	// resolves as declined so its caller doesn't hang forever.
	pending?.settle(false);
	return new Promise<boolean>((resolve) => {
		pending = { ...options, id: ++nextId, settle: resolve };
	});
}

export const confirmPrompt = {
	get pending(): PendingConfirm | null {
		return pending;
	},
	answer(confirmed: boolean) {
		const current = pending;
		pending = null;
		current?.settle(confirmed);
	},
};
