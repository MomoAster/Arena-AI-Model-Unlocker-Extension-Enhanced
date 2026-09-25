# Arena Model Unlocker Enhanced

面向 Chrome、Edge、Brave 的 Manifest V3 扩展，尝试让 Arena 与 Canary Arena 的历史模型记录重新出现在本地选择器中。当前重点是 Claude Opus。

## 当前能力

- 在页面启动时修改 React Flight 的 `initialModels`，补入已知的历史 Opus 记录。
- 补全 `/nextjs-api/model-catalog` 返回的模型目录，覆盖首屏没有模型数据的情形。
- 可选地放开当前目录中的 `userSelectable: false` 标记，或加入其他历史模型。
- 限定在 `arena.ai` 和 `canaryarena.ai`，不读取聊天内容，不向第三方发送数据。

**边界：** 扩展修改的是浏览器中的模型目录和选择器。Arena 的服务端仍决定某个历史 ID 是否接受请求。模型出现在列表里不代表它能生成回复；已从服务端撤下的模型不能靠扩展恢复。历史记录可能过期，界面改版也可能使注入失效。

2026-09-25 核查时，当前账号页面和公开的 `/nextjs-api/model-catalog` 都没有 Opus 记录。公开目录共有 301 个唯一模型，全部标为可选。这也是只把 `userSelectable` 从 `false` 改为 `true` 的旧扩展如今不起作用的原因。

## 安装

1. 从仓库下载 `dist/Arena-Model-Unlocker-Enhanced-v1.0.0.zip` 并解压。
2. 打开 `chrome://extensions`（Edge 用 `edge://extensions`），开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择解压后**包含 `manifest.json` 的文件夹**。
4. 关闭或停用功能相近的旧扩展，避免两份脚本同时修改同一页面。
5. 打开或刷新 [Arena](https://arena.ai/text/direct)，点击扩展图标。默认启用历史 Opus；其他历史模型需手动开启。

设置分别保存在两个站点的浏览器本地存储里。修改设置后，点击“保存并刷新 Arena”。

## 验证

打开 Arena 的 Direct 模式，在模型搜索框输入 `opus`。若出现历史 Opus，说明本地选择器注入生效；要验证实际调用，还需发送一次普通提示并检查是否得到模型回复。出现模型但请求报错，说明服务端没有接受该模型，扩展无法把它变成可用。

开发者可运行 `npm test`。扩展源码在 `extension/`，无构建依赖。

## 数据来源与归属

历史模型 UUID、名称和能力字段由 [Arena AI Proxy 的模型快照](https://github.com/taipgonesistema-cloud/arena-ai-proxy/blob/a1c1610bd1b06256f8eb157318df5f339a7d6f10/data/models-list.json) 转换而来，原始数据采用 MIT 许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。`scripts/generate_archive.py` 固定了源提交，可重新生成 `extension/archive.js`。

这个项目是独立重写。功能构想参考了 [RAKE 的 Arena Model Unlocker](https://github.com/theraker526/Arena-AI-Model-Unlocker-Extension)，没有复制其未授权的代码或图标。
