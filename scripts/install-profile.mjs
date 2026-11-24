#!/usr/bin/env node
/**
 * Install a dsh-prompt-rewriter tarball into the desktop profile.
 *
 * Why this exists: the profile used to unpack every build into a new
 * `dsh-prompt-rewriter-<version>` directory and repoint the node_modules
 * symlink. The running Host keeps watching the client bundle path it resolved
 * at startup (`dsh-client-hmr` stats that path every 500ms), so a new directory
 * is invisible until the whole app restarts.
 *
 * This installer keeps one stable directory (`dsh-prompt-rewriter-live`) and
 * overwrites files in place. A changed `client.js` is picked up by the running
 * Host and hot-reloaded; only Host-side files still need a restart.
 *
 * Usage:
 *   node scripts/install-profile.mjs --tgz dist/dsh-prompt-rewriter-1.10.0-dev.9.tgz
 *   node scripts/install-profile.mjs --status
 *   node scripts/install-profile.mjs --rollback 1.10.0-dev.8
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const LIVE_NAME = 'dsh-prompt-rewriter-live'
const PLUGIN_NAME = 'dsh-prompt-rewriter'
/** Host-side modules: loaded by the Host process once, never hot-reloaded here. */
const HOST_FILES = new Set(['index.js', 'legacy-rules.mjs', 'intent-first-rules.mjs', 'workbuddy-rules.mjs', 'cordis.patch.yml'])
/** package.json fields that decide module wiring; changing them needs a Host restart. */
const WIRING_KEYS = ['dsh', 'exports', 'dependencies', 'peerDependencies', 'engines', 'type']

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next
      i += 1
    } else {
      out[key] = true
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const defaultProfile = process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'desktop')
const profile = resolve(args.profile ?? defaultProfile)
const isDefaultProfile = resolve(profile) === resolve(defaultProfile)
const webUrl = (process.env.DSH_WEB_URL ?? 'http://127.0.0.1:5123').replace(/\/+$/u, '')
const live = join(profile, LIVE_NAME)
const link = join(profile, 'node_modules', PLUGIN_NAME)
const profilePkgPath = join(profile, 'package.json')
const lockPath = join(profile, 'pnpm-lock.yaml')
const wantDep = `link:${LIVE_NAME}`

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const log = (line) => console.log(`[install] ${line}`)

function stamp() {
  return new Date().toISOString().replace(/[:.]/gu, '-')
}

function backup(file) {
  if (!existsSync(file)) return
  const dest = `${file}.bak-${stamp()}`
  copyFileSync(file, dest)
  log(`backup ${relative(profile, file)} -> ${relative(profile, dest)}`)
}

/** All regular files under `dir`, as paths relative to it (no node_modules). */
function listFiles(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) listFiles(full, base, acc)
    else if (entry.isFile()) acc.push(relative(base, full))
  }
  return acc
}

function copyDir(from, to) {
  for (const rel of listFiles(from)) {
    const dest = join(to, rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(from, rel), dest)
  }
}

/** Mirror `src` into `dest` in place: changed files are copied, stale files removed. */
function syncDir(src, dest) {
  const srcFiles = new Set(listFiles(src))
  const changed = []
  for (const rel of srcFiles) {
    const from = join(src, rel)
    const to = join(dest, rel)
    if (existsSync(to) && sha256(from) === sha256(to)) continue
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
    changed.push(rel)
  }
  const removed = []
  for (const rel of listFiles(dest)) {
    if (srcFiles.has(rel)) continue
    rmSync(join(dest, rel), { force: true })
    removed.push(rel)
  }
  return { changed, removed }
}

function wiringOf(pkg) {
  if (pkg === null) return 'null'
  const take = {}
  for (const key of WIRING_KEYS) if (key in pkg) take[key] = pkg[key]
  return JSON.stringify(take)
}

