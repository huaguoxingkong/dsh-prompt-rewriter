# Changelog

本项目的所有重要改动都记录在本文件。

格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)。
开发期改动写在 `[Unreleased]` 段，发布时改名为 `## [X.Y.Z] - YYYY-MM-DD`；设置页的更新日志只列已发布的正式版本。

## [Unreleased]

**中文**

### 修复

- 规则集徽标不再挡住润色按钮的点击：徽标的命中区域回到自身大小，鼠标点按钮正常改写草稿，点徽标仍打开规则菜单；缩放或字体不同时也不会再盖住整颗按钮。

**English**

### Fixed

- The rule-set badge no longer swallows clicks meant for the enhance button: its hit area is back to the chip's own size, so clicking the button rewrites the draft again and clicking the badge still opens the rule menu at any zoom or font size.

## [1.10.1] - 2026-11-26

**中文**

### 修复

- 带图片或附件的草稿点增强不再失败（新版 Harness 上会报 cannot get property "root" without inject）：插件现在同时兼容新旧两版宿主，图片与附件照常读入。
- 思考型模型把输出预算花在思考上、接口以「输出上限」报错结束时，现在会按既有阶梯翻倍预算重试，不再一次就失败；模型自带的输出上限也会被正确读取，起始预算不再恒为 2000。

**English**

### Fixed

- Enhancing a draft that carries an image or attachment no longer fails on newer Harness builds (it reported cannot get property "root" without inject): both host generations are supported and attachments are read again.
- When a reasoning model spent its budget thinking and the provider ended with an output-limit error, the run failed once instead of retrying: it now doubles the budget along the existing ladder, and the model's own output cap is read so the first attempt no longer starts at 2000 tokens.

## [1.10.0] - 2026-11-25

**中文**

### 新增

- 规则集快捷切换：增强按钮旁新增当前规则集的徽标，点徽标、右键按钮或按 Ctrl+J 打开同一个菜单，菜单只切换不编辑，选中立即生效并在输入框上方提示已切到「X」。
- 规则集快捷键可自定义：设置页「快捷键」组新增一行，可录制或手改组合、恢复默认、取消绑定，并有独立开关（默认开，关闭时保留已录组合）；保存前拦下浏览器或系统保留键、以及与本插件其他快捷键的冲突并点名占用者；默认组合改为 Ctrl+J（旧的 Alt+Shift+R 会被 Windows 输入法切换吃掉），行下附一行 ↑/↓ 与 Enter 的使用提示。

### 变更

- 所有功能默认开启：参考输入框图片、增强快捷键总开关都改为默认打开（原本默认开启的保持不变）；设置页仍可逐项关掉，显式关闭会一直生效。

### 修复

- 规则集快捷键按了没反应：输入框为空时无响应、菜单飘到页面左上角、被宿主的「搜索会话」等组合静默吃掉；现在贴着输入框展开、窗口变窄也不越界，冲突组合在保存时就拒绝。
- 看不出当前是哪套规则：徽标不再恒显「自」，内置保持旧 / 意 / WB，自定义按规则名取字（英文取前两个字母，不可用时显示「关」）；下拉不再自动加「自定义：」前缀，规则必须填名，菜单高亮跟随当前规则。
- 装上新版本后设置页仍显示旧版本号、更新日志停在旧内容：这两处改为按文件变化重读。

**English**

### Added

- Quick rule-set switching: a badge beside the enhance button names the active rule set; click the badge, right-click the button, or press Ctrl+J to open the same menu, which only switches sets. A pick applies at once and the composer reports Switched to "X" above it.
- The rule-set shortcut is now customizable: a new row in the Keyboard shortcut group records or edits the combination, restores the default, or unbinds it, with its own switch (on by default) that keeps the recorded combination when off. Before saving it refuses browser or system reserved keys and clashes with this plugin's other shortcuts, naming the owner; the default is Ctrl+J because the old Alt+Shift+R is swallowed by the Windows input-language switch, and a hint below covers ↑/↓ and Enter.

### Changed

- All features now default to on: reading images in the composer and the enhance-shortcut master switch are on out of the box (the others were already on); every one can still be turned off in Settings, and an explicit off sticks.

### Fixed

