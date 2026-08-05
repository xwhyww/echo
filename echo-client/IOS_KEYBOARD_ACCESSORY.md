# The iOS keyboard accessory bar

Tap any input on iOS — the composer, the search field, the login code — and a
grey bar appears above the keyboard with **‹ ›** arrows and a **Done** button.
This documents what it is, why nothing in the client can hide it, and how it was
removed.

**Status: removed.** `src-tauri/ios/EchoInputAccessory.m` takes the bar away,
and `useKeyboardDismiss.svelte.ts` replaces the dismissal it used to provide.
The rest of this file is why it had to be done that way.

## What it is

UIKit's *input accessory view*, also called the form assistant. It belongs to
the first responder, not to the page: whenever WKWebView focuses a form control
or a `contenteditable` element, UIKit attaches the bar to the keyboard. The
arrows step between focusable fields on the page (greyed out when there is only
one), and Done resigns first responder.

It is native chrome drawn above the web view. The page is never told it exists
and has no say in it.

- **iOS only.** Android's WebView shows nothing comparable, so this is not a
  general "mobile" problem — it will not reproduce in Chrome device emulation.
- **Every text surface is affected**, including `TextField`
  (`lib/components/ui/TextField.svelte`), which is a `contenteditable` div
  rather than an `<input>`. Contenteditable gets the same bar.

## Why the client cannot hide it

There is no web-facing switch. None of these do anything:

- CSS — no `-webkit-` property targets it; it is not in the page's layout at all.
- Meta tags — `viewport`, `format-detection`, `apple-mobile-web-app-*`: unrelated.
- Attributes — `enterkeyhint`, `inputmode`, `autocomplete`, `autocapitalize`
  change the *keyboard*, never the bar above it.
- Focus tricks — swapping `<input>` for `contenteditable` (which `TextField`
  already does) does not avoid it.

So do not spend time looking for a CSS or Svelte fix. There isn't one.

## How it was removed

Native code in the iOS shell: replace the accessory-view getter on the private
class that backs text editing inside WKWebView so it returns `nil`.
`src-tauri/ios/EchoInputAccessory.m` does that from `+load`, with the
`UIApplicationDidFinishLaunching` notification as a second chance in case
WebKit's classes are not registered that early. It is a class-level swizzle, so
it covers the web view Tauri has already built as well as any created later —
nothing has to race the shell's startup.

Objective-C rather than the Swift originally sketched here: `+load` runs by
itself, so there is no call to thread into `main.mm` and no bridging header.

### Where the file lives, and why not in `gen/`

`src-tauri/.gitignore` ignores all of `/gen/`, because the generated
`project.pbxproj` carries a per-developer `DEVELOPMENT_TEAM`. A source file
dropped into `src-tauri/gen/apple` would therefore be untracked, and gone on the
next clone or `ios:clean`.

So the file is committed at `src-tauri/ios/` and copied in by
`scripts/ios-native.sh`, which every `ios:*` script runs first. No `project.yml`
edit is needed: it lists `Sources` as a *directory*, so xcodegen compiles
whatever is sitting there when the project is generated — which is also why the
copy has to happen before `tauri ios init`, not after.

### The two costs, as accepted

**1. `WKContentView` is a private class name.** The swizzle ships in a great
many App Store apps and has held across years of iOS releases, but it is not
API. If Apple renames the class the lookup finds nothing and the bar returns —
it does not crash, and it does not need a client-side fallback.

**2. Done was how many people dismiss the keyboard.** With the bar gone the
keyboard would otherwise cover the conversation with no way out, so
`src/lib/hooks/ui/useKeyboardDismiss.svelte.ts` blurs the focused field on a tap
outside it or a drag of the page under it. It is mounted once by the root
layout, so it covers every text surface — composer, search, login code — not
just the composer, which matters because the swizzle is app-wide too.

Two details in that hook are load-bearing:

- it listens for `touchmove`, not `scroll`. iOS fires scroll events while it
  resizes the page around the keyboard it has just opened, which would blur the
  field in the same breath as focusing it.
- anything marked `data-keeps-keyboard` counts as part of the field rather than
  as "outside". `EmojiPicker` carries it, so picking an emoji does not put the
  keyboard away mid-message.
