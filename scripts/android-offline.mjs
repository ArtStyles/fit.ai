import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2] ?? 'debug'
if (!['debug', 'release'].includes(mode)) throw new Error('Use debug or release.')
const android = resolve(root, 'android')
const env = { ...process.env }
if (process.platform === 'win32') {
  const bundledJava = 'C:/Program Files/Android/Android Studio/jbr'
  const sdk = resolve(env.LOCALAPPDATA ?? '', 'Android/Sdk')
  if (!env.JAVA_HOME && existsSync(resolve(bundledJava, 'bin/java.exe'))) env.JAVA_HOME = bundledJava
  if (!env.ANDROID_HOME && existsSync(sdk)) env.ANDROID_HOME = sdk
  if (!env.ANDROID_SDK_ROOT && env.ANDROID_HOME) env.ANDROID_SDK_ROOT = env.ANDROID_HOME
  // Windows packaged hosts can redirect TEMP in a way incompatible with Java's
  // Unix-domain wakeup pipe. Both Gradle client and daemon need a real directory.
  if (!env.JAVA_TOOL_OPTIONS?.includes('-Djdk.net.unixdomain.tmpdir=')) {
    const socketDirectory = resolve(root, '.artifacts/java-tmp')
    mkdirSync(socketDirectory, { recursive: true })
    env.JAVA_TOOL_OPTIONS = `${env.JAVA_TOOL_OPTIONS ?? ''} "-Djdk.net.unixdomain.tmpdir=${socketDirectory.replaceAll('\\', '/')}"`.trim()
  }
}
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd, env, stdio: 'inherit', windowsHide: true,
    // cmd /s /c receives its already quoted batch command as one command line.
    windowsVerbatimArguments: process.platform === 'win32' && command === 'cmd.exe',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run(process.execPath, [resolve(root, 'scripts/prepare-mobile.mjs')])
run(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'mobile/vite.config.ts'])
run(process.execPath, [resolve(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android'])
const config = JSON.parse(readFileSync(resolve(android, 'app/src/main/assets/capacitor.config.json'), 'utf8'))
if (config.server?.url || config.webDir !== 'mobile/dist') throw new Error('Refusing to build an Android package with a remote app loader.')
if (mode === 'release' && !existsSync(resolve(android, 'keystore.properties'))) {
  throw new Error('Release signing configuration is missing. Restore the original signing files; do not create a replacement key.')
}
const tasks = ['testDebugUnitTest', mode === 'release' ? 'assembleRelease' : 'assembleDebug', '--console=plain', '--max-workers=2']
if (process.platform === 'win32') run('cmd.exe', ['/d', '/s', '/c', `""${resolve(android, 'gradlew.bat')}" ${tasks.join(' ')}"`], android)
else run(resolve(android, 'gradlew'), tasks, android)
