<script lang="ts">
	import { Mic, Send, Smile, Trash2 } from 'lucide-svelte';
	import { onDestroy, onMount, untrack } from 'svelte';
	import ButtonIcon from '$lib/components/ui/ButtonIcon.svelte';
	import ComposerAttachments from '$lib/components/chat/ComposerAttachments.svelte';
	import VoiceRecorderStrip from '$lib/components/audio/VoiceRecorderStrip.svelte';
	import { useVoiceRecording } from '$lib/hooks/audio/useVoiceRecording.svelte.js';
	import { useEmojiEditor } from '$lib/hooks/ui/useEmojiEditor.svelte.js';
	import { device } from '$lib/stores/device.svelte.js';
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

	// On a phone the soft keyboard already has an emoji key, so our own picker is
	// a second way to do the same thing — one that costs a button in a cramped
	// bar and half the screen when opened, over a keyboard the user then has to
	// dismiss. It stays on desktop, where there is no other way in.
	const showEmojiButton = $derived(!!onemojitoggle && !device.isTouch);

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

	// One recording, drawn in two places that are no longer siblings: the strip
	// inside the pill, the button that starts and finishes it outside — so the
	// recording is held here, above both.
	const voice = useVoiceRecording({
		onsend: handleVoiceSend,
		onerror: (m) => onvoiceerror?.(m),
		onactive: (a) => (recordingActive = a),
	});

	onDestroy(voice.dispose);

	// Exactly one action to the right of the field, so its position never moves:
	// finish the recording, send what is typed, or start recording when there is
	// nothing to send and this surface takes voice at all.
	const action = $derived(
		recordingActive ? 'voice' : !canSend && onvoice ? 'record' : 'send',
	);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- `data-keeps-keyboard` and the pointerdown guard sit on the whole row, not on
     the pill: attach, send and the mic are outside the pill now, and both of
     those protections have to follow them — otherwise pressing send would trip
     the global dismisser in `useKeyboardDismiss` and drop the keyboard, and the
     button would steal the caret on the way down. -->
<div class="textfield-wrapper" onpointerdown={onFieldPointerDown} data-keeps-keyboard>
	<!-- Left of the pill: attach normally, discard while recording. There is
	     nothing to attach to a recording, and the two destructive-ish edges of a
	     recording then sit at opposite ends of the bar — throw away on the left,
	     send on the right — so neither is reachable by accident. -->
	{#if recordingActive}
		<ButtonIcon
			size="m"
			variant="glass"
			title={t.chat.cancelRecording}
			onclick={voice.cancel}
		>
			<!-- Red on the icon rather than the button: `variant="glass"` is what
			     gives it its background, and `danger` would trade that away. -->
			<Trash2 size={20} class="text-error" />
		</ButtonIcon>
	{:else}
		<ComposerAttachments bind:text={value} onsend={(f, text) => submit(text.trim(), f)} />
	{/if}
	<div class="textfield" class:recording={recordingActive} onclick={onFieldClick}>
		{#if recordingActive}
			<VoiceRecorderStrip recorder={voice} />
		{:else}
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
			{#if showEmojiButton}
				<ButtonIcon
					size="m"
					title={t.common.emoji}
					onclick={() => onemojitoggle?.()}
				>
					<Smile size={20} class={emojiOpen ? 'emoji-active' : ''} />
				</ButtonIcon>
			{/if}
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

	<!-- Outside the pill, and always exactly one button wide, so the target does
	     not move under a thumb as the composer changes shape. -->
	<div class="composer-action">
		{#if action === 'voice'}
			<ButtonIcon variant="glass" size="m" title={t.chat.sendVoice} onclick={voice.send}>
				<Send size={20} />
			</ButtonIcon>
		{:else if action === 'record'}
			<ButtonIcon variant="glass" size="m" title={t.chat.recordVoice} onclick={voice.start}>
				<Mic size={20} />
			</ButtonIcon>
		{:else}
			<ButtonIcon variant="glass" size="m" title={t.common.send} onclick={send} disabled={!canSend}>
				<Send size={20} />
			</ButtonIcon>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.textfield-wrapper {
		display: flex;
		flex-direction: row;
		gap: var(--sp-2);
		position: relative;
		align-items: center;
	}

	.textfield {
		/* Takes the row's spare width; the attach and action buttons either side
		   keep their own. */
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--sp-2);
		min-height: var(--input-h);
		padding: 0 var(--sp-2) 0 var(--sp-6);
		cursor: text;
		@include glass-more;
		border-radius: 32px;
		transition: border-color var(--duration-fast) var(--ease-default);
		border: none;
		/* The counter is positioned against the pill, not the row, or it would
		   sit over the send button. */
		position: relative;
	}

	.composer-action {
		flex-shrink: 0;
		display: flex;
		align-items: center;
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
