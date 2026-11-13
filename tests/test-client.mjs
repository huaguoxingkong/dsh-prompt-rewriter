// Client-half behavioural test with a minimal React + DOM substitute.
// Verifies the real client.js module: registration, visibility gating, request
// flow, in-place replacement, stale guard, error/cancel states.
// Run: node test-client.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

// ---------------------------------------------------------------- mini React
/**
 * A tiny but INSTANCE-CORRECT React stand-in.
 *
 * The previous version kept one global hook array and re-invoked components while
 * walking the tree (`expand`), so a component ran once per traversal with a shared,
 * frequently-reset hook index. Any component that (a) subscribed to an external
 * store in an effect, or (b) was wrapped by another component, ended up with state
 * scattered across slots — which is why the task-registry work appeared "broken"
 * in tests while the same component rendered fine when called directly.
 *
 * This version mirrors React's actual model:
 *   - one persistent hook slot array PER (component, mount) instance;
 *   - hooks are only read while a render of THAT instance is executing;
 *   - components render once per pass and the result is memoised, so inspecting
 *     the tree never re-runs a component;
 *   - effects run after the pass and re-run only when their deps change, exactly
 *     like React (a stable deps array means "run once").
 */
const hookState = {
	/** Instance currently rendering, so hooks know where to store. */
	current: null,
	/** Every mounted instance, keyed by the component function + an ordinal. */
	instances: new Map(),
	/** Components expanded during the current pass (avoids re-invoking them). */
	rendered: new Map(),
	/** Instances that still have pending work. */
	dirty: false,
};

/**
 * Create (or reuse) the hook store for one component instance.
 * A "mount" is a fresh instance; a "rerender" reuses the same instance.
 */
function createInstance(Component) {
	return { Component, hooks: [], index: 0, pendingEffects: [], cleanups: [], alive: true };
}

/** Run one render pass for an instance, executing its due effects afterwards. */
function renderInstance(instance, props) {
	hookState.current = instance;
	instance.index = 0;
	instance.pendingEffects = [];
	try {
		return instance.Component(props);
	} finally {
		hookState.current = null;
		for (const pending of instance.pendingEffects.splice(0)) {
			// Run the PREVIOUS cleanup before the new effect, as React does. Doing it the
			// other way let a stale cleanup tear down the registration the new effect had
			// just installed, which made "attach the current handler" appear not to work.
			const previous = instance.cleanups[pending.index];
			if (typeof previous === 'function') previous();
			const cleanup = pending.fn();
			instance.cleanups[pending.index] = typeof cleanup === 'function' ? cleanup : undefined;
		}
	}
}

const React = {
	createElement(type, props, ...children) {
		return { type, props: props ?? {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) };
	},
	useState(initial) {
		const instance = hookState.current;
		const i = instance.index++;
		if (!(i in instance.hooks)) instance.hooks[i] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
		const set = (next) => {
			const current = instance.hooks[i];
			const value = typeof next === 'function' ? next(current.value) : next;
			if (Object.is(value, current.value)) return;
			current.value = value;
			hookState.dirty = true;
		};
		return [instance.hooks[i].value, set];
	},
	useEffect(fn, deps) {
		const instance = hookState.current;
		const i = instance.index++;
		const slot = instance.hooks[i];
		const changed = slot === undefined
			|| deps === undefined
			|| deps.length !== (slot.deps?.length ?? -1)
			|| deps.some((d, k) => !Object.is(d, slot.deps[k]));
		instance.hooks[i] = { kind: 'effect', deps };
		// Only a changed deps array schedules a re-run: a stable `[]` runs once.
		if (changed) instance.pendingEffects.push({ index: i, fn });
	},
	useRef(initial) {
		const instance = hookState.current;
		const i = instance.index++;
		if (instance.hooks[i] === undefined) instance.hooks[i] = { kind: 'ref', current: initial };
		return instance.hooks[i];
	},
	useCallback(fn, deps) {
		const instance = hookState.current;
		const i = instance.index++;
		const slot = instance.hooks[i];
		if (slot !== undefined && deps !== undefined && slot.deps !== undefined
			&& deps.length === slot.deps.length && deps.every((d, k) => Object.is(d, slot.deps[k]))) return slot.fn;
		instance.hooks[i] = { kind: 'callback', fn, deps };
		return fn;
	},
	useMemo(fn, deps) {
		const instance = hookState.current;
		const i = instance.index++;
		const slot = instance.hooks[i];
		if (slot !== undefined && deps !== undefined && slot.deps !== undefined
			&& deps.length === slot.deps.length && deps.every((d, k) => Object.is(d, slot.deps[k]))) return slot.value;
		const value = fn();
		instance.hooks[i] = { kind: 'memo', value, deps };
		return value;
	},
	useSyncExternalStore(subscribe, getSnapshot) {
		const instance = hookState.current;
		const i = instance.index++;
		const value = getSnapshot();
		instance.hooks[i] = { kind: 'store', value };
		if (typeof subscribe === 'function') {
			// Subscribe once per instance; notifications mark the tree dirty.
			if (instance.hooks[i].unsub === undefined) {
				const unsub = subscribe(() => { hookState.dirty = true; });
				instance.hooks[i].unsub = typeof unsub === 'function' ? unsub : undefined;
			}
		}
		return value;
	},
};

// ---------------------------------------------------------------- mini DOM
const head = { children: [], append(node) { this.children.push(node); }, remove(node) { this.children = this.children.filter((n) => n !== node); } };
const body = { children: [], append(node) { this.children.push(node); node.__owner = this; }, remove(node) { this.children = this.children.filter((n) => n !== node); } };
// localStorage survives replacing the plugin files, which is exactly what the
// one-time notice relies on. Exposed so cases can reset it.
const storage = new Map();
globalThis.localStorage = {
	getItem(key) { return storage.has(key) ? storage.get(key) : null; },
	setItem(key, value) { storage.set(key, String(value)); },
	removeItem(key) { storage.delete(key); },
	clear() { storage.clear(); },
};
globalThis.__peStorage = storage;
globalThis.document = {
	head,
	body,
	querySelector: () => null,
	createElement: (tag) => ({
		tag, dataset: {}, className: '', textContent: '', children: [], attrs: {},
		setAttribute(name, value) { this.attrs[name] = value; },
		append(...nodes) { for (const n of nodes) { n.__owner = this; this.children.push(n); } },
		appendChild(node) { node.__owner = this; this.children.push(node); return node; },
		addEventListener(type, handler) { (this.listeners ??= {})[type] = handler; },
		remove() { const owner = this.__owner ?? head; owner.remove(this); },
	}),
	addEventListener(type, handler) { (globalThis.__peDocListeners ??= {})[type] = handler; },
	removeEventListener(type, handler) {
		const list = globalThis.__peDocListeners;
		if (list && list[type] === handler) delete list[type];
	},
};
globalThis.__peDocListeners = {};

// ---------------------------------------------------------------- module load
let plugin;
globalThis.window = {
	__ModuleLoader__: {
		load({ id, factory }) {
			const require = (name) => {
				if (name === 'react') return React;
				if (name === '@deepseek-ai/dsh-client-ui-primitives') return {};
				throw new Error('unexpected require: ' + name);
			};
			plugin = factory(require);
			// The module id must match the package name: the loader keys the bundle on it.
			const pkgName = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).name;
			assert.equal(id, pkgName, 'client module id must equal the package name');
		},
	},
	// The plugin installs a keyboard fallback on the window; the harness records the
	// listeners so a test can dispatch a key and assert what the plugin does.
	addEventListener(type, handler) {
		(globalThis.__peKeyListeners ??= []).push({ type, handler });
	},
	removeEventListener(type, handler) {
		const list = globalThis.__peKeyListeners ?? [];
		const at = list.findIndex((entry) => entry.type === type && entry.handler === handler);
		if (at >= 0) list.splice(at, 1);
	},
};
globalThis.__peKeyListeners = [];
new Function(source)();

// ---------------------------------------------------------------- render harness
function snapshotOf(value) {
	return (selector, equal) => {
		const selected = selector(value);
		return selected;
	};
}

// A mount creates a FRESH instance, so state from an earlier test can never leak
// into the next one — the same isolation a real unmount/remount gives.
function mountComponent(Component, props) {
	const instance = createInstance(Component);
	return renderInstanceToTree(instance, props);
}

/** Render an instance to a (memoised) element tree. */
function renderInstanceToTree(instance, props) {
	let tree;
	// Repeat while an effect scheduled a state update, like React's render loop.
	for (let round = 0; round < 30; round += 1) {
		hookState.dirty = false;
		hookState.rendered = new Map();
		tree = renderInstance(instance, props);
		if (!hookState.dirty) break;
	}
	return { tree, instance, rerender: () => renderInstanceToTree(instance, props) };
}

/**
 * Re-render the same instance after async work settles, preserving hook state so
 * values set by an effect are visible.
 */
function settle(Component, props, instance) {
	const target = instance ?? createInstance(Component);
	return renderInstanceToTree(target, props).tree;
}

/**
 * Resolve function components the way React does, without disturbing hook state.
 *
 * Expanding runs a child component exactly once per pass and memoises it in
 * `hookState.rendered`. Re-invoking on every traversal (the previous behaviour)
 * made components with their own hook slots re-run with a reset index, which is
 * what scattered the task-registry state under the harness.
 */
let expandOrdinal = 0;
function expand(node) {
	if (node === null || node === undefined || typeof node !== 'object') return node;
	if (Array.isArray(node)) return node.map(expand).flat(Infinity);
	if (typeof node.type === 'function') {
		const key = node.type.name + '#' + (expandOrdinal++);
		const cached = hookState.rendered.get(node.type);
		if (cached !== undefined && cached.key === key) return cached.tree;
		// A fresh instance for this child: React gives every component its own slots.
		const instance = createInstance(node.type);
		const tree = expand(renderInstance(instance, { ...(node.props ?? {}), children: undefined }));
		hookState.rendered.set(node.type, { key, tree });
		return tree;
	}
	const children = (node.children ?? []).map(expand).flat(Infinity);
	return { ...node, children };
}
function findButton(node) {
	const root = expand(node);
	const stack = [root];
	while (stack.length > 0) {
		const current = stack.pop();
		if (current === null || current === undefined || typeof current !== 'object') continue;
		if (Array.isArray(current)) {
			stack.push(...current);
			continue;
		}
		if (current.type === 'button') return current;
		stack.push(...(current.children ?? []));
	}
	return null;
}

