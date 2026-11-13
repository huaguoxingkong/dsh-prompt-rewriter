# 安全策略

## 报告方式

请**不要**用公开 issue 报告安全问题。用 GitHub 的私密报告通道：

<https://github.com/huaguoxingkong/dsh-prompt-rewriter/security/advisories/new>

## 属于范围的问题

本插件在本地改写输入框里的文字，并把输入框内容发给当前会话所选的模型。以下算安全问题：

- 改写结果写入输入框时越界，覆盖附件、链接或同槽位其它控件的内容
- 把本机路径、剪贴板或会话历史中不该出现的内容带进改写结果
- 与其它插件共用 `conversation.input.*` 槽位时越权读取或写入其它控件

## 响应

个人项目，尽力在 7 天内确认收到。修复走正常发版流程，并在 Release 说明中注明。
