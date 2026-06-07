#!/usr/bin/env bash
# Run on MacinCloud from repo root. Replaces Capacitor SPM ios/ with CocoaPods.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v pod >/dev/null 2>&1; then
  echo "Install CocoaPods first:"
  echo "  brew install cocoapods"
  exit 1
fi

echo "Removing SPM-based ios/ directory..."
rm -rf ios

echo "Ensuring VoIP plugin has a CocoaPods podspec..."
node scripts/ensure-voip-plugin-podspec.js

echo "Adding ios/ with CocoaPods..."
npx cap add ios --packagemanager CocoaPods

echo "Syncing Capacitor plugins..."
npx cap sync ios

echo "Installing pods..."
cd ios/App
pod install

echo "Testing xcodebuild can load the workspace..."
xcodebuild -list -workspace App.xcworkspace

echo "OK — commit ios/ changes, push, then run iOS TestFlight workflow."
