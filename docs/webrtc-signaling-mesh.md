# WebRTC 学习：WebSocket 信令服务器 + 多人 Mesh 通话（可实施方案）

更新时间：2026-02-07

## 目标与范围

- **目标**：在现有项目中新增 `server/` 信令服务器（原生 WebSocket），并在 `app/` 中新增一个**完全独立**的新页面，实现“通过服务器信令的多人 Mesh（网状 P2P）音视频通话”。
- **范围**：
  - 信令服务器：房间管理、成员列表、消息广播、补齐 `from` 字段、基本校验与断线清理。
  - 前端新页面：WebSocket 连接/入房、获取本地媒体、为每个远端 `peerId` 维护一个 `RTCPeerConnection`，按 `from` 归类处理 `offer/answer/ice/hangup`，网格展示远端视频。
- **非目标（后续扩展）**：SFU/媒体转发、TURN 部署、完善鉴权与生产级监控。

## 总体架构

- **信令**：Browser ↔ (WebSocket) ↔ Signaling Server
- **媒体**：Browser ↔ (WebRTC P2P, Mesh) ↔ Browser（服务器不参与媒体）
- **多人 Mesh**：房间 N 人时，每个客户端会与其他每个客户端建立一条 `RTCPeerConnection`（连接数约 \(N-1\)）。

## 为什么不在信令服务器里“做 SDP 解析/改写”

- 信令服务器的职责是**转发**与**房间管理**；对 SDP/ICE 来说，最稳定的做法是**不透明透传**。
- “解析”可以用于**只读观测**（例如长度、包含哪些媒体 m-line），但不建议在第一版做任何改写，否则容易引入兼容性问题。

## 信令协议（可实施版）

### 客户端 → 服务端（JSON）

- **join**
  - `{ action: "join", roomId: string, name?: string }`
- **leave**
  - `{ action: "leave", roomId: string }`
- **signal**
  - `{ action: "signal", roomId: string, type: "offer"|"answer"|"ice-candidate"|"hangup", data: any }`
  - 说明：第一版默认广播；可预留 `to?: string` 以便未来定向转发（本版不强制用）。

### 服务端 → 客户端（JSON）

- **joined**
  - `{ action: "joined", roomId: string, clientId: string, peers: Array<{clientId:string, name?:string}> }`
- **peer-joined**
  - `{ action: "peer-joined", roomId: string, peer: {clientId:string, name?:string} }`
- **peer-left**
  - `{ action: "peer-left", roomId: string, clientId: string }`
- **signal**
  - `{ action: "signal", roomId: string, from: string, type: "...", data: any }`

### 转发规则（本方案关键点）

- 服务端收到 `signal`：
  - 校验 `roomId/type` 与消息大小；
  - **广播给同房间除发送者外所有连接**；
  - 发送给接收方的消息由服务端补齐 `from = senderClientId`。

## 关键协商策略：老用户向新用户发 Offer（避免 glare）

采用“**老用户向新用户发 offer**”策略（工程上简单且稳定）：

- 当某客户端收到 `peer-joined(newPeerId)`：
  - 将自己视为“老用户”，对 `newPeerId` 建立连接并发起 `offer`。
- 新加入用户：
  - 不主动向已有用户发 `offer`；
  - 只在收到来自各老用户的 `offer` 后逐一 `answer`。

> 说明：本方案仍然使用广播信令；客户端依靠 `from` 将每条信令路由到对应的 `RTCPeerConnection`。

## 服务器端实现方案（`server/`）

### 技术栈与依赖

- Node.js（ESM）
- `ws`

### 目录结构建议

- `server/package.json`
- `server/src/index.js`（主入口）
- `server/README.md`（启动方式与协议说明）

### 数据结构

- `rooms: Map<roomId, Set<ws>>`
- `clients: Map<clientId, ws>`
- `ws.clientId / ws.roomId / ws.name`（挂在连接对象上即可）

### 关键行为

- **分配 clientId**：连接建立时生成短 id（例如 8~12 位随机 base36）。
- **join**
  - 将 ws 加入 room；
  - 回 `joined`（包含 peers 列表：房间内除自己外所有人）；
  - 向房间其他人广播 `peer-joined`。