function classify(changed, previousPkg, nextPkg) {
  const host = changed.filter((rel) => HOST_FILES.has(rel))
  if (wiringOf(previousPkg) !== wiringOf(nextPkg)) host.push('package.json (module wiring)')
  return host
}

/** Keep the previous live content as a rollback directory when the version changes. */
function snapshotLive(previousPkg) {
  if (previousPkg === null || typeof previousPkg.version !== 'string') return null
  const dest = join(profile, `${PLUGIN_NAME}-${previousPkg.version}`)
  if (existsSync(join(dest, 'package.json'))) return null
  copyDir(live, dest)
  log(`snapshot ${previousPkg.version} -> ${relative(profile, dest)} (rollback)`)
  return dest
}

function resolveLinkTarget() {
  if (!existsSync(link)) return null
  try {
    return realpathSync(link)
  } catch {
    return null
  }
}

function relink() {
  if (existsSync(link)) {
    const st = lstatSync(link)
    if (st.isSymbolicLink()) unlinkSync(link)
    else rmSync(link, { recursive: true, force: true })
  }
  symlinkSync(live, link, 'junction')
  log(`symlink node_modules/${PLUGIN_NAME} -> ${LIVE_NAME}`)
}

function updateProfileManifest() {
  const pkg = readJson(profilePkgPath)
  pkg.dependencies ??= {}
  if (pkg.dependencies[PLUGIN_NAME] === wantDep) return false
  backup(profilePkgPath)
  pkg.dependencies[PLUGIN_NAME] = wantDep
  writeFileSync(profilePkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  log(`package.json dependency ${PLUGIN_NAME}=${wantDep}`)
  return true
}

function updateLock() {
  if (!existsSync(lockPath)) return false
  const text = readFileSync(lockPath, 'utf8')
  const block = /(\n      dsh-prompt-rewriter:\n        specifier: )[^\n]+(\n        version: )[^\n]+/u
  if (!block.test(text)) {
    log('pnpm-lock.yaml: plugin importer entry not found; left unchanged')
    return false
  }
  const next = text.replace(block, `$1${wantDep}$2${wantDep}`)
  if (next === text) return false
  backup(lockPath)
  writeFileSync(lockPath, next)
  log(`pnpm-lock.yaml ${PLUGIN_NAME}=${wantDep}`)
  return true
}

function artifactRevision(stat) {
  const parts = [String(stat.mtimeMs), String(stat.ctimeMs), String(stat.size)]
  const hash = createHash('sha1').update('plugin-artifact').update('\0')
  for (const part of parts) hash.update(`${Buffer.byteLength(part)}:`).update(part)
  return hash.digest('hex').slice(0, 12)
}

/** First `dsh-prompt-rewriter` row revision from the Host's /plugins/events stream. */
async function runningRevision(timeoutMs = 4000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${webUrl}/plugins/events`, {
      headers: { accept: 'text/event-stream' },
      signal: controller.signal,
    })
    if (!res.ok || !res.body) return { error: `HTTP ${res.status}` }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let end
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const line = raw.split('\n').find((part) => part.startsWith('data: '))
          if (!line) continue
          let frame
          try { frame = JSON.parse(line.slice(6)) } catch { continue }
          if (frame.type !== 'graph') continue
          const row = frame.graph?.entries?.find?.((entry) => entry.id === PLUGIN_NAME)
          if (row) return { rev: row.rev }
        }
      }
    } finally {
      reader.cancel().catch(() => {})
    }
    return { error: 'no graph frame' }
  } catch (error) {
    return { error: error.name === 'AbortError' ? 'timeout' : error.message }
  } finally {
    clearTimeout(timer)
  }
}

/** Start time of the running DSH main process, or null when it cannot be read. */
function hostProcessStart() {
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Sort-Object StartTime | Select-Object -First 1 | ForEach-Object { $_.StartTime.ToString('o') }",
    ], { encoding: 'utf8', timeout: 8000 }).trim()
    const ms = out ? Date.parse(out) : Number.NaN
    return Number.isNaN(ms) ? null : ms
  } catch {
    return null
  }
}

/** Host-side files in live that are newer than the running process (i.e. written after it started). */
function pendingHostFiles(startMs) {
  if (!isDefaultProfile || startMs === null) return []
  const pending = []
  for (const rel of HOST_FILES) {
    const file = join(live, rel)
    if (!existsSync(file)) continue
    if (statSync(file).ctimeMs > startMs) pending.push(rel)
  }
  return pending
}

/** Find a versioned directory whose client.js matches `rev` (evidence for which build runs). */
function matchVersionByRevision(rev) {
  const matches = []
  for (const entry of readdirSync(profile, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${PLUGIN_NAME}-1.`)) continue
    if (lstatSync(join(profile, entry.name)).isSymbolicLink()) continue
    const file = join(profile, entry.name, 'client.js')
    if (!existsSync(file)) continue
    if (artifactRevision(statSync(file)) === rev) matches.push(entry.name.replace(`${PLUGIN_NAME}-`, ''))
  }
  return matches
}

