export type ToastType = 'error' | 'info';

export interface ToastItem {
	id: number;
	message: string;
	type: ToastType;
	duration: number;
}

const DEFAULT_DURATION = 4000;

let items = $state<ToastItem[]>([]);
let nextId = 0;

function push(message: string, type: ToastType, duration: number): number {
	// A retried action that fails the same way twice shouldn't stack two
	// identical toasts — restart the one already on screen instead.
	const existing = items.find((t) => t.message === message && t.type === type);
	if (existing) {
		items = items.filter((t) => t.id !== existing.id);
		items = [...items, { ...existing, id: ++nextId, duration }];
		return nextId;
	}
	const id = ++nextId;
	items = [...items, { id, message, type, duration }];
	return id;
}

/**
 * App-wide transient messages. Rendered once by `ToastHost` in the root layout,
 * so anything — a component, a hook, a store — can report a failure without
 * owning a toast slot of its own.
 */
export const toasts = {
	get items(): ToastItem[] {
		return items;
	},
	error(message: string, duration = DEFAULT_DURATION): number {
		return push(message, 'error', duration);
	},
	info(message: string, duration = DEFAULT_DURATION): number {
		return push(message, 'info', duration);
	},
	dismiss(id: number) {
		items = items.filter((t) => t.id !== id);
	},
	clear() {
		items = [];
	},
};
