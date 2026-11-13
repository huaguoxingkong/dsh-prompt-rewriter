#!/usr/bin/env node
// Post-release three-way check: the same docs must be visible on npm (inside the
// tarball), on GitHub's default branch, and in the release asset. The 1.8.3 cycle
// shipped a release with no zip and a README whose image names had moved; the
// package gate cannot see either, so run this after every publish:
//   node scripts/check-sync.mjs --token $GH_TOKEN
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const BUNDLE = path.resolve(import.meta.dirname, '..');
const arg = (name, fallback) => {
	const i = process.argv.indexOf('--' + name);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const pkg = JSON.parse(fs.readFileSync(path.join(BUNDLE, 'package.json'), 'utf8'));
const VERSION = arg('version', pkg.version);
const REPO = arg('repo', 'huaguoxingkong/dsh-prompt-rewriter');
const REF = arg('ref', 'main');
const REGISTRY = arg('registry', 'https://registry.npmjs.org');
const TOKEN = arg('token', process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '');
const DOCS = ['README.md', 'README.en.md', 'CHANGELOG.md', 'screenshots.json'];

let failures = 0;
const check = (name, ok, detail) => {
	console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : ''));
	if (!ok) failures += 1;
};
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchBuf(url, headers, tries) {
	const n = tries || 3;
	for (let i = 0; i < n; i++) {
		try {
			const res = await fetch(url, { headers: headers || {}, redirect: 'follow' });
			if (res.status === 200) return Buffer.from(await res.arrayBuffer());
			if (i === n - 1) return { status: res.status };
		} catch (err) {
			if (i === n - 1) return { error: (err.cause && err.cause.code) || err.message };
		}
		await sleep(600);
	}
}
const ghRaw = () => Object.assign({ Accept: 'application/vnd.github.raw', 'User-Agent': 'dsh-check-sync' }, TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {});
const ghJson = () => Object.assign({ Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-check-sync' }, TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {});
const ghApi = (p) => 'https://api.github.com/repos/' + REPO + '/' + p;

async function packedDocs() {
	const pack = await (await fetch(REGISTRY + '/' + pkg.name)).json();
	check('registry latest is the version under check', pack['dist-tags'] && pack['dist-tags'].latest === VERSION, (pack['dist-tags'] || {}).latest + ' vs ' + VERSION);
	const dist = pack.versions && pack.versions[VERSION] ? pack.versions[VERSION].dist : null;
	check('version exists on the registry', Boolean(dist), VERSION);
	if (!dist) return null;
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sync-'));
	const tgz = path.join(tmp, 'pkg.tgz');
	const buf = await fetchBuf(dist.tarball);
	if (!Buffer.isBuffer(buf)) { check('tarball downloads', false, JSON.stringify(buf)); return null; }
	fs.writeFileSync(tgz, buf);
	check('tarball sha1 matches the registry record', crypto.createHash('sha1').update(buf).digest('hex') === dist.shasum, dist.shasum.slice(0, 12));
	const out = {};
	for (const f of DOCS) out[f] = execFileSync('tar', ['-xzOf', tgz, 'package/' + f], { maxBuffer: 1 << 26 });
	fs.rmSync(tmp, { recursive: true, force: true });
	return out;
}

const main = async () => {
	const packed = await packedDocs();
	for (const f of DOCS) {
		const local = fs.readFileSync(path.join(BUNDLE, f));
		if (packed) check(f + ': npm package == working tree', sha(packed[f]) === sha(local), sha(local));
		const remote = await fetchBuf(ghApi('contents/' + f + '?ref=' + REF), ghRaw());
		check(f + ': GitHub ' + REF + ' == working tree', Buffer.isBuffer(remote) && sha(remote) === sha(local), Buffer.isBuffer(remote) ? sha(remote) : JSON.stringify(remote));
	}

	const text = fs.readFileSync(path.join(BUNDLE, 'README.md'), 'utf8') + fs.readFileSync(path.join(BUNDLE, 'README.en.md'), 'utf8');
	const refs = [...new Set([...text.matchAll(/docs\/images\/([A-Za-z0-9._-]+\.(?:png|gif|jpe?g|webp|svg))/g)].map((m) => m[1]))];
	let cdnOk = 0;
	let repoOk = 0;
	for (const name of refs) {
		if (Buffer.isBuffer(await fetchBuf('https://cdn.jsdelivr.net/npm/' + pkg.name + '/docs/images/' + name))) cdnOk += 1;
		if (Buffer.isBuffer(await fetchBuf(ghApi('contents/docs/images/' + name + '?ref=' + REF), ghRaw()))) repoOk += 1;
	}
	check('README images load from the package CDN', cdnOk === refs.length, cdnOk + '/' + refs.length);
	check('README images exist on the default branch', repoOk === refs.length, repoOk + '/' + refs.length);

	const tag = 'v' + VERSION;
	const relRes = await fetch(ghApi('releases/tags/' + tag), { headers: ghJson() });
	const release = relRes.status === 200 ? await relRes.json() : null;
	check('release ' + tag + ' exists', Boolean(release), relRes.status === 200 ? 'found' : 'HTTP ' + relRes.status);
	if (release) {
		const zipName = pkg.name + '-' + VERSION + '.zip';
		const asset = (release.assets || []).find((a) => a.name === zipName);
		check('release ' + tag + ' carries ' + zipName, Boolean(asset), asset ? asset.size + ' B' : 'missing');
		const localZip = path.join(BUNDLE, 'dist', zipName);
		if (asset && fs.existsSync(localZip)) {
			const dl = await fetchBuf(asset.browser_download_url, { 'User-Agent': 'dsh-check-sync', Accept: 'application/octet-stream' });
			check('release zip == local zip', Buffer.isBuffer(dl) && sha(dl) === sha(fs.readFileSync(localZip)), sha(fs.readFileSync(localZip)));
		}
		check('release body is not empty', Boolean((release.body || '').trim()), String((release.body || '').length) + ' chars');
	}

	console.log(failures === 0 ? 'ALL SYNC CHECKS PASSED' : failures + ' SYNC CHECK(S) FAILED');
	process.exit(failures === 0 ? 0 : 1);
};

await main();
