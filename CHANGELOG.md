# 更新日志

记录每个**已发布**版本对使用者可见的变化。中英双语并列，中文在前。

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
