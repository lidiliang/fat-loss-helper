#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mobile_dir="$project_root/mobile"
android_dir="$mobile_dir/android"
app_config="$mobile_dir/app.json"
android_sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
android_java="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
gradle_cache="${GRADLE_USER_HOME:-$HOME/.gradle}"
api_url="${EXPO_PUBLIC_API_URL:-https://fat-loss-helper.iepose.cn/api/v1}"

if [ "$#" -ne 0 ] && [ "$#" -ne 2 ]; then
  printf '%s\n' "用法: $0 [版本号 versionCode]" >&2
  printf '%s\n' "示例: $0 1.1.6 9" >&2
  exit 2
fi

if [ "$#" -eq 2 ]; then
  node -e '
    const fs = require("fs");
    const [file, version, rawCode] = process.argv.slice(1);
    const code = Number(rawCode);
    if (!/^\d+\.\d+\.\d+$/.test(version) || !Number.isInteger(code) || code <= 0) {
      throw new Error("版本号需为 x.y.z，versionCode 需为正整数");
    }
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    config.expo.version = version;
    config.expo.android.versionCode = code;
    fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  ' "$app_config" "$1" "$2"
fi

if [ ! -d "$mobile_dir/node_modules" ]; then
  printf '%s\n' "缺少 mobile/node_modules，请先在 mobile 目录执行 npm install。" >&2
  exit 1
fi
if [ ! -d "$android_sdk" ]; then
  printf '%s\n' "Android SDK 不存在: $android_sdk" >&2
  exit 1
fi
if [ ! -x "$android_java/bin/java" ]; then
  printf '%s\n' "Android Studio JDK 不存在: $android_java" >&2
  exit 1
fi

app_version=$(node -p "require('$app_config').expo.version")
version_code=$(node -p "require('$app_config').expo.android.versionCode")

export ANDROID_HOME="$android_sdk"
export JAVA_HOME="$android_java"
export GRADLE_USER_HOME="$gradle_cache"
export EXPO_PUBLIC_API_URL="$api_url"
export NODE_ENV=production
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

cd "$mobile_dir"
printf '%s\n' "检查 TypeScript..."
npm run typecheck

# macOS/iCloud may leave numbered conflict copies in Gradle's generated output
# (for example, "gradleResValues 3.xml"). They are disposable build products
# and otherwise make Android's resource merger fail with duplicate resources.
generated_app_dir="$android_dir/app/build/generated"
if [ -d "$generated_app_dir" ]; then
  find "$generated_app_dir" -type f \( \
    -name 'gradleResValues [0-9]*.xml' -o \
    -name 'index.android [0-9]*.bundle' \
  \) -print -delete
fi

if [ ! -x "$android_dir/gradlew" ]; then
  printf '%s\n' "首次构建：生成 Android 原生工程..."
  npx expo prebuild --platform android --no-install
else
  printf '%s\n' "复用现有 Android 原生工程和编译缓存。"
fi

# app.json is the version source of truth. Reusing the native directory avoids
# a destructive prebuild, so keep the generated Gradle values in sync here.
native_gradle="$android_dir/app/build.gradle"
perl -0pi -e "s/versionCode\s+\d+/versionCode $version_code/; s/versionName\s+\"[^\"]+\"/versionName \"$app_version\"/" "$native_gradle"

gradle_runner="$android_dir/gradlew"
cached_gradle=$(find "$gradle_cache/wrapper/dists/gradle-9.2.0-bin" -type f -path '*/gradle-9.2.0/bin/gradle' -print -quit 2>/dev/null || true)
if [ -n "$cached_gradle" ] && [ -x "$cached_gradle" ]; then
  gradle_runner="$cached_gradle"
fi

cd "$android_dir"
printf '%s\n' "构建 ARM64 release APK: v$app_version ($version_code)..."
set +e
"$gradle_runner" :app:assembleRelease \
  --offline --no-daemon \
  -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enableMinifyInReleaseBuilds=true \
  -Pandroid.enableShrinkResourcesInReleaseBuilds=true
offline_result=$?
set -e

if [ "$offline_result" -ne 0 ]; then
  printf '%s\n' "本地缓存不完整，联网补齐依赖后重试..."
  "$gradle_runner" :app:assembleRelease \
    --no-daemon \
    -PreactNativeArchitectures=arm64-v8a \
    -Pandroid.enableMinifyInReleaseBuilds=true \
    -Pandroid.enableShrinkResourcesInReleaseBuilds=true
fi

source_apk="$android_dir/app/build/outputs/apk/release/app-release.apk"
output_dir="$project_root/artifacts"
output_apk="$output_dir/qingzhi-fatlosshelper-arm64-v$app_version.apk"
if [ ! -f "$source_apk" ]; then
  printf '%s\n' "构建完成但未找到 APK: $source_apk" >&2
  exit 1
fi

mkdir -p "$output_dir"
cp "$source_apk" "$output_apk"
unzip -tq "$output_apk"

printf '\n%s\n' "APK: $output_apk"
ls -lh "$output_apk"
shasum -a 256 "$output_apk"
