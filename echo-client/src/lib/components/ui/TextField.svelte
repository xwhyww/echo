<script lang="ts">
	import { Send, Smile } from 'lucide-svelte';
	import { onMount, untrack } from 'svelte';
	import ButtonIcon from '$lib/components/ui/ButtonIcon.svelte';
	import ComposerAttachments from '$lib/components/chat/ComposerAttachments.svelte';
	import VoiceRecorder from '$lib/components/audio/VoiceRecorder.svelte';
	import { useEmojiEditor } from '$lib/hooks/ui/useEmojiEditor.svelte.js';
	import { recordingToFile, type VoiceRecording } from '$lib/utils/voiceRecording';
	import type { VoiceMeta } from '$lib/api/personalChats';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		value?: string;
		/** A draft to restore — applied whenever it changes under us. */
		initialValue?: string;
		placeholder: string;
		maxlength?: number;
		showCounterAt?: number;
		emojiOpen?: boolean;
		onsubmit?: (value: string, files: File[]) => void;
		oninput?: (value: string) => void;
		onemojitoggle?: () => void;
		onvoice?: (file: File, meta: VoiceMeta) => void;
		onvoiceerror?: (message: string) => void;
	}

	let {
		value = $bindable(''),
		initialValue,
		placeholder,
		maxlength = 500,
		showCounterAt = 400,
		emojiOpen = false,
		onsubmit,
		oninput,
		onemojitoggle,
		onvoice,
		onvoiceerror,
	}: Props = $props();

	let editorEl = $state<HTMLDivElement>();
	let recordingActive = $state(false);
	// Whether the editor held focus when the current interaction began. Not
	// reactive: it is a fact about the gesture in flight, read and written within
	// the same handful of events.
	let editorHadFocus = false;

	const editor = useEmojiEditor(() => editorEl);

	const overLimit = $derived(value.length > maxlength);
	const canSend = $derived(value.trim().length > 0 && !overLimit);

	$effect(() => {
		const incoming = initialValue ?? '';
		untrack(() => {
			if (incoming === value) return;
			value = incoming;
			editor.render(incoming);
		});
	});

	// No focus on mount: opening a chat must not raise the keyboard on mobile or
	// steal focus from wherever the user actually is.
	onMount(() => {
		editor.render(value);
	});

	function onEditorInput() {
		value = editor.read();
		oninput?.(value);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			// Typing is proof of focus, and this path never goes through
			// pointerdown — a hardware keyboard, or the on-screen return key.
			editorHadFocus = true;
			send();
		}
	}

	// Paste is intercepted so pasted text goes through the emoji segmenter and
	// arrives as plain text — not as whatever markup the clipboard carried.
	function handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const text = e.clipboardData?.getData('text/plain') ?? '';
		if (!text) return;
		editor.insert(text);
		onEditorInput();
	}

	export function focus() {
		editor.focus();
	}

	// Picking an emoji must not pull focus into the editor: on a phone that
	// would throw the keyboard up over the picker the user is still using. The
	// emoji lands at the caret if the field was already focused, and is appended
	// otherwise.
	export function insertAtCursor(text: string) {
		editor.insert(text);
		onEditorInput();
	}

	// The field focuses the editor when you click its empty space, but a click
	// on something inside it — attach, emoji, send, the recorder — belongs to
	// that control alone.
	function onFieldClick(e: MouseEvent) {
		if (recordingActive) return;
		if ((e.target as HTMLElement | null)?.closest('button, input, label, [role="button"]')) return;
		editor.focus();
	}

	// …and pressing one of those controls must not pull focus *out* of the
	// editor either: a button takes focus on press, which drops the caret, so
	// opening the emoji picker would leave the next pick with nowhere to go but
	// the end of the text. Suppressing the default keeps the caret exactly where
	// the user left it.
	//
	// This has to be pointerdown, not mousedown. A touch fires mousedown only as
	// a compatibility event after the finger lifts — far too late to stop the
	// blur, so on a phone the first tap merely dismissed the keyboard, the bar
	// slid down out from under the finger, and the click never reached the
	// button. pointerdown fires on finger-down for touch and mouse alike.
	function onFieldPointerDown(e: PointerEvent) {
		// Recorded here, not where it is used. By the time the click arrives
		// WebKit may already have blurred the editor, and `document.activeElement`
		// no longer remembers that the keyboard was up a moment ago — which is
		// exactly the case the restore in `submit` exists for.
		editorHadFocus = document.activeElement === editorEl;
		if ((e.target as HTMLElement | null)?.closest('button')) e.preventDefault();
	}

	function send() {
		if (!canSend) return;
		submit(value.trim(), []);
	}

	function submit(text: string, files: File[]) {
		// Clearing the editor tears out every node inside it, including the one
		// the caret was sitting in, and WebKit drops focus along with it. On a
		// phone that reads as the keyboard sliding away after every message sent
		// — so focus is taken back immediately.
		//
		// Restoring it has to happen inside the same user gesture that sent the
		// message: iOS only raises the keyboard for a focus() it can attribute to
		// a tap, and one deferred to a later tick is silently ignored.
		const refocus = editorHadFocus || document.activeElement === editorEl;
		onsubmit?.(text, files);
		value = '';
		editor.render('');
		if (refocus) editor.focus();
	}

	function handleVoiceSend(rec: VoiceRecording) {
		onvoice?.(recordingToFile(rec), { duration: rec.durationSec, peaks: rec.peaks });
	}
