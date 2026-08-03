const KEY = 'echo:audioVolume';

function read(): number {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw == null) return 1;
		const n = parseFloat(raw);
		if (!Number.isFinite(n)) return 1;
		return Math.min(1, Math.max(0, n));
	} catch {
		return 1;
	}
}

let value = $state(read());

export const audioVolume = {
	get value() {
		return value;
	},
	set(v: number) {
		const clamped = Math.min(1, Math.max(0, v));
		value = clamped;
		try {
			localStorage.setItem(KEY, String(clamped));
		} catch {
			// ignore (private mode, quota, etc.)
		}
	},
};