function flatten(node, out = []) {
	const root = expand(node);
	const stack = [root];
	while (stack.length > 0) {
		const current = stack.pop();
		if (current === null || current === undefined) continue;
		if (Array.isArray(current)) {
			stack.push(...current);
			continue;
		}
		if (typeof current !== 'object') continue;
		out.push(current);
		stack.push(...(current.children ?? []));
	}
	return out;
}

function textOf(node) {
	return flatten(node)
		.map((n) => (typeof n.children === 'string' ? n.children : Array.isArray(n.children) ? n.children.filter((c) => typeof c === 'string').join(' ') : ''))
		.filter((text) => text !== '')
		.join(' ');
}

// ---------------------------------------------------------------- fake fetch
let nextResponse = null;
const requests = [];
// Per-route responses for the two read-only endpoints the seat polls. They are
// separate from `nextResponse` (which drives the enhancement POST) so a case can
// describe "context available" without interfering with the run it is testing.
let contextStatus = { hasContext: true };
// The plugin resolves the client `sessions` service through ctx.get(); the stub
// exposes it so the image path can be driven end to end.
let sessionServiceStub;
// The draft-attachment owner: `conversation` resolves browser-local draft ids to
// descriptors carrying the original File.
let conversationServiceStub;
// The plugin resolves `shortcuts` through ctx.get now. This holder lets the
// bad-service cases substitute a missing or malformed face.
let shortcutsServiceStub;
let settingsPayload = { ok: true, values: { referenceContext: true, referenceImages: false, useCustomModel: false, enhanceProvider: '', enhanceModel: '' } };

globalThis.fetch = async (url, init) => {
	const target = String(url);
	// Diagnostic beacons are out-of-band: never routed, never recorded, so they cannot
	// consume a scripted response or disturb request-count assertions.
	if (target.includes("/prompt-enhance/diag")) {
		return { ok: true, status: 200, json: async () => ({ ok: true }) };
	}
	// The seat's expectation queries are read-only and must never be mistaken for the
	// enhancement request (they have no body to parse).
	if (target.includes('/context-status')) {
		requests.push({ url: target, init, body: null });
		return { ok: true, status: 200, json: async () => ({ ok: true, hasContext: contextStatus.hasContext }) };
	}
	if (target.includes('/settings') && (init?.method ?? 'GET') === 'GET') {
		requests.push({ url: target, init, body: null });
		// A composer-scoped read is the slim view: no about text, no changelog.
		if (target.includes('scope=composer')) {
			return { ok: true, status: 200, json: async () => ({ ok: true, values: settingsPayload.values, imageLimits: settingsPayload.imageLimits, fileLimits: settingsPayload.fileLimits }) };
		}
		return { ok: true, status: 200, json: async () => settingsPayload };
	}
	requests.push({ url, init, body: init?.body === undefined ? null : JSON.parse(init.body) });
	const plan = nextResponse;
	if (typeof plan === 'function') return plan(url, init);
	if (plan?.error) throw plan.error;
	return {
		ok: plan?.status === undefined || plan.status < 400,
		status: plan?.status ?? 200,
		json: async () => plan.body,
	};
};

/**
 * The enhancement POSTs only.
 *
 * The seat also polls two read-only endpoints (settings, context-status) to decide
 * whether to show the context mark. Those are recorded in the same log so a test can
 * assert they happened, but they must never be counted as enhancement requests.
 */
function enhanceCalls() {
	return requests.filter((request) => String(request.url) === '/api/prompt-enhance');
}

/**
 * Unique session id per fixture.
 *
 * The task registry is module-level and keyed by session — the whole point of the
 * fix — so two cases sharing one id would observe each other's task. A fresh id
 * per fixture gives every case the isolation a real new conversation has.
 */
let sessionCounter = 0;
const nextSessionId = () => `s-${++sessionCounter}`;

function makeHelpers({ draft = '做个图', draftRev = 3, phase = 'plain', attachmentIds = [], occurrences = [], sessionId } = {}) {
	const sid = sessionId ?? nextSessionId();
	const state = { draft, draftRev, phase, attachmentIds, occurrences };
	const writes = [];
	const useInput = (selector) => selector(state);
	const inputActions = {
		insertText(text, span) {
			writes.push({ text, span });
			// The host bumps its revision after every accepted edit; captureInsertion()
			// below must therefore report a different value on a second write.
			state.draftRev += 1;
			return true;
		},
		captureInsertion() {
			return { start: 0, end: 0, draftRev: state.draftRev };
		},
	};
	return {
		state,
		writes,
		props: { sessionId: sid, useInput, inputActions, t: (key, vars) => (vars === undefined ? key : `${key}:${JSON.stringify(vars)}`) },
	};
}

function installPlugin() {
	const registrations = [];
	// A fresh plugin instance installs its own window listener; clearing keeps the
	// "last installed" lookup pointing at this instance.
	globalThis.__peKeyListeners = [];
	// Minimal stand-in for the host shortcuts service, matching the contract the
	// plugin relies on: register a command, read the catalog, describe a candidate,
	// and edit a binding. The real service owns persistence and conflict detection;
	// this stub reproduces its REPLY shape so the plugin path is exercised.
	const registeredCommands = [];
	const shortcuts = {
		register(command) {
			registeredCommands.push(command);
			return () => {};
		},
		registerFixed(command) {
			registeredCommands.push(command);
			return () => {};
		},
		catalog: {
			// The resolved row for our command, as `refreshLabels` publishes it: a normalized
			// binding plus the display keys. The fallback listener compares against this.
			getSnapshot: () => [{
				id: 'prompt-enhance.run',
				binding: { code: 'KeyE', modifiers: ['control', 'shift'] },
				keys: ['Ctrl', '+', 'Shift', '+', 'E'],
			}],
			subscribe: () => () => {},
		},
		config: { getSnapshot: () => ({ revision: 1 }) },
		describeBinding: (binding) => ({
			conflicts: [],
			issue: null,
			keys: [],
			// Mirror the host: `primary` expands to the platform modifier.
			binding: {
				code: binding.code,
				modifiers: (binding.modifiers ?? []).map((m) => (m === 'primary' ? 'control' : m)),
			},
		}),
		edit: () => ({ status: 'saved' }),
	};
	const ctx = {
		inject: ['slots', 'locale'],
		shortcuts,
		// Only the services this plugin looks up are modelled.
		get: (name) => {
			if (name === 'sessions') return sessionServiceStub;
			if (name === 'conversation') return conversationServiceStub;
			if (name === 'shortcuts') return shortcutsServiceStub === undefined ? shortcuts : shortcutsServiceStub;
			return undefined;
		},
		registeredCommands,
		locale: {
			register: () => () => {},
			// The plugin binds a translator for its nav label and settings copy.
			bind: () => (key, vars) => (vars === undefined ? key : `${key}:${JSON.stringify(vars)}`),
		},
		// `ctx.inject(names, cb)` runs the callback only when every named service
		// exists, and never gates activation. Mirrors the host contract the plugin relies
		// on for optional services.
		inject: (names, callback) => {
			const list = Array.isArray(names) ? names : [names];
			const present = list.every((name) => {
				const value = ctx.get(name);
				return value !== undefined && value !== null;
			});
			if (present) callback(ctx);
			return () => {};
		},
		effect: (fn) => {
			const dispose = fn();
			return () => { if (typeof dispose === 'function') dispose(); };
		},
		slots: {
			inject(key, cb) {
				assert.ok(
					key === 'conversation.input.right' || key === 'settings.section',
					`unexpected slot ${key}`,
				);
				const dispose = cb();
				return () => { if (typeof dispose === 'function') dispose(); };
			},
			register(options, component) {
				registrations.push({ options, component });
				return () => {};
			},
		},
	};
	const listenersBefore = (globalThis.__peKeyListeners ?? []).length;
	// Cordis activates a plugin only when EVERY injected service exists. Modelling
	// that here is what makes the "shortcuts service is absent" case meaningful:
	// with `shortcuts` in the inject list the plugin never applies, so the composer
	// button disappears. The stub must reproduce that, not skip it.
	const injected = plugin.inject ?? [];
	const missing = injected.filter((name) => {
		if (name === 'slots' || name === 'locale') return false;
		if (name === 'remote') return false;
		if (name === 'remote.session') return false;
		return ctx.get(name) === undefined || ctx.get(name) === null;
	});
	if (missing.length > 0) {
		// Dormant: no slots registered, no commands registered.
		return registrations;
	}
	plugin.apply(ctx);
	registrations.keyListeners = (globalThis.__peKeyListeners ?? []).slice(listenersBefore);
	// Expose the commands this instance registered, so a test can invoke the very
	// command the host would, against the same module-level task registry.
	registrations.commands = registeredCommands;
	return registrations;
}

/** The composer control registration. */
function composerRegistration(registrations) {
	const found = registrations.find((entry) => entry.options.name === 'conversation.input.right');
	assert.ok(found, 'expected the composer control');
	return found;
}

