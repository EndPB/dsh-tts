# dsh-tts — DSH 的语音合成供应商、语音按钮与进度条

仿照 DSH 模型供应商的结构实现的 TTS 插件：**CosyVoice（阿里云百炼，双向流式）** 与 **Edge TTS** 是两个一等供应商，语音、音色、凭据、默认项、缓存与确认阈值都在 **设置 → 语音合成** 中管理。

- **工具**：`tts_speak` 合成语音，聊天中出现语音卡片。默认**异步**：调用立即返回，CosyVoice 在后台流式合成，模型可以继续思考和回复。
- **播放只由点击触发**：工具卡和助手回复操作行都提供「语音 / 暂停 / 继续」，不会自动播放。优先朗读**模型调用 `tts_speak` 时生成的文本**（从 Session 日志读取），没有时才用展示的回复。已有语音时点击暂停，再点从当前位置继续；播放结束后点击重新开始。
- **长度确认**：没有 `tts_speak` 调用时，回复不超过阈值（默认 100 字）直接合成，超过则弹窗确认；阈值可改，0 表示总是确认。
- **自动朗读**：`always` 时每轮新回复自动朗读（同样优先工具文本；过长且无工具文本则跳过）；`tagged` 时由模型按需调用工具。默认 `tagged`，因此不会自动播放。
- **流式合成**：CosyVoice 走 DashScope 的 `run-task / continue-task / finish-task` 双向 WebSocket。异步工具卡直接引用 `/stream/<id>`，后台边合成边缓存；用户点击「语音」时若已合成完就直接播放缓存，否则复用同一个后台任务。
- **生成模式**：设置里可在「异步（立即返回，后台合成）」和「阻塞（等完整音频）」之间切换；默认异步。
- **进度条**：回复下方（`turnTail`，与「本回合记忆 写入 N」同区）显示两行——上排是随语音逐字移动、两侧淡入淡出的文本，下排是当前时间 / 总时间进度条；没有语音时不渲染。
- **缓存**：完整合成结果按「文本 + 全部合成参数」内容寻址持久化；重启不清理，默认不限容量，可设置条数/容量或手动清理；清音频不影响模型调用文本。
- **设置页**：供应商卡片、音色建议、参数、API Key（DSH 凭据存储）、试听、检测、默认供应商、自动朗读、确认阈值、缓存占用与清理。

## 数据流

```
tts_speak ──> Host 异步任务：立即返回 /_dsh/dsh-tts/stream/<id>
                 ├─ 后台 CosyVoice 双向流式合成，边合成边写语音缓存
                 └─ 同一个文本的「语音」点击复用该任务，不重复合成

「语音」/ 自动朗读 ──> RPC speech(sessionId, messageId|beforeSeq)
                        ├─ 从 Session 日志找该回合最后一个 tts_speak 的 arguments.text
                        ├─ 没有则用最终回复；超过阈值且未确认 → needsConfirm
                        └─ 命中缓存 → 立即 /audio/<id>（按钮显示「读取中」）
                            未命中 → prepare(stream:false) 完整合成 → /audio/<id>
                                     若同一文本的后台任务在跑，则等待它而不是再合成

播放 ──> 只有点击「语音」才创建/恢复共享 <audio>；没有 autoplay
进度条 ──> audio.currentTime + speech.timings + speech.duration
           上排：当前词居中，左右渐变淡出；下排：mm:ss / mm:ss 与填充
```

## 设置 → 语音合成

页面分为全局设置、缓存、两个供应商卡片和底部保存栏：

- **默认供应商**：`CosyVoice` / `Edge TTS`，只列出已启用项。
- **语音生成方式**：`异步（立即返回，后台合成）` 或 `阻塞（等完整音频）`；默认异步。
- **自动朗读**：`关闭` / `模型需要时（tagged）` / `每条回复（always）`。
- **系统提示**：是否把语音输出约定注入系统提示。
- **单次最大字符数**：控制单次朗读上限。
- **确认阈值**：没有工具文本时，超过多少字先弹窗；默认 100，0 = 总是确认。
- **语音缓存**：开关、最大条目数、最大容量 MB、当前占用、清理按钮。0 表示不限；清理只删音频。
- **试听文本**：每个供应商卡片底部的「试听」用它，留空则用内置示例。

### CosyVoice 卡片