- **leave/close**
  - 从 room 移除；
  - 广播 `peer-left`；
  - 清理空房间。
- **消息校验**
  - `JSON.parse` 失败：忽略或断开（实现时二选一）；
  - `roomId` 必须是短字符串（例如 1~64）；
  - 单条消息限制（建议 256KB）。

### 本地启动方式（示例）

- 监听 `ws://localhost:8787`（端口可用 `PORT` 环境变量覆盖）。

## 前端新页面实现方案（`app/`）

### 新增路由与页面

- 新增路由：例如 `/pc-server`
- 新增页面：例如 `app/src/views/PeerConnectionServerView.vue`
- 要求：页面**完全独立**，不引用现有 `PeerConnection/` 下的 composables。

### UI/状态（最小可用）

- 输入：`serverUrl`（默认 `ws://localhost:8787`）、`roomId`（默认 `demo`）、`name`（可选）
- 按钮：连接/断开、开启本地媒体、挂断全部（清理所有 peer 连接）
- 展示：本地视频（muted）、远端视频网格（按 peerId）、日志区

### 核心数据结构（按 `from` 归类）

- `ws: WebSocket | null`
- `clientId: string | null`
- `peers: Map<peerId, {name?:string, joinedAt:number}>`
- `localStream: MediaStream | null`
- `pcs: Map<peerId, RTCPeerConnection>`
- `remoteStreams: Map<peerId, MediaStream>`
- `pendingIce: Map<peerId, RTCIceCandidateInit[]>`

### RTCPeerConnection 配置与事件

- `iceServers`：学习阶段先用公开 STUN 即可
- 每个 `pc`：
  - `onicecandidate`：将 candidate 作为 `ice-candidate` 发出去
  - `ontrack`：将 track 放入该 peer 的 `MediaStream`，绑定到对应 `<video>`
  - `onconnectionstatechange / oniceconnectionstatechange`：记录日志

### 信令处理流程（按 peerId = from）

- 收到 `peer-joined(newPeerId)`：
  - 若 `localStream` 已就绪：创建该 peer 的 pc，addTrack，`createOffer -> setLocalDescription -> send offer`
  - 若本地媒体尚未就绪：只记录 peer，等媒体 ready 后再对所有未连接 peer 发起 offer
- 收到 `signal(from, offer)`：
  - `ensurePc(from)`（不存在就创建并 addTrack）
  - `setRemoteDescription(offer)`
  - flush `pendingIce[from]`
  - `createAnswer -> setLocalDescription -> send answer`
- 收到 `signal(from, answer)`：
  - 找到 pc：`setRemoteDescription(answer)`
  - flush `pendingIce[from]`
- 收到 `signal(from, ice-candidate)`：
  - 若 `pc 不存在` 或 `pc.remoteDescription` 为空：`pendingIce[from].push(candidate)`
  - 否则 `addIceCandidate`
- 收到 `peer-left(peerId)` 或 `hangup`：
  - 关闭并清理该 peer 的 pc、remote stream、UI

### 生命周期与清理

- 页面卸载：关闭 ws、停止本地 tracks、关闭所有 pcs、清空 map
- WS 断开：清空 peer 连接并提示用户重连

## 开发与联调步骤（本地可复现）

1. 启动信令服务器：确认 `ws://localhost:8787` 可连接
2. 启动前端：进入新页面
3. 打开多个 Tab：同一 `roomId`，依次连接并开启本地媒体
4. 验证：新人加入触发老用户发 offer；关掉任意 Tab 触发 `peer-left` 清理

## 已知限制与学习提示

- **Mesh 的天然限制**：人数越多，CPU/带宽压力上升；4~6 人后变差属正常现象。
- **公网稳定性**：仅 STUN 跨网可能失败；后续学习 TURN/SFU 再提升成功率与规模。
- **SDP 学习建议**：前端做只读日志（长度、媒体行、编码等），服务器不改写。

## 后续扩展路线（可选）

- **Perfect Negotiation**：进一步解决 offer glare
- **定向信令（to 字段）**：多人时更清晰、减少无关广播
- **TURN（coturn）**：公网连通性提升
- **引入现成 SFU**：LiveKit / mediasoup / Janus（用于学习更大规模多人）