- The rule-set shortcut no longer does nothing on an empty composer, no longer sends its menu to the page's top-left corner, and is no longer swallowed by host combinations such as the session search; it now opens against the composer, stays on screen in a narrow window, and refuses conflicting combinations when saving.
- The badge no longer says 自 for every custom rule: built-ins keep 旧 / 意 / WB, custom rules show initials from their name (two letters for a Latin name, Off when unavailable); the dropdown no longer adds a 自定义: prefix, a rule must be named, and the menu highlight follows the active set.
- The settings page no longer keeps the previous version number or stale release notes after an update; both are re-read when their files change.

## [1.9.0] - 2026-11-22

**中文**

### 新增

- 自定义规则：可以在「增强规则版本」里写自己的改写规则并选中使用，最多 10 条；「＋ 添加规则」会给出一段可直接复制给 AI 的提示词，生成的正文粘回即可保存；每次增强结束还会在输入框上方提示这次是按自定义规则改写、模型判定无需改动，还是用了内置规则。

### 修复

- 与 dsh-claude-style 这类会收紧行距的主题同开时，输入框的鲸鱼标记不再压住模型名（issue #9）。
- 增强请求不再超出模型声明的输出上限，不会再因此被 provider 以 400 拒绝（issue #10）。
- 设置页的更新日志不再把 Markdown 记号原样显示：历史版本里的反引号与星号按纯文本呈现。

**English**

### Added

- Custom rules: write your own rewrite rules in the Enhance rule set row (up to 10) and use one instead of the built-in sets; "+ Add rule" gives you a prompt to hand to your own AI, and pasting the result back saves it. A line above the composer then says whether your rule was used, whether the model saw nothing to change, or which built-in rule ran.

### Fixed

