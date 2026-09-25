# Arena Model Unlocker Enhanced

一个适用于 Chrome、Edge 和 Brave 的 Arena 模型目录扩展。它可以把已知的历史模型加入 Arena、Canary Arena 的模型搜索和选择器，重点支持 Claude Opus。安装或更新后刷新 Arena 页面，再搜索模型名称即可查看结果。

**模型出现在列表里，不等于 Arena 仍提供该模型。** 扩展只能修改浏览器看到的目录；实际生成是否成功由 Arena 服务端决定。历史记录是实验性候选项，不应当当作实时可用模型清单。

An experimental browser extension for exploring historical model entries in Arena. It can make entries visible in the selector, but it cannot restore server-side access to retired models.

## 功能

- 把历史 Opus 记录加入 Direct 模式的模型选择器。
- 处理页面首屏模型数据和后续模型目录请求；不会替换或删除 Arena 当前提供的模型。
- 可选显示页面标为不可选的记录，或加入其他历史模型。
- 弹窗显示页面是否处理过模型数据，并提供独立的刷新按钮。
- 仅作用于 `arena.ai`、`canaryarena.ai`；扩展不读取聊天内容，也不向第三方发送数据。

## 安装

1. 下载 [`dist/Arena-Model-Unlocker-Enhanced-v1.2.0.zip`](dist/Arena-Model-Unlocker-Enhanced-v1.2.0.zip) 并解压。
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启开发者模式。
3. 选择“加载已解压的扩展程序”，指向包含 `manifest.json` 的文件夹。
4. 如果装过其他修改 Arena 模型列表的扩展，先停用它们，避免脚本冲突。
5. **刷新已打开的 Arena 标签页。** 扩展不会追溯修改安装前已经加载的页面；弹窗里的“仅刷新页面”按钮可完成这一步。
6. 在 [Arena Direct](https://arena.ai/text/direct) 的模型搜索框输入 `opus`。

设置按站点保存在浏览器本地。切换开关后点击“保存并刷新 Arena”。

## 如何判断是否生效

- **搜索不到模型：** 确认扩展已启用、当前网址受支持，并刷新 Arena 页面。弹窗会提示页面是否处理了模型数据。
- **能选择但生成失败：** 选择器注入已经生效，但生成请求没有成功。可能涉及 Arena 的模型供应、验证、额度或临时故障；仅凭列表和一次报错无法判定是哪一种。扩展不能代替 Arena 恢复服务端已停用的模型。
- **弹窗显示 HTTP 错误：** 扩展只记录最近一次历史模型请求的模型名称和 HTTP 状态，不保存提示词。HTTP 200 也不等于已生成回复。
- **正常生成：** 以实际回复和 Arena 显示的模型为准；模型名称或历史 ID 本身不能证明调用成功。

开发者可运行 `npm test`。扩展源码位于 `extension/`，没有构建依赖。

## 当前验证结果

2026-09-25 的一次 Chrome 实测中，刷新页面后可搜索并选中历史 Opus；`claude-opus-4-6` 的生成请求到达 Arena 后返回 HTTP 400，`claude-opus-4-6-thinking` 也显示生成失败。同一浏览器中的公开模型 `claude-sonnet-4-6` 正常回复。这个结果证明列表可见与模型可用是两道不同的检查；它不代表所有历史 ID 在所有时间和环境下都得到相同结果。

## 历史数据

模型 UUID、名称和能力字段由 [Arena AI Proxy 的模型快照](https://github.com/taipgonesistema-cloud/arena-ai-proxy/blob/a1c1610bd1b06256f8eb157318df5f339a7d6f10/data/models-list.json) 转换而来。该快照采用 MIT 许可，完整说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。`scripts/generate_archive.py` 固定了数据源提交，可重新生成 `extension/archive.js`。本扩展代码为独立实现。
