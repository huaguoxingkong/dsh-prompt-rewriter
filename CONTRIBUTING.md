# 参与贡献

## 行为准则

参与本项目（issue、讨论、PR、评审）即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)；违规由维护者按该文档的执行指南处理。

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
| 报告问题，并给出可复现的根因与可采纳的修法 | README 致谢条目 + CHANGELOG 该版本条目尾 | `（感谢 @you 报告并给出修复方向）` |
| 只报告现象，未给出定位与修法 | CHANGELOG 条目尾 | `（#123）` |
| 合并的代码、文档、测试、设计 | [AUTHORS](AUTHORS) + CHANGELOG 条目尾 | 按贡献类型列出 |

收录标准：

- [AUTHORS](AUTHORS)：作者与维护者，以及被合并的代码、文档、测试或设计贡献；按首次合并收录，长期有效。
- README 致谢：报告问题并给出可复现根因与可采纳修法的人，每条写明采纳的版本与结果。
- 只提问、只报告现象、未给出定位与修法的，不列入长期名单，只按 CHANGELOG 条目尾的 `（#123）` 记录。
- 仓库没有 `CONTRIBUTORS.md`，也不另建：贡献者只出现在 AUTHORS 与 README 致谢两处。

`Co-authored-by:` 只用于共同编写同一个 commit 的人（需要对方的 GitHub 邮箱）；它会计入 GitHub 贡献统计，不用于只提建议的人。

## 更新日志写法

`CHANGELOG.md` 面向用户，按用户可感知的粒度写：

- 一个功能一条、一个 bug 一条；目标 4–5 条，上限 6 条（中英分别计数）。
- 不写内部实现：弹层、常量、字段名、行号等用户感知不到的细节，并进对应功能条或省略。
- 按 新增 / 变更 / 修复 分组；中英逐条对应，条数一致。
- 面板按纯文本渲染，条目里不要出现 `**` 和反引号。
- `node scripts/gate.mjs` 会检查：任一版本段的中英条目数各超过 6 条即失败，并输出实际条数。

## 许可

提交即表示同意以 MIT 许可发布你的贡献。