async function status() {
  const dep = readJson(profilePkgPath).dependencies?.[PLUGIN_NAME] ?? '(absent)'
  const target = resolveLinkTarget()
  const liveVersion = existsSync(join(live, 'package.json')) ? readJson(join(live, 'package.json')).version : '(missing)'
  log(`profile=${profile}`)
  log(`web=${webUrl}`)
  log(`dependency=${dep}`)
  log(`node_modules target=${target ?? '(missing)'}`)
  log(`live version=${liveVersion}`)
  if (!existsSync(join(live, 'client.js'))) {
    log('RESTART_REQUIRED=yes (live bundle missing)')
    return 0
  }
  const liveRev = artifactRevision(statSync(join(live, 'client.js')))
  const running = await runningRevision()
  const hostPending = pendingHostFiles(hostProcessStart())
  log(`live client rev=${liveRev}`)
  log(`running client rev=${running.rev ?? `(unknown: ${running.error})`}`)
  if (hostPending.length > 0) log(`host code pending restart=${hostPending.join(', ')}`)
  if (running.rev === undefined) {
    log('RESTART_REQUIRED=unknown (could not read the running graph)')
    return 0
  }
  if (running.rev === liveRev) {
    const need = hostPending.length > 0
    log(need
      ? `RESTART_REQUIRED=yes (host-side pending: ${hostPending.join(', ')})`
      : 'RESTART_REQUIRED=no (the running Host already serves the live bundle)')
    log(`本次需要重启：${need ? '是' : '否'}`)
    return 0
  }
  const matches = matchVersionByRevision(running.rev)
  log(`running bundle matches=${matches.length > 0 ? matches.join(', ') : '(unknown build)'}`)
  log(`RESTART_REQUIRED=yes (the running Host still serves an older bundle${hostPending.length > 0 ? `; host-side pending: ${hostPending.join(', ')}` : ''})`)
  log('本次需要重启：是')
  return 0
}

function rollback(version) {
  const source = join(profile, `${PLUGIN_NAME}-${version}`)
  if (!existsSync(join(source, 'client.js'))) {
    const available = readdirSync(profile)
      .filter((name) => name.startsWith(`${PLUGIN_NAME}-1.`))
      .map((name) => name.replace(`${PLUGIN_NAME}-`, ''))
      .sort()
    log(`rollback source missing: ${source}`)
    log(`available: ${available.join(', ')}`)
    return 1
  }
  if (realpathSync(source) === realpathSync(live)) {
    log(`rollback source is a junction to live; use ${PLUGIN_NAME}-${version}-snapshot instead`)
    return 1
  }
  const previousPkg = readJson(join(live, 'package.json'))
  const { changed, removed } = syncDir(source, live)
  const nextPkg = readJson(join(live, 'package.json'))
  const host = classify(changed, previousPkg, nextPkg)
  log(`rolled back live to ${nextPkg.version} from ${relative(profile, source)}`)
  log(`changed=${changed.join(', ') || '(none)'} removed=${removed.join(', ') || '(none)'}`)
  log(host.length === 0 ? 'RESTART_REQUIRED=no (client bundle only; refresh or wait for the hot reload)' : `RESTART_REQUIRED=yes (host-side: ${host.join(', ')})`)
  log(`本次需要重启：${host.length === 0 ? '否' : '是'}`)
  return 0
}

