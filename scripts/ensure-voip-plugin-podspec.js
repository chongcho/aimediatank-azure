#!/usr/bin/env node
/**
 * @kapsula-chat/capacitor-push-calls ships SPM only (Package.swift).
 * CocoaPods needs KapsulaChatCapacitorPushCalls.podspec in the package root.
 */
const fs = require('fs')
const path = require('path')

const pluginDir = path.join(
  __dirname,
  '..',
  'node_modules',
  '@kapsula-chat',
  'capacitor-push-calls'
)
const podspecPath = path.join(pluginDir, 'KapsulaChatCapacitorPushCalls.podspec')

if (!fs.existsSync(pluginDir)) {
  console.warn('[ensure-voip-plugin-podspec] plugin not installed; skip')
  process.exit(0)
}

if (fs.existsSync(podspecPath)) {
  console.log('[ensure-voip-plugin-podspec] podspec already present')
  process.exit(0)
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8')
)

const podspec = `Pod::Spec.new do |s|
  s.name = 'KapsulaChatCapacitorPushCalls'
  s.version = '${pkg.version}'
  s.summary = '${(pkg.description || 'Capacitor VoIP and push plugin').replace(/'/g, "\\\\'")}'
  s.license = '${pkg.license || 'MIT'}'
  s.homepage = 'https://www.npmjs.com/package/@kapsula-chat/capacitor-push-calls'
  s.authors = { 'Kapsula Chat' => 'support@kapsula.chat' }
  s.source = { :path => '.' }
  s.source_files = 'ios/Plugin/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
`

fs.writeFileSync(podspecPath, podspec)
console.log('[ensure-voip-plugin-podspec] wrote', podspecPath)
