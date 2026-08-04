# The iOS keyboard accessory bar

Tap any input on iOS — the composer, the search field, the login code — and a
grey bar appears above the keyboard with **‹ ›** arrows and a **Done** button.
This documents what it is, why nothing in the client can hide it, and what it
would cost to remove.

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

## What removing it takes

Native code in the iOS shell: replace the accessory-view getter on the private
class that backs text editing inside WKWebView so it returns `nil`.

The Xcode project does not exist in the repo yet — `src-tauri/gen/` holds only
`schemas/`. This lands after `npm run tauri ios init`, as a Swift file added to
`src-tauri/gen/apple`:

```swift
import UIKit
import WebKit

// WKWebView renders text input in a private WKContentView, and that is the
// responder UIKit asks for an accessory view. Returning nil kills the
// prev/next/Done bar app-wide — it is a class-level swizzle, so it applies to
// every web view created afterwards.
func removeWebViewInputAccessory() {
    guard let contentView = NSClassFromString("WKContentView"),
          let method = class_getInstanceMethod(
              contentView,
              #selector(getter: UIResponder.inputAccessoryView)
          )
    else { return }

    let none: @convention(block) (AnyObject) -> UIView? = { _ in nil }
    method_setImplementation(method, imp_implementationWithBlock(none))
}
```

Call it once at launch, before the web view is created.

### Two costs to weigh first

**1. `WKContentView` is a private class name.** The swizzle ships in a great
many App Store apps and has held across years of iOS releases, but it is not
API. If Apple renames the class the `guard` simply no-ops and the bar returns —
it does not crash, and it does not need a client-side fallback.

**2. Done is how many people dismiss the keyboard.** Take the bar away and the
composer has no blur affordance at all, so the keyboard covers the conversation
with no obvious way out. Ship the dismissal first, in the client:

- blur the editor on a tap outside the composer;
- blur it when the message list is scrolled.

Both belong in `TextField` / the composer, and neither depends on the native
change — they are worth having regardless.

## Decision

Not done. The bar stays until the iOS shell is generated and the two costs above
are accepted. When that happens, the client-side keyboard dismissal is the
prerequisite, not an afterthought.
