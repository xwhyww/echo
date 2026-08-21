# Firebase Messaging resolves the service and its callbacks reflectively, so R8
# must not rename or strip them. Without this a release build registers, gets a
# token, and then silently never delivers a message.
-keep class com.google.firebase.** { *; }
-keep class com.echo.plugin.push.** { *; }
