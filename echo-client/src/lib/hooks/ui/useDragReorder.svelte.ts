/**
 * Drag-to-reorder for a keyed list: which row is being dragged, which row it is
 * hovering, and whether it would land before or after that row.
 *
 * Only the gesture lives here. What reordering *means* — the new order, the
 * positions to save — belongs to the caller's `ondrop`.
 */
export function useDragReorder(options: {
	/** False while dragging must not start (no permission, a row is in edit mode). */
	enabled: () => boolean;
	ondrop: (dragId: string, overId: string, after: boolean) => void;
	/** Is the pointer past the row's midpoint — i.e. does the drop land after it. */
	isPastMidpoint: (clientY: number, rect: DOMRect) => boolean;
}) {
	let draggingId = $state<string | null>(null);
	let overId = $state<string | null>(null);
	let after = $state(false);

	function reset() {
		draggingId = null;
		overId = null;
		after = false;
	}

	return {
		isDragging(rowId: string) { return draggingId === rowId; },
		// A row never marks a drop against itself — that would be a no-op move
		// drawn as a real one.
		isDragOverBefore(rowId: string) {
			return overId === rowId && !after && draggingId !== rowId;
		},
		isDragOverAfter(rowId: string) {
			return overId === rowId && after && draggingId !== rowId;
		},

		onDragStart(e: DragEvent, rowId: string) {
			if (!options.enabled()) {
				e.preventDefault();
				return;
			}
			draggingId = rowId;
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				// Some browsers require some data to be set or drag doesn't initiate.
				e.dataTransfer.setData('text/plain', rowId);
			}
		},

		onDragOver(e: DragEvent, rowId: string) {
			if (!draggingId || draggingId === rowId) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			overId = rowId;
			after = options.isPastMidpoint(e.clientY, rect);
		},

		onDragLeaveRow(e: DragEvent, rowId: string) {
			// Only clear if we're not moving into a child element of the same row.
			const next = e.relatedTarget as Node | null;
			if (next && (e.currentTarget as HTMLElement).contains(next)) return;
			if (overId === rowId) overId = null;
		},

		onDrop(e: DragEvent, rowId: string) {
			e.preventDefault();
			const dragId = draggingId;
			const landedAfter = after;
			reset();
			if (dragId) options.ondrop(dragId, rowId, landedAfter);
		},

		onDragEnd: reset,
	};
}
