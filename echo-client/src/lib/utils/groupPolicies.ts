import type { Group } from '$lib/api/groups.js';
import type { Dict } from '$lib/i18n/en.js';

export type PolicyField =
	| 'invitePolicy'
	| 'messagePolicy'
	| 'pinPolicy'
	| 'editInfoPolicy'
	| 'historyVisible';

export interface PolicyFieldMeta {
	field: PolicyField;
	label: string;
	desc: string;
	options: { value: string; label: string }[];
	/** The group's current answer, as the string the segmented control compares. */
	current: (group: Group) => string;
	/** Back to the type the API wants — `historyVisible` is the one boolean. */
	parse: (value: string) => string | boolean;
}

/**
 * Every group policy the owner can change, with its wording and its choices.
 * Kept out of the page so the settings screen renders a list instead of
 * repeating the same block once per policy.
 */
export function groupPolicyFields(t: Dict): PolicyFieldMeta[] {
	const whoCan = [
		{ value: 'owner', label: t.groupSettings.policies.owner },
		{ value: 'admins', label: t.groupSettings.policies.admins },
		{ value: 'everyone', label: t.groupSettings.policies.everyone },
	];
	const staffOnly = [
		{ value: 'owner', label: t.groupSettings.policies.owner },
		{ value: 'admins', label: t.groupSettings.policies.admins },
	];
	const history = [
		{ value: 'true', label: t.groupSettings.policies.visible },
		{ value: 'false', label: t.groupSettings.policies.newMembersOnly },
	];
	const asString = (v: string | boolean | undefined, fallback: string) =>
		v === undefined || v === null ? fallback : String(v);

	return [
		{
			field: 'invitePolicy',
			label: t.groupSettings.whoCanInvite,
			desc: t.groupSettings.whoCanInviteDesc,
			options: whoCan,
			current: (g) => asString(g.invitePolicy, 'admins'),
			parse: (v) => v,
		},
		{
			field: 'messagePolicy',
			label: t.groupSettings.whoCanMessage,
			desc: t.groupSettings.whoCanMessageDesc,
			options: whoCan,
			current: (g) => asString(g.messagePolicy, 'everyone'),
			parse: (v) => v,
		},
		{
			field: 'pinPolicy',
			label: t.groupSettings.whoCanPin,
			desc: t.groupSettings.whoCanPinDesc,
			options: whoCan,
			current: (g) => asString(g.pinPolicy, 'admins'),
			parse: (v) => v,
		},
		{
			field: 'historyVisible',
			label: t.groupSettings.chatHistory,
			desc: t.groupSettings.chatHistoryDesc,
			options: history,
			current: (g) => asString(g.historyVisible, 'true'),
			parse: (v) => v === 'true',
		},
		{
			field: 'editInfoPolicy',
			label: t.groupSettings.whoCanEditInfo,
			desc: t.groupSettings.whoCanEditInfoDesc,
			options: staffOnly,
			current: (g) => asString(g.editInfoPolicy, 'admins'),
			parse: (v) => v,
		},
	];
}