/** The settings page registration. */
function settingsRegistration(registrations) {
	const found = registrations.find((entry) => entry.options.name === 'settings.section');
	assert.ok(found, 'expected the settings page');
	return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

await test('registers exactly one control in conversation.input.right', async () => {
	const registrations = installPlugin();
	assert.equal(registrations.length, 2);
	assert.equal(registrations[0].options.name, 'conversation.input.right');
	assert.equal(registrations[0].options.id, 'prompt-enhance');
	assert.equal(registrations[0].options.order, 50);
	assert.equal(registrations[0].options.locale, 'prompt-enhance');
	assert.equal(typeof registrations[0].component, 'function');
});

await test('renders nothing while the draft is empty', async () => {
	nextResponse = { body: { ok: true, text: 'x' } };
	const { props } = makeHelpers({ draft: '   ' });
	const { tree } = mountComponent(composerRegistration(installPlugin()).component, props);
	assert.equal(findButton(tree), null);
});

await test('shows an icon-only button once the draft has content', async () => {
	nextResponse = { body: { ok: true, text: 'x' } };
	const { props } = makeHelpers({ draft: '做个图' });
	const { tree } = mountComponent(composerRegistration(installPlugin()).component, props);
	const button = findButton(tree);
	assert.ok(button, 'expected a button');
	assert.equal(button.props['aria-busy'], false);
	assert.equal(button.props['data-busy'], false);
	assert.equal(button.props['data-state'], 'idle');
	// Icon-only: no visible text, the label lives in the accessible name and tooltip.
	assert.equal(textOf(button), '');
	assert.equal(button.props['aria-label'], 'label.idle');
	assert.equal(button.props.title, 'label.idle');
	const icon = flatten(button).find((node) => node.type === 'svg');
	assert.ok(icon, 'expected an svg icon');
	// The idle mark is the OFFICIAL fish logo (23.16:17.04 viewBox), sized by height.
	assert.match(icon.props.viewBox, /^0 0 23\.16 17\.04$/u);
	assert.equal(icon.props.height, 14);
	assert.ok(icon.props.width > icon.props.height, 'the fish is wider than tall');
	const path = flatten(icon).find((node) => node.type === 'path');
	assert.ok(path && path.props.d.length > 3000, 'official fish path must be reused verbatim');
});

await test('posts the draft and replaces it in place without sending', async () => {
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '请绘制一张折线图，含坐标轴与图例。', model: 'p1 / m1' } };
	const helper = makeHelpers({ draft: '做个图', draftRev: 7 });
	const { tree } = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(tree).props.onClick();
	await sleep(0);
	assert.equal(enhanceCalls().length, 1);
	assert.equal(enhanceCalls()[0].url, '/api/prompt-enhance');
	assert.equal(enhanceCalls()[0].init.method, 'POST');
	assert.equal(enhanceCalls()[0].init.credentials, 'same-origin');
	assert.deepEqual(enhanceCalls()[0].body, { sessionId: helper.props.sessionId, draft: '做个图', images: [], files: [], clientFilesSkipped: 0 });
	assert.equal(helper.writes.length, 1);
	assert.equal(helper.writes[0].text, '请绘制一张折线图，含坐标轴与图例。');
	assert.deepEqual(helper.writes[0].span, { start: 0, end: 3, draftRev: 7 });
});

await test('a clarification response leaves the original draft untouched', async () => {
	nextResponse = { body: { ok: true, kind: 'clarify', text: '你希望我对这个文档做什么？' } };
	const helper = makeHelpers({ draft: '诺奖终稿.docx', draftRev: 3 });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(20);
	assert.equal(helper.writes.length, 0);
	assert.equal(helper.state.draft, '诺奖终稿.docx');
	assert.ok(flatten(mounted.rerender().tree).find((node) => node.props?.['data-tone'] === 'info'), 'clarification must be visible');
});


await test('shows a busy spinner while the host is working, then offers the undo', async () => {
	let release;
	nextResponse = () => new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: async () => ({ ok: true, text: '增强结果' }) }); });
	const helper = makeHelpers();
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	const busyTree = mounted.rerender().tree;
	const busyButton = findButton(busyTree);
	assert.equal(busyButton.props['data-busy'], true);
	assert.equal(busyButton.props['aria-busy'], true);
	assert.equal(busyButton.props['aria-label'], 'label.busy');
	// The busy mark is the official TWIST tail (a stepped SVG contour), not a
	// generic spinner and not a text label.
	assert.equal(textOf(busyButton), '');
	assert.equal(flatten(busyButton).some((node) => node.props?.className === 'dsh-pe_twist'), true);
	assert.equal(flatten(busyButton).some((node) => node.props?.className === 'dsh-pe_spin'), false);
	// It must be an SVG path whose `d` is one of the official twist contours.
	const twistSvg = flatten(busyButton).find((node) => node.props?.className === 'dsh-pe_twist');
	assert.equal(twistSvg.type, 'svg');
	assert.equal(twistSvg.props.viewBox, '20 40 300 240');
	const twistPath = flatten(busyButton).find((node) => node.type === 'path');
	assert.ok(twistPath && twistPath.props.d.length > 300, 'twist contour must be the real official path');
	release();
	await sleep(0);
	assert.equal(helper.writes.length, 1);
	// The swap published a new draft; the seat now offers the way back.
	helper.state.draft = '增强结果';
	helper.state.draftRev = 8;
	const doneTree = mounted.rerender().tree;
	const doneButton = findButton(doneTree);
	assert.equal(doneButton.props['data-busy'], false);
	assert.equal(doneButton.props['data-state'], 'undo');
	assert.equal(doneButton.props['aria-label'], 'label.undo');
});

await test('the undo button restores the exact pre-enhancement prompt', async () => {
	nextResponse = { body: { ok: true, text: '增强后的提示词' } };
	const helper = makeHelpers({ draft: '原始草稿', draftRev: 4 });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	assert.equal(helper.writes.length, 1);
	assert.equal(helper.writes[0].text, '增强后的提示词');

	// The composer published the produced draft and the user re-renders it.
	helper.state.draft = '增强后的提示词';
	helper.state.draftRev = 5;
	const undoTree = mounted.rerender().tree;
	const undoButton = findButton(undoTree);
	assert.equal(undoButton.props['data-state'], 'undo');
	assert.equal(textOf(undoButton), '', 'the undo control must stay icon-only');

	undoButton.props.onClick();
	assert.equal(helper.writes.length, 2, 'undo must issue exactly one more edit');
	assert.equal(helper.writes[1].text, '原始草稿', 'undo must write back the original prompt');
	assert.deepEqual(helper.writes[1].span, { start: 0, end: '增强后的提示词'.length, draftRev: 5 });

	// After the restore the seat returns to the enhance affordance.
	helper.state.draft = '原始草稿';
	helper.state.draftRev = 6;
	const afterTree = mounted.rerender().tree;
	assert.equal(findButton(afterTree).props['data-state'], 'idle');
});

await test('editing the produced draft retires the undo offer', async () => {
	nextResponse = { body: { ok: true, text: '增强后的提示词' } };
	const helper = makeHelpers({ draft: '原始草稿' });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	helper.state.draft = '增强后的提示词';
	helper.state.draftRev = 5;
	assert.equal(findButton(mounted.rerender().tree).props['data-state'], 'undo');

	// The user types over the produced text: the offer no longer applies.
	helper.state.draft = '增强后的提示词，再加一句';
	helper.state.draftRev = 6;
	assert.equal(findButton(mounted.rerender().tree).props['data-state'], 'idle');
});

await test('a failed request keeps the draft and switches to the retry mark', async () => {
	requests.length = 0;
	nextResponse = { body: { ok: false, code: 'AUTH', message: '凭据缺失' } };
	const helper = makeHelpers();
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	const tree = mounted.rerender().tree;
	const button = findButton(tree);
	assert.equal(textOf(button), '');
	assert.equal(button.props['data-state'], 'error');
	assert.match(button.props.title, /凭据缺失/u);
	assert.equal(helper.writes.length, 0, 'draft must be untouched on failure');
	assert.match(textOf(tree), /凭据缺失/u);
});

await test('a failed enhancement offers no undo', async () => {
	nextResponse = { body: { ok: false, code: 'AUTH', message: '凭据缺失' } };
	const helper = makeHelpers({ draft: '原始草稿' });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	assert.equal(findButton(mounted.rerender().tree).props['data-state'], 'error');
});

await test('a transport error surfaces the HTTP status', async () => {
	nextResponse = { status: 503, body: {} };
	const helper = makeHelpers();
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	assert.match(textOf(mounted.rerender().tree), /state\.transport/u);
	assert.equal(helper.writes.length, 0);
});

await test('a draft change during the request blocks the overwrite', async () => {
	let release;
	nextResponse = () => new Promise((resolve) => {
		release = () => resolve({ ok: true, status: 200, json: async () => ({ ok: true, text: '新提示词' }) });
	});
	const helper = makeHelpers({ draft: '旧草稿', draftRev: 11 });
	const Host = composerRegistration(installPlugin()).component;
	const mounted = mountComponent(Host, helper.props);
	findButton(mounted.tree).props.onClick();
	// The user types while the request is in flight: the draft revision advances
	// and React re-renders this same component instance.
	helper.state.draft = '旧草稿 + 新输入';
	helper.state.draftRev = 12;
	mounted.rerender();
	release();
	await sleep(0);
	mounted.rerender();
	assert.equal(helper.writes.length, 0, 'stale result must not overwrite the draft');
	// Nothing was replaced, so no undo may be offered either.
	assert.notEqual(findButton(mounted.rerender().tree).props['data-state'], 'undo');
});

await test('the composer refusing the replacement is reported', async () => {
	nextResponse = { body: { ok: true, text: '增强结果' } };
	const helper = makeHelpers();
	helper.props.inputActions = { insertText: () => false };
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	assert.match(textOf(mounted.rerender().tree), /state\.refused/u);
});

await test('a rewrite that finishes mid-send lands once the composer is idle', async () => {
	let release;
	nextResponse = () => new Promise((resolve) => {
		release = () => resolve({ ok: true, status: 200, json: async () => ({ ok: true, text: '增强结果' }) });
	});
	const helper = makeHelpers();
	// A host-accurate writer: an accepted insert commits the new draft in the same
	// tick, which is what lets the undo seat adopt the produced text.
	helper.props.inputActions = {
		insertText(text, span) {
			helper.writes.push({ text, span });
			helper.state.draft = text;
			helper.state.draftRev += 1;
			return true;
		},
		captureInsertion: () => ({ start: 0, end: 0, draftRev: helper.state.draftRev }),
	};
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	// The user sends the message while the rewrite is still running: the host freezes
	// the editor, and every span write would be refused.
	helper.state.phase = 'sending';
	mounted.rerender();
	release();
	await sleep(0);
	assert.equal(helper.writes.length, 0, 'a frozen composer must not be written to');

	// The send settles: the parked result lands without another click.
	helper.state.phase = 'plain';
	mounted.rerender();
	await sleep(0);
	assert.equal(helper.writes.length, 1);
	assert.equal(helper.writes[0].text, '增强结果');

	// The text landed in the host draft, so the seat now offers the way back.
	assert.equal(helper.state.draft, '增强结果');
	assert.equal(findButton(mounted.rerender().tree).props['data-state'], 'undo');
});

