// Firebase Cloud Messaging registration, the Android half of PushPlugin.swift.
//
// A plain library module: Tauri's Gradle glue discovers it through the
// `.android_path("android")` in build.rs and adds it to the generated project as
// `:tauri-plugin-push`. It carries no `google-services.json` of its own — that
// file belongs to the *application*, and scripts/android.mjs copies it into the
// generated app module along with the Google Services plugin that reads it.
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.echo.plugin.push"
    compileSdk = 36
    defaultConfig {
        minSdk = 24
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation(project(":tauri-android"))
    // The BoM keeps firebase-messaging in step with whatever else Firebase gets
    // added later, so versions never have to be reconciled by hand.
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
}