- The composer's whale mark no longer overlaps the model name when a theme such as dsh-claude-style tightens that row (issue #9).
- An enhancement no longer asks for more output than the model declares, so it is no longer rejected with a 400 (issue #10).
- The changelog in settings no longer shows raw Markdown: backticks and asterisks from older entries are rendered as plain text.

## [1.8.4] - 2026-11-19

**中文**

- 命令块存在时增强按钮不再消失：此前草稿以已领取的命令（如 `/计划`）开头时，输入态 `claimed` 被误当成冻结态，鲸鱼按钮渲染为 `null`；现在 `claimed` 与 `plain` 一并视为可编辑，按钮照常显示。（#8，感谢 @YuvuShine 报告并给出复现与修法）
- 改写结果即时落地，不再等切会话：此前 `claimed` 下结果被存成「等待」，只发一条读屏提示，必须切到别的会话重建输入框才补投；现在 `claimed` 直接写入，与普通草稿一致。
- 命令块不再被改写成普通文本：此前整段替换的区间从 0 开始，把命令 chip 覆盖成纯文本、命令随之失效；现在命令块与其分隔符作为受保护段参与分区，改写只落在命令参数之后，并禁止整段 `setDraft` 覆盖。

**English**

- The Enhance button no longer disappears when the draft starts with a claimed command (such as `/plan`): `claimed` used to be treated as a frozen state, so the whale button rendered as `null`; it is now editable like `plain`, and the button stays visible. (#8 — thanks to @YuvuShine for the report, the repro and the fix.)
- The rewrite lands immediately instead of waiting for a session switch: under `claimed` the result used to be parked and only announced to screen readers, and the composer had to be rebuilt in another session before it was applied; it now writes directly, exactly like a plain draft.
- The command chip is no longer downgraded to plain text: the whole-draft replacement used to start at offset 0 and overwrite the chip, silently disabling the command; the chip and its separator are now protected segments, the rewrite lands after the command argument, and a whole-draft `setDraft` write is refused while a chip is present.

## [1.8.3] - 2026-11-13

中文

- 这是 1.7.1 之后的合并发布：改动原本分在 1.8.0–1.8.2 三个开发版本里。这三个版本曾发到 npm、现已全部撤回，同名版本号不能再使用，所以内容并入本版，版本号从 1.7.1 直接到 1.8.3。
- 增强规则可选：设置页新增三套规则——旧版（逐字沿用 1.7.1 的规则原文）、意图优先（先推断真实意图再写全）、WorkBuddy（沿用其原始提示词）。三套都只调用一次模型，区别只在改写力度。
- 输入框里的附件会被读取：最多 2 个非图片附件、每个不超过 5 MiB，文本类发送 6000 字符预览；关闭开关后只读文件名。
- 改写不再反问你：夹在改写旁的问句会被就地删掉；整条只有问句时用旧版规则重跑，仍不行就保留原草稿。
- 修复：发送消息时点增强不再失败：输入框冻结时会等到空闲再写入，并照常提供回退。
- 修复：增强按钮被同槽位第三方控件覆盖约 4px（#4）：改用不参与布局的 7px 视觉偏移。
- 设置页顶部新增 Star 与 issue 入口：版本号仍在右侧，不新增设置项。
- 文档：两半的加载方式写明：只改客户端由 client HMR 自动替换，不必重启；宿主侧改动仍需重启一次。
- 文档与截图：设置页截图按本版界面重出（中英各一张，2 倍图）；README 补上附件、反问、规则版本、常见问题、工作原理与已知限制；「单元测试未随本仓库发布」改为「不随 npm 包发布」，并补上 `node scripts/gate.mjs`。
- README 图片换地址并按出现顺序重新编号：改用 jsDelivr 包内地址，文件名重编为 `01-hero`、`02-button-states`、`03-context-modes`、`04-settings`（中英各一套），消除 `01 → 03 → 04 → 05` 空号。

English

- A merged release after 1.7.1. The work was split across three development builds, 1.8.0–1.8.2. All three were published to npm and have since been unpublished; those version numbers cannot be reused, so the content ships here as 1.8.3.
- Selectable enhancement rule sets. Settings now offers three: Legacy (the 1.7.1 playbook verbatim), Intent-first (infers what you actually want, then writes it out fully), and WorkBuddy (its original prompt, unchanged). Each makes a single model call; only the rewriting strength differs.
- Attachments in the composer are read. Up to 2 non-image attachments, 5 MiB each; text files contribute a 6000-character preview. Turn the switch off and only file names are used.
- No more questions back. A question sitting next to a rewrite is stripped; if the whole reply is a question, the Legacy rules run once more, and the original draft is kept if that fails too.
- Fixed: clicking enhance while sending no longer fails. A frozen composer is now waited on, and undo still works.
- Fixed: the button was overlapped by ~4px by a third-party control in the same seat (#4). It now uses a 7px visual offset that takes no layout space.
- Star and issue entries at the top of settings. The version stays on the right; no new setting was added.
- Docs: how each half loads. Client-only changes hot-replace through client HMR without a restart; host-side changes still need one.
- Docs and screenshots. The settings screenshot is re-shot for this UI in both languages at 2x. The README gains attachment, no-questions, rule-set, FAQ, how-it-works and known-limits sections. The false "unit tests are not published with this repository" line now reads "not published in the npm package", and `node scripts/gate.mjs` is documented as the pre-release gate.
- README images moved and renumbered in reading order: `01-hero`, `02-button-states`, `03-context-modes`, `04-settings` (both languages), served from jsDelivr inside the package. The `01 → 03 → 04 → 05` gap is gone.

## [1.7.1] - 2026-11-06

中文

- OpenCode 渠道的增强请求不再返回 400：此前请求没有把会话号透传给模型层，OpenCode 目标缺少 `x-opencode-session` 路由头，接口直接返回 `400 MissingSessionID`；现在会话号随请求一起下发，其余渠道的行为不变。（感谢 @xutiannuo 报告并给出修复方向）

English

- Enhancement requests on OpenCode no longer return 400: the session id was not forwarded to the model layer, so OpenCode targets were missing the `x-opencode-session` routing header and the API answered `400 MissingSessionID`. It is now sent with the request; every other provider behaves exactly as before. (Thanks to @xutiannuo for the report and the fix direction.)

## [1.7.0] - 2026-11-05

中文

- 上传文件或链接后改写结果不再被拒绝：此前输入框里带有附件或链接时，经常出现「输入框没有接受替换，草稿保持不变」；现在按编辑器的实际坐标写入，改写正常落进输入框，附件引用也原样保留。
- 增强结果不再出现附件的完整磁盘路径：此前改写的提示词里会复制出 `@D:\...` 之类的地址；现在只保留可读的文件名，撤销操作也只恢复用户自己输入的文字。
- 设置页新增更新日志：按版本折叠展示各已发布版本的变化，默认展开最新版本，逐条列出；内容取自随包发布的本文件，与当前版本号保持一致。

English

- A rewrite is no longer refused after you attach a file or a link: when the composer held an attachment or a link, the rewrite often ended in "the composer did not accept the replacement, the draft is unchanged". It is now written at the editor's real coordinates, so it lands in the composer as usual and attachment references are preserved.
- Enhanced prompts no longer carry an attachment's full disk path: the rewritten prompt used to copy out addresses like `@D:\...`. Only the readable file name is kept now, and undo restores only the text you typed yourself.
- The settings page now ships a changelog: released versions fold open by version — the latest expanded by default, each entry shown line by line. The content is read from the CHANGELOG.md shipped with the package and stays in step with the current version.

## [1.6.3] - 2026-11-02

中文

- 快捷键服务缺失时插件不再整体失效：此前宿主的快捷键服务若没有注册（例如与另一个锁定旧版客户端的插件共存），整个插件会保持休眠，输入框旁的按钮也随之消失。现在只有快捷键降级为不可用，改写按钮照常工作。
- 快捷键服务晚注册也能读到绑定：服务在插件之后才注册时，设置页不再把它显示成「未设置」或「不可用」。

English

- The plugin no longer goes dormant when the host's shortcut service is missing: if that service never registered — for example when another plugin pinned the client runtime to an older range — the whole plugin stayed inactive and the composer button disappeared with it. Only the shortcut degrades now; the Enhance button keeps working.
- A service that registers late still resolves: the settings page no longer reports the binding as unset or unavailable when the service arrives after the plugin.

## [1.6.2] - 2026-10-31

中文

- 螺旋鱼尾改用品牌蓝：增强进行中的鱼尾动效此前跟随按钮的文字色，深色主题下接近白色，与旁边的鱼形图标不同色。现在统一使用官方品牌蓝，待命与进行中两种状态看起来是同一个控件。
- 输入框图片读取更可靠：宿主服务取不到时改从输入框自身的通道取图；两处都无法回答时不再静默跳过，文字改写照常完成，状态区会告诉你少读了几张。

English

- The twisting tail now uses the brand blue: while an enhancement runs, the tail animation inherited the button's text colour, which is near white in the dark theme and did not match the fish icon beside it. It now uses the official brand blue, so the idle and running states read as one control.
- Composer images are read more reliably: when the host service cannot answer, the composer's own channel is used instead; when neither can, the images are no longer skipped silently — the text-only rewrite still completes and the status area reports how many were missed.

## [1.6.1] - 2026-10-30

中文

- 本次为代码清理，没有功能变化：快捷键注册失败时的控制台输出与一条内部调试属性被移除，按钮、设置页与改写流程的行为与 1.6.0 完全一致。

English

- Code cleanup only, no functional change: the console message printed when shortcut registration fails and one internal debug attribute were removed. The button, the settings page and the rewrite flow behave exactly as in 1.6.0.

## [1.6.0] - 2026-10-30

中文

- 键盘快捷键：现在可以用键盘触发提示词增强，不必再点图标。默认关闭，在「设置 → 提示词改写」打开后生效；桌面端为 `Ctrl+E`（macOS `Cmd+E`），浏览器端为 `Ctrl+Alt+E`（macOS `Cmd+Alt+E`）。
- 键位可自定义：设置页可以录制自己的组合，也可以一键恢复默认。录入的组合若已被其它命令占用，会指出冲突的命令名且不生效，你原有的键位保持不变。
- 与点击完全等价：快捷键走的是图标自身的点击入口，增强完成后同样可以再按一次撤销，不存在第二套逻辑。回退仍由按钮或 `Ctrl+Z` 负责。
- 重启后仍然生效：键位通过 Harness 的快捷键机制注册，与内置快捷键共用同一套持久化。

English

- Keyboard shortcut: trigger an enhancement from the keyboard instead of clicking the icon. Off by default; enable it under Settings → Prompt rewriter. `Ctrl+E` on desktop (`Cmd+E` on macOS) and `Ctrl+Alt+E` in the browser (`Cmd+Alt+E`).
- Rebindable: record your own combination in Settings, or restore the default with one click. If a combination is already taken by another command, the row names the command it collides with, the combination is not applied, and your existing binding stays.
- Same as clicking: the shortcut runs the icon's own click handler, so pressing it again after a finished enhancement undoes it, exactly like the icon. Restoring a draft stays on the button or `Ctrl+Z`.
- Survives a restart: the binding is registered through Harness's shortcut service, so it persists across restarts.

## [1.5.1] - 2026-10-29

中文

- 设置页显示插件版本号：点一下在新标签页打开项目主页，不打断当前会话。遇到问题时先看一眼版本，反馈时更好定位。
- 修复版本号链接指向错误地址：此前指向一个不存在的仓库，点击会打开 404。
- 修复安装目录含空格时版本号读不出来：路径被解析成带 `%20` 的形式，读取失败且不报错，版本号那一行直接消失。
- 设置文案精简：两条多层意思的提示各压缩到一句，并补上输入框上蓝点的含义说明。

English

- The settings page shows the plugin version: click it to open the project page in a new tab without leaving your conversation, so reporting an issue starts with the version in hand.
- Fixed the version link pointing at the wrong address: it led to a repository that does not exist, so clicking it opened a 404.
- Fixed the version failing to load when the install path contains a space: the path resolved with `%20` in it, the read failed silently, and the whole version row disappeared.
- Tighter settings copy: two multi-clause hints were reduced to one line each, and the blue dot on the composer icon is now explained where it appears.

## [1.4.1] - 2026-10-28

中文

- 长草稿、含链接的草稿不再失败：此前模型输出触顶会被误报成「模型没有返回可用的提示词」；现在识别到截断会自动扩大预算重试，你看到的是一次稍慢但成功的改写。
- 重启后上下文圆点立即出现：此前重启 DSH 后要发一条消息才显示，而且重启后的第一次改写也会退化成不参考前文；现在改为从磁盘补齐历史。
- 输入框为空时不再显示按钮：此前空输入框也显示图标，点了没有反应。
- 上下文圆点颜色修正：此前渲染成白色，现在使用主题中真实存在的品牌色。
- 圆点含义改为「此刻会发生什么」：它现在只依据改写前就能确定的两件事——开关是否打开、本会话是否确实有上下文——而不是上一次运行的结果。
- 占位符有了上限：最多 3 个，超出部分折叠成一句请补充其余细节，避免改写结果变成一张待填的表单。
- 新增 `DSH_SESSIONS_DIR` 环境变量：可覆盖会话根目录，供非默认 DSH home 的部署使用。

English

- Long drafts and drafts containing links no longer fail: a truncated model response used to be reported as the model returning no usable prompt; a truncation now triggers a larger budget and a retry, so you see one slightly slower but successful rewrite.
- The context dot appears right after a restart: it previously needed a sent message to show up, and the first rewrite after a restart silently ignored earlier turns; history is now read from disk.
- The icon is hidden while the composer is empty: an empty composer used to show a button that did nothing when clicked.
- Context dot colour fixed: it rendered white and now uses a brand colour the theme actually defines.
- The dot now reports what will happen: it is decided by the two facts knowable before a run, namely whether the switch is on and whether this conversation really has context, rather than by the outcome of the previous run.
- Placeholders are capped at three: anything beyond that is folded into a single request to supply the remaining details, so a rewrite cannot become a form waiting to be completed.
- New `DSH_SESSIONS_DIR` environment variable: overrides the session root for deployments with a non-default DSH home.

## [1.2.1] - 2026-10-28

中文

- 首图演示了「点哪里」：动图从静止开始，指针移入并停在图标上，按下之后草稿被替换，读者一眼能看到是哪个按钮触发改写。
- 读屏文字同步更新：图片的替代文字改成了「点一下输入框右侧的鲸鱼尾巴图标」，使用读屏的用户同样知道点哪里。
- 本版只改文档与配图：插件代码与 1.2.0 完全一致，可直接覆盖升级。

English

- The lead figure shows what to click: the animation starts still, the pointer moves in and rests on the icon, then presses and the draft is replaced, so the triggering control is obvious at a glance.
- Screen-reader text updated: the image alternative text now says to click the whale-tail icon on the right of the composer, so screen-reader users know where to click too.
- Documentation and figures only: the plugin code is identical to 1.2.0, so you can upgrade over it directly.

## [1.2.0] - 2026-10-28

中文

- 历史裁剪提速约 3 倍：超长的一轮对话不再拖慢改写，同样的预算能携带更多有效上下文。
- 改写更贴近真实目标：推断你真正想达成什么，而不是照字面改写你的步骤；缺失的信息用显式占位符标出，既不臆造也不悄悄删掉你的需求。
- 结果更好读：信息按「目标 → 约束 → 输出格式」排序，用祈使句直接对执行者说话。
- 上下文模式的结果可独立成立：携带前文已经确认的结论，但不携带推导过程。

English

- History trimming is about 3× faster: an extremely long turn no longer slows the request down, and the same budget carries more useful context.
- Closer to your real goal: the rewrite infers what you actually want instead of paraphrasing your steps, and marks missing information with explicit placeholders rather than inventing it or dropping it.
- Easier to follow: information is ordered goal to constraints to output format, addressed to the executor in the imperative.
- A context-aware result stands on its own: it carries conclusions already settled earlier, without the reasoning behind them.

## [1.1.0] - 2026-10-28

中文

- 切换会话不再中断改写：点了按钮之后可以切到别的会话，任务会继续跑完，回来时结果已经写进输入框。
- 多会话互不干扰：两个会话可以同时各跑一个改写任务，各自独立完成。

English

- An enhancement survives a session switch: after clicking, you can move to another conversation and the run finishes anyway; the result is in your draft when you return.
- Conversations stay independent: two conversations can run one rewrite each at the same time and finish separately.

## [1.0.3] - 2026-10-28

中文

- 英文 README 与英文界面截图：README 拆成英文版与中文版，11 个小节一一对应、可互相切换；英文版另配一套界面文字为英文的图。
- 动图取代静态图：首图循环演示「草稿 → 鱼尾旋成螺旋 → 原地替换成提示词」的完整过程，另一张展示按钮的四种状态。
- 修复 npm 包内缺失的文件：此前发布包漏掉了截图与中文说明，从 npm 安装的用户看不到配图。

English

- English README and English screenshots: the README split into English and Chinese versions with 11 matching sections that link to each other, and the English one ships its own figures with English UI text.
- Animated figures replace static ones: the lead figure loops through draft, twisting tail and replaced prompt, and another shows the four button states.
- Fixed files missing from the npm package: earlier publishes omitted the screenshots and the Chinese guide, so npm users saw no figures.

## [1.0.2] - 2026-10-28

中文

- 首图标注了按钮位置：首张截图加了一处指引，读者不用再猜是哪个图标负责改写。
- 本版只改文档：插件代码与 1.0.0 相同，可直接覆盖升级。

English

- The lead screenshot points at the button: a guide was added to the first figure, so readers no longer have to guess which icon runs the rewrite.
- Documentation only: the plugin code is identical to 1.0.0, so you can upgrade over it directly.

## [1.0.0] - 2026-10-28

中文

- 一键改写：输入框有内容时，旁边出现一个按钮，点一下就把草稿改写成目标、格式、约束齐全的可执行提示词，原地替换、不发送消息。
- 可撤销：改写结果是一次普通编辑，`Ctrl+Z` 或点回退图标即可还原。
- 可取消：改写过程中再点一下即暂停，草稿保持原样，不报错。
- 失败可见：出错时按钮变成重试图标，失败原因直接显示在按钮旁，不用翻日志。
- 上下文感知：会话已有对话时参考前文的目标、已确认项和已排除方案；空会话只处理当前草稿。这会多耗一些 token。
- 可选参考图片：打开开关后，输入框里已经放好的图片参与改写；历史消息里的图片始终不读。
- 设置页：三个开关加一个模型选择器，只影响这个按钮，不影响正常发送。
- 安装：`dsh plugin --profile desktop add dsh-prompt-rewriter`，装完重启 Harness（本插件无 HMR）。

English

- One-click rewrite: with text in the composer, a button appears beside it; one click turns the draft into a complete, executable prompt covering goal, format and constraints — replaced in place, never sent.
- Undoable: the result is an ordinary edit, so `Ctrl+Z` or the revert icon restores your draft.
- Cancellable: click again while it runs to pause; your draft stays untouched and nothing errors.
- Visible failure: on error the button becomes a retry icon and shows the reason beside it, so you never have to open a log.
- Context aware: a conversation with history contributes its goals, confirmed decisions and ruled-out options; an empty one uses only the current draft. This costs extra tokens.
- Optional images: with the switch on, images already placed in the composer take part in the rewrite; images from earlier messages are never read.
- Settings: three switches and a model picker that affect only this button, never normal sending.
- Install: `dsh plugin --profile desktop add dsh-prompt-rewriter`, then restart Harness (this plugin has no HMR).

## 链接

[Unreleased]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.9.0...HEAD
[1.9.0]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.8.4...v1.9.0
[1.8.4]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.8.3...v1.8.4
[1.8.3]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.7.1...v1.8.3
[1.7.1]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.6.3...v1.7.0
[1.6.3]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.6.2...v1.6.3
[1.6.2]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.4.1...v1.5.1
[1.4.1]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.2.1...v1.4.1
[1.2.1]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/compare/v1.0.0...v1.0.2
[1.0.0]: https://github.com/huaguoxingkong/dsh-prompt-rewriter/releases/tag/v1.0.0
