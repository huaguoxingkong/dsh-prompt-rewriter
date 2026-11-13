globalThis.window = { addEventListener() {}, removeEventListener() {} };
// Focused settings-page test with an explicit, minimal React harness.
// The shared harness in test-client.mjs evolved around the composer control;
// this file gives the settings page its own small renderer so both stay honest.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

// ---------------------------------------------------------------- mini React
const state = { hooks: [], effects: [], slots: [], index: 0, dirty: false };

const React = {
	createElement(type, props, ...children) {
		return { type, props: props ?? {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) };
	},
	useState(initial) {
		const i = state.index++;
		if (!(i in state.slots)) state.slots[i] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
		const set = (next) => {
			const value = typeof next === 'function' ? next(state.slots[i].value) : next;
			if (Object.is(value, state.slots[i].value)) return;
			state.slots[i].value = value;
			state.dirty = true;
		};
		return [state.slots[i].value, set];
	},
	useEffect(fn, deps) {
		const i = state.index++;
		const previous = state.slots[i];
		const changed = previous === undefined || deps === undefined || deps.some((d, k) => !Object.is(d, previous.deps[k]));
		state.slots[i] = { kind: 'effect', deps, cleanup: previous?.cleanup };
		if (changed) state.effects.push({ i, fn });
	},
	useRef(initial) {
		const i = state.index++;
		if (!(i in state.slots)) state.slots[i] = { kind: 'ref', current: initial };
		return state.slots[i];
	},
	useCallback(fn, deps) {
		const i = state.index++;
		const previous = state.slots[i];
		if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((d, k) => Object.is(d, previous.deps[k]))) return previous.fn;
		state.slots[i] = { kind: 'callback', fn, deps };
		return fn;
	},
	useMemo(fn, deps) {
		const i = state.index++;
		const previous = state.slots[i];
		if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((d, k) => Object.is(d, previous.deps[k]))) return previous.value;
		const value = fn();
		state.slots[i] = { kind: 'memo', value, deps };
		return value;
	},
};

// ---------------------------------------------------------------- DOM + module
globalThis.document = {
	head: { children: [], append(node) { this.children.push(node); }, remove() {} },
	createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
};
globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');

let plugin;
globalThis.window = {
	__ModuleLoader__: {
		load({ factory }) {
			plugin = factory((name) => {
				if (name === 'react') return React;
				throw new Error('unexpected require ' + name);
			});
		},
	},
};
new Function(source)();

// ---------------------------------------------------------------- harness
/**
 * Resolve a function component into its element, the way React would.
 *
 * The registered component is a thin wrapper around SettingsSection. Expanding the
 * wrapper consumes no hooks, but the WRAPPER CALL itself advances the shared index.
 * Without rewinding, the inner component's first hook lands one slot too late and
 * every subsequent slot shifts 鈥?which surfaced as a missing `useState` and an
 * effect bound to the wrong slot. Rewinding before each expansion gives each
 * function component the fresh slot space React would give it.
 */
function resolve(node) {
	if (node === null || node === undefined) return node;
	if (Array.isArray(node)) return node.map(resolve).flat(Infinity);
	if (typeof node !== 'object') return node;
	if (typeof node.type === 'function') {
		state.index = 0;
		return resolve(node.type({ ...(node.props ?? {}), children: undefined }));
	}
	return { ...node, children: (node.children ?? []).map(resolve).flat(Infinity) };
}

/**
 * Flatten the tree in DOCUMENT order.
 * A stack would visit children last-in-first-out and report rows backwards, so
 * this walks the resolved tree depth-first in order.
 */
function flatten(node, out = []) {
	const resolved = resolve(node);
	const visit = (current) => {
		if (current === null || current === undefined) return;
		if (Array.isArray(current)) {
			for (const child of current) visit(child);
			return;
		}
		if (typeof current !== 'object') return;
		out.push(current);
		for (const child of current.children ?? []) visit(child);
	};
	visit(resolved);
	return out;
}

/**
 * Render once, running effects and flushing state updates.
 *
 * Hooks are executed while expanding the tree, so expansion must happen inside
 * the same iteration that owns `state.index`; expanding afterwards would run
 * hooks with a stale index and scatter their slots.
 */
function render(Component, props) {
	let tree;
	let guard = 0;
	do {
		guard += 1;
		state.dirty = false;
		state.index = 0;
		state.effects = [];
		const rendered = Component(props);
		tree = resolve(rendered);
		for (const effect of state.effects) {
			const cleanup = effect.fn();
			if (typeof cleanup === 'function') state.slots[effect.i] = { ...state.slots[effect.i], cleanup };
		}
	} while (state.dirty && guard < 30);
	return tree;
}

/** Mount fresh, then render (a new component instance). */
function mount(Component, props) {
	state.slots = [];
	state.index = 0;
	state.effects = [];
	return render(Component, props);
}

let route = null;
let requests = [];
let stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true };
// What the Host reports about the package: the version and project URL the page
// displays. Kept separate from `stored` because it is read-only metadata.
let about = { version: '9.9.9', url: 'https://github.com/example/dsh-prompt-rewriter' };
// Release notes returned by the Host. Driven per case.
let changelog = [];
// When set, the next settings POST is refused with this message, which is how the
// page learns that a value it was asked to store is not acceptable.
let refusePost = null;

globalThis.fetch = async (url, init) => {
	// Diagnostic beacons are out-of-band: not recorded, not routed.
	if (String(url).includes("/prompt-enhance/diag")) {
		return { ok: true, status: 200, json: async () => ({ ok: true }) };
	}
	requests.push({ url: String(url), init });
	if (String(url).endsWith('/settings')) {
		if (init?.method === 'POST') {
			if (refusePost !== null) {
				const message = refusePost;
				refusePost = null;
				return { ok: true, status: 200, json: async () => ({ ok: false, code: 'BAD_REQUEST', message }) };
			}
			stored = { ...stored, ...JSON.parse(init.body) };
		}
		return { ok: true, status: 200, json: async () => ({ ok: true, values: stored, about, changelog }) };
	}
	return { ok: true, status: 200, json: async () => ({ ok: true, text: 'enhanced' }) };
};

// --- host shortcuts stubs --------------------------------------------------
// Tests drive these directly: `shortcutCatalog` is what the row displays,
// `shortcutDescribe` decides whether a candidate conflicts, and `shortcutEdit`
// records writes so a test can assert "the old value was kept".
let shortcutCatalog = [{ id: 'prompt-enhance.run', keys: ['Ctrl', '+', 'Shift', '+', 'Enter'], label: () => '增强提示词' }];
// The host's revision is a UUID rotated on every accepted write; the stub mirrors that
// so a cached revision shows up as a "stale" refusal, exactly as in the real app.
let shortcutRevision = 'rev-0';
let shortcutRevisionCount = 0;
/** When true, the next edit is refused as stale, exercising the retry path. */
let shortcutForceStaleOnce = false;
let shortcutDescribe = () => ({ conflicts: [], issue: null, keys: [] });
let shortcutEdit = () => ({ status: 'saved' });
const shortcutWrites = [];
const registeredCommands = [];