await test('a chip-free draft still lands when the span write is refused', async () => {
	nextResponse = { body: { ok: true, text: '增强结果' } };
	const helper = makeHelpers();
	const drafts = [];
	helper.props.inputActions = {
		insertText: () => false,
		captureInsertion: () => ({ start: 0, end: 0, draftRev: helper.state.draftRev }),
		setDraft: (text) => { drafts.push(text); },
	};
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	assert.deepEqual(drafts, ['增强结果']);
	assert.equal(findButton(mounted.rerender().tree).props['data-state'], 'undo');
});

await test('a user pause restores the fish mark instead of showing retry', async () => {
	requests.length = 0;
	nextResponse = (url, init) => new Promise((resolve, reject) => {
		init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
	});
	const helper = makeHelpers({ draft: '原始草稿', draftRev: 3 });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	assert.equal(enhanceCalls().length, 1);
	assert.equal(findButton(mounted.rerender().tree).props['data-state'], 'busy');

	// The user clicks again to pause their own run.
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	const after = findButton(mounted.rerender().tree);

	// Icon: back to the resting fish, NOT the retry/error mark.
	assert.equal(after.props['data-state'], 'idle', 'a pause must not enter the error state');
	assert.equal(after.props['data-busy'], false);
	assert.notEqual(after.props['data-state'], 'error');
	// The rendered mark is the fish svg (official viewBox), not the retry arrow.
	const mark = flatten(after).find((node) => node.type === 'svg');
	assert.ok(mark, 'expected an svg mark');
	assert.equal(mark.props.viewBox, '0 0 23.16 17.04', 'pause must fall back to the official fish');
	// Draft untouched, no undo offered.
	assert.equal(helper.writes.length, 0, 'a pause must leave the draft unchanged');
	assert.notEqual(after.props['data-state'], 'undo');
	// The cancellation is still announced for assistive tech.
	assert.match(textOf(mounted.rerender().tree), /state\.cancelled/u);
});

await test('after a pause, the next run follows the normal icon logic again', async () => {
	// First run: paused by the user.
	let aborted = false;
	nextResponse = (url, init) => new Promise((resolve, reject) => {
		init.signal.addEventListener('abort', () => {
			aborted = true;
			reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
		});
	});
	const helper = makeHelpers({ draft: '草稿' });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	assert.equal(aborted, true);
	assert.equal(findButton(mounted.rerender().tree).props['data-state'], 'idle');

	// Second run: a normal success must behave exactly as before the change.
	nextResponse = { body: { ok: true, text: '增强后的提示词' } };
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	assert.equal(helper.writes.length, 1, 'the second run must replace the draft');
	// The composer publishes the produced text; the undo offer survives only while
	// the live draft still equals what the swap left behind.
	helper.state.draft = '增强后的提示词';
	helper.state.draftRev = 4;
	assert.equal(findButton(mounted.rerender().tree).props['data-state'], 'undo', 'a successful run still offers the undo');
});

await test('unmounting does NOT abort the in-flight request', async () => {
	// The regression this whole change exists for: switching sessions unmounts the
	// composer, and the old cleanup aborted the fetch — so an enhancement stopped
	// the moment the user looked at another conversation. Unmounting must leave the
	// request running to completion.
	requests.length = 0;
	let resolveResponse;
	nextResponse = (url, init) => new Promise((resolve) => {
		resolveResponse = resolve;
		// Record an abort so the assertion can prove it never fired.
		init.signal.addEventListener('abort', () => { init.abortedByUnmount = true; });
	});
	const helper = makeHelpers({ draft: '离开会话时仍在增强' });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);

	// Simulate the session switch: the composer unmounts.
	mounted.instance.alive = false;
	for (const cleanup of mounted.instance.cleanups) if (typeof cleanup === 'function') cleanup();
	await sleep(0);

	assert.equal(enhanceCalls()[0].init.signal.aborted, false, 'unmount must not abort the request');
	assert.equal(enhanceCalls()[0].init.abortedByUnmount, undefined, 'no abort listener may have fired');

	// The request finishes afterwards, exactly as it would in the real client.
	resolveResponse({ ok: true, status: 200, json: async () => ({ ok: true, text: '完成后的提示词', mode: 'plain' }) });
	await sleep(0);
	// The result was parked rather than lost; the editor was not written to because
	// no composer is mounted for this session any more.
	assert.equal(helper.writes.length, 0, 'an unmounted editor is never written to');
});

await test('a composer without insertText renders nothing (no crash)', async () => {
	const helper = makeHelpers();
	helper.props.inputActions = undefined;
	const { tree } = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	assert.equal(findButton(tree), null);
});

await test('a failure shows its reason on screen, not only in title', async () => {
	nextResponse = { body: { ok: false, code: 'AUTH', message: '凭据缺失' } };
	const helper = makeHelpers();
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	const tree = mounted.rerender().tree;

	// A visible notice element must exist, outside the visually hidden live region.
	const notice = flatten(tree).find((node) => node.props?.className === 'dsh-pe_notice');
	assert.ok(notice, 'a failed run must render a visible notice');
	assert.equal(notice.props.role, 'alert');
	assert.match(textOf(notice), /凭据缺失/u);
	// It must not be the screen-reader-only span.
	const hidden = flatten(tree).find((node) => node.props?.className === 'dsh-pe_sr');
	assert.notEqual(notice, hidden, 'the reason must live in a visible element');
});

await test('a successful run in context mode is reported in the accessible name', async () => {
	// The tooltip may describe what the last run did; the DOT may not (see the
	// dedicated mark tests below). This case pins only the accessible name.
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'context' } };
	const helper = makeHelpers({ draft: '草稿' });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	helper.state.draft = '增强结果';
	helper.state.draftRev = 7;
	const tree = mounted.rerender().tree;
	const button = findButton(tree);
	// The test stub's `t` echoes the key and its params, so assert the call shape:
	// the context-aware key wraps the base label with the inner text as {base}.
	assert.match(button.props.title, /label\.contextAware/u);
	assert.match(button.props.title, /label\.undo/u, 'the inner label must be preserved as {base}');
});

await test('a plain-mode run is not described as context-aware', async () => {
	// The tooltip reports what the run did. With mode:'plain' it must not claim the
	// conversation was used. (The DOT is expectation-driven and covered separately.)
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	const helper = makeHelpers({ draft: '草稿' });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	helper.state.draft = '增强结果';
	helper.state.draftRev = 7;
	const tree = mounted.rerender().tree;
	assert.equal(findButton(tree).props.title.includes('已参考本会话上下文'), false);
});

await test('registers a settings page in the Settings sidebar', async () => {
	const registrations = installPlugin();
	const settings = settingsRegistration(registrations);
	assert.equal(settings.options.name, 'settings.section');
	assert.equal(settings.options.id, 'prompt-enhance');
	assert.equal(settings.options.order, 50);
	assert.equal(typeof settings.component, 'function');
	// The nav label is localized through the shared locale mechanism.
	assert.equal(typeof settings.options.label, 'function');
});

// --- composer images -------------------------------------------------------
// Regression for the reported bug: images were never read because the gate was a
// locally cached preference that the async settings load had not filled in yet.
// The Host now owns the switch, so the composer always forwards what the draft
// holds and never depends on settings having arrived.

await test('a text document is sent as file evidence, not as an image', async () => {
	requests.length = 0;
	nextResponse = { body: { ok: true, text: 'x' } };
	conversationServiceStub = undefined;
	const helper = makeHelpers({ draft: '分析这个文档', draftRev: 2, attachmentIds: ['file-doc'] });
	helper.props.inputActions.resolveDraftAttachments = () => [{ kind: 'file', file: { name: 'note.txt', type: 'text/plain', size: 5, arrayBuffer: async () => new TextEncoder().encode('hello').buffer } }];
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(20);
	const body = enhanceCalls()[0].body;
	assert.equal(body.files.length, 1);
	assert.equal(body.files[0].name, 'note.txt');
	assert.equal(body.files[0].mediaType, 'text/plain');
	assert.equal(body.files[0].textPreview, 'hello');
	// A text file travels as a bounded preview only: sending the same bytes again
	// as base64 doubles the request for no extra information.
	assert.equal(body.files[0].data, undefined);
	assert.equal(body.images.length, 0);
});

await test('the composer obeys the file policy the Host publishes', async () => {
	requests.length = 0;
	nextResponse = { body: { ok: true, text: 'x' } };
	conversationServiceStub = undefined;
	// One file per message and a 12-character preview, both taken from the Host. The
	// client keeps its own numbers only for the case where this route cannot be read,
	// so a reachable route must win.
	const fullPolicy = settingsPayload;
	settingsPayload = { ok: true, values: { referenceFiles: true }, fileLimits: { maxFilesPerMessage: 1, textPreviewChars: 24 } };
	const helper = makeHelpers({ draft: '分析这两个文档', draftRev: 2, attachmentIds: ['file-a', 'file-b'] });
	const long = { name: 'a.txt', type: 'text/plain', size: 26, arrayBuffer: async () => new TextEncoder().encode('abcdefghijklmnopqrstuvwxyz').buffer };
	const second = { name: 'b.txt', type: 'text/plain', size: 6, arrayBuffer: async () => new TextEncoder().encode('second').buffer };
	helper.props.inputActions.resolveDraftAttachments = () => [{ kind: 'file', file: long }, { kind: 'file', file: second }];
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(20);
	const body = enhanceCalls()[0].body;
	assert.equal(body.files.length, 1, 'the published file cap is enforced');
	assert.equal(body.files[0].name, 'a.txt');
	assert.equal(body.files[0].textPreview.length, 24, 'the published preview cap is enforced');
	assert.ok(body.files[0].textPreview.endsWith('[preview truncated]'));
	assert.equal(body.clientFilesSkipped, 1, 'the file that did not fit is reported');

	// A cap smaller than the truncation marker must still be a cap: a negative slice
	// reads from the end and would hand over almost the whole file.
	settingsPayload = { ok: true, values: { referenceFiles: true }, fileLimits: { maxFilesPerMessage: 1, textPreviewChars: 12 } };
	requests.length = 0;
	const short = makeHelpers({ draft: '分析这个文档', draftRev: 2, attachmentIds: ['file-a'] });
	short.props.inputActions.resolveDraftAttachments = () => [{ kind: 'file', file: long }];
	const secondMount = mountComponent(composerRegistration(installPlugin()).component, short.props);
	findButton(secondMount.tree).props.onClick();
	await sleep(20);
	const shortBody = enhanceCalls()[0].body;
	settingsPayload = fullPolicy;
	assert.equal(shortBody.files[0].textPreview.length, 12);
	assert.ok(requests.some((entry) => entry.url.includes('scope=composer')), 'the composer reads the slim settings view');
	settingsPayload = fullPolicy;
});