| 字段 | 说明 |
| --- | --- |
| 启用 | 关闭后默认供应商会切到另一个已启用项 |
| 模型 | `cosyvoice-v3.5-plus` / `v3.5-flash` / `v3-plus` / `v3-flash` / `v2` |
| 音色 | 建议列表 + 任意克隆/定制音色 id（你的 `cosyvoice-v3.5-plus-vd-...` 就是定制音色） |
| 情感 / 风格 | 传给 `instruction`，例如「用开心的语气，语速稍快」 |
| 语速 / 音调 / 音量 | `0.5–2.0` / `0.5–2.0` / `0–100` |
| 语言提示 | 传给 `language_hints`，减少数字/符号读音问题 |
| 渐进播放 | 后台异步合成与试听是否使用双向流；关闭后等完整文件 |
| API Key | 只显示「已配置 / 未配置」；输入新值后写入 DSH 凭据存储 |
| 高级 | 凭据引用名、WebSocket 地址、格式、采样率、MP3 码率 |

### Edge TTS 卡片

| 字段 | 说明 |
| --- | --- |
| 启用 | 同上 |
| 音色 | 从 `edge-tts --list-voices` 拉取（300+），可直接输入 |
| 语速 / 音调 / 音量 | Edge 语法：`+10%`、`+0Hz`、`+0%` |
| 高级 | Python 命令 |

「检测」会实际运行 `python -m edge_tts --version` 并显示结果。

## 语音文本来源与确认

Host 的 `speech` / `prepare(source=message|turn)` 不再直接用展示文本，而是：

1. 在 Session 日志中找到这条助手消息所在的回合；
2. 取该回合中**最后一个** `tts_speak` 的 `tool/call.arguments.text`，并沿用它的 `voice` / `instruction` / `provider` 覆盖；
3. 没有工具调用时才退回消息正文；
4. 正文超过 `speech.confirmThreshold` 且调用方未确认 → 返回 `needsConfirm`，客户端弹窗；工具文本永不弹窗。确认框通过 `createPortal` 挂到 `document.body`，完整朗读文本放在可滚动区域，不再只显示 160 字预览。

工具调用的文本在 Session 日志里，是**持久的事实来源**，不归音频缓存管理。因此清理语音缓存后，再次点击「语音」仍会用同一段模型调用文本重新合成。

## 进度条

`conversation.chat.turnTail` 的 `dsh-tts/now-playing` 组件只在该回合有语音时渲染：

- 上排：把实际朗读文本逐字排成一条轨道，按 CosyVoice 的 `sentence.words` 时间轴取当前词，`translateX` 把它移到中间；两侧各有一个实测半宽的占位，保证 0 秒和结尾也能居中，容器用渐变 mask 让两侧淡出。
- 下排：`mm:ss / mm:ss` 和一条填充进度条；当前时间按总时长钳制。
- 总时长由 Host 的 MP3 帧解析器（`lib/mp3-duration.js`）计算，而不是依赖浏览器的 `audio.duration`——后者对流式/分块 MP3 可能一直是 Infinity，之前才会出现先 9 秒、后跳 15 秒。缓存音频也会重新解析真实时长。
- CosyVoice 在 `run-task.parameters` 里显式传 `word_timestamp_enabled: true`；服务端在 `sentence.words` 返回 `begin_time/end_time`（毫秒）与 `begin_index/end_index`。若时间轴缺开头（首个 word 的 `begin_index > 0`），客户端按首个词的时间补 lead；若只返回第一句，则把剩余文本按剩余音频时间补到结尾。
- 上下两条都可操作：下侧时间条点击/拖动直接定位，并支持左右键 5 秒、Shift+左右 15 秒、Home/End；上侧文本条左右拖动按相对时间 scrub。暂停时拖动只改位置，继续后从新位置播放。
- Edge 没有词级时间轴：用音频实际时长做时间条，文本按比例估算。

## 语音缓存

- 位置：`%DSH_HOME%/tts/cache`（`settings.cache.dir`，默认如此）。
- 键：`sha256(provider + model + voice + rate + pitch + volume + instruction + format + sampleRate + bitRate + 文本)` 的前 40 位十六进制。
- 每次完整合成写入 `<key>.mp3` + `<key>.json`（元数据含文本、词时间轴、时长、provider/voice）。`tts_speak`、手动「语音」、自动朗读、试听共用同一缓存。
- **重启不清理**：启动时只 `ensure` 目录，不扫描、不删除。只有显式「清理语音缓存」或用户设置的 `maxEntries` / `maxSizeMB` 超限才删除；两个上限默认 0 = 不限。
- 清理删除音频和元数据，不删除 Session 里的 `tts_speak` 文本；再次播放会重新合成同一段话。

## 供应商实现

### CosyVoice（DashScope 双向流式）

