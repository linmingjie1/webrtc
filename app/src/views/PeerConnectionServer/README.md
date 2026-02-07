# WebRTC 多人 Mesh 通话（WebSocket 信令）

基于 WebSocket 信令服务器的多人音视频通话实现，采用 Mesh（网状）拓扑结构。

## 功能特性

- ✅ WebSocket 信令通道
- ✅ 房间管理（自动加入/离开）
- ✅ 多人 Mesh 连接（每个客户端与其他所有客户端建立 P2P 连接）
- ✅ 老用户向新用户发 Offer（避免 glare）
- ✅ 本地视频预览
- ✅ 远端视频网格展示
- ✅ 实时日志输出
- ✅ 断线自动清理

## 使用步骤

### 1. 启动信令服务器

```bash
cd server
npm install
npm start
```

服务器将在 `ws://localhost:8787` 启动。

### 2. 启动前端应用

```bash
cd app
npm run dev
```

### 3. 访问页面

在浏览器中打开 `http://localhost:5173/pc-server`

### 4. 测试多人通话

1. 打开第一个浏览器标签页
   - 输入房间 ID（如 `demo`）
   - 点击"连接并加入房间"
   - 点击"开启本地媒体"

2. 打开第二个浏览器标签页
   - 输入相同的房间 ID（`demo`）
   - 点击"连接并加入房间"
   - 点击"开启本地媒体"

3. 观察效果
   - 第一个标签页会自动向第二个标签页发送 Offer
   - 第二个标签页收到 Offer 后回复 Answer
   - 两个标签页建立 P2P 连接
   - 可以看到彼此的视频

4. 继续添加更多参与者
   - 打开第三、第四个标签页...
   - 每个新标签页都会与所有已有标签页建立连接

## 架构设计

### 信令流程

```
客户端 A                  信令服务器                  客户端 B
   |                          |                          |
   |------- join(demo) ------>|                          |
   |<----- joined(peers) -----|                          |
   |                          |<------ join(demo) -------|
   |                          |------ joined(peers) ---->|
   |<---- peer-joined(B) -----|------- peer-joined(A) -->|
   |                          |                          |
   |-- offer (broadcast) ---->|---- offer (from: A) ---->|
   |                          |<--- answer (broadcast) --|
   |<--- answer (from: B) ----|                          |
   |                          |                          |
   |-- ice (broadcast) ------>|------ ice (from: A) ---->|
   |<------ ice (from: B) ----|<---- ice (broadcast) ----|
```

### 协商策略

采用"**老用户向新用户发 Offer**"策略：

1. **新用户加入**
   - 服务器向房间内所有人广播 `peer-joined` 消息
   - 已在房间的用户收到消息后，主动向新用户发送 Offer

2. **新用户响应**
   - 新用户只需等待来自各个老用户的 Offer
   - 收到 Offer 后逐一回复 Answer

3. **优势**
   - 避免 Offer 冲突（glare）
   - 逻辑简单清晰
   - 适合小规模多人场景

### 数据结构

#### 客户端状态

```javascript
{
  // WebSocket 连接
  ws: WebSocket
  clientId: string
  isConnected: boolean
  currentRoomId: string
  
  // Peer 管理
  peers: Map<peerId, {name, joinedAt}>
  
  // WebRTC 连接
  pcs: Map<peerId, RTCPeerConnection>
  remoteStreams: Map<peerId, MediaStream>
  pendingIce: Map<peerId, RTCIceCandidateInit[]>
  
  // 本地媒体
  localStream: MediaStream
}
```

#### 服务器状态

```javascript
{
  // 房间管理
  rooms: Map<roomId, Set<WebSocket>>
  
  // 客户端管理
  clients: Map<clientId, WebSocket>
  
  // WebSocket 扩展属性
  ws.clientId: string
  ws.roomId: string
  ws.name: string
}
```

## 核心 Composables

### useWebSocketSignaling

负责 WebSocket 连接和信令消息处理：

- `connect()` - 连接到信令服务器
- `disconnect()` - 断开连接
- `joinRoom(roomId, name)` - 加入房间
- `leaveRoom()` - 离开房间
- `sendSignal(type, data)` - 发送信令消息

### useMeshConnection

负责多人 Mesh 连接管理：

- `setLocalStream()` - 设置本地媒体流
- `handlePeerJoined(peer)` - 处理新用户加入
- `handlePeerLeft(peerId)` - 处理用户离开
- `handleOffer(from, offer)` - 处理收到的 Offer
- `handleAnswer(from, answer)` - 处理收到的 Answer
- `handleIceCandidate(from, candidate)` - 处理 ICE 候选
- `hangupAll()` - 挂断所有连接

## 信令协议

### 客户端 → 服务器

