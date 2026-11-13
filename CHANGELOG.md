# 更新日志

记录每个**已发布**版本对使用者可见的变化。插件内只维护中文条目；对外发布（GitHub Release / npm）的双语正文由发布方据此撰写，其中中文以本文件为准。

## 1.8.1

**中文**

- **设置页截图更新到 1.8.0 的界面**：原来的两张图还是 1.7.1 的样子，看不到三套增强规则、参考附件开关，也看不到顶部的 Star 与 issue 入口。现在中英文各一张，按 1.8.0 实际渲染的设置页重出（2 倍图，1624×1560）。

## 1.8.0

**中文**

- **增强规则可选**：设置页新增三套规则。**旧版**逐字沿用 1.7.1 发布的规则原文，手感与老版本一致；**意图优先**先推断你真正想干什么，再把话写明白、写全；**WorkBuddy** 逐字沿用 WorkBuddy 随包发布的原始提示词。三套都只调用一次模型，区别只在改写力度；每套的定位与取舍在设置页里可直接对照。
- **输入框里的附件会被读取**：增强时可参考当前输入框中最多 2 个非图片附件（每个不超过 5 MiB；文本类发送 6000 字符预览），关闭开关后只读文件名、不读内容。图片参考的开关与行为不变。
- **改写不再反问你**：模型若在改写旁边夹了问句，问句会被就地删掉、改写保留；若整条回复只有问句，会用旧版规则再跑一次；仍不行就保留原草稿——问句不会出现在结果里。
- **修复：发送消息时点增强不再失败**：此前在改写进行中按了发送，输入框处于冻结态会拒绝写入，改写被丢弃并提示「输入框没有接受替换，草稿保持不变」；现在会等到输入框空闲后自动写入，并照常提供「回退」。
- **修复：增强按钮被同槽位的第三方控件覆盖约 4px**（#4）：去掉了「右邻一定是宿主自己的模型触发器」这一负边距假设，改用不参与布局的 7px 视觉偏移。
- **设置页顶部改为反馈入口**：原来那句「只影响增强提示词按钮」的说明换成「遇到问题？到 GitHub 提 issue ↗」，点开直接进本项目的 issue 列表；版本号仍在同一行右侧。
- **设置页顶部新增 Star 入口**：第一行改为「点个 Star ⭐ · 遇到问题？提 issue ↗」，整行沿用次要色与 13px 字号，只有行尾的 ⭐ 自带颜色；版本号仍在右侧，不新增设置项。
- **文档：两半的加载方式写明**——只改客户端（按钮、交互、提示文案）由 Harness 的 client HMR 自动替换，不必重启；宿主侧（增强接口与提示词规则）改动仍需重启一次。

## 1.7.1

**中文**

- **OpenCode 渠道的增强请求不再返回 400**：此前请求没有把会话号透传给模型层，OpenCode 目标缺少 `x-opencode-session` 路由头，接口直接返回 `400 MissingSessionID`；现在会话号随请求一起下发，其余渠道的行为不变。（感谢 @xutiannuo 报告并给出修复方向）
## 1.7.0

**中文**

- **上传文件或链接后改写结果不再被拒绝**：此前输入框里带有附件或链接时，经常出现「输入框没有接受替换，草稿保持不变」；现在按编辑器的实际坐标写入，改写正常落进输入框，附件引用也原样保留。
- **增强结果不再出现附件的完整磁盘路径**：此前改写的提示词里会复制出 `@D:\...` 之类的地址；现在只保留可读的文件名，撤销操作也只恢复用户自己输入的文字。
- **设置页新增更新日志**：按版本折叠展示各已发布版本的变化，默认展开最新版本，逐条列出；内容取自随包发布的本文件，与当前版本号保持一致。

## 1.6.3

**中文**

- 快捷键服务不可用时插件不再整体失效。此前宿主的快捷键服务若没有注册（例如与另一个锁定旧版客户端的插件共存），整个插件会保持休眠，输入框旁的按钮也随之消失；现在只有快捷键降级为不可用，改写按钮照常工作。
- 快捷键服务晚于插件注册时也能读到当前绑定，不再把它显示成「未设置」或「不可用」。

**English**

- The plugin no longer goes dormant when the host's shortcut service is missing. Previously, if that service never registered — for example when another plugin pinned the client runtime to an older range — the whole plugin stayed inactive and the composer button disappeared with it. Only the shortcut degrades now; the Enhance button keeps working.
- A shortcut service that registers after the plugin now resolves correctly, instead of being reported as unset or unavailable.
## 1.6.2

**中文**

- 增强进行中的鱼尾动效改用品牌蓝。此前它跟随按钮的文字色，深色主题下接近白色，与旁边的鱼形图标不同色。
- 输入框里的图片读取更可靠：宿主服务取不到时改从输入框自身的通道取图；两处都无法回答时不再静默跳过，文字改写照常完成，状态区会告诉你少读了几张。

**English**

- The tail animation shown while an enhancement runs now uses the brand blue. It previously followed the button's text colour, which is near white in the dark theme and did not match the fish icon beside it.
- Composer images are read more reliably: when the host service cannot answer, the composer's own channel is used instead; when neither can, the images are no longer skipped silently — the text-only rewrite still completes and the status area reports how many were missed.
## 1.6.0

**中文**

- 新增键盘快捷键，可一键增强、运行中再按一次暂停；默认关闭，可在设置里打开、录制自定义键位或一键恢复默认。
- 录入的键位若已被其它命令占用，会指出冲突的命令名且不生效，原有键位保持不变。

**English**

- Added a keyboard shortcut: press once to enhance, again to pause. Off by default; enable it in settings, record your own combination, or reset to the default.
- A combination already taken by another command is reported with that command's name and is not applied; your previous binding stays.

## 1.5.1

**中文**

- 修正版本号链接指向的项目地址。

**English**

- Corrected the project address the version number links to.

## 1.5.0

**中文**

- 设置页显示当前版本号，点击可打开项目主页。
- 「参考之前的对话」旁补充说明，解释输入框上蓝点的含义。

**English**

- The settings page shows the current version; clicking it opens the project page.
- The reference-context row now explains the blue dot on the composer icon.

## 1.4.1

**中文**

- 输入框为空时不再显示增强按钮。

**English**

- The Enhance button no longer appears while the composer is empty.

## 1.2.1

**中文**

- 长草稿、含链接的草稿不再因输出预算不足而失败：模型触顶时会自动扩大预算重试。

**English**

- Long drafts and drafts containing links no longer fail on a small output budget: a truncated run is retried with a larger one.

## 1.2.0

**中文**

- 改写速度提升约 3 倍。
- 改写结果更贴近真实意图：把该由你决定的选择留开，上下文模式下的结果可独立成立。

**English**

- Rewriting is about 3× faster.
- Results follow intent more closely: choices that belong to you stay open, and a context-aware result stands on its own.

## 1.1.0

**中文**

- 切换会话不再中断进行中的增强：离开会话只是解除界面关注，请求继续跑完，回来时结果自动写入。

**English**

- Switching sessions no longer cancels a running enhancement: leaving the conversation only detaches the UI, and the result is applied when you return.

## 1.0.3

**中文**

- 补全中英双语 README 与截图，修复 npm 包内缺失的图片与中文说明。

**English**

- Added the bilingual README and screenshots; fixed images and the Chinese guide missing from the npm package.