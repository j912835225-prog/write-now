#!/bin/bash
# Build Write Now.app and a DMG into dist/ (macOS, Apple silicon).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=0.3.0
BUILD=4
export RUSTFLAGS="--remap-path-prefix=$PWD=. --remap-path-prefix=$HOME=~"
cargo build --release

APP="dist/Write Now.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp target/release/script-paper "$APP/Contents/MacOS/"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>zh_CN</string>
  <key>CFBundleDisplayName</key><string>Write Now</string>
  <key>CFBundleName</key><string>Write Now</string>
  <key>CFBundleExecutable</key><string>script-paper</string>
  <key>CFBundleIdentifier</key><string>local.mz.write-now</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleLocalizations</key><array><string>zh_CN</string><string>en</string><string>ja</string></array>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUILD</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>CFBundleDocumentTypes</key>
  <array>
    <dict>
      <key>CFBundleTypeName</key><string>Fountain 剧本</string>
      <key>CFBundleTypeRole</key><string>Editor</string>
      <key>LSHandlerRank</key><string>Owner</string>
      <key>LSItemContentTypes</key><array><string>io.fountain.screenplay</string></array>
    </dict>
    <dict>
      <key>CFBundleTypeName</key><string>纯文本</string>
      <key>CFBundleTypeRole</key><string>Editor</string>
      <key>LSHandlerRank</key><string>Alternate</string>
      <key>LSItemContentTypes</key><array><string>public.plain-text</string><string>net.daringfireball.markdown</string></array>
    </dict>
  </array>
  <key>UTImportedTypeDeclarations</key>
  <array>
    <dict>
      <key>UTTypeConformsTo</key><array><string>public.plain-text</string></array>
      <key>UTTypeDescription</key><string>Fountain 剧本</string>
      <key>UTTypeIdentifier</key><string>io.fountain.screenplay</string>
      <key>UTTypeTagSpecification</key>
      <dict><key>public.filename-extension</key><array><string>fountain</string></array></dict>
    </dict>
  </array>
</dict>
</plist>
PLIST
codesign --force --sign - "$APP"

STAGE=$(mktemp -d)
ditto "$APP" "$STAGE/Write Now.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "Write Now" -srcfolder "$STAGE" -format UDZO -ov "dist/Write-Now-$VERSION-arm64.dmg"
echo "dist/Write-Now-$VERSION-arm64.dmg"
