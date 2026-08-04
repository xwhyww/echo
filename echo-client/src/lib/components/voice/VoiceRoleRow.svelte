<script lang="ts">
	import { Trash2, Pencil, Shield, UserPlus, GripVertical } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ButtonIcon from '$lib/components/ui/ButtonIcon.svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import TitleIcon from '$lib/components/ui/TitleIcon.svelte';
	import VoiceRoleEditForm from '$lib/components/voice/VoiceRoleEditForm.svelte';
	import type { VoiceRole } from '$lib/api/voice.js';
	import type { useDragReorder } from '$lib/hooks/ui/useDragReorder.svelte.js';
	import {
		hasPermission,
		memberLabel,
		roleColor,
		type PermissionMeta,
		type RoleColorOption,
		type RolePatch,
	} from '$lib/utils/voiceRoles.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		role: VoiceRole;
		/** Whether the viewer may edit, reorder and assign — hides every affordance when false. */
		canManage: boolean;
		/** Permission bit → label + icon. Owned by the panel so the read-only
		    pills and the edit checkboxes stay in sync across every row. */
		permissionMeta: PermissionMeta[];
		colorOptions: RoleColorOption[];

		/** Show the inline edit form instead of the read-only row. The draft
		    belongs to the form; the panel only decides which row is open. */
		editing: boolean;

		/** The list's drag gesture, asked about this row and driven by it. */
		drag: ReturnType<typeof useDragReorder>;

		onedit: (role: VoiceRole) => void;
		ondelete: (role: VoiceRole) => void;
		oncanceledit: () => void;
		onsubmitedit: (patch: RolePatch) => Promise<void>;
		onaddmember: (roleId: string) => void;
		onremovemember: (roleId: string, userId: string) => void;
	}

	let {
		role,
		canManage,
		permissionMeta,
		colorOptions,
		editing,
		drag,
		onedit,
		ondelete,
		oncanceledit,
		onsubmitedit,
		onaddmember,
		onremovemember,
	}: Props = $props();

	const tint = $derived(roleColor(role.color));
</script>

<li
	class="vrp-role"
	class:dragging={drag.isDragging(role.id)}
	class:drag-over-before={drag.isDragOverBefore(role.id)}
	class:drag-over-after={drag.isDragOverAfter(role.id)}
	draggable={canManage && !editing}
	ondragstart={(e) => drag.onDragStart(e, role.id)}
	ondragover={(e) => drag.onDragOver(e, role.id)}
	ondragleave={(e) => drag.onDragLeaveRow(e, role.id)}
	ondrop={(e) => drag.onDrop(e, role.id)}
	ondragend={drag.onDragEnd}
>
	{#if editing}
		<VoiceRoleEditForm
			{role}
			{permissionMeta}
			{colorOptions}
			onsave={onsubmitedit}
			oncancel={oncanceledit}
		/>
	{:else}
		<div class="vrp-role-row">
			{#if canManage}
				<span
					class="vrp-drag-handle text-faint"
					title={t.voice.roles.dragToReorder}
					aria-hidden="true"
				>
					<GripVertical size={16} />
				</span>
			{/if}
			<div class="vrp-role-info">
				<TitleIcon color={tint}>
					{#snippet icon()}<Shield size={17} />{/snippet}
					<span class="fw-semibold">{role.name}</span>
				</TitleIcon>

				<div class="vrp-role-perms">
					{#each permissionMeta.filter((p) => hasPermission(role.permissions, p.bit)) as p (p.bit)}
						{@const PermIcon = p.icon}
						<Pill>
							{#snippet icon()}<PermIcon size={12} />{/snippet}
							{p.label}
						</Pill>
					{/each}
				</div>

				<div class="vrp-members">
					{#each role.members as m (m.userId)}
						<Chip
							title={memberLabel(m)}
							onremove={canManage ? () => onremovemember(role.id, m.userId) : undefined}
							removeTitle={t.voice.roles.removeFromRole}
						>
							{#snippet leading()}
								<Avatar name={memberLabel(m)} avatarUrl={m.avatarUrl} size={20} />
							{/snippet}
							{memberLabel(m)}
						</Chip>
					{/each}
					{#if canManage}
						<Button variant="dashed" onclick={() => onaddmember(role.id)}>
							<UserPlus size={14} />
							<span>{t.voice.roles.addMember}</span>
						</Button>
					{/if}
				</div>
			</div>
			{#if canManage}
				<div class="vrp-role-actions">
					<ButtonIcon size="xs" onclick={() => onedit(role)} title={t.voice.roles.editRole}>
						<Pencil size={16} />
					</ButtonIcon>
					<ButtonIcon
						size="xs"
						variant="danger"
						onclick={() => ondelete(role)}
						title={t.voice.roles.deleteRole}
					>
						<Trash2 size={16} />
					</ButtonIcon>
				</div>
			{/if}
		</div>
	{/if}
</li>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.vrp-role {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-2);
		border-radius: var(--radius-sm);
		/* Containing block for the drag insertion bars below. `glass` happens to
		   provide one too (backdrop-filter), but relying on that would break the
		   indicators the moment the glass treatment changes. */
		position: relative;
		@include glass;
	}

	.vrp-role[draggable='true'] { cursor: grab; }
	.vrp-role.dragging { opacity: 0.4; cursor: grabbing; }

	/* Insertion indicators — a 2px accent bar above/below the hovered row. */
	.vrp-role.drag-over-before::before,
	.vrp-role.drag-over-after::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--c-accent);
		border-radius: 2px;
		pointer-events: none;
	}
	.vrp-role.drag-over-before::before { top: -3px; }
	.vrp-role.drag-over-after::after { bottom: -3px; }

	.vrp-drag-handle {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 22px;
		cursor: grab;
	}
	.vrp-role.dragging .vrp-drag-handle,
	.vrp-drag-handle:active { cursor: grabbing; }

	.vrp-role-row {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-2);
	}

	.vrp-role-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		min-width: 0;
	}

	.vrp-role-perms {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}

	.vrp-role-actions {
		display: flex;
		gap: 2px;
	}

	.vrp-members {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		align-items: center;
	}
</style>