await test('a draft with no images sends an empty list without touching the store', async () => {
	requests.length = 0;
	const readCalls = [];
	const sessions = { binding: () => ({ session: { readAttachment: async (id) => { readCalls.push(id); return { ok: false }; } } }) };
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	const helper = makeHelpers({ draft: '纯文字' });
	helper.state.attachmentIds = [];
	helper.props.sessions = sessions;
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	assert.equal(readCalls.length, 0);
	const post = enhanceCalls()[0];
	assert.deepEqual(post.body.images, []);
});

await test('an unreadable composer image is skipped, not fatal', async () => {
	requests.length = 0;
	const sessions = {
		binding: () => ({
			session: {
				readAttachment: async () => {
					throw new Error('still uploading');
				},
			},
		}),
	};
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain', imagesUsed: 0, imagesSkipped: 1 } };
	const helper = makeHelpers({ draft: '看图' });
	helper.state.attachmentIds = ['att-1'];
	helper.props.sessions = sessions;
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	const post = enhanceCalls()[0];
	assert.deepEqual(post.body.images, [], 'a failed read must not block the rewrite');
	// The rewrite still succeeded.
	assert.equal(helper.writes.length, 1);
});

// ---------------------------------------------------------------------------
// Cross-session survival — the regression this change exists for
// ---------------------------------------------------------------------------
// Switching conversations unmounts this session's composer. The enhancement must
// keep running, finish, and be waiting when the user returns; two sessions must
// never interfere.

await test('an enhancement keeps running after its session is switched away', async () => {
	requests.length = 0;
	let release;
	nextResponse = () => new Promise((resolve) => {
		release = () => resolve({ ok: true, status: 200, json: async () => ({ ok: true, text: '完成的提示词', mode: 'plain' }) });
	});
	const host = composerRegistration(installPlugin()).component;
	const alpha = makeHelpers({ draft: 'A 会话的草稿' });
	const mountedA = mountComponent(host, alpha.props);
	findButton(mountedA.tree).props.onClick();
	await sleep(0);
	assert.equal(enhanceCalls().length, 1);

	// The user switches away: A's composer unmounts mid-flight.
	mountedA.instance.alive = false;
	for (const cleanup of mountedA.instance.cleanups) if (typeof cleanup === 'function') cleanup();
	await sleep(0);

	// The request is still alive and completes normally.
	assert.equal(enhanceCalls()[0].init.signal.aborted, false, 'switching sessions must not abort');
	release();
	await sleep(0);
	assert.equal(alpha.writes.length, 0, 'no editor is mounted for A, so nothing was written yet');
});

await test('returning to the session applies the finished result without re-triggering', async () => {
	requests.length = 0;
	let release;
	nextResponse = () => new Promise((resolve) => {
		release = () => resolve({ ok: true, status: 200, json: async () => ({ ok: true, text: '完成后的提示词', mode: 'plain' }) });
	});
	const host = composerRegistration(installPlugin()).component;
	const helper = makeHelpers({ draft: '原始草稿', draftRev: 5 });

	// Start the run, then leave.
	const first = mountComponent(host, helper.props);
	findButton(first.tree).props.onClick();
	await sleep(0);
	for (const cleanup of first.instance.cleanups) if (typeof cleanup === 'function') cleanup();
	release();
	await sleep(0);

	// Come back: a NEW composer instance mounts for the same session.
	const before = enhanceCalls().length;
	const back = mountComponent(host, helper.props);
	await sleep(0);

	// The parked result is delivered to the returning editor …
	assert.equal(helper.writes.length, 1, 'the finished rewrite is applied on return');
	assert.equal(helper.writes[0].text, '完成后的提示词');
	assert.equal(helper.writes[0].span.start, 0);
	// … and the run is NOT re-triggered by the remount.
	assert.equal(enhanceCalls().length, before, 'remounting must not start another request');
	assert.notEqual(findButton(back.tree)?.props?.['data-state'], 'busy', 'the session shows a settled task');
});

await test('two sessions can enhance at once without interfering', async () => {
	requests.length = 0;
	const releases = [];
	nextResponse = () => new Promise((resolve) => {
		// Each request resolves independently, in the order the test releases them.
		releases.push(() => resolve({ ok: true, status: 200, json: async () => ({ ok: true, text: 'done', mode: 'plain' }) }));
	});
	const host = composerRegistration(installPlugin()).component;

	const one = makeHelpers({ draft: '会话一的草稿' });
	const two = makeHelpers({ draft: '会话二的草稿' });
	const mountedOne = mountComponent(host, one.props);
	const mountedTwo = mountComponent(host, two.props);

	findButton(mountedOne.tree).props.onClick();
	await sleep(0);
	findButton(mountedTwo.tree).props.onClick();
	await sleep(0);

	assert.equal(enhanceCalls().length, 2, 'each session starts its own request');
	assert.notEqual(one.props.sessionId, two.props.sessionId);

	// Finish them in reverse order; each result must land on its own session.
	releases[1]();
	await sleep(0);
	mountedTwo.rerender();
	assert.equal(two.writes.length, 1, 'session two received its own result');
	assert.equal(one.writes.length, 0, 'session one is untouched by session two finishing');

	releases[0]();
	await sleep(0);
	mountedOne.rerender();
	assert.equal(one.writes.length, 1, 'session one received its own result');
});

await test('a paused task in one session does not pause another', async () => {
	requests.length = 0;
	const host = composerRegistration(installPlugin()).component;
	const running = makeHelpers({ draft: '会一直等待的会话' });
	nextResponse = () => new Promise(() => {}); // never settles
	const mountedRunning = mountComponent(host, running.props);
	findButton(mountedRunning.tree).props.onClick();
	await sleep(0);

	// A different session starts and finishes normally.
	let releaseOther;
	nextResponse = () => new Promise((resolve) => {
		releaseOther = () => resolve({ ok: true, status: 200, json: async () => ({ ok: true, text: 'other', mode: 'plain' }) });
	});
	const other = makeHelpers({ draft: '另一个会话' });
	const mountedOther = mountComponent(host, other.props);
	findButton(mountedOther.tree).props.onClick();
	await sleep(0);
	releaseOther();
	await sleep(0);
	mountedOther.rerender();
	assert.equal(other.writes.length, 1, 'the other session completes independently');
	assert.equal(running.writes.length, 0, 'the still-running session has not written');

	// Pause the running one; it must not affect the completed one.
	mountedRunning.rerender();
	findButton(mountedRunning.tree).props.onClick();
	await sleep(0);
	assert.equal(other.writes.length, 1, 'the finished session is unaffected by a pause elsewhere');
});

// ---------------------------------------------------------------------------
// Context mark — an EXPECTATION, not a history
// ---------------------------------------------------------------------------
// The dot answers "if I click now, will this run consult the conversation?".
// It is decided by the reference-context switch and whether the session actually
// has conversation, and by nothing else. In particular a previous run's success or
// failure must not change it.

const seatOf = (tree) => flatten(tree).find((node) => node.props?.['data-prompt-enhance'] === '1');

/** Mount the seat with the given server-side facts and return its context flag. */
async function mountWithContext({ hasContext, referenceContext }) {
	contextStatus = { hasContext };
	settingsPayload = { ok: true, values: { referenceContext, referenceImages: false, useCustomModel: false, enhanceProvider: '', enhanceModel: '' } };
	const helper = makeHelpers({ draft: '草稿' });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	await sleep(0);
	return { helper, mounted, mark: () => seatOf(mounted.rerender().tree).props['data-context'] };
}

await test('the mark shows before any run when context is available and the switch is on', async () => {
	const { mark } = await mountWithContext({ hasContext: true, referenceContext: true });
	assert.equal(mark(), 'true', 'an untouched session must already advertise the expectation');
});

await test('the mark is absent when the reference-context switch is off', async () => {
	const { mark } = await mountWithContext({ hasContext: true, referenceContext: false });
	assert.equal(mark(), 'false', 'the switch decides whether context will be used');
});

await test('the mark is absent when the session has no conversation', async () => {
	const { mark } = await mountWithContext({ hasContext: false, referenceContext: true });
	assert.equal(mark(), 'false', 'nothing to consult, so nothing to promise');
});

await test('the mark is hidden while a run is in flight', async () => {
	let release;
	nextResponse = () => new Promise((resolve) => {
		release = () => resolve({ ok: true, status: 200, json: async () => ({ ok: true, text: 'x', mode: 'context' }) });
	});
	const { helper, mounted, mark } = await mountWithContext({ hasContext: true, referenceContext: true });
	assert.equal(mark(), 'true', 'present before the click');
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	assert.equal(mark(), 'false', 'no "next click" exists while running, so the mark hides');
	release();
	await sleep(0);
});

await test('the mark returns after a failed run', async () => {
	// A failure says nothing about whether the NEXT run would use context.
	nextResponse = { body: { ok: false, message: 'boom' } };
	const { mounted, mark } = await mountWithContext({ hasContext: true, referenceContext: true });
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	assert.equal(mark(), 'true', 'a failed run must not erase the expectation');
});

await test('the mark is hidden on the undo seat', async () => {
	// After a successful run the seat becomes an undo button: clicking it restores the
	// previous draft rather than starting an enhancement, so a mark describing "what
	// the next enhancement will do" would describe an action this button no longer
	// performs.
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	const { helper, mounted, mark } = await mountWithContext({ hasContext: true, referenceContext: true });
	assert.equal(mark(), 'true', 'present before the run');
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	helper.state.draft = '增强结果';
	helper.state.draftRev = 7;
	assert.equal(mark(), 'false', 'the undo seat carries no context mark');
});

await test('the mark returns once the undo offer retires', async () => {
	// Editing the produced draft drops the undo offer; the seat is an enhancement
	// button again, so the expectation mark must come back.
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	const { helper, mounted, mark } = await mountWithContext({ hasContext: true, referenceContext: true });
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	helper.state.draft = '增强结果';
	helper.state.draftRev = 7;
	mounted.rerender();
	helper.state.draft = '增强结果，再加一句';
	helper.state.draftRev = 8;
	assert.equal(mark(), 'true', 'back to being an enhancement button, so the mark returns');
});

