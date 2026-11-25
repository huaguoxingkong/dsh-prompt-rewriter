# dsh-prompt-rewriter

English | [中文](README.md)

[![npm](https://img.shields.io/npm/v/dsh-prompt-rewriter.svg)](https://www.npmjs.com/package/dsh-prompt-rewriter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2%2B-4b6bfb.svg)](https://github.com/deepseek-ai)
[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/huaguoxingkong/dsh-prompt-rewriter)

Turn the half-formed sentence in your composer into a task brief you can actually run — **in place**. It rewrites the text only: it never sends and never runs anything. Not happy? `Ctrl+Z` puts your draft back.

<p align="center">
  <img src="docs/images/01-hero-en.gif" alt="Click the whale-tail icon at the right of the composer and the draft becomes a complete prompt" width="807">
  <br>
  <sub>Figure 1: click the whale tail and the draft becomes a complete prompt</sub>
</p>

- **One-click, in place**: the whale-tail button at the right of the composer fills in the goal, the format and the boundaries, then puts the result back in the composer.
- **Three ways into the rule menu**: the button badge, a right-click on the button, or `Ctrl+J` — all open the same switcher.
- **Undoable, with controls for context**: the button turns into an undo arrow when done; conversation, images and attachments each have their own switch.

```sh
dsh plugin --profile desktop add dsh-prompt-rewriter
```

**Contents**: [Quick start](#quick-start) · [Who it is for](#who-it-is-for) · [Usage](#usage) · [Shortcuts](#shortcuts) · [Settings](#settings) · [Configuration](#configuration) · [How it works](#how-it-works) · [FAQ](#faq)

---

## Quick start

1. **Install**: run this in a terminal, replacing `desktop` with the profile you actually use.
   ```sh
   dsh plugin --profile desktop add dsh-prompt-rewriter
   ```
2. **Restart Harness once**: required on first install. Afterwards a `client.js` change only needs a page refresh; `index.js` or a rule-file change still needs a restart.
3. **Try it**: type a short draft in the composer and click the whale tail at the right. Not happy? Press `Ctrl+Z` or click the undo arrow.

Requires DeepSeek Harness (desktop or Web) and `node >= 22`. The settings live under `Settings → Prompt Enhance`.

**Other ways to install**

- From source: `dsh plugin --profile web add github:huaguoxingkong/dsh-prompt-rewriter`. It runs the build step and may ask for permission the first time.
- From a Release zip: download it from [Releases](https://github.com/huaguoxingkong/dsh-prompt-rewriter/releases), unzip, then `npm install && dsh plugin --profile web add .`.

---

## Who it is for

**It fits**

- People who often throw a one-line request at an AI and get a follow-up question or a wrong turn.
- People writing code, copy or data tasks who want the downstream AI to get the goal, input, output and boundaries in one pass.
- People who want to edit the rewritten text themselves, undo it in one step, and control conversation / images / attachments separately.

**It does not fit**

- People who only want to chat and do not need a rigorous draft.
- People who need the plugin to execute the task or send the message — it only rewrites the composer.
- People who want a multi-round clarification — it does not ask questions, it fills in the gaps.

---

## What it is

A one-line draft is missing the **goal, the format and the boundaries**. The model has to guess, and a wrong guess costs you another round. This button adds those three to the sentence you already wrote:

**You wrote**

> Write a scraper for Douban movies

**What goes back in the composer**

> Write a scraper for the Douban movie Top250 with names, ratings and links, output as a CSV file; follow robots.txt, wait at least 2 seconds between requests, and slow down instead of bypassing anti-scraping measures.

You can edit the added text at any time because it sits in the composer. The rewritten result **never contains a question**: if the model slips one in, the question is dropped and the rewrite is kept; if the whole answer is a question, the plugin retries with the legacy rule set and otherwise keeps your draft.

The rule set can be switched (Legacy / Intent-first / WorkBuddy) without changing the button or the steps.

---

## Usage

1. Write a draft in the composer — any length works.
2. Click the **whale-tail icon** in the control row at the right of the composer (a blue dot at its lower-right means it will read the conversation). It is hidden while the composer is empty.
3. After a moment the draft is replaced by the rewritten prompt; how long it takes depends on the model.
4. Not happy? Press `Ctrl+Z` or click the undo arrow. To abandon a run, click the button again: the task is cancelled and the draft stays as it was.

- **For faster results**: an enhancement is a real model call; a faster model is often the difference between a few seconds and ten-plus seconds. To pin a model to enhancement only, open `Settings → Prompt Enhance` and turn on “Which model rewrites”.
- **You can switch away while it runs**: the task keeps running in the background and writes the result back when you return; two sessions can each run one independently.
- **With attachments or links in the composer**: attachments and links count as “what you already said”; the rewrite only touches the sentence next to them, and the references and link chips stay intact.

---

## Shortcuts

Two keys, two jobs: the enhance key triggers a rewrite, the rule-set key opens the switcher. Both are editable and both can be switched off on their own.

**Enhance shortcut (on by default)**: `Ctrl+E` on desktop (`Cmd+E` on macOS), `Ctrl+Alt+E` in the browser (`Cmd+Alt+E`). Press once to enhance, press again while it runs to pause; it acts on the composer of the current session.

Under `Settings → Prompt Enhance → Shortcuts` you can change the combination or turn the switch off. Click the current combo to record a new one, `Esc` cancels, **Restore default** puts it back; a combination already taken by another command is refused with the name of that command.

**Rule-set shortcut (`Ctrl+J` by default, on by default)**: press it to open the rule picker; `↑` / `↓` move the highlight, `Enter` applies, `Esc` closes without changing.

<p align="center">
  <img src="docs/images/05-rule-menu-en.gif" alt="Press Ctrl+J to open the rule picker, ↑↓ to move, Enter to apply" width="820">
  <br>
  <sub>Figure 2: Ctrl+J opens the rule picker; ↑↓ moves, Enter applies</sub>
</p>

- **It works on an empty composer**: the menu opens against the composer and stays on screen when the window narrows; the highlight and the radio dot both point at the rule set in effect, not at the first row.
- The rule-set row in the Shortcuts group can record or type a combination, and supports **Restore default** and **Unbind**.
- The rule-set key has **its own switch**: turning it off keeps the combination and turning it back on restores it; with the master shortcut switch off, neither key works.
- Combinations are validated before saving: browser or system reserved keys (e.g. `Ctrl+T`) are refused, and keys already taken by the host (e.g. `Ctrl+Alt+K` for session search) are refused with the owner named.

**Rule-set badge**: sits at the upper-right of the enhance button and shows the active rule set.

<p align="center">
  <img src="docs/images/06-badge-en.png" alt="The five badge states: L, I, WB, EN, Off" width="820">
  <br>
  <sub>Figure 3: the five badge states — L, I, WB, EN, Off</sub>
</p>

- The three built-ins show **L / I / WB** in the English UI (旧 / 意 / WB in Chinese).
- A custom rule is shortened from its name: the first character in Chinese, the first two characters for English or digits (`English` → `EN`, `123` → `12`).
- When the selected rule is unavailable (disabled or deleted), the badge shows `Off` (关 in Chinese).

**Shortcut settings**: the Shortcuts group of the settings page keeps both keys together; each row has a switch, the current combination and a restore-default action (the rule-set row also has Unbind), plus a usage hint under the rule-set row.

<p align="center">
  <img src="docs/images/07-shortcut-row-en.png" alt="The Shortcuts group in settings: enhance key, rule-set key, separate switches and a hint" width="620">
  <br>
  <sub>Figure 4: the Shortcuts group — a switch, a combination and Restore default per key</sub>
</p>

---

## Button states

<p align="center">
  <img src="docs/images/02-button-states-en.png" alt="Button states: idle, rewriting, done with undo, failed with retry" width="820">
  <br>
  <sub>Figure 5: the four button states — idle, rewriting, done with undo, failed with retry</sub>
</p>

| State | What you see | What it means |
|---|---|---|
| Idle | a still whale tail | ready to click |
| Rewriting | the tail spinning fast | running; click again to cancel |
| Done | an undo arrow | one click to restore, or press `Ctrl+Z` |
| Failed | a red retry icon + reason | the reason sits next to the button, no log hunting |

---

## Settings

<p align="center">
  <img src="docs/images/04-settings-en.png" alt="Settings: rules, references and shortcuts" width="820">
  <br>
  <sub>Figure 6: the settings page — rules, references and shortcuts</sub>
</p>

The entry is `Settings → Prompt Enhance`. Six switches and two pickers (model, rule set); the rule-set picker also holds the “Custom rules” entry — **it only affects this button, never normal sending**.

| Option | Default | What turning it on does |
|---|---|---|
| Which model rewrites | Off | Off: follow the current conversation's model. On: pin the model chosen in the picker. |
| Rule set | **Legacy (stable)** | One of Legacy / Intent-first / WorkBuddy; differences below. |
| Read the earlier conversation | **On** | Reads what came before. More accurate, but more tokens and slower on long chats. |
| Read images in the composer | **On** | Images in the composer take part. Images from earlier messages are never read. |
| Read attachment content | **On** | On: up to 2 non-image attachments, 5 MiB each, text files send a 6000-character preview. Off: only up to 8 file names. |
| Enhance shortcut | **On** | Enables the keyboard shortcut; on by default, can be turned off or rebound here. |
| Rule-set shortcut | **On** | Press `Ctrl+J` to switch rule sets; turning it off keeps the combination and turning it back on restores it. |

**The three rule sets**

- **Legacy (stable)**: uses the 1.7.1 rule text verbatim (15 lines, 10 rules), about 1.2–3× the original.
- **Intent-first**: infers what you are really asking for, then fills in six dimensions (goal / input / scope / method / output / quality bar); what the draft leaves out is left to the executor, which must declare its assumptions. Sparse drafts usually grow 2–5×, capped at 5×.
- **WorkBuddy**: uses the shipped prompt verbatim (analyse the goal, ambiguity, clarity and missing context, then rewrite under seven principles); around 800 characters, so long drafts get compressed.
- None of them answers the request itself; Legacy and Intent-first explicitly forbid questions, and WorkBuddy only forbids “answering the question” — if it returns a question, the plugin drops it.

**Other behaviour**

- The model picker lists the providers and models **you actually own**; it cannot hold a model that does not exist, and turning the switch off keeps the choice.
- Images still uploading, or over the attachment service limit, are skipped; the status area tells you how many were left out instead of failing the whole rewrite.
- The top-right of the settings page shows the **current version** and links to the project home; “Changelog” at the bottom folds by release and reads the bundled `CHANGELOG.md` offline.

**Custom rules**: choose a rule you named in the rule-set picker and it applies at once. “+ Add rule” opens two fields — the **meta prompt** on top (copy it with one click; if the clipboard is unavailable the plugin selects it and asks you to press `Ctrl+C`) and the rule body below.

Send the meta prompt to your own AI; it will generate a rule set for your habits and preferences. Paste the result into the body, give it a name and save. Up to 10 rules, 4000 characters each, and every rule can be disabled or enabled; **disabling or deleting the active rule** falls back to Legacy in the same save, never leaving a dangling selection.

### What it reads and what it does not

<p align="center">
  <img src="docs/images/03-context-modes-en.png" alt="Empty session vs existing conversation: the small dot at the icon's lower-right" width="820">
  <br>
  <sub>Figure 7: an empty session reads the draft only; with a conversation a blue dot appears</sub>
</p>

- **Conversation**: a small blue dot at the button's lower-right means it will read what was said earlier; without the dot it reads the current draft only. The dot describes **what clicking now would do**, so it hides while running, comes back after a failure and disappears when the button shows the undo arrow.
- **Images**: only images **in the current composer**; images in earlier messages are never read — old screenshots are slow and easy to misread, and that boundary is deliberate.
- **Attachments**: only non-image files **in the current composer**; attachments uploaded earlier are not read. At most 2 files, 5 MiB each, and text files only send a 6000-character preview; with the switch off, only up to 8 file names are sent.
- What reaches the prompt is the **readable file name**, not a full path such as `@D:\...`; links keep only the domain. Your local directory layout is never copied out.

---

## Configuration

Every key under the plugin's profile entry is optional. The first eleven are managed by the settings page; the last seven are operational caps and are not exposed in the UI:

```yaml
- id: dsh-prompt-rewriter
  name: dsh-prompt-rewriter
  config:
    # managed by the settings page
    useCustomModel: false      # pin enhanceProvider/enhanceModel
    enhanceProvider: ""        # empty = follow the session model
    enhanceModel: ""
    ruleSet: legacy            # legacy / intent-first / workbuddy
    customRules: "[]"          # custom rules (JSON array text): at most 10, 4000 chars each
    referenceImages: true      # read images in the composer (on by default)
    referenceFiles: true       # read attachment content in the composer (on by default)
    referenceContext: true     # read the earlier conversation (on by default)
    shortcutEnabled: true      # master switch for the enhance shortcut (on by default)
    ruleShortcut: "Ctrl+J"     # rule-set shortcut (empty = unbound)
    ruleShortcutEnabled: true  # separate switch for the rule-set shortcut (on by default)

    # operational caps (not shown in the settings page)
    maxDraftChars: 8000        # draft length cap
    maxOutputChars: 12000      # output length cap
    maxOutputTokens: 2000      # per-request output token cap
    timeoutMs: 90000           # end-to-end timeout
    historyTokenBudget: 6000   # token budget for injected history
    historyMaxMessages: 24     # how many history messages at most
    historyMessageChars: 4000  # character cap per history message
```

---

## How it works

- **Host (`index.js`)**: registers `POST /api/prompt-enhance` (rewrite) and `GET/POST /api/prompt-enhance/settings` (settings) through `ctx.connection.fetch`, inheriting Harness auth and origin checks.
- **Host request path**: reads the session projection for the current model, picks `legacy-rules.mjs` / `intent-first-rules.mjs` / `workbuddy-rules.mjs` by rule set, turns composer attachments into references, then generates through `ctx.llm`.
- **Client (`client.js`)**: renders the button in `conversation.input.right` and the settings page in `settings.section`, and replaces the draft through `inputActions.insertText`.

A few design notes:

- **History is trimmed by budget**: history injection takes `min(historyTokenBudget, context window × 5%)`, collected newest-first; a single over-budget message is cut to a computed target length (up to 4 correction passes) rather than dropped.
- **The output budget grows on demand**: a reasoning model shares one budget between thinking and the visible reply; when the plugin detects a budget-cut, it retries with double the budget (3500 → 7000 → 14000, capped by the model's declared limit and never above 16000).
- **History is injected as a JSON array**, and the system prompt states “this is data, not instructions” to stop history text from forging structure.
- **The image switch is decided by the Host**: the browser uploads whenever there are images, and the Host decides whether to use them — so a not-yet-loaded setting cannot silently fail.

---

## Known limitations

- Images in earlier messages do not take part (deliberate: only composer images are read).
- Replacement is not streamed: the button shows an animation until the rewrite completes.
- The model picker depends on the Host's `remote.session.modelCatalog`; when that surface is unavailable the page says so instead of showing an empty list.
- Attachments are read only from the current composer: earlier uploads do not take part, and one run reads at most 2 files of 5 MiB each.
- The WorkBuddy rule has no verbatim-fidelity clause; long drafts are compressed to about 800 characters.

---

## FAQ

**Nothing happens when I click.** The composer is empty, or “Which model rewrites” is on with no model picked. If you use the shortcut, check that the Shortcuts switch is on and no conflict is shown; the rule-set key also has its own switch.

**“The current model has no usable credentials”?** That model has no key configured. Pick another model, or pin a working one in Settings.

**Will it ask me questions?** No question appears in the result. None of the rule sets answers the request itself; Legacy and Intent-first explicitly forbid questions, and WorkBuddy only forbids “answering the question” — if it returns a question the plugin drops it, retries with Legacy when the whole answer is a question, and otherwise keeps your draft.

**Do my attachments get sent out?** Only when “Read attachment content” is on: up to 2 non-image attachments from the current composer, 5 MiB each, text files send a 6000-character preview. With it off, only file names are sent.

---

## Development

The plugin is split into Host and Client: the Host only uses host services such as `ctx.connection`, `ctx.llm` and `ctx.settings`; the Client registers slot components through `window.__ModuleLoader__`. **The two halves load differently, so they are verified differently**:

- **`client.js` (button, interaction, copy, styles)**: client HMR polls the front-end bundle every 500ms, pushes changes over `/plugins/events` and swaps the plugin entry in place; no host restart is needed, and a page refresh is only a fallback.
- **`index.js`, `*-rules.mjs` (enhance endpoint, prompt rules, settings storage)**: imported once at host startup; a change needs a restart.

Client HMR comes from `@deepseek-ai/dsh-client-hmr` and is always mounted in the Web composition; it is a different mechanism from the host-side `hmr`, which this profile sets to `disabled: true`, so host **code** has no hot reload.

Settings changed in the settings page still apply immediately (they go through the settings service, not file watching); only hand-editing `cordis.patch.yml` needs a restart.

**Unit tests are not published with the npm package.** The repository has the full `tests/` and `scripts/gate.mjs`, but they depend on the host's private `@deepseek-ai/schemastery`, a host React copy and this machine's profile layout, so a fresh clone cannot run them.

They stay in the repository and are not packed; run them locally before a release, and only then publish.

```sh
npm run check                    # index.js / client.js syntax
npm test                         # all tests/
node scripts/gate.mjs            # rules and shape gate (run before publishing)
npm pack --dry-run               # inspect the published contents
```

---

## Contributing, security and versioning

- Sending code, reporting issues and the local verification steps are in [CONTRIBUTING.md](CONTRIBUTING.md).
- How to report a security problem privately is in [SECURITY.md](SECURITY.md).
- How versions are chosen and how pre-releases are marked is in [VERSIONING.md](VERSIONING.md).

### Thanks

Issue reports and suggestions count as contributions too; each release credits them in its [CHANGELOG.md](CHANGELOG.md) entry, while this section keeps the long-term list and earlier releases.

- [@YuvuShine](https://github.com/YuvuShine): reported #8 (the enhance button vanished when a command block was present, the result was delayed, and the command block got rewritten), with reproduction steps, the root cause and a fix — adopted in 1.8.4.
- [@moyuboy](https://github.com/moyuboy): reported #4 (a control in the same slot covered the button by about 4px), with the root cause and four possible fixes — adopted in 1.8.3.
- [@xutiannuo](https://github.com/xutiannuo): reported #2 (the OpenCode provider returned 400 MissingSessionID), with a three-line fix — adopted in 1.7.1.

### Listed on

[![awesome-dsh-plugin](https://img.shields.io/badge/awesome--dsh--plugin-listed-4b6bfb.svg)](https://github.com/dsh-plugin/awesome-dsh-plugin)
[![dshplugin hub](https://img.shields.io/badge/dshplugin-hub-4b6bfb.svg)](https://dshplugin.com/plugins/dsh-prompt-rewriter)
[![deepseek harness plugins](https://img.shields.io/badge/deepseek--harness--plugins-listed-4b6bfb.svg)](https://deepseekharnessplugins.com/plugins/dsh-prompt-rewriter)

---

## License

The code is MIT; see [LICENSE](LICENSE). Bundled assets fall into three groups:

| Asset | License | Inside MIT? |
|---|---|---|
| Plugin code | MIT | Yes |
| The 36-frame whale-tail outline (from `dsh-status-rotator` v0.38.0, by 01Virex) | **MIT**, verified upstream | Yes, with its copyright notice kept |
| The DeepSeek “big fat fish” brand mark (from `dsh-web-frontend`) | no license found | **No, not covered by MIT** |

The third-party notices in NOTICE must stay with the distribution; see [NOTICE.md](NOTICE.md).