function install(tgz) {
  if (!tgz) {
    log('usage: node scripts/install-profile.mjs --tgz <package.tgz> | --status | --rollback <version>')
    return 1
  }
  const tgzPath = resolve(tgz)
  if (!existsSync(tgzPath)) {
    log(`tarball missing: ${tgzPath}`)
    return 1
  }
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-pe-install-'))
  try {
    execFileSync('tar', ['-xzf', tgzPath, '-C', tmp], { stdio: 'pipe' })
    const src = join(tmp, 'package')
    const nextPkg = readJson(join(src, 'package.json'))
    if (nextPkg.name !== PLUGIN_NAME) {
      log(`unexpected package name: ${nextPkg.name}`)
      return 1
    }
    log(`package ${nextPkg.name}@${nextPkg.version} from ${tgzPath}`)

    let migration = false
    const linkedBefore = resolveLinkTarget()
    if (!existsSync(live)) {
      if (linkedBefore) {
        copyDir(linkedBefore, live)
        log(`seeded ${LIVE_NAME} from ${relative(profile, linkedBefore)}`)
      } else {
        mkdirSync(live, { recursive: true })
      }
      migration = true
    }

    const previousPkg = existsSync(join(live, 'package.json')) ? readJson(join(live, 'package.json')) : null
    const wasLive = resolveLinkTarget() === realpathSync(live)

    if (!wasLive) {
      relink()
      migration = true
    }
    if (updateProfileManifest()) migration = true
    if (updateLock()) migration = true
    if (previousPkg !== null && previousPkg.version !== nextPkg.version) snapshotLive(previousPkg)

    const { changed, removed } = syncDir(src, live)
    const host = classify(changed, previousPkg, nextPkg)
    log(`live=${LIVE_NAME} version ${previousPkg?.version ?? '(none)'} -> ${nextPkg.version}`)
    log(`changed=${changed.join(', ') || '(none)'}`)
    if (removed.length > 0) log(`removed=${removed.join(', ')}`)

    const hostPending = pendingHostFiles(hostProcessStart())
    if (migration) {
      log('RESTART_REQUIRED=yes')
      log('reason: first migration to the fixed live directory (or link/dependency changed);')
      log('        the running Host still watches the old version directory. One restart only.')
    } else if (host.length > 0) {
      log('RESTART_REQUIRED=yes')
      log(`reason: this update changes host-side files: ${host.join(', ')}`)
      log('        the client bundle was hot-reloaded, but index.js is already loaded in the Host process.')
    } else {
      log('RESTART_REQUIRED=no')
      log('reason: this update changes client bundle/runtime-read files only; dsh-client-hmr reloads it')
      log('        within ~0.5s, and a page refresh serves the same new bundle.')
    }
    if (!migration && host.length === 0 && hostPending.length > 0) {
      log(`HOST_CODE_PENDING=yes (${hostPending.join(', ')})`)
      log('note: an earlier install changed host-side files; a restart is still needed to apply those.')
    }
    log(`本次需要重启：${migration || host.length > 0 ? '是' : '否'}`)
    const currentVersion = previousPkg?.version
    log(`rollback: node scripts/install-profile.mjs --rollback ${currentVersion ?? '<version>'}`)
    return 0
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (args.status) process.exit(await status())
else if (typeof args.rollback === 'string') process.exit(rollback(args.rollback))
else process.exit(install(args.tgz))
