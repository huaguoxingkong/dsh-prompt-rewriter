// Unit tests for the pure helpers, which the integration tests only exercised
// indirectly. These need no ctx, no session, and no model.
import assert from 'node:assert/strict';

const plugin = await import('../index.js');

// The helpers are module-private, so exercise them through a tiny re-export shim
// built from the module source: parse nothing, just call the public route with a
// crafted session and assert observable output. Where a pure function is not
// exported we test its contract through the route instead.
//
// `estimateTokens` is observable via the reported `historyTokens`, so these cases
// drive it through a real request with a controlled single-message history.

function textMessage(role, text) {
  return { role, content: [{ type: 'text', text }] };
}

function harness({ derived, config = {} }) {
  const routes = [];
  const calls = [];
  const llm = {
    listProviders: () => [{ id: 'p1', name: 'P1' }],
    resolveModelInfo: async () => ({}),
    prepareCall: async (cfg) => ({
      config: cfg,
      stream: async function* (options) {
        calls.push(options);
        yield { type: 'text-delta', index: 0, text: 'ok' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    }),
  };
  const ctx = {
    connection: { fetch: { register: (r) => { routes.push(r); return () => {}; } } },
    llm,
    sessions: { get: () => ({ id: 's1', deriveMessages: () => derived }) },
    sessionProjections: {
      snapshot: () => ({ asOfSeq: 1, values: { modelSelection: { lastUsed: { provider: 'p1', model: 'm1' }, next: { provider: 'p1', model: 'm1' } } } }),
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p1', model: 'm1' }) },
    effect: (fn) => { fn(); return () => {}; },
    inject: (n, cb) => cb(ctx),
    get(name) {
      if (name === 'llm') return llm;
      if (name === 'sessions') return this.sessions;
      if (name === 'sessionProjections') return this.sessionProjections;
      if (name === 'agentDefaultModel') return this.agentDefaultModel;
      return undefined;
    },
  };
  plugin.apply(ctx, config);
  return { routes, calls };
}

function enhanceRoute(routes) {
  const found = routes.find((route) => route.path === '/api/prompt-enhance');
  if (!found) throw new Error('enhancement route missing');
  return found;
}

function post(body) {
  return new Request('http://x/api/prompt-enhance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function run(body, opts) {
  const { routes } = harness(opts);
  return (await (await enhanceRoute(routes).fetch(post(body))).json());
}

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

// --- estimateTokens, observed through historyTokens -------------------------

await test('estimateTokens: pure CJK counts one token per character', async () => {
  // 40 CJK chars -> 40 tokens (plus nothing else).
  const r = await run({ sessionId: 's1', draft: 'd' }, {
    derived: [textMessage('user', '字'.repeat(40))],
    config: { historyTokenBudget: 10000 },
  });
  assert.equal(r.historyTokens, 40);
});

await test('estimateTokens: pure ASCII counts four characters per token', async () => {
  // 40 ASCII chars -> ceil(40/4) = 10 tokens.
  const r = await run({ sessionId: 's1', draft: 'd' }, {
    derived: [textMessage('user', 'a'.repeat(40))],
    config: { historyTokenBudget: 10000 },
  });
  assert.equal(r.historyTokens, 10);
});

await test('estimateTokens: mixed text sums both halves', async () => {
  // 10 CJK + 40 ASCII -> 10 + 10 = 20.
  const r = await run({ sessionId: 's1', draft: 'd' }, {
    derived: [textMessage('user', '字'.repeat(10) + 'a'.repeat(40))],
    config: { historyTokenBudget: 10000 },
  });
  assert.equal(r.historyTokens, 20);
});

await test('estimateTokens: kana and hangul are counted as CJK', async () => {
  // 10 hiragana + 10 hangul + 0 ascii -> 20.
  const r = await run({ sessionId: 's1', draft: 'd' }, {
    derived: [textMessage('user', 'あ'.repeat(10) + '한'.repeat(10))],
    config: { historyTokenBudget: 10000 },
  });
  assert.equal(r.historyTokens, 20);
});

await test('estimateTokens: an empty text contributes nothing', async () => {
  const r = await run({ sessionId: 's1', draft: 'd' }, {
    derived: [textMessage('user', ''), textMessage('user', 'a'.repeat(8))],
    config: { historyTokenBudget: 10000 },
  });
  assert.equal(r.historyTokens, 2);
});

// --- computeHistoryBudget --------------------------------------------------

await test('budget: the configured cap wins when the window is large', async () => {
  const r = await run({ sessionId: 's1', draft: 'd' }, {
    derived: [textMessage('user', 'a'.repeat(4000))], // 1000 tokens
    config: { historyTokenBudget: 500 },
  });
  assert.ok(r.historyTokens <= 500, `expected <=500, got ${r.historyTokens}`);
  assert.equal(r.historyTruncated, true);
});

await test('budget: five percent of the window wins when the window is small', async () => {
  const routes = [];
  const llm = {
    listProviders: () => [{ id: 'p1', name: 'P1' }],
    resolveModelInfo: async () => ({ context: { contextWindow: 1000 } }), // 5% = 50
    prepareCall: async (cfg) => ({
      config: cfg,
      stream: async function* () {
        yield { type: 'text-delta', index: 0, text: 'ok' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    }),
  };
  const ctx = {
    connection: { fetch: { register: (x) => { routes.push(x); return () => {}; } } },
    llm,
    sessions: { get: () => ({ id: 's1', deriveMessages: () => [textMessage('user', 'a'.repeat(4000))] }) },
    sessionProjections: { snapshot: () => ({ asOfSeq: 1, values: { modelSelection: { lastUsed: { provider: 'p1', model: 'm1' }, next: { provider: 'p1', model: 'm1' } } } }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p1', model: 'm1' }) },
    effect: (fn) => { fn(); return () => {}; },
    inject: (n, cb) => cb(ctx),
    get(name) {
      if (name === 'llm') return llm;
      if (name === 'sessions') return this.sessions;
      if (name === 'sessionProjections') return this.sessionProjections;
      if (name === 'agentDefaultModel') return this.agentDefaultModel;
      return undefined;
    },
  };
  plugin.apply(ctx, { historyTokenBudget: 100000 });
  const r = await (await enhanceRoute(routes).fetch(post({ sessionId: 's1', draft: 'd' }))).json();
  assert.ok(r.historyTokens <= 50, `expected <=50, got ${r.historyTokens}`);
  assert.equal(r.mode, 'context', 'a tiny budget must not drop context mode');
});

// --- normalizeOutput, observed through the returned text --------------------

await test('normalizeOutput: strips a fenced block', async () => {
  const routes = [];
  const llm = {
    listProviders: () => [{ id: 'p1', name: 'P1' }],
    resolveModelInfo: async () => ({}),
    prepareCall: async (cfg) => ({
      config: cfg,
      stream: async function* () {
        yield { type: 'text-delta', index: 0, text: '```text\n真正的提示词\n```' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    }),
  };
  const ctx = {
    connection: { fetch: { register: (x) => { routes.push(x); return () => {}; } } },
    llm,
    sessions: { get: () => undefined },
    sessionProjections: { snapshot: () => ({ asOfSeq: 1, values: { modelSelection: { lastUsed: { provider: 'p1', model: 'm1' }, next: { provider: 'p1', model: 'm1' } } } }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p1', model: 'm1' }) },
    effect: (fn) => { fn(); return () => {}; },
    inject: (n, cb) => cb(ctx),
    get(name) {
      if (name === 'llm') return llm;
      if (name === 'sessions') return this.sessions;
      if (name === 'sessionProjections') return this.sessionProjections;
      if (name === 'agentDefaultModel') return this.agentDefaultModel;
      return undefined;
    },
  };
  plugin.apply(ctx, {});
  const r = await (await enhanceRoute(routes).fetch(post({ sessionId: 's1', draft: 'd' }))).json();
  assert.equal(r.text, '真正的提示词');
});

// --- concurrent requests ---------------------------------------------------

await test('two concurrent requests are handled independently', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const routes = [];
  const llm = {
    listProviders: () => [{ id: 'p1', name: 'P1' }],
    resolveModelInfo: async () => ({}),
    prepareCall: async (cfg) => ({
      config: cfg,
      stream: async function* (options) {
        await gate;
        const draft = options.messages[0].content[0].text;
        yield { type: 'text-delta', index: 0, text: 'echo:' + draft.includes('A') };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    }),
  };
  const ctx = {
    connection: { fetch: { register: (x) => { routes.push(x); return () => {}; } } },
    llm,
    sessions: { get: () => undefined },
    sessionProjections: { snapshot: () => ({ asOfSeq: 1, values: { modelSelection: { lastUsed: { provider: 'p1', model: 'm1' }, next: { provider: 'p1', model: 'm1' } } } }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p1', model: 'm1' }) },
    effect: (fn) => { fn(); return () => {}; },
    inject: (n, cb) => cb(ctx),
    get(name) {
      if (name === 'llm') return llm;
      if (name === 'sessions') return this.sessions;
      if (name === 'sessionProjections') return this.sessionProjections;
      if (name === 'agentDefaultModel') return this.agentDefaultModel;
      return undefined;
    },
  };
  plugin.apply(ctx, {});

  const first = enhanceRoute(routes).fetch(post({ sessionId: 's1', draft: 'draft A' })).then((r) => r.json());
  const second = enhanceRoute(routes).fetch(post({ sessionId: 's1', draft: 'draft B' })).then((r) => r.json());
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.notEqual(a.text, b.text, 'each request must keep its own draft');
});

await test('the context window is looked up once per route, then cached', async () => {
  const routes = [];
  let lookups = 0;
  const llm = {
    listProviders: () => [{ id: 'p1', name: 'P1' }],
    resolveModelInfo: async () => {
      lookups += 1;
      return { context: { contextWindow: 100000 } };
    },
    prepareCall: async (cfg) => ({
      config: cfg,
      stream: async function* () {
        yield { type: 'text-delta', index: 0, text: 'ok' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    }),
  };
  const ctx = {
    connection: { fetch: { register: (x) => { routes.push(x); return () => {}; } } },
    llm,
    sessions: { get: () => ({ id: 's1', deriveMessages: () => [textMessage('user', '历史')] }) },
    sessionProjections: { snapshot: () => ({ asOfSeq: 1, values: { modelSelection: { lastUsed: { provider: 'p1', model: 'm1' }, next: { provider: 'p1', model: 'm1' } } } }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p1', model: 'm1' }) },
    effect: (fn) => { fn(); return () => {}; },
    inject: (n, cb) => cb(ctx),
    get(name) {
      if (name === 'llm') return llm;
      if (name === 'sessions') return this.sessions;
      if (name === 'sessionProjections') return this.sessionProjections;
      if (name === 'agentDefaultModel') return this.agentDefaultModel;
      return undefined;
    },
  };
  plugin.apply(ctx, {});
  for (let i = 0; i < 5; i += 1) {
    await (await enhanceRoute(routes).fetch(post({ sessionId: 's1', draft: 'd' }))).json();
  }
  assert.equal(lookups, 1, `expected one lookup for five requests, got ${lookups}`);
});

await test('a cancelled window lookup is not cached', async () => {
  const routes = [];
  let lookups = 0;
  const llm = {
    listProviders: () => [{ id: 'p1', name: 'P1' }],
    resolveModelInfo: async (_p, _m, signal) => {
      lookups += 1;
      if (lookups === 1) {
        // First call behaves as an aborted lookup.
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }
      return { context: { contextWindow: 50000 } };
    },
    prepareCall: async (cfg) => ({
      config: cfg,
      stream: async function* () {
        yield { type: 'text-delta', index: 0, text: 'ok' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    }),
  };
  const ctx = {
    connection: { fetch: { register: (x) => { routes.push(x); return () => {}; } } },
    llm,
    sessions: { get: () => undefined },
    sessionProjections: { snapshot: () => ({ asOfSeq: 1, values: { modelSelection: { lastUsed: { provider: 'p1', model: 'm1' }, next: { provider: 'p1', model: 'm1' } } } }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p1', model: 'm1' }) },
    effect: (fn) => { fn(); return () => {}; },
    inject: (n, cb) => cb(ctx),
    get(name) {
      if (name === 'llm') return llm;
      if (name === 'sessions') return this.sessions;
      if (name === 'sessionProjections') return this.sessionProjections;
      if (name === 'agentDefaultModel') return this.agentDefaultModel;
      return undefined;
    },
  };
  plugin.apply(ctx, {});
  const first = await (await enhanceRoute(routes).fetch(post({ sessionId: 's1', draft: 'd' }))).json();
  assert.equal(first.ok, true, 'a metadata failure must not fail the request');
  await (await enhanceRoute(routes).fetch(post({ sessionId: 's1', draft: 'd' }))).json();
  assert.equal(lookups, 2, 'the failed lookup must be retried, not cached');
});

console.log(failures === 0 ? '\nALL UNIT TESTS PASSED' : `\n${failures} UNIT TEST(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
