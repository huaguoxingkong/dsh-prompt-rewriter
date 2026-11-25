# dsh-prompt-rewriter

[English](README.en.md) | 中文

[![npm](https://img.shields.io/npm/v/dsh-prompt-rewriter.svg)](https://www.npmjs.com/package/dsh-prompt-rewriter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2%2B-4b6bfb.svg)](https://github.com/deepseek-ai)
[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/huaguoxingkong/dsh-prompt-rewriter)

把输入框里那句没头没尾的草稿，**原地**改成能直接执行的任务说明。只改内容，不发送、不运行；不满意 `Ctrl+Z` 退回去。

<p align="center">
  <img src="docs/images/01-hero.gif" alt="点一下输入框右侧的鲸鱼尾巴图标，草稿原地变成完整提示词" width="820">
  <br>
  <sub>图 1：点一下输入框右侧的鲸鱼尾巴，草稿原地变成完整提示词</sub>
</p>

- **一键原地改写**：输入框右侧的鲸鱼尾巴按钮，点一下补上目标、格式和边界，结果落回输入框。
- **三个入口切规则集**：按钮徽标、按钮右键、`Ctrl+J`，打开的是同一个切换菜单。
- **可回退，上下文可控**：完成后按钮变成回退箭头；对话、图片、附件三项各自独立开关。

```sh
dsh plugin --profile desktop add dsh-prompt-rewriter
```

**目录**：[30 秒上手](#30-秒上手) · [适合谁](#适合谁--不适合谁) · [用法](#用法) · [快捷键](#快捷键) · [设置](#设置) · [配置](#配置) · [工作原理](#工作原理) · [常见问题](#常见问题)

---

## 30 秒上手

1. **安装**：在终端执行下面这条，把 `desktop` 换成你实际在跑的 profile。
   ```sh
   dsh plugin --profile desktop add dsh-prompt-rewriter
   ```
2. **重启一次 Harness**：首次安装必须。之后只有 `client.js` 变化时刷新页面即可；`index.js` 或规则文件变化仍需重启。
3. **试一次**：在输入框写一句草稿，点右侧的鲸鱼尾巴；不满意按 `Ctrl+Z`，或点按钮变成的回退箭头。

需要 DeepSeek Harness（桌面版或 Web 版）与 `node >= 22`。装好后入口在 `设置 → 提示词增强`。

**其他安装方式**

- 从源码：`dsh plugin --profile web add github:huaguoxingkong/dsh-prompt-rewriter`。会跑构建步骤，首次可能要求授权。
- 从 Release zip：到 [Releases](https://github.com/huaguoxingkong/dsh-prompt-rewriter/releases) 下载 zip，解压后 `npm install && dsh plugin --profile web add .`。

---

## 适合谁 / 不适合谁

**适合**

- 经常一句话丢给 AI、又被反问或跑偏的人。
- 写代码、写文案、做数据处理，想让下游 AI 一次拿到目标、输入、输出与边界的人。
- 希望改写结果还能自己改、能一键撤回，并且把对话 / 图片 / 附件分开控制的人。

**不适合**

- 只想聊天、不需要把草稿写严谨的人。
- 需要插件直接执行任务或自动发送的人——它只改输入框，不发送、不运行。
- 需要多轮对话式澄清的人——它不反问，而是直接补全。

---

## 这是什么

一句话的草稿缺的是**目标、格式、边界**。模型只能猜，猜错了你得换个说法再问一轮。这个按钮把这三样补进你原本那句话里：

**你写的**

> 帮我写个爬虫抓豆瓣电影

**放回输入框的**

> 帮我写个爬虫抓豆瓣电影 Top250 的名称、评分和链接，输出为 CSV 文件；遵守 robots 协议、请求间隔不少于 2 秒，遇到反爬降频而不是绕过。

补出来的内容你随时能改，因为它就落在输入框里。改写结果里**不会出现反问**：模型若夹了问句，问句被删掉、改写保留；整段只有问句时改用旧版规则重跑，仍不行就保留原草稿。

规则版本可以切换（旧版 / 意图优先 / WorkBuddy），换算法不改按钮、不改操作步骤。

---

## 用法

1. 在输入框里写下草稿，多短都行。
2. 点输入栏右侧那一排控件里的**鲸鱼尾巴图标**（右下角有蓝点表示会参考上下文）。输入框为空时它不出现。
3. 片刻之后，草稿被换成改写后的提示词；快慢取决于所选模型。
4. 不满意就 `Ctrl+Z`，或点按钮变成的回退箭头。中途想放弃再点一下：任务取消，草稿保持原样。

- **想更快拿到结果**：增强是一次真实的模型调用，换个响应更快的模型往往就是几秒和十几秒的差别；想固定用某个模型专门做增强，去 `设置 → 提示词增强` 打开「用哪个模型改写」。
- **增强过程中可以切走**：切到别的会话任务会继续跑完，回来时结果已经写进输入框；两个会话可以各跑一个，互不影响。
- **输入框里有附件或链接时**：附件和链接算「你已经说过的东西」，改写只动旁边那句文字；附件引用、链接芯片原样保留。

---

## 快捷键

两个键各管各的：增强键触发改写，规则集键打开切换菜单。都能在设置里改，也都能单独关掉。

**增强快捷键（默认开启）**：桌面端 `Ctrl+E`（macOS `Cmd+E`），浏览器端 `Ctrl+Alt+E`。按一次增强，运行中再按一次暂停；作用对象是当前会话的输入框。

到 `设置 → 提示词增强 → 快捷键` 可以修改组合或关掉开关。点当前组合即可录制，`Esc` 取消，恢复默认一键还原；被别的命令占用时会指出冲突的命令名。

**规则集快捷键（默认 `Ctrl+J`，默认开启）**：按它打开规则选择器，`↑` / `↓` 移动高亮，`Enter` 应用，`Esc` 关闭不改。

<p align="center">
  <img src="docs/images/05-rule-menu.gif" alt="按 Ctrl+J 打开规则选择器，↑↓ 移动，Enter 应用" width="820">
  <br>
  <sub>图 2：Ctrl+J 打开规则集菜单，↑↓ 移动，Enter 应用</sub>
</p>

- **空输入框也能用**：菜单贴着输入框展开，窗口变窄也不会跑出屏幕；打开时高亮和蓝点都指向当前生效的规则集，不是第一项。
- 设置页「快捷键」组的规则集行可以录制或手改组合，支持**恢复默认**与**取消绑定**。
- 规则集键有**独立开关**：关掉后组合保留，重新打开立即恢复；增强键的总开关关闭时两个键都不生效。
- 保存前会校验组合：浏览器或系统保留键（如 `Ctrl+T`）会被拒绝，被宿主先占用的组合（如 `Ctrl+Alt+K` 归「搜索会话」）会被拒绝并点名占用者。

**规则集徽标**：在增强按钮右上角，显示当前生效的规则集。

<p align="center">
  <img src="docs/images/06-badge.png" alt="规则集徽标的五种样子：旧、意、WB、EN、关" width="820">
  <br>
  <sub>图 3：规则集徽标的五种样子：旧、意、WB、EN、关</sub>
</p>

- 内置三套在中文界面显示 **旧 / 意 / WB**（英文界面为 L / I / WB）。
- 自定义规则取名字：中文取首字，英文或数字取前两个字符（`English` → `EN`，`123` → `12`）。
- 当前选中的规则不可用（被停用或删除）时显示「关」（英文界面为 `Off`）。

**快捷键设置**：设置页「快捷键」组把两个键放在一起，每行有开关、当前组合、恢复默认（规则集行还有取消绑定），规则集行下方还有一行使用提示。

<p align="center">
  <img src="docs/images/07-shortcut-row.png" alt="设置页的快捷键组：增强键、规则集键、独立开关与使用提示" width="620">
  <br>
  <sub>图 4：快捷键组：两个键各有开关、当前组合与恢复默认</sub>
</p>

---

## 按钮状态

<p align="center">
  <img src="docs/images/02-button-states.png" alt="按钮状态：空闲、改写中、完成可回退、失败可重试" width="820">
  <br>
  <sub>图 5：按钮四种状态：空闲、改写中、完成可回退、失败可重试</sub>
</p>

| 状态 | 你看到的 | 意味着 |
|---|---|---|
| 空闲 | 静止的鲸鱼尾巴 | 可以点 |
| 改写中 | 鱼尾快速旋转 | 在跑；再点一下是取消 |
| 完成 | 变成回退箭头 | 一键还原，或用 `Ctrl+Z` |
| 失败 | 红色重试图标 + 原因 | 原因就在按钮旁边，不用翻日志 |

---

## 设置

<p align="center">
  <img src="docs/images/04-settings.png" alt="设置页：规则、参考内容与快捷键" width="820">
  <br>
  <sub>图 6：设置页：规则、参考内容与快捷键</sub>
</p>

入口在 `设置 → 提示词增强`。六个开关、两个选择器（模型、规则版本），规则版本下拉里还有「自定义规则」入口——**只影响这个按钮，不影响正常发送**。

| 选项 | 默认 | 打开会怎样 |
|---|---|---|
| 用哪个模型改写 | 关 | 关：跟随当前对话的模型。开：固定用下拉选定的模型。 |
| 增强规则版本 | **旧版（稳定）** | 三选一：旧版 / 意图优先 / WorkBuddy，区别见下。 |
| 参考之前的对话 | **开** | 读前面的内容。更准，但多耗 token、长对话更慢。 |
| 参考输入框里的图片 | **开** | 输入框里的图一起参与。历史消息里的图片始终不读。 |
| 参考附件内容 | **开** | 开：最多读 2 个非图片附件，每个不超过 5 MiB，文本类只发送 6000 字符预览。关：只把最多 8 个文件名当上下文。 |
| 增强快捷键 | **开** | 打开后可用键盘触发改写；默认开启，可在这里关闭或改组合。 |
| 规则集快捷键 | **开** | 打开后按 `Ctrl+J` 切换规则集；关掉后组合保留，重新打开即恢复。 |

**三套规则的区别**

- **旧版（稳定）**：逐字沿用 1.7.1 发布的规则原文（15 行、其中 10 条规则），约为原文 1.2–3 倍。
- **意图优先**：先推断你真正想干什么，再按六个维度补全（目标 / 输入 / 范围 / 方法 / 输出 / 质量标准）；草稿没说的地方交给执行者决定并要求它声明假设，稀疏草稿通常扩到 2–5 倍、上限 5 倍。
- **WorkBuddy**：逐字沿用随包发布的原始提示词（先分析目标、歧义、清晰度与缺失上下文，再按七条原则重写）；上限约 800 字符，长草稿会被压缩。
- 三者都不回答请求本身；旧版与意图优先明文禁止反问，WorkBuddy 原文只禁「回答问题」，它若回问句由插件丢弃。

**其他行为**

- 模型下拉列出你**实际拥有**的渠道与模型，填不进不存在的模型；关掉开关不会清空选择。
- 上传中的图片、或超出附件服务限额的图片会被跳过，状态区会告诉你少读了几张，不会因为一张图让整次改写失败。
- 设置页右上角显示**当前版本号**，点一下打开项目主页；底部「更新日志」按版本折叠，内容取自随包发布的 `CHANGELOG.md`，不联网也能看。

**自定义规则**：规则版本下拉里直接选你自己起的规则名即生效。点「＋ 添加规则」给出两栏——上面一段**元提示词**（可一键复制，剪贴板不可用时自动全选并提示按 `Ctrl+C`），把它发给你自己的 AI，AI 会按你的规则与习惯生成一套只属于你的增强规则。

把生成的正文粘回下面的框、起个名字保存即可参与增强。最多 10 条、单条正文 4000 字符，每条都能「停用 / 启用」；**停用或删除正在用的那条时**，选中项会在同一次保存里落回「旧版」，不会留下悬空选择。

### 它读什么、不读什么

<p align="center">
  <img src="docs/images/03-context-modes.png" alt="空会话 vs 已有对话：图标右下角的小圆点是标记" width="820">
  <br>
  <sub>图 7：空会话只看草稿；已有对话时按钮右下角出现蓝点</sub>
</p>

- **对话**：按钮右下角有蓝色小圆点，代表会读前面聊过的内容；没有圆点就只看当前草稿。圆点描述的是**此刻点下去会怎样**，所以它在运行中隐藏、失败后恢复、按钮变成回退箭头时消失。
- **图片**：只读**当前输入框里的**图片，历史消息里的图片永远不读——旧截图既慢又容易误读，这条边界是刻意的。
- **附件**：只读**当前输入框里的非图片附件**，历史上传过的附件不读。一次最多 2 个、每个 5 MiB，文本类只取前 6000 字符预览；关掉后只发最多 8 个文件名。
- 写进提示词的是**可读的文件名**，不是 `@D:\...` 这样的完整路径；链接只保留域名，本机目录结构不会被复制出去。

---

## 配置

profile 插件行的 `config` 全部可选。前十一项由设置页托管，后七项是运维上限，不暴露在界面上：

```yaml
- id: dsh-prompt-rewriter
  name: dsh-prompt-rewriter
  config:
    # 设置页托管
    useCustomModel: false      # 是否固定使用 enhanceProvider/enhanceModel
    enhanceProvider: ""        # 空 = 跟随会话模型
    enhanceModel: ""
    ruleSet: legacy            # 增强规则版本：legacy（旧版）/ intent-first（意图优先）/ workbuddy
    customRules: "[]"          # 自定义规则（JSON 数组文本）：最多 10 条，单条正文 ≤ 4000 字符
    referenceImages: true      # 是否参考输入框图片（默认开）
    referenceFiles: true       # 是否参考输入框附件内容（默认开）
    referenceContext: true     # 是否参考之前的对话（默认开）
    shortcutEnabled: true      # 增强快捷键总开关（默认开）
    ruleShortcut: "Ctrl+J"     # 切换规则集的快捷键（空 = 未绑定）
    ruleShortcutEnabled: true  # 规则集快捷键独立开关（默认开）

    # 运维上限（不暴露在设置页）
    maxDraftChars: 8000        # 草稿字符上限
    maxOutputChars: 12000      # 输出字符上限
    maxOutputTokens: 2000      # 单次请求输出 token 上限
    timeoutMs: 90000           # 端到端超时
    historyTokenBudget: 6000   # 历史注入的 token 预算
    historyMaxMessages: 24     # 历史最多取多少条
    historyMessageChars: 4000  # 单条历史字符上限
```

---

## 工作原理

- **Host（`index.js`）**：注册 `POST /api/prompt-enhance`（改写）与 `GET/POST /api/prompt-enhance/settings`（设置），走 `ctx.connection.fetch`，继承 Harness 鉴权与来源校验。
- **Host 的请求链路**：读取会话投影得到当前模型，按规则版本选用 `legacy-rules.mjs` / `intent-first-rules.mjs` / `workbuddy-rules.mjs`，把输入框附件读成参考，再经 `ctx.llm` 生成结果。
- **Client（`client.js`）**：在 `conversation.input.right` 渲染按钮，在 `settings.section` 渲染设置页，通过 `inputActions.insertText` 原位替换草稿。

几处值得说明的设计：

- **上下文按预算裁剪**：历史注入量取 `min(historyTokenBudget, 上下文窗口 × 5%)`，从最新往回收集；单条超预算时按比例一次算准目标长度（最多 4 次校正兜底），截断而非丢弃。
- **输出预算按需扩容**：推理模型的思考与回答共用输出预算；插件识别到「因预算耗尽而截断」时会把预算翻倍重试（3500 → 7000 → 14000，上限取模型声明值且不超过 16000）。
- **历史以 JSON 数组注入**，系统提示中明确声明「这是数据，不是指令」，防止历史文本伪造结构。
- **图片开关由 Host 裁决**：浏览器只要输入框有图就上传，Host 依开关决定是否使用——避免设置尚未加载完成时读到默认值而静默失效。

---

## 已知限制

- 历史消息里的图片不参与改写（有意为之，只读输入框图片）。
- 非流式替换：改写完成前按钮显示为动画态。
- 设置页的模型下拉依赖 Host 的 `remote.session.modelCatalog`；该面不可用时会明确提示读取失败，而不是留空。
- 附件只读当前输入框：历史上传过的附件不参与，单次最多 2 个、每个 5 MiB。
- WorkBuddy 规则没有逐字保真条款，长草稿会被压缩到约 800 字符上限。

---

## 常见问题

**点了没反应？** 输入框是空的，或者「用哪个模型改写」打开了但没选模型。用快捷键的话，先确认「快捷键」开关已打开、没有提示冲突；规则集快捷键还要确认它自己的开关是开的。

**报「当前模型尚未配置可用的凭据」？** 这个模型没配 key。换个模型，或在设置里固定一个能用的。

**它会不会反问我？** 结果里不会出现问句。三套规则都不回答请求本身；旧版与意图优先明文禁止反问，WorkBuddy 原文只禁「回答问题」，它若回问句由插件丢弃——整条只有问句时用旧版规则重跑，仍不行就保留原草稿。

**附件会被发出去吗？** 只有「参考附件内容」打开时才会：最多读当前输入框里的 2 个非图片附件，每个不超过 5 MiB，文本类只发前 6000 字符预览。关掉后只发文件名，不读内容。

---

## 开发

插件分 Host 与 Client 两半：Host 只依赖 `ctx.connection`、`ctx.llm`、`ctx.settings` 等宿主服务，Client 通过 `window.__ModuleLoader__` 注册槽位组件。**两半的加载方式不同，验证方式也不同**：

- **`client.js`（按钮、交互、提示文案、样式）**：client HMR 每 500ms 轮询前端 bundle，变更经 `/plugins/events` 推送，窗口就地替换该插件条目；不需要重启宿主，刷新窗口只是兜底。
- **`index.js`、`*-rules.mjs`（增强接口、提示词规则、设置存储）**：宿主启动时一次性 import，改完必须重启。

client HMR 由 `@deepseek-ai/dsh-client-hmr` 提供，Web 组合里始终挂载；它与宿主侧的 `hmr` 是两套东西——本机 profile 把宿主 `hmr` 设成了 `disabled: true`，所以宿主**代码**没有热重载。

设置页里改的配置项仍会立即生效（走设置服务，不经文件监听）；手工改 `cordis.patch.yml` 才需要重启。

**单元测试不随 npm 包发布。** 仓库里有完整的 `tests/` 与 `scripts/gate.mjs`，但它们依赖宿主私有的 `@deepseek-ai/schemastery`、宿主 React 副本与本机 profile 目录结构，克隆下来直接跑会失败。

所以这些测试只留在仓库里，不进 npm 包；发布前本地跑一遍，过了才发。

```sh
npm run check                    # index.js / client.js 语法
npm test                         # tests/ 全部用例
node scripts/gate.mjs            # 规则与形状门禁（发布前必跑）
npm pack --dry-run               # 检查发布内容
```

---

## 贡献、安全与版本策略

- 提交代码、报告问题与本地验证步骤见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 参与 issue、讨论与 PR 一律遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)（行为准则），由维护者执行。
- 安全问题的私下报告方式见 [SECURITY.md](SECURITY.md)。
- 版本号怎么定、预发布怎么区分、功能怎么弃用见 [VERSIONING.md](VERSIONING.md)。
- 贡献者口径：[AUTHORS](AUTHORS) 收录作者与维护者；下面的「致谢」收录报告问题并给出可复现根因与可采纳修法的人；完整收录标准见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 致谢

问题报告与修法建议同样算贡献；每版的致谢写进 [CHANGELOG.md](CHANGELOG.md) 对应条目，这一节收长期名单与早前版本的补记。

- [@YuvuShine](https://github.com/YuvuShine)：报告 #8（命令块存在时增强按钮消失、结果延迟、命令块被改写），给出复现步骤、根因定位与修法，1.8.4 采纳。
- [@moyuboy](https://github.com/moyuboy)：报告 #4（同槽位控件把按钮覆盖约 4px），给出根因分析与 4 条修法，1.8.3 采纳。
- [@xutiannuo](https://github.com/xutiannuo)：报告 #2（OpenCode 渠道返回 400 MissingSessionID），给出 3 行修法，1.7.1 采纳。

### 收录

[![awesome-dsh-plugin](https://img.shields.io/badge/awesome--dsh--plugin-listed-4b6bfb.svg)](https://github.com/dsh-plugin/awesome-dsh-plugin)
[![dshplugin hub](https://img.shields.io/badge/dshplugin-hub-4b6bfb.svg)](https://dshplugin.com/plugins/dsh-prompt-rewriter)
[![deepseek harness plugins](https://img.shields.io/badge/deepseek--harness--plugins-listed-4b6bfb.svg)](https://deepseekharnessplugins.com/plugins/dsh-prompt-rewriter)

---

## 许可

代码采用 MIT，详见 [LICENSE](LICENSE)。内嵌素材分三类：

| 素材 | 许可 | 是否在 MIT 范围内 |
|---|---|---|
| 插件代码 | MIT | 是 |
| 鲸鱼尾巴 36 帧轮廓（来自 `dsh-status-rotator` v0.38.0，作者 01Virex） | **MIT**（已核上游） | 是，保留版权声明 |
| DeepSeek「大肥鱼」品牌标识（来自 `dsh-web-frontend`） | 未找到许可 | **否，不在 MIT 范围内** |

NOTICE 里的第三方声明需随分发保留，详见 [NOTICE.md](NOTICE.md)。