</script>

<div class="textfield-wrapper">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- `data-keeps-keyboard`: the field's own controls are part of the field, not
	     "outside" it, so pressing send/emoji/attach must not trip the global
	     keyboard dismisser in `useKeyboardDismiss`. -->
	<div
		class="textfield"
		class:recording={recordingActive}
		onclick={onFieldClick}
		onpointerdown={onFieldPointerDown}
		data-keeps-keyboard
	>
		{#if !recordingActive}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={editorEl}
				class="textfield-input body-sm text-default"
				class:empty={value.length === 0}
				contenteditable="true"
				role="textbox"
				tabindex="0"
				aria-multiline="true"
				aria-label={placeholder}
				data-placeholder={placeholder}
				oninput={onEditorInput}
				onkeydown={handleKeydown}
				onpaste={handlePaste}
			></div>
			<ComposerAttachments bind:text={value} onsend={(f, text) => submit(text.trim(), f)} />
			{#if onemojitoggle}
				<ButtonIcon
					size="md"
					title={t.common.emoji}
					onclick={() => onemojitoggle?.()}
				>
					<Smile size={20} class={emojiOpen ? 'emoji-active' : ''} />
				</ButtonIcon>
			{/if}
		{/if}

		<!-- The recorder replaces the send button while there's nothing to send,
		     and takes over the whole field once recording starts. -->
		{#if onvoice && (recordingActive || !canSend)}
			<VoiceRecorder
				onsend={handleVoiceSend}
				onerror={(m) => onvoiceerror?.(m)}
				onactive={(a) => (recordingActive = a)}
			/>
		{:else if !recordingActive}
			<ButtonIcon size="md" title={t.common.send} onclick={send} disabled={!canSend}>
				<Send size={20} />
			</ButtonIcon>
		{/if}
		
		{#if value.length >= showCounterAt}
		<span
			class="char-count body-xs {overLimit
				? 'text-error'
				: value.length > maxlength * 0.9
					? 'text-warning'
					: 'text-faint'}"
		>
			{value.length}/{maxlength}
		</span>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.textfield-wrapper {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		position: relative;
	}

	.textfield {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--sp-2);
		min-height: var(--input-h);
		padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-6);
		cursor: text;
		@include glass-more;
		border-radius: 32px;
		transition: border-color var(--duration-fast) var(--ease-default);
		border: none;
	}

	.textfield-input {
		width: 100%;
		background: none;
		border: none;
		outline: none;
		min-height: 1lh;
		max-height: 8lh;
		overflow-y: auto;
		padding: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		padding-top: var(--sp-2);
		padding-bottom: var(--sp-2);
	}

	/* The editor wraps freely, but the placeholder must not: a long "Message
	   <name>" would otherwise open the field to two rows before a single
	   character is typed. One row, clipped with an ellipsis. */
	.textfield-input.empty::before {
		content: attr(data-placeholder);
		color: var(--c-text-faint);
		pointer-events: none;
		display: block;
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* The emoji images the editor builds; they only exist at runtime, so the
	   rule has to be global. */
	.textfield-input :global(.input-emoji) {
		width: 1.1em;
		height: 1.1em;
		display: inline-block;
		vertical-align: -0.2em;
		user-select: none;
		-webkit-user-drag: none;
	}

	.char-count {
		padding-left: var(--sp-1);
		position: absolute;
		right: 10px;
		bottom: 10px;
	}
</style>
