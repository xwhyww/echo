import { voiceService } from '$lib/api/voiceService.js';
import { ws } from '$lib/stores/ws.svelte.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { confirm } from '$lib/stores/confirm.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import { useDragReorder } from '$lib/hooks/ui/useDragReorder.svelte.js';
import { useVoiceRoleMembers } from '$lib/hooks/voice/useVoiceRoleMembers.svelte.js';
import type { VoiceRole } from '$lib/api/voice.js';
import type { RolePatch } from '$lib/utils/voiceRoles.js';
import {
	applyRoleEvent,
	isPastMidpoint,
	permissionMeta,
	reorderRoles,
	roleColorOptions,
	sortRoles,
} from '$lib/utils/voiceRoles.js';

/**
 * Everything behind the voice-roles panel: the role list and its WS
 * reconciliation, the create/edit/delete flows, role membership and
 * drag-to-reorder. `groupId` is read through a getter so the hook follows the
 * route without the panel having to re-create it.
 *
 * The list is this hook's; membership and the drag gesture are sub-hooks whose
 * surface is re-exported, so the panel still sees one object.
 */
export function useVoiceRoles(groupId: () => string) {
	const id = $derived(groupId());
	const t = $derived(i18n.t);

	// ─── Local state ──────────────────────────────────────────
	let roles = $state<VoiceRole[]>([]);
	let canManage = $state(false);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	// Create-role modal — the draft itself belongs to CreateRoleModal.
	let showCreateModal = $state(false);

	// Which row is open for editing; the draft inside it belongs to the form.
	let editingRoleId = $state<string | null>(null);

	let reorderSaving = $state(false);

	const sortedRoles = $derived(sortRoles(roles));
	const permissions = $derived(permissionMeta(t));
	const colorOptions = $derived(roleColorOptions(t));

	/** The single way anything outside this hook changes one role. */
	function patchRole(roleId: string, update: (role: VoiceRole) => VoiceRole) {
		roles = roles.map((r) => (r.id === roleId ? update(r) : r));
	}

	const members = useVoiceRoleMembers({ groupId: () => id, patchRole });

	const drag = useDragReorder({
		// A row being edited must not also be draggable — the two gestures fight
		// over the same pointer.
		enabled: () => canManage && !editingRoleId,
		isPastMidpoint,
		ondrop: (dragId, overId, after) => void applyReorder(dragId, overId, after),
	});

	async function applyReorder(dragId: string, overId: string, after: boolean) {
		const result = reorderRoles(roles, dragId, overId, after);
		if (!result) return;

		roles = result.roles;
		if (result.changes.length === 0) return;

		reorderSaving = true;
		try {
			await Promise.all(
				result.changes.map((c) => voiceService.updateRole(c.id, { position: c.position })),
			);
		} catch (err) {
			console.error('[useVoiceRoles] reorder failed', err);
			toasts.error(t.voice.roles.reorderFailed);
			// Re-fetch to converge on server state.
			void load();
		} finally {
			reorderSaving = false;
		}
	}

	// ─── Initial load + WS subscription ───────────────────────

	$effect(() => {
		void load();
	});

	$effect(() => {
		return ws.on((event) => {
			if (event.type === 'reconnected') {
				void load();
				return;
			}
			const next = applyRoleEvent(roles, event, id, members.lookup);
			if (!next) return;
			roles = next;
			// A role that vanished under an open editor or picker takes them with it.
			if (event.type === 'voice_role_deleted') {
				if (editingRoleId === event.roleId) editingRoleId = null;
				members.dismissIfOpenFor(event.roleId);
			}
		});
	});

	// Bumped on every load; a response whose token is stale lost the race against
	// a newer request and must not overwrite fresher state.
	let loadToken = 0;

	async function load() {
		const token = ++loadToken;
		loading = true;
		loadError = null;
		try {
			const res = await voiceService.listRoles(id);
			if (token !== loadToken) return;
			roles = res.roles;
			canManage = res.canManage;
		} catch (err) {
			if (token !== loadToken) return;
			console.error('[useVoiceRoles] load failed', err);
			loadError = t.voice.roles.loadFailed;
		} finally {
			if (token === loadToken) loading = false;
		}
	}

	// ─── Inline edit ──────────────────────────────────────────
	// The draft lives in the form that shows it; what arrives here is the diff.

	async function saveEdit(roleId: string, patch: RolePatch) {
		try {
			await voiceService.updateRole(roleId, patch);
			// WS will reconcile; keep optimistic update for snappy feel.
			patchRole(roleId, (x) => ({ ...x, ...patch }));
			editingRoleId = null;
		} catch (err) {
			console.error('[useVoiceRoles] update failed', err);
			toasts.error((err as Error).message ?? t.voice.roles.saveFailed);
			// Left open on purpose: the edit is still there to retry or abandon.
		}
	}

	async function deleteRole(r: VoiceRole) {
		const ok = await confirm({
			title: t.voice.roles.deleteRoleTitle,
			message: t.voice.roles.deleteRoleBody(r.name),
			tone: 'danger',
			confirmLabel: t.voice.roles.deleteRole,
			requireText: r.name,
		});
		if (!ok) return;
		try {
			await voiceService.deleteRole(r.id);
			roles = roles.filter((x) => x.id !== r.id);
		} catch (err) {
			console.error('[useVoiceRoles] delete failed', err);
			toasts.error((err as Error).message ?? t.voice.roles.deleteFailed);
		}
	}

	return {
		// ─── List ─────────────────────────────────────────────
		get roles() { return roles; },
		get sortedRoles() { return sortedRoles; },
		get canManage() { return canManage; },
		get loading() { return loading; },
		get loadError() { return loadError; },
		get permissionMeta() { return permissions; },
		get colorOptions() { return colorOptions; },

		// ─── Create ───────────────────────────────────────────
		// The form belongs to CreateRoleModal; all we track is whether it's open
		// and where the new role lands.
		get showCreateModal() { return showCreateModal; },
		openCreate() { showCreateModal = true; },
		closeCreate() { showCreateModal = false; },
		addRole(role: VoiceRole) {
			if (!roles.some((r) => r.id === role.id)) roles = [...roles, role];
		},

		// ─── Edit ─────────────────────────────────────────────
		get editingRoleId() { return editingRoleId; },
		openEdit(r: VoiceRole) { editingRoleId = r.id; },
		closeEdit() { editingRoleId = null; },
		saveEdit,

		deleteRole,

		// ─── Members ──────────────────────────────────────────
		get pickerRole() {
			return members.openFor ? roles.find((r) => r.id === members.openFor) ?? null : null;
		},
		get groupMembers() { return members.members; },
		get loadingMembers() { return members.loading; },
		openMemberPicker: members.openPicker,
		closeMemberPicker: members.closePicker,
		addMember: members.add,
		removeMember: members.remove,

		// ─── Drag ─────────────────────────────────────────────
		// Handed to the row whole: it both asks the gesture about itself and
		// drives it, so eight props were only ever one thing.
		drag,
		get reorderSaving() { return reorderSaving; },
	};
}