```javascript
// 加入房间
{ action: 'join', roomId: 'demo', name: 'Alice' }

// 离开房间
{ action: 'leave', roomId: 'demo' }

// 发送信令
{ 
  action: 'signal', 
  roomId: 'demo', 
  type: 'offer|answer|ice-candidate|hangup',
  data: {...}
}
```

### 服务器 → 客户端

```javascript
// 加入成功
{ 
  action: 'joined', 
  roomId: 'demo', 
  clientId: 'abc123',
  peers: [{clientId: 'xyz789', name: 'Bob'}]
}

// 新成员加入
{ 
  action: 'peer-joined', 
  roomId: 'demo',
  peer: {clientId: 'new123', name: 'Charlie'}
}

// 成员离开
{ action: 'peer-left', roomId: 'demo', clientId: 'abc123' }

// 转发信令（服务器自动补齐 from 字段）
{ 
  action: 'signal', 
  roomId: 'demo', 
  from: 'abc123',
  type: 'offer',
  data: {...}
}
```

## 关键实现细节

### ICE 候选缓存

为了处理 ICE 候选到达时机问题，实现了缓存机制：

```javascript
// 收到 ICE 候选时
if (!pc || !pc.remoteDescription) {
  // 缓存候选
  pendingIce[from].push(candidate)
} else {
  // 直接添加
  await pc.addIceCandidate(candidate)
}

// 设置远程描述后
await pc.setRemoteDescription(offer/answer)
await flushPendingIce(peerId) // 清空缓存
```

### 连接状态监听

```javascript
pc.oniceconnectionstatechange = () => {
  switch (pc.iceConnectionState) {
    case 'connected':
      // 连接成功
      break
    case 'failed':
      // 连接失败
      break
    case 'disconnected':
      // 连接断开
      break
  }
}
```

### 远程媒体流管理

```javascript
pc.ontrack = (event) => {
  // 为每个 peer 创建独立的 MediaStream
  if (!remoteStreams.has(peerId)) {
    remoteStreams.set(peerId, new MediaStream())
  }
  
  const stream = remoteStreams.get(peerId)
  stream.addTrack(event.track)
  
  // 触发响应式更新
  remoteStreams.value = new Map(remoteStreams.value)
}
```

## 已知限制

### Mesh 拓扑的天然限制

- **连接数量**：N 人房间需要 N*(N-1)/2 条连接
  - 2 人：1 条连接
  - 3 人：3 条连接
  - 4 人：6 条连接
  - 5 人：10 条连接
  - 6 人：15 条连接

- **带宽消耗**：每个客户端需要上传 N-1 份视频流
  - 假设单路视频 1Mbps
  - 4 人通话：每人需要 3Mbps 上行
  - 6 人通话：每人需要 5Mbps 上行

- **CPU 消耗**：需要同时编码多路视频

**推荐人数**：2-6 人

### 网络穿透限制

- 仅配置了 STUN 服务器
- 对称 NAT 可能无法建立连接
- 企业网络可能被防火墙阻止
- 建议后续部署 TURN 服务器

## 调试技巧

### 查看日志

页面右侧有实时日志输出，包含：

- 连接状态变化
- 信令消息收发
- ICE 候选收集
- 媒体轨道添加

### 浏览器开发者工具

```javascript
// 查看 PeerConnection 统计信息
const pc = pcs.get('peerId')
const stats = await pc.getStats()
stats.forEach(report => console.log(report))
```

### 常见问题

**Q: 连接建立失败？**
- 检查信令服务器是否运行
- 查看浏览器控制台错误
- 检查防火墙设置
- 尝试使用 localhost（避免 HTTPS 限制）

**Q: 看不到远端视频？**
- 确认双方都已开启本地媒体
- 检查 ICE 连接状态是否为 connected
- 查看日志确认收到 ontrack 事件

**Q: 音频有回声？**
- 使用耳机
- 或在本地视频上设置 `muted` 属性

## 后续优化方向

### 短期优化

- [ ] 添加音频/视频开关控制
- [ ] 显示每个连接的质量指标
- [ ] 添加屏幕共享功能
- [ ] 房间密码保护

### 中期优化

- [ ] 实现 Perfect Negotiation
- [ ] 使用 `to` 字段定向转发信令
- [ ] 添加断线重连逻辑
- [ ] 优化 UI 响应式布局

### 长期优化

- [ ] 部署 TURN 服务器（coturn）
- [ ] 迁移到 SFU 架构（LiveKit/mediasoup）
- [ ] 添加录制功能
- [ ] 实现虚拟背景

## 目录结构

```
app/src/views/PeerConnectionServer/
├── PeerConnectionServerView.vue    # 主页面组件
├── README.md                        # 本文档
└── composables/
    ├── useWebSocketSignaling.js    # WebSocket 信令管理
    └── useMeshConnection.js        # Mesh 连接管理
```

## 相关资源

- [WebRTC API 文档](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection)
- [信令服务器文档](../../../server/README.md)
- [设计文档](../../../docs/webrtc-signaling-mesh.md)
