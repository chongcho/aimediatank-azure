#!/usr/bin/env node
/**
 * Ensure Android native shell settings after `npx cap sync`.
 * - Play Store applicationId com.aimediatank.app
 * - MainActivity registers ConnectionService phone account
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const buildGradle = path.join(root, 'android', 'app', 'build.gradle')
const mainActivity = path.join(
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

const mainActivitySource = `package com.aimediatank.apple;

import android.os.Bundle;
import com.capacitor.voipcalls.VoipConnectionService;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        VoipConnectionService.registerPhoneAccount(this);
    }
}
`

if (fs.existsSync(mainActivity)) {
  const current = fs.readFileSync(mainActivity, 'utf8')
  if (!current.includes('VoipConnectionService.registerPhoneAccount')) {
    fs.writeFileSync(mainActivity, mainActivitySource)
    console.log('[setup-android-native] patched MainActivity phone account registration')
  }
}