await test('an empty composer renders nothing even when context is available', async () => {
	// The seat only appears when there is something to act on. An available context
	// dot is not a reason to render a button that cannot do anything: that would put
	// a dead control in the toolbar of every conversation that has history.
	const helper = makeHelpers({ draft: '' });
	contextStatus = { hasContext: true };
	settingsPayload = { ok: true, values: { referenceContext: true, referenceImages: false, useCustomModel: false, enhanceProvider: '', enhanceModel: '' } };
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	await sleep(0);
	assert.equal(findButton(mounted.rerender().tree), null, 'no draft means no seat, context or not');
});

await test('an empty composer without context still renders nothing', async () => {
	const helper = makeHelpers({ draft: '' });
	contextStatus = { hasContext: false };
	settingsPayload = { ok: true, values: { referenceContext: true, referenceImages: false, useCustomModel: false, enhanceProvider: '', enhanceModel: '' } };
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	await sleep(0);
	assert.equal(findButton(mounted.rerender().tree), null, 'no draft and no context: nothing to show');
});

await test('the context dot uses the host accent token with a blue fallback', async () => {
	// The host theme does not define --dsw-alias-brand-primary; a bare var() of an
	// undefined token inherited currentColor, which is why the dot rendered white.
	const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');
	const joined = source.replace(/',\s*'/g, '');
	const rule = /\.dsh-pe_button::after\{[^}]*background:([^;]+);/.exec(joined);
	assert.ok(rule, 'the dot rule must declare a background');
	const background = rule[1];
	assert.match(background, /--dsw-alias-brand-primary-new-colorprimary-new-color/u, 'must use the token the host actually defines');
	assert.match(background, /#4176e6/u, 'must carry a blue fallback in case the token is renamed again');
	assert.match(joined, /width:4px;height:4px;border-radius:50%/u, 'the dot is 4px: 3px read too small, 5px too heavy');
});

// ---------------------------------------------------------------------------
// Keyboard parity
// ---------------------------------------------------------------------------
// The shortcut must do exactly what clicking the fish does, so it publishes the
// seat's own `onClick` rather than a private copy of the work.

await test('the shortcut runs the same handler the button click runs', async () => {
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	// The feature is opt-in: turn the switch on, otherwise the command is inert by design.
	settingsPayload = { ok: true, values: { referenceContext: true, referenceImages: false, useCustomModel: false, shortcutEnabled: true, enhanceProvider: '', enhanceModel: '' } };
	// One plugin instance: the command and the composer must share the same registry, or
	// the switch the composer reports would never reach the command that reads it.
	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '草稿' });
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	// The settings request is async: settle it, then re-render so the updated switch
	// reaches the effect that publishes it to the task registry.
	await sleep(0);
	mounted.rerender();

	const command = registrations.commands.find((c) => c.id === 'prompt-enhance.run');
	assert.ok(command, 'the command must be registered');

	command.run();
	await sleep(0);
	assert.equal(enhanceCalls().length, 1, 'the shortcut must trigger an enhancement');
});

await test('the shortcut is inert while the switch is off', async () => {
	// Default state: a global key must not fire for someone who never opted in.
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	settingsPayload = { ok: true, values: { referenceContext: true, referenceImages: false, useCustomModel: false, shortcutEnabled: false, enhanceProvider: '', enhanceModel: '' } };
	const helper = makeHelpers({ draft: '草稿' });
	mountComponent(composerRegistration(installPlugin()).component, helper.props);
	await sleep(0);

	installPlugin().commands.find((c) => c.id === 'prompt-enhance.run').run();
	await sleep(0);
	assert.equal(enhanceCalls().length, 0, 'the command must do nothing while the switch is off');
});

/**
 * Load a fresh instance of the plugin's client half.
 *
 * The task registry lives at module scope (that is what lets a task outlive its
 * composer), so it is shared by every test in this file. A case that asserts
 * "nothing is attached" therefore needs its own module instance rather than one
 * carrying state from an earlier case.
 */
async function isolatedPlugin() {
	const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');
	let fresh;
	globalThis.window = {
		__ModuleLoader__: {
			load({ id, factory }) {
				fresh = factory((name) => {
					if (name === 'react') return React;
					if (name === '@deepseek-ai/dsh-client-ui-primitives') return {};
					throw new Error('unexpected require: ' + name);
				});
				assert.equal(id, 'dsh-prompt-rewriter');
			},
		},
		addEventListener() {},
		removeEventListener() {},
	};
	new Function(source)();
	return fresh;
}

await test('the shortcut does not fire when no composer is mounted', async () => {
	// A fresh module instance: the registry is module-level, so a composer attached by
	// an earlier case would otherwise still answer the command here.
	const fresh = await isolatedPlugin();
	const recorded = [];
	const ctx = {
		inject: ['slots', 'locale'],
		shortcuts: {
			register: (command) => { recorded.push(command); return () => {}; },
			registerFixed: () => () => {},
			catalog: { getSnapshot: () => [], subscribe: () => () => {} },
			config: { getSnapshot: () => ({ revision: 1 }) },
			describeBinding: () => ({ conflicts: [], issue: null, keys: [] }),
			edit: () => ({ status: 'saved' }),
		},
		locale: { register: () => () => {}, bind: () => (key, vars) => (vars === undefined ? key : `${key}:${JSON.stringify(vars)}`) },
		// Optional-service injection: the callback runs only when the service exists.
		inject: (names, callback) => {
			const list = Array.isArray(names) ? names : [names];
			const ok = list.every((name) => {
				const value = name === 'shortcuts' ? ctx.shortcuts : undefined;
				return value !== undefined && value !== null;
			});
			if (ok) callback(ctx);
			return () => {};
		},
		effect: (fn) => { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
		slots: {
			inject: (_key, cb) => { const d = cb(); return () => { if (typeof d === 'function') d(); }; },
			register: () => () => {},
		},
	};
	fresh.apply(ctx);
	const command = recorded.find((entry) => entry.id === 'prompt-enhance.run');
	assert.ok(command, 'the command must be registered');

	requests.length = 0;
	assert.equal(typeof command.resolve, 'function', 'dispatch needs resolve');
	assert.equal(command.resolve({ modal: null }).status, 'handled', 'the command claims the key');
	assert.equal(enhanceCalls().length, 0, 'but performs no work without a composer');
});

await test('in the undo state the shortcut restores the draft, matching the button', async () => {
	const command = installPlugin().commands.find((c) => c.id === 'prompt-enhance.run');
	// The parity that matters: with an undo offer showing, a click restores the draft.
	// The shortcut publishes the same `onClick`, so it must restore too.
	//
	// Each path needs its own fresh setup: restoring consumes the undo offer, so the
	// two runs cannot share one seat.
	const runCase = async (drive) => {
		requests.length = 0;
		nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
		settingsPayload = { ok: true, values: { referenceContext: true, referenceImages: false, useCustomModel: false, shortcutEnabled: true, enhanceProvider: '', enhanceModel: '' } };
		const helper = makeHelpers({ draft: '原始草稿' });
		const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
		findButton(mounted.tree).props.onClick();
		await sleep(0);
		helper.state.draft = '增强结果';
		helper.state.draftRev = 7;
		mounted.rerender();

		const before = helper.writes.length;
		await drive(helper, mounted);
		await sleep(0);
		return helper.writes.slice(before);
	};

	// Mouse: click the seat.
	const mouseWrites = await runCase(async (helper, mounted) => {
		findButton(mounted.rerender().tree).props.onClick();
	});
	// Keyboard: run the registered command.
	const keyWrites = await runCase(async () => {
		installPlugin().commands.find((c) => c.id === 'prompt-enhance.run').run();
	});

	assert.ok(mouseWrites.length > 0, 'clicking the undo seat writes the draft');
	assert.equal(keyWrites.length, mouseWrites.length, 'the shortcut must write as many times as a click');
	assert.deepEqual(keyWrites, mouseWrites, 'and write exactly the same thing');
	assert.equal(keyWrites.at(-1).text, '原始草稿', 'the restored text is the pre-enhancement draft');
});

// ---------------------------------------------------------------------------
// Delivery after a session switch
// ---------------------------------------------------------------------------
// The editor revision is per-mount state. A run started before a switch carries a
// revision that can never match again, so keying delivery on the revision alone
// discarded the finished rewrite as "stale" — the enhancement looked like it had
// stopped, while an identical second attempt (whose revision happened to line up)
// worked. The unchanged draft is the real invariant.

await test('a parked result is applied after a switch even when the revision moved', async () => {
	requests.length = 0;
	let resolveResponse;
	nextResponse = () => new Promise((resolve) => { resolveResponse = resolve; });
	settingsPayload = { ok: true, values: { referenceContext: true, referenceImages: false, useCustomModel: false, shortcutEnabled: true, enhanceProvider: '', enhanceModel: '' } };

	const helper = makeHelpers({ draft: '原始草稿', draftRev: 3 });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);

	// Switch away: the composer unmounts while the request is in flight.
	mounted.instance.alive = false;
	for (const cleanup of mounted.instance.cleanups) if (typeof cleanup === 'function') cleanup();
	await sleep(0);

	// The request finishes with nobody mounted: the result is parked.
	resolveResponse({ ok: true, status: 200, json: async () => ({ ok: true, text: '增强后的提示词', mode: 'plain' }) });
	await sleep(0);
	assert.equal(helper.writes.length, 0, 'an unmounted editor is not written to');

	// Come back. The editor restores the same text but with a NEW revision, which is
	// exactly the case that used to be thrown away.
	helper.state.draft = '原始草稿';
	helper.state.draftRev = 9;
	const remounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	await sleep(0);
	remounted.rerender();
	await sleep(0);

	assert.ok(helper.writes.length > 0, 'the parked result must be delivered on return');
	assert.equal(helper.writes.at(-1).text, '增强后的提示词', 'and it must carry the produced text');
});