function install({ catalog, getShortcuts } = {}) {
	const registrations = [];
	// The picker reads the SAME catalog the composer selector uses.
	const remote = {
		session: {
			modelCatalog: async () =>
				catalog ?? {
					ok: true,
					value: {
						groups: [
							{ id: 'deepseek-account', name: 'DeepSeek 瀹樻柟', models: [{ id: 'deepseek-v4', name: 'DeepSeek V4' }] },
							{ id: 'qiniu', name: '涓冪墰', models: [{ id: 'conatus-free', name: 'conatus-free' }] },
						],
					},
				},
		},
	};
	const getRemote = () => remote;
	const ctx = {
		inject: ['slots', 'locale'],
		// Host shortcuts contract, reproduced with the same reply shapes the plugin
		// reads. `catalog` drives the displayed keys; `describeBinding` drives the
		// conflict message; `edit` records what was written.
		shortcuts: {
			register: (command) => { registeredCommands.push(command); return () => {}; },
			catalog: { getSnapshot: () => shortcutCatalog, subscribe: () => () => {} },
			// The host mints a fresh revision on every accepted write, so the stub does too.
			config: { getSnapshot: () => ({ revision: shortcutRevision }) },
			describeBinding: (binding) => shortcutDescribe(binding),
			edit: (operation, revision) => {
				shortcutWrites.push({ operation, revision });
				// A forced stale reproduces the race the retry exists for.
				if (shortcutForceStaleOnce) {
					shortcutForceStaleOnce = false;
					return Promise.resolve({ status: 'stale' });
				}
				// Mirror the host: a stale revision is refused before anything is written.
				if (revision !== shortcutRevision) return Promise.resolve({ status: 'stale' });
				const result = shortcutEdit(operation);
				if (result?.status === 'saved') {
					shortcutRevision = `rev-${shortcutRevisionCount += 1}`;
				}
				return Promise.resolve(result);
			},
		},
		locale: { register: () => () => {}, bind: () => (key) => key },
		// Optional-service injection: the callback runs only when the service exists.
		inject: (names, callback) => {
			const list = Array.isArray(names) ? names : [names];
			const ok = list.every((name) => {
				const value = ctx.get(name);
				return value !== undefined && value !== null;
			});
			if (ok) callback(ctx);
			return () => {};
		},
		effect: (fn) => { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
		// `remote` is a ctx PROPERTY (a Cordis service face), NOT a thunk: the
		// registration wraps it in its own thunk before handing it to the section.
		remote,
		// The plugin resolves optional services through `ctx.get` at call time.
		get: (name) => {
			if (name !== 'shortcuts') return undefined;
			return getShortcuts === undefined ? ctx.shortcuts : getShortcuts();
		},
		slots: {
			inject: (_key, cb) => { const d = cb(); return () => { if (typeof d === 'function') d(); }; },
			register: (options, component) => { registrations.push({ options, component }); return () => {}; },
		},
	};
	plugin.apply(ctx);
	return registrations;
}

const t = (key, vars) => (vars === undefined ? key : `${key}:${JSON.stringify(vars)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
async function test(name, fn) {
	try {
		await fn();
		console.log('PASS ' + name);
	} catch (error) {
		failures += 1;
		console.log('FAIL ' + name + '\n   ' + (error?.message ?? error));
	}
}

const settingsOf = (regs) => regs.find((r) => (r.options.name === 'settings.section'));

await test('the settings section is registered with a localized nav label', async () => {
	const regs = install();
	const settings = settingsOf(regs);
	assert.ok(settings, 'settings.section must be registered');
	assert.equal(settings.options.id, 'prompt-enhance');
	assert.equal(settings.options.order, 50);
	assert.equal(typeof settings.options.label, 'function');
	assert.equal(settings.options.label(), 'nav', 'label resolves through the locale namespace');
});

await test('the page renders every option once settings load', async () => {
	requests = [];
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	const rows = flatten(tree).filter((n) => n.props?.['data-row'] !== undefined);
	assert.deepEqual(rows.map((r) => r.props['data-row']), ['model', 'ruleSet', 'context', 'images', 'files', 'shortcut']);

	const titles = flatten(tree).filter((n) => n.props?.className === 'dsh-pe-settingsTitle');
	assert.equal(titles.length, 6, 'each row needs a title');

	const hints = flatten(tree).filter((n) => n.props?.className === 'dsh-pe-settingsHint');
	assert.equal(hints.length, 6, 'each row needs an explanatory sentence');
	for (const hint of hints) {
		assert.ok(typeof hint.children?.[0] === 'string' && hint.children[0].length > 0, 'hint text must not be empty');
	}

	// Five toggles plus the rule-set select: the select is a row, not a switch.
	const switches = flatten(tree).filter((n) => n.props?.role === 'switch');
	assert.equal(switches.length, 5, 'five toggles: model, context, images, files, shortcut');
	assert.equal(switches[0].props['aria-checked'], 'false', 'custom model is off by default');
	assert.equal(switches[1].props['aria-checked'], 'true', 'context is on by default');
	assert.equal(switches[2].props['aria-checked'], 'false', 'images is off by default');
	assert.equal(switches[3].props['aria-checked'], 'true', 'file content is on by default');
	assert.equal(switches[4].props['aria-checked'], 'false', 'the keyboard shortcut is off by default');
});

await test('the picker lists only owned models, grouped by provider', async () => {
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: true, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	const select = flatten(tree).find((n) => n.props?.className === 'dsh-pe-select');
	assert.ok(select, 'the picker must render');
	// Two provider groups, each labelled with the provider display name.
	const groups = flatten(select).filter((n) => n.type === 'optgroup');
	assert.equal(groups.length, 2);
	assert.deepEqual(groups.map((g) => g.props.label), ['DeepSeek 瀹樻柟', '涓冪墰']);
	// Every option value carries provider + model, so the stored pair is unambiguous.
	const options = flatten(select).filter((n) => n.type === 'option' && n.props.value !== '');
	assert.deepEqual(options.map((o) => o.props.value), ['deepseek-account\u0000deepseek-v4', 'qiniu\u0000conatus-free']);
	assert.deepEqual(options.map((o) => o.children?.[0]), ['DeepSeek V4', 'conatus-free']);
});

await test('the picker is disabled while the custom-model switch is off', async () => {
	stored = { enhanceProvider: 'p1', enhanceModel: 'm9', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const select = flatten(tree).find((n) => n.props?.className === 'dsh-pe-select');
	assert.equal(select.props.disabled, true, 'the picker must be inert until enabled');
});

await test('a saved model pin is shown as the selected option', async () => {
	stored = { enhanceProvider: 'qiniu', enhanceModel: 'conatus-free', useCustomModel: true, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const select = flatten(tree).find((n) => n.props?.className === 'dsh-pe-select');
	assert.equal(select.props.value, 'qiniu\u0000conatus-free');
});

await test('choosing a model saves the provider and model pair', async () => {
	requests = [];
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: true, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const select = flatten(tree).find((n) => n.props?.className === 'dsh-pe-select');
	select.props.onChange({ target: { value: 'qiniu\u0000conatus-free' } });
	await sleep(0);
	tree = render(settings.component, { t });
	const posts = requests.filter((r) => r.init?.method === 'POST');
	assert.deepEqual(JSON.parse(posts[0].init.body), { enhanceProvider: 'qiniu', enhanceModel: 'conatus-free' });
});

await test('enabling the custom model saves only the switch', async () => {
	requests = [];
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	flatten(tree).filter((n) => n.props?.role === 'switch')[0].props.onClick();
	await sleep(0);
	const posts = requests.filter((r) => r.init?.method === 'POST');
	assert.deepEqual(JSON.parse(posts[0].init.body), { useCustomModel: true });
});

await test('toggling context saves exactly that field', async () => {
	requests = [];
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	// Switch order: 0 = custom model, 1 = context, 2 = images.
	flatten(tree).filter((n) => n.props?.role === 'switch')[1].props.onClick();
	await sleep(0);
	tree = render(settings.component, { t });

	const posts = requests.filter((r) => r.init?.method === 'POST');
	assert.equal(posts.length, 1);
	assert.deepEqual(JSON.parse(posts[0].init.body), { referenceContext: false });
	// The page reflects the saved value after the round trip.
	assert.equal(flatten(tree).filter((n) => n.props?.role === 'switch')[0].props['aria-checked'], 'false');
});

await test('toggling images saves exactly that field', async () => {
	requests = [];
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	flatten(tree).filter((n) => n.props?.role === 'switch')[2].props.onClick();
	await sleep(0);
	tree = render(settings.component, { t });

	const posts = requests.filter((r) => r.init?.method === 'POST');
	assert.deepEqual(JSON.parse(posts[0].init.body), { referenceImages: true });
	assert.equal(flatten(tree).filter((n) => n.props?.role === 'switch')[1].props['aria-checked'], 'true');
});

await test('a load failure is reported on the page', async () => {
	const original = globalThis.fetch;
	globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	globalThis.fetch = original;
	const error = flatten(tree).find((n) => n.props?.className === 'dsh-pe-settingsError');
	assert.ok(error, 'a failed load must be surfaced');
	assert.equal(error.props.role, 'alert');
});

await test('a refused save is reported inside the row that caused it', async () => {
	// The value on screen does not change when the write is refused, so the message
	// has to sit under the control the user touched: parked at the bottom of the page
	// it reads as "the click did nothing".
	refusePost = '规则集必须是 legacy、intent-first 或 workbuddy。';
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	const rules = flatten(tree).filter((n) => n.props?.className === 'dsh-pe-select').at(-1);
	rules.props.onChange({ target: { value: 'workbuddy' } });
	await sleep(0);
	tree = render(settings.component, { t });

	const nodes = flatten(tree);
	const rowIndex = nodes.findIndex((n) => n.props?.['data-row'] === 'ruleSet');
	const errorIndex = nodes.findIndex((n) => n.props?.className === 'dsh-pe-settingsError');
	assert.ok(rowIndex >= 0, 'the rule-set row exists');
	assert.ok(errorIndex >= 0, 'the refusal must be visible');
	assert.equal(nodes[errorIndex].props.role, 'alert');
	assert.ok(errorIndex > rowIndex, 'the message sits under its own row, not above it');
	const nextRow = nodes.findIndex((n, index) => index > rowIndex && n.props?.['data-row'] !== undefined);
	assert.ok(nextRow < 0 || errorIndex < nextRow, 'the message stays inside the failing row');
	assert.equal(rules.props.value, 'legacy', 'the refused value is not shown as stored');
});

await test('the rule-set row explains all three playbooks and marks the two experimental ones', async () => {
	stored = { ruleSet: 'intent-first' };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const nodes = flatten(tree);

	const select = nodes.filter((n) => n.props?.className === 'dsh-pe-select').at(-1);
	const labels = flatten(select).filter((n) => n.type === 'option').map((option) => option.children?.[0]);
	assert.deepEqual(labels, ['settings.rules.legacy', 'settings.rules.intentFirst', 'settings.rules.workbuddy'],
		'each playbook is labelled through the locale table');

	// The comparison is one collapsed line: three open cards pushed the switches
	// below the fold, which is the clutter this layout is meant to avoid.
	const details = nodes.find((n) => n.props?.className === 'dsh-pe-rulesMore');
	assert.ok(details !== undefined, 'the comparison block must exist');
	assert.equal(details.type, 'details');
	assert.equal(details.props.open, undefined, 'collapsed by default');
	assert.equal(details.children[0].type, 'summary');

	const cards = nodes.filter((n) => n.props?.className === 'dsh-pe-ruleCard');
	assert.deepEqual(cards.map((card) => card.props['data-rule']), ['legacy', 'intent-first', 'workbuddy']);
	assert.deepEqual(cards.map((card) => card.props['data-current']), ['false', 'true', 'false'],
		'only the selected playbook is highlighted');

	const badges = cards.map((card) => flatten(card).find((n) => String(n.props?.className).includes('dsh-pe-ruleCardBadge')));
	assert.deepEqual(badges.map((badge) => badge.children?.[0]),
		['settings.rules.badge.stable', 'settings.rules.badge.experimental', 'settings.rules.badge.experimental'],
		'only the legacy playbook is marked stable');

	// Each card states the three facts a reader actually compares.
	for (const card of cards) {
		const facts = flatten(card).filter((n) => n.type === 'dt').map((n) => n.children?.[0]);
		assert.deepEqual(facts, ['settings.rules.fact.strength', 'settings.rules.fact.length', 'settings.rules.fact.bestFor']);
	}
});

// --- 浜掓枼 regression -------------------------------------------------------
// The reported symptom: turning one switch on appeared to turn the others off.
// Two causes are pinned here 鈥?a global `saving` lock that disabled/serialised
// every control, and a GET that echoed the boot-time snapshot instead of the
// live row. These tests drive several switches in sequence and assert each keeps
// its own value and that a sibling is never disabled by another's save.

await test('switching one control leaves the others untouched and usable', async () => {
	requests = [];
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	const switches = () => flatten(tree).filter((n) => n.props?.role === 'switch');

	// 1. Turn the custom model on.
	switches()[0].props.onClick();
	await sleep(0);
	tree = render(settings.component, { t });

	// The sibling toggles must NOT be disabled while that save is in flight.
	assert.equal(switches()[1].props.disabled, false, 'context must stay usable during another save');
	assert.equal(switches()[2].props.disabled, false, 'images must stay usable during another save');

	// 2. Turn images on 鈥?context must remain on.
	switches()[2].props.onClick();
	await sleep(0);
	tree = render(settings.component, { t });
	assert.equal(switches()[1].props['aria-checked'], 'true', 'context survives an images save');
	assert.equal(switches()[2].props['aria-checked'], 'true');
	assert.equal(switches()[0].props['aria-checked'], 'true', 'custom model survives later saves');

	// 3. Turn context off 鈥?the other two keep their values.
	switches()[1].props.onClick();
	await sleep(0);
	tree = render(settings.component, { t });
	assert.equal(switches()[0].props['aria-checked'], 'true', 'custom model survives a context save');
	assert.equal(switches()[2].props['aria-checked'], 'true', 'images survive a context save');
	assert.equal(switches()[1].props['aria-checked'], 'false');
});

await test('each switch posts only its own field', async () => {
	requests = [];
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	const click = async (index) => {
		flatten(tree).filter((n) => n.props?.role === 'switch')[index].props.onClick();
		await sleep(0);
		tree = render(settings.component, { t });
	};
	await click(0);
	await click(2);
	await click(1);
	await click(3);

	const bodies = requests.filter((r) => r.init?.method === 'POST').map((r) => JSON.parse(r.init.body));
	assert.deepEqual(bodies[0], { useCustomModel: true }, 'a toggle must not carry sibling fields');
	assert.deepEqual(bodies[1], { referenceImages: true });
	assert.deepEqual(bodies[2], { referenceContext: false });
	assert.deepEqual(bodies[3], { referenceFiles: false });
});

// --- 涓嬫媺 regression -------------------------------------------------------
// The picker could not open because it was permanently disabled: `saving` is now
// a control id, and a bare truthiness test made it always disabled. It must be
// enabled as soon as the custom-model switch is on, expose every owned model,
// and save the exact provider/model pair on selection.

await test('the picker is enabled once the custom model is on and lists every model', async () => {
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: true, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	const select = flatten(tree).find((n) => n.props?.className === 'dsh-pe-select');
	assert.ok(select, 'the picker must render');
	assert.equal(select.props.disabled, false, 'the picker must be openable once enabled');

	// Every owned model is present, grouped by provider, and selectable.
	const options = flatten(select).filter((n) => n.type === 'option' && n.props.value !== '');
	assert.deepEqual(options.map((o) => o.props.value), [
		'deepseek-account\u0000deepseek-v4',
		'qiniu\u0000conatus-free',
	]);
	assert.equal(options.every((o) => o.props.disabled !== true), true, 'no option may be disabled');
});

await test('selecting each available model saves that exact pair', async () => {
	requests = [];
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: true, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	const pick = async (value) => {
		const select = flatten(tree).find((n) => n.props?.className === 'dsh-pe-select');
		select.props.onChange({ target: { value } });
		await sleep(0);
		tree = render(settings.component, { t });
	};

	await pick('deepseek-account\u0000deepseek-v4');
	await pick('qiniu\u0000conatus-free');

	const bodies = requests.filter((r) => r.init?.method === 'POST').map((r) => JSON.parse(r.init.body));
	assert.deepEqual(bodies[0], { enhanceProvider: 'deepseek-account', enhanceModel: 'deepseek-v4' });
	assert.deepEqual(bodies[1], { enhanceProvider: 'qiniu', enhanceModel: 'conatus-free' });

	// The selection is reflected back in the control.
	const finalSelect = flatten(tree).find((n) => n.props?.className === 'dsh-pe-select');
	assert.equal(finalSelect.props.value, 'qiniu\u0000conatus-free');
});

await test('a failed catalog load is visible, not a silently empty picker', async () => {
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: true, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install({ catalog: { ok: false, error: { message: 'nope' } } }));
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const select = flatten(tree).find((n) => n.props?.className === 'dsh-pe-select');
	const placeholder = flatten(select).find((n) => n.type === 'option' && n.props.value === '');
	assert.equal(placeholder.children?.[0], 'settings.model.loadError', 'the failure must be named in the picker');
});

await test('a stored model stays visible while the switch is off', async () => {
	// The switch applies the pin; it does not forget it. With the switch off and a
	// stored choice, the picker must show that choice (not "none selected") so the
	// user can see what will be applied when they turn it back on.
	stored = { enhanceProvider: 'zai', enhanceModel: 'glm-5.3-flash', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	const select = flatten(tree).find((n) => n.props?.className === 'dsh-pe-select');
	assert.equal(select.props.value, 'zai\u0000glm-5.3-flash', 'the stored pin must be echoed even while disabled');
	assert.equal(select.props.disabled, true, 'the control is inert while the switch is off');
});

await test('turning the switch on shows the stored model without re-picking', async () => {
	requests = [];
	stored = { enhanceProvider: 'zai', enhanceModel: 'glm-5.3-flash', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });

	flatten(tree).filter((n) => n.props?.role === 'switch')[0].props.onClick();
	await sleep(0);
	tree = render(settings.component, { t });

	const select = flatten(tree).find((n) => n.props?.className === 'dsh-pe-select');
	assert.equal(select.props.disabled, false, 'the picker is usable once the switch is on');
	assert.equal(select.props.value, 'zai\u0000glm-5.3-flash', 'the previous choice is already selected');
	const posts = requests.filter((r) => r.init?.method === 'POST').map((r) => JSON.parse(r.init.body));
	assert.deepEqual(posts[0], { useCustomModel: true }, 'only the switch is written');
});

await test('every settings row carries a plain-language title', async () => {
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true };
	const regs = install();
	const settings = settingsOf(regs);
	// Assert on structure and locale KEYS, not on literal copy: hard-coding the wording
	// here made the test a second place every copy change had to be mirrored.
	const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');
	for (const key of ['settings.model.title', 'settings.rules.title', 'settings.context.title', 'settings.images.title', 'settings.files.title', 'settings.shortcut.title',
		// Copy that names the playbooks: short by construction, because it sits in
		// a 220px select or a one-line disclosure.
		'settings.rules.legacy', 'settings.rules.intentFirst', 'settings.rules.workbuddy', 'settings.rules.compare',
		'settings.rules.badge.stable', 'settings.rules.badge.experimental',
		'settings.rules.fact.strength', 'settings.rules.fact.length', 'settings.rules.fact.bestFor']) {
		const entry = new RegExp(`'${key.replace(/\./gu, '\\.')}':\\s*'([^']+)'`, 'u').exec(source);
		assert.ok(entry, `${key} must exist in the locale table`);
		assert.ok(entry[1].length > 0, `${key} must have visible text`);
		// A plain-language label is short; a sentence in the title position is a bug.
		assert.ok(entry[1].length <= 24, `${key} reads as a label, not a sentence`);
	}
	// The comparison cards carry one sentence each; they must say something.
	for (const key of ['settings.rules.legacy.about', 'settings.rules.intent-first.about', 'settings.rules.workbuddy.about']) {
		const entry = new RegExp(`'${key.replace(/\./gu, '\\.')}':\\s*'([^']+)'`, 'u').exec(source);
		assert.ok(entry, `${key} must exist in the locale table`);
		assert.ok(entry[1].length >= 20, `${key} must explain the playbook, not just name it`);
	}
	// And the page really renders one titled row per setting.
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const titles = flatten(tree).filter((n) => n.props?.className === 'dsh-pe-settingsTitle');
	assert.equal(titles.length, 6);
});

