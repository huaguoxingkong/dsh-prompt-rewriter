# 参与贡献

## 报告问题

用仓库的 issue 模板，附上：插件版本（设置页右上角）、DSH 版本、复现步骤、预期与实际、控制台输出。能定位到文件与行号更好。

## 提交代码

1. Fork 后从 `main` 拉分支，一个 PR 只做一件事。
2. 提交前本地跑：

   ```sh
   node scripts/gate.mjs
   node tests/test-units.mjs
   node tests/test-settings.mjs
   node tests/test-host.mjs
   node tests/test-client.mjs
   ```

3. 提交信息用 `type(scope): summary` 前缀（`feat` / `fix` / `docs` / `test` / `chore`）。
4. 不改 `package.json` 的 `version`；版本号由维护者指定。

## 致谢规则

问题报告和修法建议同样算贡献。按贡献类型记录：

| 你的贡献 | 记录位置 | 格式 |
|---|---|---|
| 提交的 PR 被合并 | commit 作者 + CHANGELOG 条目尾 | `（#123 by @you）` |
| 只报 issue，但给出了复现、根因与具体修法，维护者照此修改 | CHANGELOG 该版本条目尾 | `（感谢 @you 报告并给出修复方向）` |
| 只报 issue 报告现象 | CHANGELOG 条目尾 | `（#123）` |
| 多次贡献（代码、文档、测试、设计） | [AUTHORS](AUTHORS) 或 `CONTRIBUTORS.md` | 按贡献类型列出 |

`Co-authored-by:` 只用于共同编写同一个 commit 的人（需要对方的 GitHub 邮箱）；它会计入 GitHub 贡献统计，不用于只提建议的人。

## 许可

提交即表示同意以 MIT 许可发布你的贡献。
