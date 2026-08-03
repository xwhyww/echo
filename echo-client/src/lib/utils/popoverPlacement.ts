/** Which way a popover opens off its trigger. */
export interface Quadrant {
	/**
	 * `left` anchors the popover's right edge to the trigger's right edge and
	 * grows leftward; `right` anchors at `left: 0` and grows rightward.
	 */
	horiz: 'left' | 'right';
	vert: 'up' | 'down';
}

export interface Box {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/**
 * Picks the quadrant that keeps a popover of roughly `size` inside the
 * viewport, given where its trigger sits.
 *
 * Only "roughly": the caller passes an over-estimate of the rendered box, since
 * the alternative is measuring a popover that isn't in the DOM yet. Being a
 * function of four plain numbers, this is also the part worth a test — the
 * cases that matter (a trigger against either edge, a viewport too small for
 * either side) are hard to hit by hand.
 */
export function pickQuadrant(
	trigger: Box,
	viewport: { width: number; height: number },
	size: { width: number; height: number },
	margin: number,
): Quadrant {
	// Horizontal: pick the side that keeps the popover on-screen; when both fit
	// or neither does, take the side with more room.
	const roomRight = viewport.width - trigger.left - margin;
	const roomLeft = trigger.right - margin;
	const fitsRight = roomRight >= size.width;
	const fitsLeft = roomLeft >= size.width;
	let horiz: 'left' | 'right';
	if (fitsLeft && !fitsRight) horiz = 'left';
	else if (fitsRight && !fitsLeft) horiz = 'right';
	else horiz = roomLeft >= roomRight ? 'left' : 'right';

	// Vertical: prefer up — these indicators sit at the bottom of their bar —
	// and flip only when there isn't room and down is roomier.
	const roomUp = trigger.top - margin;
	const roomDown = viewport.height - trigger.bottom - margin;
	const vert: 'up' | 'down' = roomUp >= size.height ? 'up' : roomDown > roomUp ? 'down' : 'up';

	return { horiz, vert };
}