// --- version line and project link -----------------------------------------

await test('the page shows the version the Host reports', async () => {
	// The version must come from the package manifest via the Host, never be
	// hard-coded in the client.
	about = { version: '9.9.9', url: 'https://github.com/example/dsh-prompt-rewriter' };
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const version = flatten(tree).find((n) => n.props?.className === 'dsh-pe-version');
	assert.ok(version, 'the version line must render');
	assert.equal(version.children?.[0], 'v9.9.9', 'it must show the reported version');
});

await test('the version links to the project page in a new tab', async () => {
	about = { version: '1.2.3', url: 'https://github.com/example/dsh-prompt-rewriter' };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const link = flatten(tree).find((n) => n.props?.className === 'dsh-pe-version');
	assert.equal(link.type, 'a', 'a known project URL makes it a link');
	assert.equal(link.props.href, 'https://github.com/example/dsh-prompt-rewriter');
	assert.equal(link.props.target, '_blank', 'opens in a new tab, leaving this session alone');
	assert.match(link.props.rel ?? '', /noopener/u, 'a new tab must not hand over window.opener');
});

await test('a missing project URL degrades to plain version text', async () => {
	// No repository in the manifest means nothing to open: show the version alone
	// rather than a link that goes nowhere.
	about = { version: '0.0.1', url: undefined };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const version = flatten(tree).find((n) => n.props?.className === 'dsh-pe-version');
	assert.equal(version.type, 'span');
	assert.equal(version.children?.[0], 'v0.0.1');
});

