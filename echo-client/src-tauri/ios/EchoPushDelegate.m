// Catches the APNs device token, which is delivered somewhere the plugin cannot
// reach.
//
// `registerForRemoteNotifications` answers through the *app delegate* —
// `application:didRegisterForRemoteNotificationsWithDeviceToken:` — and Tauri
// generates and owns that delegate. There is no subclass to write and no
// forwarding hook in the Tauri Swift API (checked: gen/apple/TauriAPI has no
// app-delegate plumbing at all).
//
// So the methods are added to whatever class the delegate turns out to be, at
// runtime, and the result is republished through NSNotificationCenter.
// PushPlugin.swift listens for that and never has to know where it came from.
// This is the same channel EchoInputAccessory.m uses to patch UIKit — a file in
// src-tauri/ios/ that scripts/ios-native.sh copies into the app target.
//
// Ordering matters and is why this runs from `didFinishLaunching` rather than
// `+load`: at `+load` the delegate does not exist yet, and the methods have to
// be in place before anything calls registerForRemoteNotifications.

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

NSString *const EchoDidRegisterForRemoteNotifications = @"EchoDidRegisterForRemoteNotifications";
NSString *const EchoDidFailToRegisterForRemoteNotifications =
	@"EchoDidFailToRegisterForRemoteNotifications";

// APNs addresses a device by the hex form of the token. `Data.description` is
// not it — it has been a bracketed dump, and on newer OSes an opaque one.
static NSString *EchoHexFromToken(NSData *token) {
	const unsigned char *bytes = token.bytes;
	NSMutableString *hex = [NSMutableString stringWithCapacity:token.length * 2];
	for (NSUInteger i = 0; i < token.length; i++) {
		[hex appendFormat:@"%02x", bytes[i]];
	}
	return hex;
}

static void EchoDidRegister(id self, SEL _cmd, UIApplication *app, NSData *token) {
	[[NSNotificationCenter defaultCenter]
		postNotificationName:EchoDidRegisterForRemoteNotifications
					  object:nil
					userInfo:@{@"token": EchoHexFromToken(token)}];
}

static void EchoDidFail(id self, SEL _cmd, UIApplication *app, NSError *error) {
	[[NSNotificationCenter defaultCenter]
		postNotificationName:EchoDidFailToRegisterForRemoteNotifications
					  object:nil
					userInfo:@{@"error": error.localizedDescription ?: @"unknown"}];
}

@interface EchoPushDelegatePatch : NSObject
@end

@implementation EchoPushDelegatePatch

+ (void)install {
	id delegate = UIApplication.sharedApplication.delegate;
	if (delegate == nil) return;
	Class cls = object_getClass(delegate);

	struct {
		SEL selector;
		IMP implementation;
	} methods[] = {
		{@selector(application:didRegisterForRemoteNotificationsWithDeviceToken:),
		 (IMP)EchoDidRegister},
		{@selector(application:didFailToRegisterForRemoteNotificationsWithError:),
		 (IMP)EchoDidFail},
	};

	for (size_t i = 0; i < sizeof(methods) / sizeof(methods[0]); i++) {
		// "v@:@@" — returns void, takes (self, _cmd, UIApplication *, id).
		if (!class_addMethod(cls, methods[i].selector, methods[i].implementation, "v@:@@")) {
			// Only reachable if Tauri's delegate starts implementing these
			// itself, in which case its version wins and no token ever reaches
			// the plugin. Loud on purpose: the symptom otherwise is a silent
			// absence of notifications.
			NSLog(@"[echo-push] %@ already implements %@ — token will not be forwarded",
				  NSStringFromClass(cls), NSStringFromSelector(methods[i].selector));
		}
	}
}

+ (void)load {
	[[NSNotificationCenter defaultCenter]
		addObserverForName:UIApplicationDidFinishLaunchingNotification
					object:nil
					 queue:[NSOperationQueue mainQueue]
				usingBlock:^(NSNotification *note) { [EchoPushDelegatePatch install]; }];
}

@end
