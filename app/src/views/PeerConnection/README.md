# WebRTC 点对点连接示例

这个示例演示了如何使用 WebRTC 实现两个浏览器标签页之间的视频通话。

## 功能特性

- ✅ 完整的 Offer/Answer 信令交换流程
- ✅ ICE 候选收集和交换
- ✅ 实时连接状态监控
- ✅ 详细的信令日志记录
- ✅ 使用 BroadcastChannel API 实现标签页间通信

## 使用步骤

### 1. 启动开发服务器

```bash
cd app
pnpm install
pnpm dev
```

### 2. 打开两个标签页

在浏览器中打开两个标签页，都访问：`http://localhost:5173/peer-connection`

### 3. 设置角色

- **第一个标签页**：选择"呼叫者 (Caller)"角色
- **第二个标签页**：选择"接收者 (Callee)"角色

### 4. 开始通话

1. 在**呼叫者**标签页，点击"开始呼叫"按钮
2. 允许浏览器访问摄像头和麦克风
3. 等待接收者响应
4. 在**接收者**标签页，会自动收到 Offer 并开始处理
5. 允许浏览器访问摄像头和麦克风
6. 等待连接建立

### 5. 观察连接过程

在信令日志面板中，你可以看到完整的连接流程：

```
[INFO] 信令通道已初始化
[INFO] 页面加载完成，请选择角色
[INFO] 切换角色: caller
[INFO] ========== 开始呼叫流程 ==========
[INFO] 正在获取本地媒体流...
[SUCCESS] 本地媒体流获取成功
[INFO] 创建 PeerConnection...
[INFO] 添加本地轨道: video
[INFO] 添加本地轨道: audio
[SUCCESS] PeerConnection 创建成功
[INFO] 正在创建 Offer...
[INFO] 设置本地描述 (Offer)
[SEND] 发送信令: offer
[INFO] 收集到 ICE 候选: host
[SEND] 发送信令: ice-candidate
[RECEIVE] 收到信令: answer
[INFO] 设置远程描述 (Answer)
[SUCCESS] Answer 处理完成，等待 ICE 连接建立...
[RECEIVE] 收到信令: ice-candidate
[INFO] 添加远程 ICE 候选: host
[INFO] ICE 连接状态: checking
[INFO] ICE 连接状态: connected
[SUCCESS] 收到远程媒体轨道: video
[SUCCESS] 收到远程媒体轨道: audio
```

## 技术要点

### 1. 信令交换流程

```
Caller (呼叫者)                    Callee (接收者)
     |                                    |
     | 1. getUserMedia()                  |
     | 2. createPeerConnection()          |
     | 3. addTrack()                      |
     | 4. createOffer()                   |
     | 5. setLocalDescription(offer)      |
     | 6. send(offer) -----------------> |
     |                                    | 7. getUserMedia()
     |                                    | 8. createPeerConnection()
     |                                    | 9. addTrack()
     |                                    | 10. setRemoteDescription(offer)
     |                                    | 11. createAnswer()
     |                                    | 12. setLocalDescription(answer)
     | <----------------- send(answer) 13.|
     | 14. setRemoteDescription(answer)   |
     |                                    |
     | <====== ICE 候选交换 ======>      |
     |                                    |
     | <====== P2P 连接建立 ======>      |
     |                                    |
     | <====== 媒体流传输 ========>      |
```

### 2. ICE 候选类型

在日志中你会看到不同类型的 ICE 候选：

- **host**: 本地网络地址（局域网 IP）
- **srflx**: STUN 服务器反射的公网地址
- **relay**: TURN 服务器中继地址（本示例未配置 TURN）

### 3. 连接状态

- **new**: 初始状态
- **checking**: 正在检查 ICE 候选
- **connected**: 连接成功
- **completed**: 连接完成
- **failed**: 连接失败
- **disconnected**: 连接断开
- **closed**: 连接关闭

## 核心 API

### RTCPeerConnection

```javascript
// 创建连接
const pc = new RTCPeerConnection(configuration)

// 添加媒体轨道
localStream.getTracks().forEach(track => {
  pc.addTrack(track, localStream)
})

// 创建 Offer
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)

// 创建 Answer
const answer = await pc.createAnswer()
await pc.setLocalDescription(answer)

// 设置远程描述
await pc.setRemoteDescription(remoteDescription)

// 添加 ICE 候选
await pc.addIceCandidate(candidate)
```

### 事件监听

```javascript
// ICE 候选事件
pc.onicecandidate = (event) => {
  if (event.candidate) {
    // 发送候选到远端
    sendToRemote(event.candidate)
  }
}

// 接收远程媒体流
pc.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0]
}

// ICE 连接状态变化
pc.oniceconnectionstatechange = () => {
  console.log('ICE 状态:', pc.iceConnectionState)
}
```

## BroadcastChannel API

用于同源标签页之间的通信：

```javascript
// 创建通道
const channel = new BroadcastChannel('channel-name')

// 发送消息
channel.postMessage({ type: 'offer', data: offer })

// 接收消息
channel.onmessage = (event) => {
  const { type, data } = event.data
  // 处理消息
}

// 关闭通道
channel.close()
```

## 常见问题

### 1. 为什么需要两个标签页？

因为 WebRTC 是点对点（P2P）通信，需要两个对等端（Peer）。在生产环境中，这两个对等端通常是不同的设备或用户，但为了学习和测试，我们使用同一个浏览器的两个标签页来模拟。

### 2. 信令服务器的作用是什么？

信令服务器用于交换 SDP（会话描述）和 ICE 候选信息。本示例使用 BroadcastChannel API 模拟信令服务器，在生产环境中通常使用 WebSocket。

### 3. 媒体数据通过哪里传输？

一旦 WebRTC 连接建立，音视频数据是直接在两个标签页之间传输的（P2P），不经过信令通道。这就是 WebRTC 的优势：降低服务器负担和延迟。

### 4. STUN 服务器是做什么的？

STUN 服务器帮助客户端发现自己的公网 IP 地址和端口，用于 NAT 穿透。本示例使用了 Google 的免费 STUN 服务器。

### 5. 如果连接失败怎么办？

检查以下几点：
- 浏览器是否支持 WebRTC（Chrome、Firefox、Edge、Safari）
- 是否允许了摄像头和麦克风权限
- 两个标签页是否在同一个域名下（BroadcastChannel 要求）
- 查看控制台和信令日志中的错误信息

### 6. 摄像头打不开

常见原因：
- **摄像头被占用**：关闭其他使用摄像头的应用（Zoom、Teams 等）
- **权限问题**：访问 `chrome://settings/content/camera` 检查权限
- **系统权限**（macOS）：系统偏好设置 → 安全性与隐私 → 摄像头
- **浏览器问题**：完全退出浏览器后重新打开

## 下一步学习

- 添加 TURN 服务器支持（用于更复杂的网络环境）
- 实现屏幕共享功能
- 添加数据通道（DataChannel）传输文本或文件
- 使用 WebSocket 替代 BroadcastChannel，实现跨设备通信
- 实现多人视频会议（Mesh 或 SFU 架构）

## 参考资源

- [MDN - WebRTC API](https://developer.mozilla.org/zh-CN/docs/Web/API/WebRTC_API)
- [WebRTC Samples](https://webrtc.github.io/samples/)
- [WebRTC 标准文档](https://www.w3.org/TR/webrtc/)