await test('a parked result is dropped when the draft was edited while away', async () => {
	// The safety half of the same rule: if the text changed, the result must NOT
	// overwrite what the user typed.
	requests.length = 0;
	let resolveResponse;
	nextResponse = () => new Promise((resolve) => { resolveResponse = resolve; });

	const helper = makeHelpers({ draft: '原始草稿', draftRev: 3 });
	const mounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	findButton(mounted.tree).props.onClick();
	await sleep(0);
	mounted.instance.alive = false;
	for (const cleanup of mounted.instance.cleanups) if (typeof cleanup === 'function') cleanup();
	await sleep(0);
	resolveResponse({ ok: true, status: 200, json: async () => ({ ok: true, text: '增强后的提示词', mode: 'plain' }) });
	await sleep(0);

	// The user typed something else before coming back.
	helper.state.draft = '我自己改过的草稿';
	helper.state.draftRev = 9;
	const remounted = mountComponent(composerRegistration(installPlugin()).component, helper.props);
	await sleep(0);
	remounted.rerender();
	await sleep(0);

	assert.equal(helper.writes.length, 0, 'a changed draft must never be overwritten');
});

// ---------------------------------------------------------------------------
// Composer images
// ---------------------------------------------------------------------------
// The composer slot provides only `inputActions`; `sessions` is not a prop. Before
// it was resolved from ctx, readComposerImages saw no session and reported every
// attachment as skipped while the rewrite still succeeded — the image was silently
// ignored.

await test('composer images reach the request body', async () => {
	// Draft ids are browser-local: only the `conversation` service can resolve them,
	// and it hands back the original File. session.readAttachment cannot, which is why
	// images were silently skipped before.
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	const resolved = [];
	conversationServiceStub = {
		resolveDraftAttachments: (ids) => {
			resolved.push(...ids);
			return ids.map((id) => ({
				kind: 'image',
				id,
				previewUrl: 'blob:preview',
				file: {
					name: 'shot.png',
					type: 'image/png',
					arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
				},
			}));
		},
	};

	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '看这张图', draftRev: 5, attachmentIds: ['att-1'] });
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);

	assert.deepEqual(resolved, ['att-1'], 'the draft id is resolved through the conversation service');
	const body = enhanceCalls()[0].body;
	assert.equal(body.images.length, 1, 'one image must be sent to the host');
	assert.equal(body.images[0].mediaType, 'image/png');
	assert.equal(body.images[0].data, 'AQID', 'the File bytes travel as canonical base64');
	conversationServiceStub = undefined;
});

await test('a non-image draft attachment is not sent', async () => {
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	conversationServiceStub = {
		resolveDraftAttachments: (ids) => ids.map((id) => ({
			kind: 'file',
			id,
			file: { name: 'report.pdf', type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(0) },
		})),
	};

	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '看这个文件', draftRev: 5, attachmentIds: ['att-9'] });
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);

	const body = enhanceCalls()[0].body;
	assert.equal(body.images.length, 0, 'only images are part of this feature');
	conversationServiceStub = undefined;
});

await test('a missing conversation service skips images without failing the run', async () => {
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain', imagesSkipped: 1 } };
	conversationServiceStub = undefined;
	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '看这张图', draftRev: 5, attachmentIds: ['att-1'] });
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	const body = enhanceCalls()[0].body;
	assert.equal(body.images.length, 0, 'no bytes can be read without the service');
	assert.equal(body.draft, '看这张图', 'the rewrite still runs on the text');
});

await test('an image is read when the conversation service mounts after activation', async () => {
	// Reproduces the real ordering: `apply` runs before the conversation plugin has
	// registered its service, so an eager capture would be undefined for the whole
	// session. The image must still be read once the service exists.
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	conversationServiceStub = undefined;

	const registrations = installPlugin();          // service absent here
	const helper = makeHelpers({ draft: '看这张图', draftRev: 5, attachmentIds: ['att-late'] });
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);

	// The conversation plugin mounts afterwards.
	conversationServiceStub = {
		resolveDraftAttachments: (ids) => ids.map((id) => ({
			kind: 'image',
			id,
			file: { name: 'late.png', type: 'image/png', arrayBuffer: async () => new Uint8Array([7, 8]).buffer },
		})),
	};

	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);

	const body = enhanceCalls()[0].body;
	assert.equal(body.images.length, 1, 'the late-mounted service must still be used');
	assert.equal(body.images[0].data, 'Bwg=', 'base64 of [7,8]');
	conversationServiceStub = undefined;
});

await test('the whale tail is painted brand blue, not inherited', async () => {
	// `color: inherit` made the tail take the button's label colour, which is why it
	// rendered white instead of the brand blue.
	const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');
	const joined = source.replace(/',\s*'/g, '');
	const rule = /\.dsh-pe_twist\{[^}]*\}/.exec(joined);
	assert.ok(rule, 'the tail rule must exist');
	assert.equal(/color:inherit/.test(rule[0]), false, 'inherit is exactly what made it white');
	assert.match(rule[0], /color:var\(--dsw-alias-brand-primary[^)]*\)/, 'the tail must use the brand accent token');
	assert.match(rule[0], /#4176e6/, 'and must carry a blue fallback for themes that rename it');
});

await test('images are read from the action face when the service is absent', async () => {
	// Two owners can resolve draft ids. Losing one of them must not make every image
	// unreadable, which is what a single-owner lookup did.
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	conversationServiceStub = undefined;
	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '看图', draftRev: 5, attachmentIds: ['att-1'] });
	helper.props.inputActions.resolveDraftAttachments = (ids) => ids.map((id) => ({
		kind: 'image',
		id,
		file: { name: 'a.png', type: 'image/png', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
	}));
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);

	const body = enhanceCalls()[0].body;
	assert.equal(body.images.length, 1, 'the action face must be able to supply the image');
	assert.equal(body.images[0].data, 'AQID');
});

await test('an unreadable attachment is reported instead of dropped silently', async () => {
	// Neither owner answers: the run still completes, but the skip count must reach the
	// user through the existing notice rather than vanishing.
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	conversationServiceStub = undefined;
	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '看图', draftRev: 5, attachmentIds: ['att-1'] });
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);

	const body = enhanceCalls()[0].body;
	assert.equal(body.images.length, 0, 'no bytes can be read');
	// The component turns its local skip count into the visible notice.
	const tree = mounted.rerender().tree;
	const notice = flatten(tree).find((n) => n.props?.className === 'dsh-pe_notice');
	const announced = flatten(tree).find((n) => n.props?.className === 'dsh-pe_sr');
	assert.ok(notice !== undefined || announced !== undefined, 'the skip must be surfaced somewhere');
});

// ---------------------------------------------------------------------------
// Shortcut service resilience
// ---------------------------------------------------------------------------
// The host builds the `shortcuts` service conditionally (it throws before
// `super(ctx, "shortcuts")` when the desktop keyboard bridge is absent), and a
// third-party shortcut plugin that pins the client runtime to an older range can
// keep it from registering. Losing it must cost only the shortcut row: the
// composer button has to keep rendering and keep working.

await test('the button still renders and works when the shortcuts service is absent', async () => {
	// Before the fix `shortcuts` sat in `inject`, which Cordis treats as "all services
	// must exist" — a missing service kept the whole plugin dormant, so the button
	// disappeared together with the shortcut row.
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	shortcutsServiceStub = null;   // ctx.get('shortcuts') resolves to null
	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '写个函数', draftRev: 3 });
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);
	const tree = mounted.rerender().tree;
	const button = findButton(tree);
	assert.ok(button !== undefined, 'the composer button must still render');
	button.props.onClick();
	await sleep(0);
	assert.equal(enhanceCalls().length, 1, 'and the rewrite must still run');
	shortcutsServiceStub = undefined;
});

await test('a service without edit reports unavailable instead of crashing', async () => {
	// A partially built face: registration works, editing does not. The settings row
	// must degrade to "unavailable" rather than throw during render.
	shortcutsServiceStub = {
		register: () => () => {},
		catalog: { getSnapshot: () => [{ id: 'prompt-enhance.run', keys: ['Ctrl', '+', 'E'] }], subscribe: () => () => {} },
		config: { getSnapshot: () => ({ revision: 1 }) },
		// `edit` is deliberately missing.
	};
	const registrations = installPlugin();
	const settings = mountComponent(settingsRegistration(registrations).component, {
		t: (key, vars) => (vars === undefined ? key : `${key}:${JSON.stringify(vars)}`),
	});
	await sleep(0);
	const tree = settings.rerender().tree;
	assert.ok(tree !== undefined, 'the settings page must render');
	const flat = flatten(tree);
	assert.ok(flat.length > 0, 'the settings page must not be blank');
	shortcutsServiceStub = undefined;
});

await test('a throwing or non-array catalog is tolerated', async () => {
	// Older host builds expose `catalog` as a plain value and some throw while the
	// bridge is still starting. Neither shape may crash the composer or the page.
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '增强结果', mode: 'plain' } };
	shortcutsServiceStub = {
		register: () => () => {},
		catalog: {
			getSnapshot: () => { throw new Error('bridge not ready'); },
			// Not an array, and not a wrapper with `commands` either.
			subscribe: () => { throw new Error('no subscribe'); },
		},
		config: { getSnapshot: () => { throw new Error('no config'); } },
		edit: () => { throw new Error('no edit'); },
	};
	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '写个函数', draftRev: 3 });
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);
	const button = findButton(mounted.rerender().tree);
	assert.ok(button !== undefined, 'the composer button must survive a throwing catalog');
	button.props.onClick();
	await sleep(0);
	assert.equal(enhanceCalls().length, 1, 'and the rewrite must still run');

	// The settings page must also survive the same broken face.
	const settings = mountComponent(settingsRegistration(registrations).component, {
		t: (key, vars) => (vars === undefined ? key : `${key}:${JSON.stringify(vars)}`),
	});
	await sleep(0);
	const tree = settings.rerender().tree;
	assert.ok(tree !== undefined, 'the settings page must render with a throwing catalog');
	shortcutsServiceStub = undefined;
});

