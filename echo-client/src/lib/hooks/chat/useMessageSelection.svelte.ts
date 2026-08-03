// Multi-select for a message list: click-to-toggle plus click-and-drag over a
// range. Extracted from the personal-chat page so the same behaviour can back
// the group chat too. The caller owns what to DO with the selection (forward,
// delete); this hook only tracks which message ids are selected and drives the
// drag gesture.

type SelectableMessage = { id: string; authorId: string };

const DRAG_THRESHOLD = 5;

export function useMessageSelection(
	getMessages: () => SelectableMessage[],
	getMyId: () => string | undefined,
) {
	let selectedIds = $state<Set<string>>(new Set());

	const selecting = $derived(selectedIds.size > 0);
	const selectedOwnCount = $derived(
		[...selectedIds].filter(
			(id) => getMessages().find((m) => m.id === id)?.authorId === getMyId(),
		).length,
	);

	function toggle(msgId: string) {
		const next = new Set(selectedIds);
		if (next.has(msgId)) next.delete(msgId);
		else next.add(msgId);
		selectedIds = next;
	}

	function selectOnly(msgId: string) {
		selectedIds = new Set([msgId]);
	}

	// Drop a single id — used when a selected message disappears out from under
	// the selection (e.g. deleted by another client over the WS).
	function remove(msgId: string) {
		if (!selectedIds.has(msgId)) return;
		const next = new Set(selectedIds);
		next.delete(msgId);
		selectedIds = next;
	}

	function clear() {
		selectedIds = new Set();
	}

	// --- drag-to-select ---------------------------------------------------
	let dragSelecting = $state(false);
	let dragAction = $state<'select' | 'deselect'>('select');
	let dragStartIdx = $state(-1);
	let dragBaseSelection = $state<Set<string>>(new Set());
	let dragPending = $state<{ msgId: string; idx: number; x: number; y: number } | null>(null);

	function getMsgIdFromPoint(x: number, y: number): string | null {
		const el = document.elementFromPoint(x, y);
		return el?.closest<HTMLElement>('[data-msg-id]')?.dataset.msgId ?? null;
	}

	function getMsgIndex(msgId: string): number {
		return getMessages().findIndex((m) => m.id === msgId);
	}

	function beginDragSelection(msgId: string, idx: number) {
		dragSelecting = true;
		dragAction = selectedIds.has(msgId) ? 'deselect' : 'select';
		dragStartIdx = idx;
		dragBaseSelection = new Set(selectedIds);

		const next = new Set(selectedIds);
		if (dragAction === 'select') next.add(msgId);
		else next.delete(msgId);
		selectedIds = next;
	}

	function onDragStart(e: MouseEvent) {
		if (e.button !== 0) return;
		const msgId = getMsgIdFromPoint(e.clientX, e.clientY);
		if (!msgId) return;
		const el = e.target as HTMLElement;
		if (el.closest('a, button, .media-trigger, .context-overlay, input, textarea')) return;

		const idx = getMsgIndex(msgId);
		if (idx === -1) return;

		if (selectedIds.size > 0) {
			beginDragSelection(msgId, idx);
		} else {
			dragPending = { msgId, idx, x: e.clientX, y: e.clientY };
		}
	}

	function onDragMove(e: MouseEvent) {
		if (dragPending && !dragSelecting) {
			const dx = e.clientX - dragPending.x;
			const dy = e.clientY - dragPending.y;
			if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
				beginDragSelection(dragPending.msgId, dragPending.idx);
				dragPending = null;
			} else {
				return;
			}
		}
		if (!dragSelecting) return;
		const msgId = getMsgIdFromPoint(e.clientX, e.clientY);
		if (!msgId) return;
		const curIdx = getMsgIndex(msgId);
		if (curIdx === -1) return;

		const messages = getMessages();
		const lo = Math.min(dragStartIdx, curIdx);
		const hi = Math.max(dragStartIdx, curIdx);
		const next = new Set(dragBaseSelection);
		for (let i = lo; i <= hi; i++) {
			const id = messages[i].id;
			if (dragAction === 'select') next.add(id);
			else next.delete(id);
		}
		selectedIds = next;
	}

	function onDragEnd() {
		dragSelecting = false;
		dragPending = null;
	}

	return {
		get selectedIds() { return selectedIds; },
		get selecting() { return selecting; },
		get selectedOwnCount() { return selectedOwnCount; },
		get dragSelecting() { return dragSelecting; },
		has: (id: string) => selectedIds.has(id),
		ids: () => [...selectedIds],
		toggle,
		selectOnly,
		remove,
		clear,
		onDragStart,
		onDragMove,
		onDragEnd,
	};
}
