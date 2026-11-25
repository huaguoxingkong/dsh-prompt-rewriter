# dsh-prompt-rewriter

English | [中文](README.md)

[![npm](https://img.shields.io/npm/v/dsh-prompt-rewriter.svg)](https://www.npmjs.com/package/dsh-prompt-rewriter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/huaguoxingkong/dsh-prompt-rewriter)
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![DSH Plugin Hub](https://dshpluginhub.ai/badges/plugins/dsh-prompt-rewriter.svg)](https://dshpluginhub.ai/plugins/dsh-prompt-rewriter)
[![DeepSeek Harness plugins](https://deepseekharnessplugins.com/api/badge/huaguoxingkong/dsh-prompt-rewriter)](https://deepseekharnessplugins.com/plugins/huaguoxingkong/dsh-prompt-rewriter)
[![dsh.so risk: low](https://cdn.dsh.so/badge/dsh-prompt-rewriter.svg)](https://www.dsh.so/artifact/dsh-prompt-rewriter/?ref=badge)

Turns the half-formed draft in your composer into a task instruction you can actually run. **It rewrites the box, it never sends.** Don't like it? `Ctrl+Z` and you're back.

> An unofficial community project, not affiliated with or endorsed by DeepSeek. Artwork attribution is in [NOTICE.md](NOTICE.md).

---

![Click the whale-tail icon on the right of the composer and the draft becomes a complete prompt in place](https://cdn.jsdelivr.net/npm/dsh-prompt-rewriter/docs/images/01-hero-en.gif)

## What it is

A one-line draft is missing **goal, format, and boundaries**. The model can only guess — guess wrong and you spend another round rewording. This button puts those three things back into the sentence you already wrote:

| What changed | Your draft | What goes back in the box |
|---|---|---|
| Original wording | *help me write a scraper for Douban movies* | the same sentence |
| Goal | | scrape the movie **Top 250**'s **titles, ratings and links** |
| Format | | write the result to a **CSV file** |
| Boundaries | | respect robots.txt, **wait at least 2 seconds between requests**, and on anti-bot pages **slow down instead of working around the limit** |

The third column is not yours: the plugin added it after reading that sentence. **You can edit whatever it added** — the result sits in the composer, nowhere else.

Two more things worth knowing: **the rewrite never asks you a question** (a question the model slips in beside the rewrite is dropped while the rewrite stays; if the whole reply is a question it re-runs on the legacy rules, and failing that keeps your draft), and **the rule set can be switched** (Legacy / Intent-first / WorkBuddy, from settings, without changing the button or the steps).

## Install

Requires DeepSeek Harness (desktop or web) and `node >= 22`. **Restart Harness once after the first install**: the host half (enhancement endpoint and prompt rules) is loaded only at startup. For later updates, a version that changes only `client.js` needs just a page refresh (client HMR replaces the open window within about a second); a version that changes `index.js` or the rule files still needs a restart, and the install script prints whether a restart is required.

### From npm (recommended)

```sh
dsh plugin --profile web add dsh-prompt-rewriter      # web
dsh plugin --profile desktop add dsh-prompt-rewriter  # desktop
```

Use the profile you actually run. The plugin targets the web client, so both work.

### From the GitHub source

```sh
dsh plugin --profile web add github:huaguoxingkong/dsh-prompt-rewriter
```

A source install runs build steps and may ask for permission the first time. Only grant it to packages you trust.

### From a Release zip

Download the zip from [Releases](https://github.com/huaguoxingkong/dsh-prompt-rewriter/releases), unpack it, then run `npm install && dsh plugin --profile web add .`.

## Usage

1. Type any draft in the composer — shorter is fine.
2. Click the **whale-tail icon** in the right-hand control group of the composer (a small blue dot means it will use conversation context). It shares that group with the model picker and send button, and other plugins may add controls between them. It isn't there when the box is empty.
3. A moment later — how long depends on the chosen model — the draft is replaced with the rewritten prompt.
4. Not what you wanted? `Ctrl+Z`, or click the undo arrow the button turned into.

Changed your mind mid-flight? Click again to cancel. The draft stays exactly as it was — no half-finished text left behind.

How hard it rewrites is the *Enhancement rule set* in settings; switching rules changes neither the button nor the steps.

### For faster results, pick a stable model

An enhancement is a real model call, and **how fast the result comes back depends mostly on the model you have selected**. If it feels slow, switch the session to a model that is more stable and responds faster — the same draft can take a few seconds on one model and well over ten on another. The button does not favour any particular model; it uses whichever one you picked.

> Want a fixed model just for enhancement, without affecting normal chat? Open `Settings → Prompt Enhance` and turn on **Use a fixed model**.

### You can navigate away mid-rewrite

Once you've clicked, you don't have to sit and wait. **Switch to another session and the task keeps running.** Come back and the result is already in the composer; if it hasn't finished, the button is still the spinning tail. Two sessions can each run their own rewrite without interfering.

### When the composer has attachments or links

Attachments and links are things you already said — the rewrite only touches the sentence beside them.

- Attachment references and link chips stay in place when the rewritten text lands in the composer. Undo restores only the words you typed; your attachments are not swept away with it.
- **Attachment content** is read only while *Reference attachment content* is on: at most 2 non-image attachments of 5 MiB each, and text-like files contribute the first 6,000 characters. With it off, only up to 8 file names are used as context.
- What goes into the prompt is the **readable file name**, not the full `@D:\...` path, and a link keeps only its host name. Your local directory layout never travels with the prompt.

## Shortcuts

### Enhancement shortcut (off by default)

Turn it on at **Settings → Prompt Enhance → Shortcut**. Desktop uses `Ctrl+E` (`Cmd+E` on macOS); the browser uses `Ctrl+Alt+E` (`Cmd+Alt+E` on macOS).

- Press once to enhance; press again while it runs to pause. It acts on the composer of the current conversation.
- **Same as clicking the icon** — the shortcut runs the icon's own click handler, including its undo state, so the two paths cannot drift. Restoring a draft stays on the button or `Ctrl+Z`.
- Click the shown combination to record your own; `Esc` cancels. **Reset** restores the default in one click.
- Already taken by another command? The row names the command it collides with, the combination is not applied, and your previous binding stays.
- Registered through Harness's shortcut service, so it persists across restarts.

### Rule-set shortcut

The default is `Ctrl+J`. Press it to open the rule picker, move with `↑` / `↓`, and press `Enter` to apply the highlighted rule. You can also open the same menu by clicking the badge on the enhance button or right-clicking the button. The menu only switches sets; adding, editing and deleting stay in settings.

- The rule-set row in the **Shortcuts** group records or edits the combination, restores the default, or unbinds it.
- The rule-set shortcut has its **own switch** (on by default): turning it off keeps the combination, and turning it back on restores it at once. With the main shortcut switch off, neither key fires.
- Before saving, the combination is checked: browser or system reserved keys and clashes with the plugin's other shortcuts are refused, and the row names what they collide with.
- A one-line hint under the row shows the live combination, or points to the badge / right-click entry when the key is off or unbound.

## Button states

![Button states: idle, rewriting, done and undoable, failed and retryable](https://cdn.jsdelivr.net/npm/dsh-prompt-rewriter/docs/images/02-button-states-en.gif)

| State | What you see | What it means |
|---|---|---|
| Idle | static whale tail | ready to click |
| Rewriting | the tail spins fast | running; click again to cancel |
| Done | turns into an undo arrow | one click back, or `Ctrl+Z` |
| Failed | red retry icon + reason | the reason sits right next to it — no log hunting |

## Settings

`Settings → Prompt Enhance`. Six switches and two selectors (model, rule set); the rule-set dropdown also holds the **custom rules** entry. They affect **only this button, never normal sending**.

![Settings page](https://cdn.jsdelivr.net/npm/dsh-prompt-rewriter/docs/images/04-settings-en.png)

| Option | Default | What turning it on does |
|---|---|---|
| Use a fixed model | Off | Off: follow the model of the current conversation. On: always use the model picked below. |
| Enhancement rule set | **Legacy (stable)** | One of Legacy / Intent-first / WorkBuddy; the differences are below. |
| Reference the conversation | **On** | Read earlier turns. More accurate, but costs more tokens and is slower on long chats. |
| Reference composer images | Off | Include images in the composer. Images from earlier messages are never read. |
| Reference attachment content | **On** | On: read up to 2 non-image attachments from the composer, 5 MiB each; text-like files send at most the first 6,000 characters. Off: only up to 8 file names are used as context. |
| Enhancement shortcut | Off | Lets the keyboard trigger a rewrite. Off by default, so no global key fires unasked. |
| Rule-set shortcut | **On** | Lets `Ctrl+J` switch rule sets; turning it off keeps the combination and turning it back on restores it. |

The three rule sets:

- **Legacy (stable)**: ships the 1.7.1 playbook verbatim (15 rows, 10 of them rules; about 1.2–3× the draft).
- **Intent-first**: works out what the user actually wants, then fills in six dimensions (goal / inputs / scope / method / output / quality bar); where the draft is silent the executor is told to decide and state its assumption. A sparse draft usually grows to 2–5× its length, never beyond 5×.
- **WorkBuddy**: uses its shipped prompt verbatim (analyse objective, ambiguity, clarity and missing context, then rewrite against its seven principles); the cap is around 800 characters and long drafts get compressed.
- None of them answer the request itself; Legacy and Intent-first explicitly forbid asking, and any question WorkBuddy returns is dropped by the plugin.

Other behaviour:

- The model dropdown lists **the providers and models you actually have** — you can't type in one that doesn't exist.
- Turning the model switch off does not clear your selection; flipping it back on shows the same choice.
- Images still uploading or over the host attachment service's per-image or per-message limit are skipped; the status area reports how many were missed. A rewrite never fails because of an image.
- Files over the count or size limit are skipped and reported in the result status.
- The **current version** sits in the top-right of the settings page; clicking it opens the project home page. Check it before reporting a problem — it makes the issue much easier to pin down.
- **Custom rules**: pick a rule you named in the rule-set dropdown to use it. "＋ Add rule" opens two fields — a **meta prompt** on top (one click to copy; when the clipboard is unavailable the field is selected for you and the hint says to press Ctrl+C) and a paste box below. Send the meta prompt to your own AI; it returns a rule set built from your habits, preferences and memory. Paste the body back, give it a name and save. Up to 10 rules, 4000 characters each. Every entry can be **disabled or enabled**; disabling or deleting the rule in use switches the selection back to **Legacy** in the same save, so a dead selection is never left behind.
- The first row is the entry point: "Star ⭐ · problems? open an issue ↗", leading to the project home page and this project's issue list.
- The **changelog** at the bottom folds by version, newest open by default; it is read from the shipped `CHANGELOG.md`, so it works offline.

### What it reads and what it doesn't

![Empty session vs. existing conversation: the small dot in the corner is the marker](https://cdn.jsdelivr.net/npm/dsh-prompt-rewriter/docs/images/03-context-modes-en.png)

- **Conversation**: a small blue dot in the button's lower-right corner means it will read earlier turns; no dot means the current draft only. The dot describes **what will happen if you click now**, so it hides while a run is in flight, comes back after a failure, and disappears once the button turns into an undo arrow.
- **Images**: only images **currently sitting in the composer** — never images from earlier messages. That line is deliberate: old pasted screenshots are slow to process and easy to misread.
- **Attachments**: only **non-image attachments currently in the composer** — attachments from earlier turns are never read. The cap is 2 files per run, 5 MiB each; text-like files send at most the first 6,000 characters, and with the switch off only up to 8 file names go out.

## Configuration

Every `config` key on the profile plugin line is optional. The first eleven are managed by the settings page; the last seven are operational ceilings and are not exposed in the UI.

```yaml
- id: dsh-prompt-rewriter
  name: dsh-prompt-rewriter
  config:
    # managed by the settings page
    useCustomModel: false      # pin enhanceProvider/enhanceModel
    enhanceProvider: ""        # empty = follow the session model
    enhanceModel: ""
    ruleSet: legacy            # enhancement rule set: legacy / intent-first / workbuddy
    customRules: "[]"          # user rules as a JSON array string: max 10, 4000 chars each
    referenceImages: false     # read composer images
    referenceFiles: true       # read composer file contents
    referenceContext: true     # read earlier turns
    shortcutEnabled: false     # enhancement shortcut (off by default)
    ruleShortcut: "Ctrl+J"     # rule-set switch shortcut (empty = unbound)
    ruleShortcutEnabled: true  # independent switch for the rule-set shortcut

    # operational ceilings (not exposed in the UI)
    maxDraftChars: 8000        # draft length cap
    maxOutputChars: 12000      # output length cap
    maxOutputTokens: 2000      # output tokens per request
    timeoutMs: 90000           # end-to-end timeout
    historyTokenBudget: 6000   # token budget for injected history
    historyMaxMessages: 24     # max history messages
    historyMessageChars: 4000  # per-message character cap
```

## How it works

| Half | File | Responsibility |
|---|---|---|
| Host | `index.js` | Registers `POST /api/prompt-enhance` (rewrite) and `GET/POST /api/prompt-enhance/settings`, through `ctx.connection.fetch` so it inherits Harness auth and origin checks. Reads the session projection for the current model, picks the rule set from settings (`legacy-rules.mjs` / `intent-first-rules.mjs` / `workbuddy-rules.mjs`), turns composer attachments into reference material, then generates via `ctx.llm`. |
| Client | `client.js` | Renders the button at `conversation.input.right` and the settings page at `settings.section`. Replaces the draft in place via `inputActions.insertText`. |

A few designs worth calling out:

- **Context is budgeted**: injected history is `min(historyTokenBudget, contextWindow × 5%)`, collected newest-first. When a single message exceeds the whole budget, its target length is computed in one proportional step (with up to 4 correction passes for rounding and mixed-script error), then truncated rather than dropped — so "has context" never silently degrades into "no context".
- **The output budget grows on demand**: a reasoning model shares one output budget between thinking and answering, so a long draft can spend it all on reasoning and leave nothing for the reply. When the run is cut off by that budget, the plugin doubles it and retries (3500 → 7000 → 14000, capped by the model's declared maximum and never above 16000) instead of misreporting truncation as "the model returned nothing".
- **History is injected as a JSON array**, and the system prompt states explicitly that it is data, not instructions — text inside history can't forge structure.
- **The image switch is decided by the Host**: the browser uploads composer images unconditionally and the Host decides whether to use them, so a not-yet-loaded setting cannot silently turn them off.
- **Attachments are read on demand**: only while *Reference attachment content* is on does it take composer attachments (at most 2, 5 MiB each), preview the first 6,000 characters of text-like files, and hand the rest to the model as references. One over-limit file is skipped, not the whole rewrite.

## Known limitations

- Images from earlier messages never take part (deliberate: only composer images are read).
- Replacement is not streamed: the button shows an animated state until the rewrite is done.
- The model dropdown depends on the Host's `remote.session.modelCatalog`; when that surface is unavailable the dropdown says so instead of staying empty.
- Attachments are limited to the current composer: earlier uploads never take part, at most 2 files per run, 5 MiB each.
- WorkBuddy has no verbatim-fact clause, so long drafts are compressed to its roughly 800-character cap.

## FAQ

**Nothing happens when I click.** The composer is empty, or *Use a fixed model* is on without a model selected. If you used a shortcut, check that the shortcut switch is on and that no conflict is reported; the rule-set key also has its own switch.

**"No credentials configured for the current model."** That model has no key set. Switch models, or pin one that works in settings.

**Can I undo the whole rewrite?** One `Ctrl+Z`. It's an ordinary edit step in the composer.

**Do my attachments survive a rewrite?** Yes. Attachment references and links stay as they were; only the text is replaced.

**Does it change messages I already sent?** No. It only edits the draft, and it never sends.

**Will it ask me a question back?** Not in the result. None of the three rule sets answers the request itself; Legacy and Intent-first forbid asking outright, and WorkBuddy's own text only forbids answering it — so any question it does emit is dropped by the plugin. If the whole reply is a question it re-runs on the legacy rules, and failing that keeps your draft.

**Do my attachments get sent?** Only with *Reference attachment content* on: at most 2 non-image attachments from the composer, 5 MiB each, and text-like files send the first 6,000 characters only. Turn it off and only the file names go out.

## Development

The plugin has a Host half and a Client half: the Host depends only on host services such as `ctx.connection`, `ctx.llm` and `ctx.settings`, while the Client registers slot components through `window.__ModuleLoader__`. **The two halves load differently, so they are verified differently**:

| What changed | How it takes effect | Restart the host? |
| --- | --- | --- |
| `client.js` (button, interaction, copy, styles) | client HMR polls the client bundle every 500ms and pushes the change through `/plugins/events`; the open window replaces that plugin's entry in place | No; a window refresh is only a fallback |
| `index.js`, `*-rules.mjs` (endpoint, prompt rules, settings storage) | imported once at host startup | Yes |

Client HMR comes from `@deepseek-ai/dsh-client-hmr` and is always mounted in the web composition; it is separate from the host-side `hmr` — this machine's profile sets the host `hmr` to `disabled: true` (see the comment in `cordis.patch.yml`), so host **code** is not hot-reloaded. Settings changed in the UI still apply immediately (through the settings service, not file watching); only a hand edit of `cordis.patch.yml` needs a restart.

**The unit tests are not published on npm.** The repo carries a full `tests/` tree and `scripts/gate.mjs`, but they depend on the host's private `@deepseek-ai/schemastery`, its React copy, and this machine's profile layout, so a fresh clone cannot run them as-is. They stay in the repo and out of the npm package. Run them locally before a release.

```sh
npm run check                    # index.js / client.js syntax
npm test                         # every test under tests/
node scripts/gate.mjs            # rule and shape gate (required before release)
npm pack --dry-run               # inspect the published contents
```

## Contributing, security and versioning

- Code contributions, issue reports and local verification steps are in [CONTRIBUTING.md](CONTRIBUTING.md).
- How to report a security problem privately is in [SECURITY.md](SECURITY.md).
- How versions are chosen and how pre-releases are marked is in [VERSIONING.md](VERSIONING.md).

### Acknowledgements

Issue reports and suggested fixes count as contributions too; each release's thanks live in its [CHANGELOG.md](CHANGELOG.md) entry, and this section keeps the long-term list and earlier credits.

- [@YuvuShine](https://github.com/YuvuShine): reported #8 (the enhance button disappeared with a command block present, results lagged, and the block was rewritten), with reproduction steps, root cause and a fix; adopted in 1.8.4.
- [@moyuboy](https://github.com/moyuboy): reported #4 (a same-slot control covered the button by about 4px), with root-cause analysis and four fixes; adopted in 1.8.3.
- [@xutiannuo](https://github.com/xutiannuo): reported #2 (OpenCode provider returned 400 MissingSessionID), with a three-line fix; adopted in 1.7.1.

## License

The code is MIT; see [LICENSE](LICENSE). Bundled assets fall into three groups:

| Asset | License | Covered by MIT? |
|---|---|---|
| Plugin code | MIT | Yes |
| Whale-tail 36-frame outline (from `dsh-status-rotator` v0.38.0, by 01Virex) | **MIT**, verified upstream (all 36 frames compared) | Yes, with its copyright notice kept |
| DeepSeek "big fish" brand mark (from `dsh-web-frontend`) | **no license found** in the source package | **No**, explicitly excluded in LICENSE |

This is an unofficial community project, not affiliated with or endorsed by DeepSeek. Full attribution and the verification trail are in [NOTICE.md](NOTICE.md).
