# 版本与发布约定

> 本文件记录本项目的版本号规则与发版流程。**恢复源码时这份文件丢失过**（它不在 npm 包的 `files` 白名单里），故重建。

## 一、版本号必须是合法 semver（硬）

`1.6.3.1` 这类**四段式版本号不是合法 semver**，后果是硬的：

| 后果 | 证据 |
|---|---|
| `npm publish` 拒绝发布 | — |
| 写进 profile 的 `dependencies` 后，该 profile 里**一切**插件安装都会失败 | 实测 `ERR_PNPM_NO_MATCHING_VERSION: No matching version found for dsh-prompt-rewriter@1.6.3.1` |
| 即使 `link:` 指向本地目录，pnpm 仍校验被链接包的 manifest | 实测 `ERR_PNPM_BAD_PACKAGE_JSON: Invalid version: "1.6.3.1"` |

所以：

- **开发版**用合法预发布后缀：`X.Y.Z-dev.N`（如 `1.7.0-dev.1`、`1.7.0-dev.2`……）
- **正式版**用三段式 `X.Y.Z`（去掉 `-dev.N` 即可发布）

## 二、开发版与未发布正式版不得写成 profile 的版本号依赖

本地开发一律：

```json
"dsh-prompt-rewriter": "link:D:/DSH project/prompt-enhance-bundle"
```

只有已经发布到 npm 的正式版，才把 profile 依赖写成三段式版本号。本地打包但尚未 publish 的正式版，用 `dsh plugin --profile desktop add <tgz>` 产生的 `file:` 依赖，或经完整校验、指向独立正式目录的 `link:` 依赖；**不能写一个 npm 上还不存在的版本号**。

原因：写死一个未发布的版本号，会让 pnpm 在整个 profile 里解析失败——**连装别的插件都会报错**，且错误信息指向本项目，看起来像本项目的 bug。

## 三、递增规则

| 改动性质 | 版本位 |
|---|---|
| 只修 bug，无新增能力 | patch（`1.6.4` → `1.6.5`） |
| 新增用户可感知的能力、设置项、按钮状态 | minor（`1.6.x` → `1.7.0`，patch 归零） |
| 破坏性变更（改名配置项/命令 id、需迁移） | major（`2.0.0`），另行商定 |

## 四、正式版打包流程（本会话负责，长期固定）

**打包正式版由开发会话（本会话）完成**，不是发布会话的事。每次打包正式版按下面顺序走：

| 顺序 | 步骤 | 说明 |
|---|---|---|
| 1 | 代码定稿、把 `package.json` 的版本定为三段式 `X.Y.Z` | 去掉 `-dev.N` |
| 2 | **把该版本的更新日志写进 `CHANGELOG.md`** | 固定步骤，不可跳过，见下 |
| 3 | `npm run check` / `npm test` / `npm run pack` / `npm run gate:local` | 全绿才算打好 |
| 4 | **把同一个 `dist/dsh-prompt-rewriter-X.Y.Z.tgz` 安装到 desktop profile** | 只改工作区或只保留旧 `link:` 不算完成 |
| 5 | 校验本机安装并确认插件运行 | 见下面的验收清单 |

发布会话（另一个会话）**不打包、不负责装本机**：它只负责推代码 / 打 tag / 建 GitHub Release / `npm publish`（需用户授权）。

### 正式版本机安装与验收

- 优先在 DSH 完全退出后执行 `dsh plugin --profile desktop add <正式 tgz>`；运行中的插件目录有 Windows 文件锁，遇到 `EPERM` 不要反复重跑 pnpm，先核实 profile 与其它直接依赖是否完整，再等待重启释放锁。
- 安装源必须是刚打出的正式 tgz，不得用工作区源码代替正式包验收。
- 安装后逐文件比较实际插件目录与 tgz：文件数、相对路径、内容哈希都一致；`package.json` 版本与 `CHANGELOG.md` 最新版本都等于 `X.Y.Z`。
- 跑 `npm run gate:local`、`dsh plugin --profile desktop list dsh-prompt-rewriter --depth=0`，并确认运行时 `dsh-prompt-rewriter` 为 `active`。
- 若安装命令中断了其它插件，必须先把它们恢复到原版本并验证，再交付。

### 更新日志怎么写法

- 写在随包发布的 `CHANGELOG.md`，**新增 `## X.Y.Z` 段并放在最前**；只写 `**中文**` 段，不写英文。
- 条目文风与 GitHub Release 一致：`- **加粗小标题**：此前……；现在……`，每条讲清问题与变化。
- 内容只写使用者可见的变化，不写内部重构、测试、CI 之类。
- 门禁会自动兜底：`CHANGELOG.md` 最新 `## x.y.z` 必须等于 `package.json` 的 `version`，**忘了写日志就打包会直接失败**。
- 插件设置页的「更新日志」面板读的就是这个文件，只显示中文、默认展开最新版，所以日志版本与版本号天然一致。

### 与其它发布物的关系

插件内 `CHANGELOG.md` 的中文是**唯一依据**。发布会话在 GitHub Release / npm 写双语正文时，中文须照抄此文件，英文按此翻译，不得另写一套中文。

### 功能拆分与排除（长期规则）

某功能「本次不做」时，按用户确认拆成**独立模块**存到 `D:\DSH project\<模块名>\`，不随 npm 包发布、不装进 profile；主包只保留该功能不影响的条款。规则：

- 拆出的内容自包含：规则原文、测试断言、离线报告脚本、评估 fixture，能用 `npm test` / `npm run shape` 独立跑通。
- 主包必须同步撤掉对应断言与日志条目，并新增**回归测试**证明拆出的条款没有回流。
- 拆出后仍属同一版本号的重新打包：**tgz 哈希会变**，本机安装目录、profile `link:` 与 `pnpm-lock.yaml` importer 都要一起替换，旧正式目录归档到 `_audit/refs/install-backups/` 保留可回退。
- 已装版本仍是同一版本号时，用新目录名（如 `…-1.7.0-r2`）解包后切换 junction，不要在 DSH 运行时原地覆盖被加载的文件；PowerShell 处理含中文的路径会乱码， junction 与 profile 读写统一用 Node。

2026-11-05 实例：「意图优先提示词改写规则」（45 条）拆到 `prompt-rewrite-rules/`；1.7.0 回到 1.6.3 的 13 条规则，但**保留** Fidelity / Attached files 两条附件安全条款（它们属于路径修复，不属于规则重写）。1.7.0 日志因此从 4 条变 3 条。

## 五、发布前检查

```bash
npm run check   # 语法
npm test        # 四套测试
npm run gate    # 产物门禁（含 semver、profile 依赖、日志版本一致性校验）
```

门禁里与本文件相关的防线：

- `version is valid semver` —— 始终检查
- `profile uses a link or a released version` —— `--local` 时检查
- `CHANGELOG.md newest version matches manifest` —— 正式版打包时检查，dev 版跳过

## 六、不变量（不得改动）

- `package.json` 的 `name`
- `cordis.patch.yml` 的 `id` / `name`
- profile 的 `dsh.profile.bundles` 条目
- 螺旋鱼尾动效（8 段指纹逐字节一致）