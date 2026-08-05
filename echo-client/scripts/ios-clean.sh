#!/bin/sh
# Drops the parts of the generated Xcode project that go stale when you switch
# build configuration, then regenerates it.
#
# `cargo-mobile2` lists Externals/ among the project's `sources`, so xcodegen
# indexes whatever static libraries happen to sit there — and each build leaves
# one behind under its own configuration (Externals/arm64/debug/libapp.a,
# Externals/arm64/release/libapp.a). Once both exist, two files named libapp.a
# land in the Resources phase and the build stops with:
#
#     error: Multiple commands produce '…/echo.app/libapp.a'
#
# Alternating `npm run ios:dev` with `npm run ios:build` is enough to hit it.
# project.yml goes too because ios:init keeps an existing one, which would
# otherwise preserve the duplicate entries.
#
# If a build still fails right after this, the stale piece is Xcode's own build
# description rather than the project:
#     rm -rf ~/Library/Developer/Xcode/DerivedData/app-*
set -e

cd "$(dirname "$0")/.."

rm -rf src-tauri/gen/apple/Externals
rm -f src-tauri/gen/apple/project.yml

echo "[ios-clean] removed Externals/ and project.yml — regenerating"
sh scripts/ios-native.sh
exec sh scripts/with-env.sh tauri ios init