- 端点：`wss://dashscope.aliyuncs.com/api-ws/v1/inference`（可在高级里改成 workspace 域名）。
- 鉴权：`Authorization: Bearer <DASHSCOPE_API_KEY>`。
- 协议：连接后发 `run-task`（`streaming: "duplex"`，参数含 `model / voice / format / sample_rate / volume / rate / pitch / bit_rate / instruction / language_hints / word_timestamp_enabled`），收到 `task-started` 后按句发多个 `continue-task`，再发 `finish-task`。
- 服务端 `result-generated`（`sentence-begin/synthesis/end`）之后紧跟一个二进制音频帧；`task-finished` 结束。插件按到达顺序把二进制帧交给流式播放，并把逐步增长的 `sentence.words` 作为词时间轴。
- 取消：`finish-task` 带 `directive: "cancel"`，随后关闭连接。

### Edge TTS

通过本机 `edge-tts` CLI 调用（Edge 服务要求 v2 `Sec-MS-GEC` 令牌，官方 Python 包持续维护它）：

```powershell
python -m pip install --user edge-tts
```

未安装时只有 Edge 失败，CosyVoice 不受影响。

## 配置与持久化

三层：

1. `cordis.patch.yml` 的 `dsh-tts` 行是**部署默认值**；
2. 设置页保存到 **`%DSH_HOME%/tts/settings.json`**，覆盖默认值；
3. 语音缓存独立在 `%DSH_HOME%/tts/cache`，不随 `settings.json` 重置删除。

「恢复默认」删除 `settings.json`，回到 patch 默认值；不会清空语音缓存。API Key 不在这两个文件里：

- 默认引用名 `DASHSCOPE_API_KEY`；
- 由 DSH 凭据服务保存（`%DSH_HOME%/.credentials.yaml` 的 `refs`），或回退到环境变量；
- 设置页只显示 `configured / source / writable`，从不回传密钥值；
- 供应商每次请求时重新解析，换 key 不需要重启。

## RPC 通道与“无额外后端”

设置页、「语音」按钮、进度条轮询都走 DSH 自带的 `connection` RPC 通道，不新开端口或进程：

- Host 在 `ctx.inject(['connection', 'webServer'], ...)` 的子上下文上调用 `connection.rpc.handle('/dsh-tts', handler)`；`connection.rpc.handle` 会用**读取该服务的上下文**去 `webServer.register` 路由，只注入 `connection` 会导致路由没挂上，客户端收到 405。
- 路由、音频和流都注册在 DSH 现有的 `webServer` 上；设置存 `%DSH_HOME%/tts/settings.json`；密钥走 `ctx.credentials`；CosyVoice 是 Host 进程发起的出站 WebSocket。
- 依赖只有 `ws`（WebSocket 客户端库）和本机 `edge-tts` CLI，没有额外服务端。

## 流式播放与异步生成

`tts_speak` 默认调用 `prepare(stream:true, background:true)`：Host 创建 `/stream/<id>` 后立刻返回，后台协程把 CosyVoice 的音频帧推给这个流并写入缓存。模型不必等音频结束；设置成 `blocking` 时才改回 `synthesize` 等完整文件。

用户点击「语音」时，Host 先查缓存；如果同一文本的后台任务还在跑，`prepare` 会复用该任务而不是再开一条 CosyVoice WebSocket。因为播放必须由点击触发，后台任务会忽略「没有监听者就取消」的超时，先完成并落缓存。

`prepare(stream:false)` 仍用于「语音」/自动朗读：先收完整文件，按 MP3 帧计算真实时长，再返回 `/_dsh/dsh-tts/audio/<id>` 播放。这样进度条从第一帧就是准确总时长，不会在合成结束处跳变；缓存命中仍即时。

## 目录结构

```
index.js                 Host：provider 注册、工具、语音解析/缓存、RPC、音频/流路由
client.js                浏览器：工具卡片、语音按钮与确认弹窗、自动朗读、进度条、设置页
lib/config.js            设置默认值、深合并、校验、供应商目录
lib/settings-store.js    settings.json 的同步加载与原子保存
lib/cache.js             内容寻址语音缓存（get/put/stats/clear/prune）
lib/mp3-duration.js      MP3 帧解析器，计算真实音频时长
lib/providers/cosyvoice.js  DashScope 双向 WebSocket 流 + 词时间轴
lib/providers/edge.js    edge-tts CLI、音色列表、状态检测
lib/providers/index.js   供应商注册表
lib/streams.js           渐进播放流中心（chunked + 完成落盘）
lib/routes.js            音频/流路由，Range 与鉴权
lib/session-text.js      从 Session 日志读取助手消息与 tts_speak 文本
lib/store.js             已发布音频的 URL 映射
lib/text.js              Markdown 清理、按句切块
cordis.patch.yml         部署默认配置（不含密钥）
test/smoke.mjs           纯函数/设置存储测试
test/host-v2.mjs         mock Cordis 端到端测试（真实合成、缓存、确认、词时间轴）
```

