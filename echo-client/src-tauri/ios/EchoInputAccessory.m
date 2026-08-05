// Removes the grey ‹ › / Done bar UIKit draws above the keyboard whenever a
// text surface inside the web view takes focus.
//
// The bar is UIKit's input accessory view. It belongs to the first responder
// rather than to the page, so nothing web-facing can reach it — no CSS
// property, meta tag or input attribute. See IOS_KEYBOARD_ACCESSORY.md for the
// dead ends. The only way out is to replace the accessory-view getter on the
// private class that backs text editing inside WKWebView.
//
// WKContentView is not public API. If Apple renames it the lookup below finds
// nothing, this file quietly does nothing, and the bar comes back — no crash,
// and the client needs no fallback.
//
// Taking the bar away also takes away how most people dismiss the keyboard, so
// this is only half the change: useKeyboardDismiss.svelte.ts blurs the focused
// field on a tap outside it or a drag of the page under it.

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

@interface EchoInputAccessoryPatch : NSObject
@end

@implementation EchoInputAccessoryPatch

static void EchoRemoveInputAccessory(void) {
	Class contentView = NSClassFromString(@"WKContentView");
	if (contentView == Nil) return;

	Method getter = class_getInstanceMethod(contentView, @selector(inputAccessoryView));
	if (getter == NULL) return;

	// Replacing the implementation on the class covers web views that already
	// exist as well as any created later, so this does not have to race Tauri's
	// own web view construction.
	IMP none = imp_implementationWithBlock(^UIView *(id _self) { return nil; });
	method_setImplementation(getter, none);
}

// +load runs before main, which is early enough only if WebKit's classes are
// registered by then. They normally are — the target links WebKit — but the
// launch notification is a guaranteed second chance, and running the swizzle
// twice costs nothing.
+ (void)load {
	EchoRemoveInputAccessory();
	[[NSNotificationCenter defaultCenter]
		addObserverForName:UIApplicationDidFinishLaunchingNotification
					object:nil
					 queue:nil
				usingBlock:^(NSNotification *note) { EchoRemoveInputAccessory(); }];
}

@end
