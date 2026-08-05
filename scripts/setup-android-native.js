#!/usr/bin/env node
/**
 * Ensure Android native shell settings after `npx cap sync`.
 * - Play Store applicationId com.aimediatank.app
 * - MainActivity package matches namespace (required or launcher crashes)
 * - MainActivity registers ConnectionService phone account
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const buildGradle = path.join(root, 'android', 'app', 'build.gradle')
const mainActivityApp = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'aimediatank',
  'app',
  'MainActivity.java',
)
const mainActivityApple = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'aimediatank',
  'apple',
  'MainActivity.java',
)
const stringsXml = path.join(root, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml')

if (!fs.existsSync(buildGradle)) {
  console.warn('[setup-android-native] android/app/build.gradle not found; run npx cap add android')
  process.exit(0)
}

let gradle = fs.readFileSync(buildGradle, 'utf8')
if (gradle.includes('applicationId "com.aimediatank.apple"')) {
  gradle = gradle
    .replace('namespace = "com.aimediatank.apple"', 'namespace = "com.aimediatank.app"')
    .replace('applicationId "com.aimediatank.apple"', 'applicationId "com.aimediatank.app"')
  fs.writeFileSync(buildGradle, gradle)
  console.log('[setup-android-native] set applicationId com.aimediatank.app')
}

const mainActivitySource = `package com.aimediatank.app;

import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import com.capacitor.voipcalls.VoipConnectionService;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "AiMediaTank";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerVoipPhoneAccountSafely();
    }

    private void registerVoipPhoneAccountSafely() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        try {
            VoipConnectionService.Companion.registerPhoneAccount(this);
        } catch (Exception e) {
            Log.w(TAG, "Phone account registration skipped", e);
        }
    }
}
`

fs.mkdirSync(path.dirname(mainActivityApp), { recursive: true })

if (fs.existsSync(mainActivityApple)) {
  fs.unlinkSync(mainActivityApple)
  console.log('[setup-android-native] removed legacy com.aimediatank.apple.MainActivity')
}

const current = fs.existsSync(mainActivityApp) ? fs.readFileSync(mainActivityApp, 'utf8') : ''
const hasPhoneAccountMethod = current.includes('registerVoipPhoneAccountSafely')
// Method alone is not enough — 1.0.66 kept the helper but dropped the onCreate call,
// which broke ConnectionService incoming-call UI.
// Require trailing `;` so we match a call site, not the method definition
// (`private void registerVoipPhoneAccountSafely() {`) later in the file.
const phoneAccountRegisteredOnCreate =
  /void\s+onCreate\s*\([^)]*\)\s*\{[\s\S]*?registerVoipPhoneAccountSafely\s*\(\s*\)\s*;/.test(current)
if (!hasPhoneAccountMethod) {
  fs.writeFileSync(mainActivityApp, mainActivitySource)
  console.log('[setup-android-native] patched MainActivity at com.aimediatank.app')
} else if (current.includes('package com.aimediatank.apple')) {
  fs.writeFileSync(mainActivityApp, mainActivitySource)
  console.log('[setup-android-native] fixed MainActivity package com.aimediatank.app')
} else if (!phoneAccountRegisteredOnCreate) {
  let fixed = current
  if (
    fixed.includes('syncIncomingCallPresentation(getIntent());') &&
    !fixed.includes('registerVoipPhoneAccountSafely();')
  ) {
    fixed = fixed.replace(
      'syncIncomingCallPresentation(getIntent());',
      'syncIncomingCallPresentation(getIntent());\n        registerVoipPhoneAccountSafely();',
    )
  } else if (
    fixed.includes('super.onCreate(savedInstanceState);') &&
    !/registerVoipPhoneAccountSafely\s*\(\s*\)\s*;/.test(fixed)
  ) {
    fixed = fixed.replace(
      'super.onCreate(savedInstanceState);',
      'super.onCreate(savedInstanceState);\n        registerVoipPhoneAccountSafely();',
    )
  }
  if (fixed !== current && /registerVoipPhoneAccountSafely\s*\(\s*\)\s*;/.test(fixed)) {
    fs.writeFileSync(mainActivityApp, fixed)
    console.log('[setup-android-native] restored registerVoipPhoneAccountSafely() in onCreate')
  } else {
    console.warn(
      '[setup-android-native] MainActivity missing registerVoipPhoneAccountSafely() in onCreate — incoming call UI will fail',
    )
  }
} else if (!current.includes('applySystemBars')) {
  console.warn(
    '[setup-android-native] MainActivity missing applySystemBars() — status bar may be hidden; update MainActivity.java',
  )
}

if (fs.existsSync(stringsXml)) {
  let strings = fs.readFileSync(stringsXml, 'utf8')
  if (strings.includes('com.aimediatank.apple')) {
    strings = strings
      .replace(/com\.aimediatank\.apple/g, 'com.aimediatank.app')
    fs.writeFileSync(stringsXml, strings)
    console.log('[setup-android-native] updated strings.xml package_name')
  }
}

const rootBuildGradle = path.join(root, 'android', 'build.gradle')
const variablesGradle = path.join(root, 'android', 'variables.gradle')

if (fs.existsSync(rootBuildGradle)) {
  let rootGradle = fs.readFileSync(rootBuildGradle, 'utf8')
  if (!rootGradle.includes('kotlin-gradle-plugin')) {
    rootGradle = rootGradle.replace(
      "classpath 'com.google.gms:google-services:4.4.4'",
      "classpath 'com.google.gms:google-services:4.4.4'\n        classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion\"",
    )
    if (!rootGradle.includes('ext.kotlinVersion')) {
      rootGradle = rootGradle.replace(
        'buildscript {',
        "buildscript {\n    ext.kotlinVersion = '2.0.21'",
      )
    }
    fs.writeFileSync(rootBuildGradle, rootGradle)
    console.log('[setup-android-native] added Kotlin Gradle plugin for capacitor-push-calls')
  }
}

if (fs.existsSync(variablesGradle)) {
  let vars = fs.readFileSync(variablesGradle, 'utf8')
  if (!vars.includes('kotlinVersion')) {
    vars = vars.replace('ext {', "ext {\n    kotlinVersion = '2.0.21'")
    fs.writeFileSync(variablesGradle, vars)
    console.log('[setup-android-native] set kotlinVersion in variables.gradle')
  }
}

// Keep https App Links intent-filter verified for aimediatank.com (Play Deep Links).
const androidManifest = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
if (fs.existsSync(androidManifest)) {
  let manifest = fs.readFileSync(androidManifest, 'utf8')
  const deepLinkFilter =
    /(<intent-filter)(>\s*<action android:name="android\.intent\.action\.VIEW" \/>\s*<category android:name="android\.intent\.category\.DEFAULT" \/>\s*<category android:name="android\.intent\.category\.BROWSABLE" \/>\s*<data android:scheme="https" android:host="aimediatank\.com" \/>\s*<\/intent-filter>)/
  if (deepLinkFilter.test(manifest) && !manifest.includes('android:autoVerify="true"')) {
    manifest = manifest.replace(deepLinkFilter, '$1 android:autoVerify="true"$2')
    fs.writeFileSync(androidManifest, manifest)
    console.log('[setup-android-native] set autoVerify on App Links intent-filter')
  }
}