## 从 GitHub 安装与更新

源码仓库：<https://github.com/EndPB/dsh-tts>。

- 在 DSH 的插件安装/从仓库导入界面选择 `https://github.com/EndPB/dsh-tts`；支持 npm 安装规格的地方也可用 `github:EndPB/dsh-tts`。
- 仓库只包含源码与 `package.json`；安装时由包管理器安装唯一运行依赖 `ws`，不需要预先构建。
- 更新时重新从同一仓库安装即可；`package.json` 的 `version` 会随功能升级。

本机开发时，源码在 `E:\data\vscode\ds-tts`，安装副本在 `C:\Users\86132\Documents\dsh-tts-plugin`，profile 里是 **junction 链接**。

```powershell
robocopy E:\data\vscode\ds-tts C:\Users\86132\Documents\dsh-tts-plugin /MIR
```

- 依赖 `ws` 在包的 `node_modules/ws` 里（本地 link 安装不会替你装依赖），所以必须把 `node_modules` 一起同步。
- 同步后，在 Plugins/设置里把 `@local/dsh-tts` **关闭再启用**（入口 id `include:dsh-tts`）即可热重载 Host 与客户端 bundle。若页面没出现新入口，再刷新页面或重启桌面端。
- 只有 `package.json` 的依赖/版本或 `dsh` 字段变化时，才需要 `remove_bundle` + `install_bundle`；普通代码更新靠 junction 即可。

## DSHA / DSH 仓库导入

仓库根目录就是包根：`package.json`、`cordis.patch.yml`、Host 入口 `index.js`、客户端 bundle `client.js`、`lib/`、`locale/` 与 `icon.svg` 都在同一层。DSH/DSHA 从 GitHub 安装时会按 `package.json` 安装 `ws`，不需要本地 zip 或预构建。

- **兼容范围**：清单声明 `engines.dsh: ">=0.2.0-rc.2 <0.3.0-0"`，覆盖 DSHA 使用的 **0.2.0-rc.2** 与 0.2.1-rc.2。
- **安装**：仓库地址 `https://github.com/EndPB/dsh-tts`，或 npm 规格 `github:EndPB/dsh-tts`。
- **升级**：重新从同一仓库安装；设置和语音缓存保留。

## 测试

```powershell
$env:DASHSCOPE_API_KEY='...'; $env:COSYVOICE_VOICE_ID='...'
node test/smoke.mjs       # 31 项，无网络（含生成模式、缓存重启/清理、MP3 帧时长）
node test/host-v2.mjs     # 57 项，真实 CosyVoice 异步/阻塞合成 + 缓存 + 确认 + 词时间轴 + 时长 + Edge
```

客户端组件测试（React 18 + react-test-renderer）在 `C:\Users\86132\Documents\dsh-tts-component-test\component-v2.cjs`，19 项通过。

## 已知限制

- 设置页、「语音」按钮与进度条依赖本地 connection RPC；远程配对页面目前主要保证工具卡片播放。
- 异步工具卡会立刻出现，但后台音频就绪前点击「语音」会显示「读取中」并等待；这是为了不阻塞模型思考。
- 为保证时长/进度准确，「语音」和自动朗读仍等完整文件；缓存回放即时。异步模式只改变工具调用的返回时机，不牺牲进度条总时长。
- `/stream` 用于异步工具卡；浏览器对分块 MP3 的 `duration` 不可靠，因此进度条读 Host 记录的总时长。
- 文本进度对 CosyVoice 精确；Edge 没有词时间轴，文本位置按比例估算。若服务端某次只返回第一句时间轴，尾部文本按剩余音频时间补全，词级精度会略降。
- MP3 时长由帧头计算；非 MP3 格式回退到 `audio.duration`。
- CosyVoice 的 `wav/pcm/opus` 格式不做流式播放（只有 `mp3` 走流），`pcm` 也无法被 `<audio>` 直接播放。
- Edge TTS 需要 Python 与 `edge-tts`；CosyVoice 需要有效的 DashScope key。
- 设置文件与凭据文件都在 DSH home；Agent 工具进程与用户同权限，无法用文件权限隔离密钥。