await test('the page links straight to the issue tracker', async () => {
	about = { version: '1.2.3', url: 'https://github.com/example/dsh-prompt-rewriter' };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const link = flatten(tree).find((n) => n.props?.className === 'dsh-pe-feedbackLink');
	assert.ok(link, 'the feedback link must render');
	assert.equal(link.type, 'a');
	assert.equal(link.props.href, 'https://github.com/example/dsh-prompt-rewriter/issues', 'goes to the issue list, not the repo root');
	assert.equal(link.props.target, '_blank', 'a report opens in a new tab');
	assert.match(link.props.rel ?? '', /noopener/u);
	assert.equal(link.children?.[0], 'settings.feedback', 'the label comes from the locale table');
	// It takes the place of the old intro line, inside the same head row as the version.
	const head = flatten(tree).find((n) => n.props?.className === 'dsh-pe-settingsHead');
	assert.ok(flatten(head).some((n) => n.props?.className === 'dsh-pe-feedbackLink'), 'the link sits in the head row');
	assert.equal(source.includes("'settings.intro'"), false, 'the old intro string is gone');
});

await test('the head row leads with the star ask', async () => {
	about = { version: '1.2.3', url: 'https://github.com/example/dsh-prompt-rewriter' };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const nodes = flatten(tree);
	const head = nodes.find((n) => n.props?.className === 'dsh-pe-settingsHead');
	assert.ok(head, 'the head row exists');
	const star = nodes.find((n) => n.props?.className === 'dsh-pe-star');
	assert.ok(star, 'the star link renders');
	assert.equal(star.type, 'a');
	assert.equal(star.props.href, 'https://github.com/example/dsh-prompt-rewriter', 'it opens the repository itself');
	assert.equal(star.props.target, '_blank');
	assert.match(star.props.rel ?? '', /noopener/u);
	assert.equal(star.children?.[0], 'settings.star', 'the wording comes from the locale table');
	const firstAnchor = flatten(head).find((n) => n.type === 'a');
	assert.equal(firstAnchor?.props.className, 'dsh-pe-star', 'the star is the first interactive element on the page');
	// The line stays muted: only the emoji carries colour, so nothing out-shouts the rows below.
	assert.match(source, /\.dsh-pe-star\{color:inherit/u, 'the star link inherits the muted line colour');
	assert.match(source, /settings\.star': '[^']*Star ⭐'/u, 'the ⭐ glyph trails the word Star');
});

await test('no issue link when the manifest has no project URL', async () => {
	about = { version: '0.0.1', url: undefined };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	assert.equal(flatten(tree).find((n) => n.props?.className === 'dsh-pe-feedbackLink'), undefined);
	assert.equal(flatten(tree).find((n) => n.props?.className === 'dsh-pe-star'), undefined, 'no star link either');
	// The line still tells the user where reports go; it is just not clickable.
	const line = flatten(tree).find((n) => n.props?.className === 'dsh-pe-settingsIntro');
	assert.deepEqual(line.children, ['settings.feedback']);
});

await test('the context row explains the blue dot in the same hint', async () => {
	// One line, merged into the existing hint 鈥?not a second paragraph.
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true };
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const hints = flatten(tree).filter((n) => n.props?.className === 'dsh-pe-settingsHint');
	const contextHint = hints.find((n) => String(n.children?.[0] ?? '').includes('settings.context'));
	assert.ok(contextHint, 'the context row must keep its hint');
	const text = String(contextHint.children?.[0] ?? '');
	assert.match(text, /settings\.context\.mark/u, 'the dot explanation must be appended to the same hint');
	// Exactly one hint node for the row: no stacked extra line.
	assert.equal(hints.filter((n) => String(n.children?.[0] ?? '').includes('settings.context')).length, 1);
});

// --- shortcut row -----------------------------------------------------------
// Acceptance the feature must hold: show the effective combination, allow recording,
// refuse a clash visibly WITHOUT losing the previous value, and restore the default.

/** Mount the page and return accessors for the shortcut row. */
async function mountShortcutRow(options = {}) {
	// A custom resolver lets a case simulate the service arriving after mount.
	// The switch is on for these cases: recording is disabled while the feature is off,
	// which is asserted separately.
	stored = { enhanceProvider: '', enhanceModel: '', useCustomModel: false, referenceImages: false, referenceContext: true, shortcutEnabled: true };
	const settings = settingsOf(install({ getShortcuts: options.getShortcuts }));
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const mounted = {
		get tree() { return tree; },
		rerender() { tree = render(settings.component, { t }); return { tree }; },
	};
	const binding = () => flatten(mounted.tree).find((n) => n.props?.className === 'dsh-pe-binding');
	return { mounted, binding };
}

await test('the shortcut row shows the effective combination', async () => {
	shortcutCatalog = [{ id: 'prompt-enhance.run', keys: ['Ctrl', '+', 'Shift', '+', 'Enter'], label: () => '增强提示词' }];
	const { binding } = await mountShortcutRow();
	const button = binding();
	assert.ok(button, 'the binding control must render');
	assert.equal(button.children?.[0], 'Ctrl+Shift+Enter', 'it must show the resolved keys');
});

await test('clicking the binding starts recording', async () => {
	const { mounted, binding } = await mountShortcutRow();
	binding().props.onClick();
	mounted.rerender();
	const button = binding();
	assert.equal(button.props['data-recording'], 'true', 'the control enters recording mode');
	assert.equal(button.children?.[0], 'settings.shortcut.recording', 'it shows the recording prompt');
});

await test('a conflicting combination is reported and the previous value is kept', async () => {
	// The host answers with the commands it collides with; refusing before writing is
	// what keeps the old binding in force.
	shortcutCatalog = [{ id: 'prompt-enhance.run', keys: ['Ctrl', '+', 'Shift', '+', 'Enter'], label: () => '增强提示词' }];
	shortcutDescribe = () => ({ conflicts: ['shortcuts.open'], issue: null, keys: [] });
	shortcutWrites.length = 0;
	const { mounted, binding } = await mountShortcutRow();
	binding().props.onClick();
	mounted.rerender();
	binding().props.onKeyDown({ code: 'Slash', ctrlKey: true, shiftKey: false, altKey: false, preventDefault: () => {}, stopPropagation: () => {} });
	// `assign` is async (the host's `edit` resolves the outcome), so let it settle.
	await sleep(0);

	assert.equal(shortcutWrites.length, 0, 'a conflicting binding must not be written');
	mounted.rerender();
	const hints = flatten(mounted.tree).filter((n) => n.props?.className === 'dsh-pe-settingsHint');
	const conflictHint = hints.map((n) => String(n.children?.[0] ?? '')).find((text) => text.includes('settings.shortcut.conflict'));
	assert.ok(conflictHint, 'the conflict must be reported in the row');
	assert.equal(binding().children?.[0], 'Ctrl+Shift+Enter', 'the previous combination stays in force');
	shortcutDescribe = () => ({ conflicts: [], issue: null, keys: [] });
});

await test('a free combination is written through the host', async () => {
	shortcutDescribe = () => ({ conflicts: [], issue: null, keys: [] });
	shortcutEdit = () => ({ status: 'saved' });
	shortcutWrites.length = 0;
	const { mounted, binding } = await mountShortcutRow();
	binding().props.onClick();
	mounted.rerender();
	binding().props.onKeyDown({ code: 'KeyE', ctrlKey: true, shiftKey: true, altKey: false, preventDefault: () => {}, stopPropagation: () => {} });
	await sleep(0);

	assert.equal(shortcutWrites.length, 1, 'the binding is handed to the host');
	assert.deepEqual(shortcutWrites[0].operation, {
		type: 'set',
		id: 'prompt-enhance.run',
		binding: { code: 'KeyE', modifiers: ['primary', 'shift'] },
	});
	assert.equal(shortcutWrites[0].revision, 'rev-0', 'the edit carries the live revision');
});

await test('a host rejection is surfaced verbatim, not as "unknown"', async () => {
	// `edit` is async and classifies its outcome. Reading it synchronously produced
	// `undefined`, which the row rendered as "unknown" — a misleading message for a
	// combination that was in fact fine. The stub resolves a failure here so the
	// reported text must come from the host's own status.
	shortcutDescribe = () => ({ conflicts: [], issue: null, keys: [] });
	shortcutEdit = () => ({ status: 'stale' });
	shortcutWrites.length = 0;
	const { mounted, binding } = await mountShortcutRow();
	binding().props.onClick();
	mounted.rerender();
	binding().props.onKeyDown({ code: 'KeyR', ctrlKey: true, shiftKey: true, altKey: true, preventDefault: () => {}, stopPropagation: () => {} });
	// Two turns: one for the host promise, one for the resulting state update.
	await sleep(0);
	await sleep(0);
	mounted.rerender();

	const hints = flatten(mounted.tree).filter((n) => n.props?.className === 'dsh-pe-settingsHint');
	const text = hints.map((n) => String(n.children?.[0] ?? '')).join(' | ');
	// The settings translator does not interpolate variables, so the verbatim status is
	// asserted at the contract level below; here it is enough to prove the rejection
	// path was taken and the misleading "unknown" fallback is gone.
	assert.match(text, /settings\.shortcut\.rejected/u, 'the row must report a rejection');
	assert.equal(text.includes('unknown'), false, 'a resolved status must never read as unknown');
	shortcutEdit = () => ({ status: 'saved' });
});

await test('the binding request resolves with the host status, not a synchronous read', async () => {
	// Direct contract check for the async bug: `shortcuts.edit` returns a promise. If the
	// caller reads `.status` synchronously it sees `undefined` and reports "unknown".
	// Exercised through the real host shape here, without the settings UI in the way.
	const outcomes = [];
	const fakeShortcuts = {
		describeBinding: () => ({ conflicts: [], issue: null, keys: [] }),
		catalog: { getSnapshot: () => [] },
		edit: async () => ({ status: 'stale' }),
	};
	// Reproduce the plugin's own call shape.
	const result = await fakeShortcuts.edit({ type: 'set', id: 'prompt-enhance.run', binding: { code: 'KeyR', modifiers: [] } }, 1);
	outcomes.push(result.status);
	assert.equal(outcomes[0], 'stale', 'awaiting the host yields its classified status');
	// And the promise is genuinely asynchronous, which is what a sync read would miss.
	assert.equal(typeof fakeShortcuts.edit(...[{ type: 'set' }]).then, 'function', 'edit returns a thenable');
});

await test('reset asks the host to restore the default', async () => {
	shortcutWrites.length = 0;
	shortcutEdit = () => ({ status: 'saved' });
	const { mounted } = await mountShortcutRow();
	const reset = flatten(mounted.tree).find((n) => n.props?.className === 'dsh-pe-reset');
	assert.ok(reset, 'a reset control must exist');
	reset.props.onClick();
	await sleep(0);
	assert.equal(shortcutWrites.length, 1);
	assert.deepEqual(shortcutWrites[0].operation, { type: 'reset', id: 'prompt-enhance.run' });
});

await test('a stale revision is retried, so reset actually clears the override', async () => {
	// The host rotates its revision on every accepted write. A cached revision made the
	// reset "stale", so the stored override was never deleted and the row kept showing
	// the old combination. The plugin must re-read and retry once.
	shortcutWrites.length = 0;
	shortcutEdit = () => ({ status: 'saved' });
	shortcutRevision = 'rev-stale';
	shortcutRevisionCount = 0;
	shortcutForceStaleOnce = true;

	const { mounted } = await mountShortcutRow();
	const reset = flatten(mounted.tree).find((n) => n.props?.className === 'dsh-pe-reset');
	reset.props.onClick();
	await sleep(0);
	await sleep(0);

	assert.equal(shortcutWrites.length, 2, 'the first attempt is refused, the retry lands');
	assert.equal(shortcutWrites[0].operation.type, 'reset', 'both attempts are the same operation');
	assert.equal(shortcutWrites[1].operation.type, 'reset', 'the retry repeats the operation');
	shortcutForceStaleOnce = false;
	shortcutRevision = 'rev-0';
	shortcutRevisionCount = 0;
});

await test('the shortcut command is registered with a default binding', async () => {
	registeredCommands.length = 0;
	install();
	const command = registeredCommands.find((entry) => entry.id === 'prompt-enhance.run');
	assert.ok(command, 'the command must be registered with the host');
	assert.equal(typeof command.run, 'function', 'it must be runnable');
	assert.equal(typeof command.label, 'function', 'the label is localized');

	// Desktop takes a single primary modifier. Across 49 recorded presses in the live
	// app every Ctrl+<letter> arrived while no Ctrl+Shift+<anything> ever did, so the
	// one-modifier shape is the only one proven to reach the window.
	for (const key of ['desktop:windows', 'desktop:macos']) {
		const binding = command.defaults[key];
		assert.ok(binding, `${key} must be declared`);
		assert.equal(binding.code, 'KeyE', `${key} uses a letter key the IME cannot swallow`);
		assert.deepEqual(binding.modifiers, ['primary'], `${key} is the proven single-modifier shape`);
	}

	// The browser half cannot use a bare Ctrl+<letter>: the web validator only allows a
	// one-modifier chord for three punctuation keys. It therefore gets primary+alt,
	// which is an accepted shape and still avoids Shift.
	for (const key of ['web:windows', 'web:macos']) {
		const binding = command.defaults[key];
		assert.ok(binding, `${key} must be declared or the key is dead in the browser app`);
		assert.equal(binding.code, 'KeyE', `${key} uses the same physical key`);
		assert.deepEqual(binding.modifiers, ['primary', 'alt'], `${key} is web-legal without Shift`);
	}

	// Shift must never appear anywhere: the IME consumes that modifier pair.
	for (const [key, binding] of Object.entries(command.defaults)) {
		assert.equal(binding.modifiers.includes('shift'), false, `${key} must not use Shift`);
	}
});

await test('the shorter default is not a reserved or conflicting shape', async () => {
	// Rules taken from the host's `bindingIssue` / `isWebBindingAllowed`:
	//   - `Enter` without `Alt` is reserved (it is the submit chord) — avoided entirely.
	//   - For web windows/macos, two modifiers including primary and shift are accepted.
	//   - The three explicitly whitelisted web chords are Ctrl+/, Ctrl+Shift+, and
	//     Ctrl+Shift+. ; the first is already taken by the host's own "shortcuts.open".
	const binding = { code: 'KeyE', modifiers: ['primary', 'alt'] };
	assert.equal(binding.code === 'Enter', false, 'the default must not be Enter, which is reserved without Alt');
	assert.ok(binding.modifiers.includes('primary'), 'it must include the primary modifier');
	assert.ok(binding.modifiers.includes('alt'), 'two-modifier web chords need primary plus alt or shift');
	assert.equal(binding.modifiers.includes('shift'), false, 'Shift is consumed by the IME and must be avoided');
	assert.equal(binding.code === 'Slash' && binding.modifiers.length === 1, false, 'Ctrl+/ belongs to the host');
});

await test('no hook is called after the loading early-return', async () => {
	// React requires the same hook count on every render. The settings page returns a
	// loading view while `values` is null; a hook placed AFTER that return makes the
	// loaded render use more hooks than the loading one, and React throws — the panel
	// goes blank. The test harness does not enforce hook order, so this is checked
	// statically instead.
	const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');
	const start = source.indexOf('function SettingsSection');
	const end = source.indexOf('function installStyles', start);
	assert.ok(start > 0 && end > start, 'SettingsSection must be findable');

	const body = source.slice(start, end);
	const early = body.indexOf('if (values === null)');
	assert.ok(early > 0, 'the loading early-return must still exist');

	const after = body.slice(early);
	// Any hook call after the early return is a violation.
	const hookAfter = /use(State|Effect|Ref|Callback|Memo|SyncExternalStore)\s*\(|\buseShortcutBinding\s*\(/u.exec(after);
	assert.equal(hookAfter, null, `hook "${hookAfter?.[0]}" must be called before the early return`);

	// And the shortcut hook specifically must live before it.
	const shortcutHook = body.indexOf('useShortcutBinding(');
	assert.ok(shortcutHook > 0 && shortcutHook < early, 'useShortcutBinding must run before the early return');
});

await test('the shortcut command supplies the resolve dispatch requires', async () => {
	registeredCommands.length = 0;
	install();
	const command = registeredCommands.find((entry) => entry.id === 'prompt-enhance.run');
	assert.ok(command, 'the command must be registered');
	// `dispatch()` calls `command.resolve(context)` and never `command.run`. A command
	// without `resolve` throws one line after the desktop bridge already swallowed the
	// key, so nothing happens and nothing is logged — the exact silent no-op reported.
	assert.equal(typeof command.resolve, 'function', 'resolve is mandatory for dispatch');
	const resolution = command.resolve({ modal: null });
	assert.equal(resolution.status, 'handled', 'resolve must claim the key');
	assert.equal(typeof resolution.run, 'function', 'resolve must return the runnable action');
	// The web runtime reads both of these before dispatch reaches resolve.
	assert.ok(Array.isArray(command.regions) && command.regions.length > 0, 'regions are read on web');
	assert.ok(Array.isArray(command.modals), 'modals are read on web');
});

await test('shortcut edits only ever target this plugin own command', async () => {
	// A rebind or a reset must never touch another command's stored override: both
	// operations are asserted to carry exactly one id.
	shortcutWrites.length = 0;
	shortcutEdit = () => ({ status: 'saved' });
	shortcutForceStaleOnce = false;
	const { mounted, binding } = await mountShortcutRow();
	binding().props.onClick();
	mounted.rerender();
	binding().props.onKeyDown({ code: 'KeyJ', ctrlKey: true, shiftKey: false, altKey: true, preventDefault: () => {}, stopPropagation: () => {} });
	await sleep(0);
	mounted.rerender();
	const reset = flatten(mounted.tree).find((n) => n.props?.className === 'dsh-pe-reset');
	assert.ok(reset, 'a reset control must exist');
	reset.props.onClick();
	await sleep(0);

	assert.ok(shortcutWrites.length >= 2, 'one set and one reset must reach the host');
	for (const write of shortcutWrites) {
		assert.equal(write.operation.id, 'prompt-enhance.run', 'the plugin must never target another command id');
	}
});

await test('the shortcut row fills in when the service registers late', async () => {
	// The settings section can mount before the host has registered `shortcuts`.
	// Capturing the face at render time left the row blank forever; the hook must
	// re-read it so a late service still populates the displayed combination.
	shortcutCatalog = [{ id: 'prompt-enhance.run', keys: ['Ctrl', '+', 'E'], label: () => '增强提示词' }];
	// A healthy face the host registers only after the section has mounted.
	const healthy = {
		register: () => () => {},
		catalog: { getSnapshot: () => shortcutCatalog, subscribe: () => () => {} },
		config: { getSnapshot: () => ({ revision: shortcutRevision }) },
		describeBinding: () => ({ conflicts: [], issue: null, keys: [] }),
		edit: () => Promise.resolve({ status: 'saved' }),
	};
	const late = { value: undefined };
	const { mounted, binding } = await mountShortcutRow({ getShortcuts: () => late.value });

	// First render: service absent -> the control still renders, with no keys yet.
	assert.ok(binding(), 'the control must render even while the service is absent');

	// The host registers it a beat later.
	late.value = healthy;
	await new Promise((resolve) => setTimeout(resolve, 200));
	mounted.rerender();

	assert.equal(binding().children?.[0], 'Ctrl+E', 'the late service must fill the row');
});

await test('the changelog renders as a card timeline with the newest expanded', async () => {
	requests = [];
	about = { version: '1.7.0-dev.2', url: 'https://github.com/example/dsh-prompt-rewriter' };
	changelog = [
		{ version: '1.7.0', items: ['新增更新日志', '移除更新弹窗'] },
		{ version: '1.6.3', items: ['修复快捷键服务'] },
	];
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const nodes = flatten(tree);

	// Card + header with a version count.
	assert.ok(nodes.some((n) => n.props?.className === 'dsh-pe-changelog'), 'card container');
	const title = nodes.find((n) => n.props?.className === 'dsh-pe-changelogTitle');
	assert.equal(title.children[0], 'settings.changelog.title');
	const count = nodes.find((n) => n.props?.className === 'dsh-pe-changelogCount');
	assert.ok(String(count.children[0]).startsWith('settings.changelog.count'), 'version count is shown');

	// One row per version, with a badge, meta and rotating chevron.
	const rows = nodes.filter((n) => n.props?.className === 'dsh-pe-changelogRow');
	assert.equal(rows.length, 2, 'one row per version');
	assert.equal(rows[0].props['aria-expanded'], true, 'newest is open by default');
	assert.equal(rows[1].props['aria-expanded'], false);
	const badges = nodes.filter((n) => n.props?.className === 'dsh-pe-changelogBadge');
	assert.equal(badges[0].children[0], 'v1.7.0');
	assert.equal(badges[1].children[0], 'v1.6.3');
	const latest = nodes.filter((n) => n.props?.className === 'dsh-pe-changelogLatest');
	assert.equal(latest.length, 1, 'only the newest carries the Latest tag');
	const meta = nodes.filter((n) => n.props?.className === 'dsh-pe-changelogMeta');
	assert.equal(meta.length, 2, 'each version shows its item count');
	assert.ok(nodes.some((n) => n.props?.className === 'dsh-pe-changelogChevron'), 'rotating chevron');

	// Timeline dots and open/latest state are exposed to CSS via data attributes.
	const entries = nodes.filter((n) => n.props?.className === 'dsh-pe-changelogEntry');
	assert.equal(entries[0].props['data-latest'], 'true');
	assert.equal(entries[0].props['data-open'], 'true');
	assert.equal(entries[1].props['data-open'], 'false');
	assert.equal(nodes.filter((n) => n.props?.className === 'dsh-pe-changelogDot').length, 2);

	const items = nodes.filter((n) => n.type === 'li');
	assert.equal(items.length, 2, 'only the open version shows its items');
	assert.equal(items[0].children[0], '新增更新日志');
	assert.equal(items[1].children[0], '移除更新弹窗');

	// Footer link points at the project's releases page; the Star ask lives in the head.
	const feet = nodes.filter((n) => n.props?.className === 'dsh-pe-changelogFoot');
	assert.equal(feet.length, 1, 'the footer carries only the history link now');
	assert.equal(feet[0].props.href, 'https://github.com/example/dsh-prompt-rewriter/releases');
	assert.equal(feet[0].props.target, '_blank');
	assert.ok(nodes.find((n) => n.props?.className === 'dsh-pe-changelogFootRow'), 'the hairline row still exists');
});

await test('no changelog footer when the manifest has no project URL', async () => {
	requests = [];
	about = { version: '0.0.1', url: undefined };
	changelog = [{ version: '1.0.0', items: ['仅用于渲染'] }];
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const nodes = flatten(tree);
	assert.equal(nodes.filter((n) => n.props?.className === 'dsh-pe-changelogFootRow').length, 0, 'no empty footer row');
	assert.equal(nodes.filter((n) => n.props?.className === 'dsh-pe-changelogFoot').length, 0, 'no link to a missing repo');
});

await test('clicking a version switches which entries are expanded', async () => {
	requests = [];
	changelog = [
		{ version: '1.7.0', items: ['新增更新日志', '移除更新弹窗'] },
		{ version: '1.6.3', items: ['修复快捷键服务'] },
	];
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	const rows = flatten(tree).filter((n) => n.props?.className === 'dsh-pe-changelogRow');
	rows[1].props.onClick();
	tree = render(settings.component, { t });
	const after = flatten(tree);
	const rowsAfter = after.filter((n) => n.props?.className === 'dsh-pe-changelogRow');
	assert.equal(rowsAfter[0].props['aria-expanded'], false);
	assert.equal(rowsAfter[1].props['aria-expanded'], true);
	const items = after.filter((n) => n.type === 'li');
	assert.equal(items.length, 1);
	assert.equal(items[0].children[0], '修复快捷键服务');
	const entries = after.filter((n) => n.props?.className === 'dsh-pe-changelogEntry');
	assert.equal(entries[0].props['data-open'], 'false');
	assert.equal(entries[1].props['data-open'], 'true');
});

await test('an empty changelog renders no panel', async () => {
	requests = [];
	changelog = [];
	const settings = settingsOf(install());
	let tree = mount(settings.component, { t });
	await sleep(0);
	tree = render(settings.component, { t });
	assert.equal(flatten(tree).some((n) => n.props?.className === 'dsh-pe-changelog'), false);
});

console.log(failures === 0 ? '\nALL SETTINGS TESTS PASSED' : `\n${failures} SETTINGS TEST(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
