#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
android_sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
android_java="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
gradle_cache="${GRADLE_USER_HOME:-$HOME/.gradle}"

if [ ! -x "$android_sdk/platform-tools/adb" ]; then
  printf '%s\n' "Android SDK not found at: $android_sdk" >&2
  exit 1
fi

export ANDROID_HOME="$android_sdk"
export JAVA_HOME="$android_java"
export GRADLE_USER_HOME="$gradle_cache"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

cd "$project_root/mobile"
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleDebug --no-daemon

mkdir -p "$project_root/artifacts"
cp app/build/outputs/apk/debug/app-debug.apk "$project_root/artifacts/qingzhi-fatlosshelper-debug.apk"
printf '%s\n' "APK: $project_root/artifacts/qingzhi-fatlosshelper-debug.apk"
