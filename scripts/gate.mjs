// Final gate: every claim in the changelog must be checkable in one run.
// Tests are run separately; this verifies the artefacts and invariants.
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import path from 'node:path';

// Resolved from this file so the gate runs from any checkout location.
const BUNDLE = path.resolve(import.meta.dirname, '..');
// Machine-specific checks (the running profile) only run on a developer machine.
const LOCAL = process.argv.includes('--local');
let failures = 0;
const check = (name, ok, detail = '') => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
	if (!ok) failures += 1;
};

// --- 1. tarball contents match the current sources -------------------------
const pkg = JSON.parse(fs.readFileSync(`${BUNDLE}/package.json`, 'utf8'));
// GATE_TGZ lets a release run gate a tarball packed elsewhere (CI, temp dir)
// without dropping a build artefact into the checkout.
const tgzPath = process.env.GATE_TGZ ?? `${BUNDLE}/dist/dsh-prompt-rewriter-${pkg.version}.tgz`;
check('tarball exists for current version', fs.existsSync(tgzPath), `${pkg.version}`);

const tar = fs.existsSync(tgzPath) ? zlib.gunzipSync(fs.readFileSync(tgzPath)) : Buffer.alloc(0);
const entries = new Map();
for (let o = 0; o + 512 <= tar.length;) {
	const header = tar.subarray(o, o + 512);
	if (header[0] === 0) break;
	const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
	const size = parseInt(header.subarray(124, 136).toString('utf8').trim() || '0', 8);
	if (name) entries.set(name, tar.subarray(o + 512, o + 512 + size));
	o += 512 + Math.ceil(size / 512) * 512;
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
for (const file of ['client.js', 'index.js', 'cordis.patch.yml', 'package.json']) {
	const inTar = entries.get('package/' + file);
	const onDisk = fs.readFileSync(`${BUNDLE}/${file}`);
	check(`tarball ${file} matches source`, inTar !== undefined && sha(inTar) === sha(onDisk));
}

// --- 2. publish whitelist: no node_modules, no scratch files --------------
const names = [...entries.keys()];
check('no node_modules in tarball', !names.some((n) => n.includes('node_modules')));
check('aggregated CHANGELOG.md is shipped', names.some((n) => n === 'package/CHANGELOG.md'));
check('no per-version changelog or scratch in tarball', !names.some((n) => /CHANGELOG-\d|\.npmcache|_old|_trace/.test(n)));
// Derived from the manifest instead of a magic number: every declared entry must
// exist in the tarball, and nothing outside the declaration may ship. npm always
// adds package.json, README.md and LICENSE regardless of `files`.
const ALWAYS_SHIPPED = ['package.json', 'README.md', 'LICENSE'];
const toRegExp = (pattern) =>
	new RegExp('^' + pattern.split('*').map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
const declared = pkg.files ?? [];
const shipped = names.map((n) => n.replace('package/', ''));
const matchers = declared.map((p) => toRegExp(p.replace(/^\.\//u, '')));
const missing = declared.filter((_, index) => !shipped.some((name) => matchers[index].test(name)));
check('every files[] entry ships', missing.length === 0, missing.join(', ') || `${declared.length} entries`);
const allowed = (name) =>
	ALWAYS_SHIPPED.includes(name) || matchers.some((matcher) => matcher.test(name));
const extras = shipped.filter((name) => !allowed(name));
check('no undeclared files in tarball', extras.length === 0, extras.join(', ') || 'clean');

// --- 2a. every relative import is packed ----------------------------------
// `npm pack` drops any module missing from files[], and the plugin then fails to
// import at all (1.8.0-dev.4 shipped this bug). Walk the import graph from the
// entry points and require each relative target to exist and to be declared.
const IMPORT_RE = /(?:^|\n)[ \t]*(?:import|export)[^'"\n]*?from[ \t]*['"]([^'"]+)['"]/gu;
const edges = [];
const visited = new Set();
const walk = (file) => {
	if (visited.has(file)) return;
	visited.add(file);
	const source = fs.readFileSync(`${BUNDLE}/${file}`, 'utf8');
	for (const match of source.matchAll(IMPORT_RE)) {
		const specifier = match[1];
		if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
		const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
		edges.push({ from: file, target });
		if (fs.existsSync(`${BUNDLE}/${target}`)) walk(target);
	}
};
for (const entry of ['index.js', 'client.js']) walk(entry);
const dangling = edges.filter((edge) => !fs.existsSync(`${BUNDLE}/${edge.target}`));
check('every relative import resolves on disk', dangling.length === 0, dangling.map((edge) => `${edge.from} -> ${edge.target}`).join(', ') || `${edges.length} edges`);
const unlisted = edges.filter((edge) => !matchers.some((matcher) => matcher.test(edge.target)));
check('every relative import is listed in files[]', unlisted.length === 0, unlisted.map((edge) => edge.target).join(', ') || `${edges.length} edges`);
const offArtefact = edges.filter((edge) => entries.size > 0 && !entries.has('package/' + edge.target));
check('every relative import ships in the tarball', offArtefact.length === 0, offArtefact.map((edge) => edge.target).join(', ') || `${edges.length} edges`);

// --- 2b. shipped changelog matches the version being packed ----------------
// The panel reads the shipped CHANGELOG.md directly, so its newest heading
// must be THIS version. This keeps the displayed release notes in sync with
// package.json without any network source. Dev builds are exempt.
const isDevBuild = pkg.version.includes('-');
const changelogSrc = fs.readFileSync(`${BUNDLE}/CHANGELOG.md`, 'utf8');
const newestHeading = /^##\s*(\d+\.\d+\.\d+)\s*$/mu.exec(changelogSrc)?.[1];
if (isDevBuild) {
	console.log('SKIP  changelog-version check (dev build)');
} else {
	check(
		'CHANGELOG.md newest version matches manifest',
		newestHeading === pkg.version,
		'changelog newest=' + String(newestHeading) + ' manifest=' + pkg.version,
	);
}

	// --- 2c. composer seat layout is decoupled from host geometry ------------
	// Regression guard: a negative margin tuned to the host gap, a container-width
	// variant, or an extreme slot order made the whale icon drift whenever another
	// plugin registered in the same list slot or the host changed its spacing.
	const clientSrcForSeat = fs.readFileSync(`${BUNDLE}/client.js`, "utf8");
	const seatRule = /'\.dsh-pe_root\{([^}]*)\}'/u.exec(clientSrcForSeat)?.[1] ?? "";
	const cssJoined = (() => {
		const block = /const CSS = \[([\s\S]*?)\]\n\t\t\t\.join/u.exec(clientSrcForSeat)?.[1] ?? '';
		return block.split('\n').filter((l) => l.trim().startsWith("'")).map((l) => l.trim().replace(/^'|',?$/gu, '')).join('');
	})();
	const seatFull = /\.dsh-pe_root\{([^}]*)\}/u.exec(cssJoined)?.[1] ?? seatRule;
	const seatOrder = /id: 'prompt-enhance', order: (-?\d+)/u.exec(clientSrcForSeat)?.[1];
	check("seat has no negative margin", !/margin-[a-z]+:-\d/u.test(seatFull), seatFull.slice(0, 110));
	check("seat owns its flex box", /flex:0 0 auto/u.test(seatFull) && /max-width:100%/u.test(seatFull));
	check("no @container override on the seat", !/@container[^\n]*\.dsh-pe_root/u.test(clientSrcForSeat));
	check("slot order is a calm value", seatOrder !== undefined && Number(seatOrder) >= 0 && Number(seatOrder) <= 100, `order=${seatOrder}`);
	const seatCss = /const CSS = \[([\s\S]*?)\]\n\t\t\t\.join/u.exec(clientSrcForSeat)?.[1] ?? '';
	const seatRules = seatCss.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
	// A small fixed visual nudge is allowed; it must stay below the host narrow gap (8px)
	// and must not be expressed as a negative margin or a container-width variant.
	const nudge = /--dsh-pe-seat-nudge,(\d+)px/u.exec(clientSrcForSeat)?.[1];
	check("visual nudge stays below host minimum gap", nudge !== undefined && Number(nudge) > 0 && Number(nudge) < 8, `nudge=${nudge}px`);
	check("nudge is a transform, not a layout margin", /transform:translateX\(var\(--dsh-pe-seat-nudge/u.test(seatFull) && !/margin-[a-z]+:-\d/u.test(seatFull));
	check("seat does not target host internals", !/standardControls|InputBar_module/u.test(seatRules));

// --- 3. twist fingerprint unchanged --------------------------------------
const clientSrc = fs.readFileSync(`${BUNDLE}/client.js`, 'utf8');
const grab = (re) => (re.exec(clientSrc) || ['MISSING'])[0];
const current = {
	twistViewBox: grab(/const TWIST_VIEWBOX = "[^"]+";/),
	twistDuration: grab(/const TWIST_DURATION_MS = \d+;/),
	twistFrames: grab(/const TWIST_FRAMES = \[[\s\S]*?\];/),
	twistCss: grab(/'\.dsh-pe_twist\{[^}]*\}',/),
	twistPathCss: grab(/'\.dsh-pe_twist path\{[^}]*\}',/),
	whaleTailFn: grab(/function WhaleTail\(\) \{[\s\S]*?\n\t\t\}/),
	keyframesFn: grab(/function twistKeyframesRule\(\) \{[\s\S]*?\n\t\t\}/),
	installStyles: grab(/function installStyles\(\) \{[\s\S]*?\n\t\t\}/),
};
const baselineDoc = JSON.parse(fs.readFileSync(path.join(BUNDLE, 'tests', 'fixtures', 'twist-baseline.json'), 'utf8'));
 const baseline = baselineDoc.hashes;
const hashes = Object.fromEntries(Object.entries(current).map(([k, v]) => [k, sha(v)]));
const changed = Object.keys(hashes).filter((k) => hashes[k] !== baseline[k]);
check('twist animation byte-identical (8 fragments)', changed.length === 0, changed.join(', ') || 'all 8 match');

// --- 4. public surface unchanged -----------------------------------------
// A four-part version (1.6.3.1) is not valid semver: npm and pnpm reject it, and any
// profile that pins it cannot install anything. Dev builds must use a prerelease
// suffix instead (1.6.4-dev.1).
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
check('version is valid semver', SEMVER.test(pkg.version), pkg.version);
check('package name unchanged', pkg.name === 'dsh-prompt-rewriter', pkg.name);
const patch = fs.readFileSync(`${BUNDLE}/cordis.patch.yml`, 'utf8');
check('patch id/name unchanged', /- id: dsh-prompt-rewriter/.test(patch) && /name: dsh-prompt-rewriter/.test(patch));
// The running profile is machine state, not an artefact property, so it is only
// asserted on request. A clean checkout has no profile and must still pass.
const PROFILE = 'C:/Users/划过星空/.dsh/profiles/desktop/package.json';
if (LOCAL && fs.existsSync(PROFILE)) {
	const profile = JSON.parse(fs.readFileSync(PROFILE, 'utf8'));
	check('profile dependency present', (profile.dependencies ?? {})['dsh-prompt-rewriter'] !== undefined);
	const pinned = (profile.dependencies ?? {})['dsh-prompt-rewriter'];
	// A dev build must be linked, never pinned: a pinned dev version is unpublished,
	// and pnpm then refuses every install in that profile.
	// Two ways to be wrong, and both break pnpm for the WHOLE profile:
	//   - a four-part version (1.6.3.1) is not valid semver at all;
	//   - a three-part version that was never published resolves to nothing.
	// So a pinned version must be confirmed to exist on the registry, not merely look
	// right. Network failures skip the check rather than failing the gate offline.
	if (typeof pinned === 'string' && pinned.startsWith('link:')) {
		check('profile uses a link or a released version', true, 'link');
	} else {
		let released;
		try {
			const response = await fetch(`https://registry.npmjs.org/dsh-prompt-rewriter`, {
				signal: AbortSignal.timeout(8000),
			});
			const meta = response.ok ? await response.json() : undefined;
			released = meta?.versions !== undefined && pinned in meta.versions;
		} catch {
			console.log('SKIP  profile version check (registry unreachable)');
			released = undefined;
		}
		if (released !== undefined) {
			check('profile pins a published version', released, `pinned ${pinned}`);
		}
	}
	check('profile bundles contains plugin', (profile.dsh?.profile?.bundles ?? []).includes('dsh-prompt-rewriter'));
} else {
	console.log('SKIP  profile checks (pass --local on a developer machine)');
}

// --- 5. changelog present -------------------------------------------------
check('aggregated CHANGELOG present', fs.existsSync(`${BUNDLE}/CHANGELOG.md`));

console.log(`\n${failures === 0 ? 'ALL ARTEFACT CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exitCode = failures === 0 ? 0 : 1;