await test('a result lands when the revision moved but the draft did not', async () => {
	// Attaching a file or a link chip commits an editor edit that bumps `draftRev`
	// while the draft TEXT stays the same. Writing with the revision captured at
	// click time then fails the host's `span.draftRev !== this.rev` guard, and the
	// user sees "输入框没有接受替换".
	requests.length = 0;
	nextResponse = { body: { ok: true, text: '改写后的提示词', mode: 'plain' } };
	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '原始草稿', draftRev: 3 });
	// Model the host's real guard instead of accepting every write.
	let hostRev = 3;
	const spans = [];
	helper.props.inputActions.insertText = (text, span) => {
		spans.push({ text, draftRev: span.draftRev });
		if (span.draftRev !== hostRev) return false;
		hostRev += 1;
		return true;
	};
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);

	findButton(mounted.rerender().tree).props.onClick();
	// While the model is running, the composer commits a file chip: revision moves,
	// text does not.
	hostRev = 9;
	helper.state.draftRev = 9;
	mounted.rerender();
	await sleep(0);
	await sleep(0);

	assert.equal(spans.length, 1, 'the write must be attempted');
	assert.equal(spans[0].draftRev, 9, 'it must carry the CURRENT revision, not the captured one');
	const tree = mounted.rerender().tree;
	const notice = flatten(tree).find((n) => n.props?.['data-notice'] === 'true');
	assert.equal(notice, undefined, 'no refusal notice may be shown');
});

// ---- Reference chips: detect coordinates + chip preservation ----------------
const CHIP_A = '电磁仿真基础及Python接口课件.pdf';
const CHIP_B = '智能算法驱动的光学设计与应用.pdf';

function chip(offset, label) {
	return { offset, length: label.length, clipboardText: label };
}

async function runRewrite(helper) {
	nextResponse = { body: { ok: true, text: '改写结果', mode: 'plain' } };
	const registrations = installPlugin();
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	await sleep(0);
	return mounted;
}

await test('chips are converted to detect coordinates and the write is accepted', async () => {
	const labelA = CHIP_A;
	const labelB = CHIP_B;
	const tail = '给我把这两个pdf给解密了';
	const draft = labelA + labelB + tail;
	const helper = makeHelpers({
		draft,
		occurrences: [chip(0, labelA), chip(labelA.length, labelB)],
	});
	await runRewrite(helper);
	assert.equal(helper.writes.length, 1, 'prefix chips leave one text run');
	const write = helper.writes[0];
	const detectEnd = draft.length - (labelA.length - 1) - (labelB.length - 1);
	assert.equal(write.span.end, detectEnd, 'end is the DETECT length, not clipboard length');
	assert.equal(write.span.start, 2, 'start skips the two chip characters');
	assert.equal(write.text, '改写结果');
	assert.equal(write.span.end <= draft.length, true);
});

await test('chips in the middle are preserved by replacing text runs back to front', async () => {
	const head = '请处理';
	const label = CHIP_A;
	const tail = '并给出结论';
	const draft = head + label + tail;
	const helper = makeHelpers({
		draft,
		occurrences: [chip(head.length, label)],
	});
	await runRewrite(helper);
	const detectEnd = draft.length - (label.length - 1);
	const chipStart = head.length;
	assert.equal(helper.writes.length, 2, 'two text runs around the chip');
	// The right-most run receives the new text first; the left run is cleared.
	assert.equal(helper.writes[0].text, '改写结果');
	assert.equal(helper.writes[0].span.start, chipStart + 1);
	assert.equal(helper.writes[0].span.end, detectEnd);
	assert.equal(helper.writes[1].text, '');
	assert.equal(helper.writes[1].span.start, 0);
	assert.equal(helper.writes[1].span.end, chipStart);
	// Neither span covers the chip's detect slot.
	for (const write of helper.writes) {
		assert.equal(write.span.start >= chipStart + 1 || write.span.end <= chipStart, true);
	}
	// Each write asks the host for the CURRENT revision.
	assert.equal(helper.writes[0].span.draftRev, 3);
	assert.equal(helper.writes[1].span.draftRev, 4);
});

await test('U+FFFC and private-use markers are normalised before the write', async () => {
	const marker = String.fromCharCode(0xFFFC);
	const pua = String.fromCharCode(0xE100);
	nextResponse = { body: { ok: true, text: '前' + marker + '后' + pua + '尾', mode: 'plain' } };
	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '草稿' });
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	await sleep(0);
	assert.equal(helper.writes.length, 1);
	assert.equal(helper.writes[0].text, '前后尾', 'markers removed here, not silently by the host');
	assert.equal(/[\uE100-\uE11D\uFFFC]/u.test(helper.writes[0].text), false);
});

await test('a draft with chips is not reported as refused', async () => {
	const labelA = CHIP_A;
	const labelB = CHIP_B;
	const helper = makeHelpers({
		draft: labelA + labelB + '给我把这两个pdf给解密了',
		occurrences: [chip(0, labelA), chip(labelA.length, labelB)],
	});
	const mounted = await runRewrite(helper);
	assert.equal(helper.writes.length, 1, 'the write went through');
	const tree = mounted.rerender().tree;
	const notice = flatten(tree).find((n) => n.props?.['data-notice'] === 'true');
	assert.equal(notice, undefined, 'no refusal notice');
});

await test('a chip-only draft inserts the rewrite after the attachments', async () => {
	const labelA = CHIP_A;
	const labelB = CHIP_B;
	const draft = labelA + labelB;
	const helper = makeHelpers({
		draft,
		occurrences: [chip(0, labelA), chip(labelA.length, labelB)],
	});
	await runRewrite(helper);
	assert.equal(helper.writes.length, 1, 'one collapsed insertion');
	const detectEnd = draft.length - (labelA.length - 1) - (labelB.length - 1);
	assert.equal(helper.writes[0].span.start, detectEnd);
	assert.equal(helper.writes[0].span.end, detectEnd, 'collapsed, so no chip is replaced');
	assert.equal(helper.writes[0].text, '改写结果');
});

// ---- Attached files: no disk paths in the rewrite --------------------------
const DISK_A = '@D:\\project\\超表面逆向设计\\课件\\电磁仿真基础及Python接口课件.pdf';
const DISK_B = '@D:\\project\\超表面逆向设计\\课件\\智能算法驱动的光学设计与应用(前两天课件)打开密码{{PASSWORD_mue3qo8b}}';

await test('attached file paths never reach the model', async () => {
	const typed = '给我把这两个pdf给解密了';
	requests.length = 0;
	const helper = makeHelpers({
		draft: DISK_A + DISK_B + typed,
		occurrences: [chip(0, DISK_A), chip(DISK_A.length, DISK_B)],
	});
	await runRewrite(helper);
	const post = requests.find((request) => request.body !== null && request.body.draft !== undefined);
	assert.ok(post, 'the enhancement POST exists');
	assert.equal(/[A-Za-z]:\\/u.test(post.body.draft), false, 'no disk path in the model-facing draft');
	assert.match(post.body.draft, /\[附件1: /u);
	assert.match(post.body.draft, /\[附件2: /u);
	assert.ok(post.body.draft.includes(typed), 'the typed request survives');
	// Short names are kept: a password written into a file name is useful evidence.
	assert.match(post.body.draft, /电磁仿真基础及Python接口课件\.pdf/u);
	assert.match(post.body.draft, /打开密码/u, 'the file-name hint survives');
});

await test('a leaked disk path in the model output is shortened before writing', async () => {
	nextResponse = {
		body: { ok: true, text: '请解密 ' + DISK_A + '，密码见文件名。', mode: 'plain' },
	};
	const registrations = installPlugin();
	const helper = makeHelpers({ draft: '草稿' });
	const mounted = mountComponent(composerRegistration(registrations).component, helper.props);
	await sleep(0);
	findButton(mounted.rerender().tree).props.onClick();
	await sleep(0);
	await sleep(0);
	assert.equal(helper.writes.length, 1);
	assert.equal(helper.writes[0].text, '请解密 电磁仿真基础及Python接口课件.pdf，密码见文件名。');
	assert.equal(/[A-Za-z]:\\/u.test(helper.writes[0].text), false);
});

await test('undo restores only the typed text, never the attachment labels', async () => {
	const typed = '给我把这两个pdf给解密了';
	const before = DISK_A + DISK_B + typed;
	const helper = makeHelpers({
		draft: before,
		occurrences: [chip(0, DISK_A), chip(DISK_A.length, DISK_B)],
	});
	const mounted = await runRewrite(helper);
	// The composer republished the produced draft; chips are still present.
	helper.state.draft = DISK_A + DISK_B + '改写结果';
	helper.state.draftRev = 6;
	const undoButton = findButton(mounted.rerender().tree);
	assert.equal(undoButton.props['data-state'], 'undo');
	undoButton.props.onClick();
	assert.equal(helper.writes.length >= 2, true, 'undo issued a write');
	const undoWrite = helper.writes[helper.writes.length - 1];
	assert.equal(undoWrite.text, typed, 'only the typed text is restored');
	assert.equal(/[A-Za-z]:\\/u.test(undoWrite.text), false);
});

await test('composer seat stays decoupled from host geometry', () => {
	const src = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');
	const cssText = /const CSS = \[([\s\S]*?)\]\n\t\t\t\.join/u.exec(src)?.[1] ?? '';
	const joined = cssText.split('\n').filter((l) => l.trim().startsWith("'")).map((l) => l.trim().replace(/^'|',?$/gu, '')).join('');
	const rule = /\.dsh-pe_root\{([^}]*)\}/u.exec(joined)?.[1] ?? '';
	assert.ok(/flex:0 0 auto/u.test(rule), 'seat must not shrink into neighbours');
	assert.ok(/max-width:100%/u.test(rule), 'seat must bound its own width');
	assert.equal(/margin-[a-z]+:-\d/u.test(rule), false, 'no negative margin');
	assert.ok(/transform:translateX\(var\(--dsh-pe-seat-nudge/u.test(rule), 'tightening is a visual transform, not a layout margin');
	const nudge = Number(/--dsh-pe-seat-nudge,(\d+)px/u.exec(src)?.[1]);
	assert.ok(nudge > 0 && nudge < 8, `nudge must stay below the host narrow gap, got ${nudge}px`);
	assert.equal(/@container[^\n]*\.dsh-pe_root/u.test(src), false, 'no width-dependent seat pull');
	const order = Number(/id: 'prompt-enhance', order: (-?\d+)/u.exec(src)?.[1]);
	assert.ok(Number.isFinite(order) && order >= 0 && order <= 100, `calm slot order, got ${order}`);
	// Only CSS selector text matters; comments may mention host class names.
	const cssRules = cssText.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
	assert.equal(/standardControls|InputBar_module/u.test(cssRules), false, 'no host-internal selectors in CSS rules');
});

console.log(failures === 0 ? '\nALL CLIENT TESTS PASSED' : `\n${failures} CLIENT TEST(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
