#!/bin/sh
# Copies the hand-written native iOS sources into the generated Xcode project.
#
# src-tauri/gen/ is gitignored wholesale — the generated project.pbxproj carries
# DEVELOPMENT_TEAM, which is per-developer (see src-tauri/.gitignore). So
# anything hand-written for the native side lives in src-tauri/ios/, which is
# committed, and is copied in from there.
#
# No project.yml edit is needed: it lists `Sources` as a directory, so xcodegen
# picks up whatever happens to be sitting in it. What matters is that the copy
# runs *before* the project is generated, which is why every ios:* script goes
# through here first. Creating the directory when it does not exist yet lets
# this run ahead of the very first `tauri ios init` too.
#
# Only the top level of src-tauri/ios/ is copied: BroadcastExtension/ belongs to
# the extension target, which project.yml points at directly, and compiling its
# SampleHandler into the app as well would be an error.
set -e

cd "$(dirname "$0")/.."

dest=src-tauri/gen/apple/Sources/app
mkdir -p "$dest"
cp src-tauri/ios/*.m src-tauri/ios/*.swift "$dest/"

echo "[ios-native] copied src-tauri/ios/*.{m,swift} -> $dest/"
