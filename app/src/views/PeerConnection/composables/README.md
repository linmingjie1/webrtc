# Composables 架构说明

本目录包含了 WebRTC 点对点通话功能的所有可组合函数（Composables），按照功能模块进行拆分。

## 📁 文件结构

```
composables/
├── useLogger.js           # 日志管理
├── useConnectionState.js  # 连接状态管理
├── useMedia.js            # 媒体流管理
├── useSignaling.js        # 信令通道管理
└── usePeerConnection.js   # WebRTC 连接管理
```

## 📦 模块说明

### 1. useLogger.js - 日志管理
负责应用内的所有日志记录和管理。

**功能：**
- 添加不同类型的日志（info, success, error, warn, send, receive）
- 清空日志
- 自动添加时间戳

**导出：**
```javascript
{
  logs,       // 日志列表
  addLog,     // 添加日志函数
  clearLogs   // 清空日志函数
}
```

---

### 2. useConnectionState.js - 连接状态管理
管理 WebRTC 连接的所有状态信息。

**功能：**
- 管理用户角色（caller/callee）
- 管理连接状态（connecting/connected/disconnected）
- 管理 ICE 连接状态
- 提供状态相关的计算属性（用于 UI 展示）

**导出：**
```javascript
{
  role,                     // 角色（'caller' 或 'callee'）
  isConnecting,             // 是否正在连接
  isConnected,              // 是否已连接
  iceConnectionState,       // ICE 连接状态
  connectionStatusText,     // 连接状态文本
  connectionStatusType,     // 连接状态类型（用于 UI）
  iceConnectionStateType,   // ICE 状态类型（用于 UI）
  resetConnectionState      // 重置所有状态
}
```

---

### 3. useMedia.js - 媒体流管理
处理本地和远程媒体流的获取、播放和清理。

**功能：**
- 获取用户摄像头和麦克风（getUserMedia）
- 管理本地视频流
- 接收和播放远程视频流
- 清理媒体资源

**导出：**
```javascript
{
  localVideoRef,      // 本地视频 DOM 引用
  remoteVideoRef,     // 远程视频 DOM 引用
  localStream,        // 本地媒体流
  remoteStream,       // 远程媒体流
  getLocalStream,     // 获取本地媒体流
  addRemoteTrack,     // 添加远程轨道
  stopLocalStream,    // 停止本地流
  clearRemoteStream   // 清空远程流
}
```

---

### 4. useSignaling.js - 信令通道管理
使用 BroadcastChannel API 实现标签页间的信令通信。

**功能：**
- 初始化信令通道（BroadcastChannel）
- 发送信令消息（offer/answer/ICE candidate）
- 接收并处理信令消息
- 序列化 WebRTC 对象（避免 DataCloneError）

**信令消息格式：**
```javascript
{
  type: 'offer' | 'answer' | 'ice-candidate' | 'hangup',
  data: any
}
```

**导出：**
```javascript
{
  initSignalingChannel,    // 初始化信令通道
  sendSignaling,           // 发送信令
  closeSignalingChannel    // 关闭信令通道
}
```

---

### 5. usePeerConnection.js - WebRTC 连接管理
核心模块，管理 RTCPeerConnection 及其所有相关操作。

**功能：**
- 创建和配置 PeerConnection
- 处理 SDP 协商（Offer/Answer）
- 管理 ICE 候选收集和添加
- 处理连接生命周期（建立、断开、失败）
- 自动重连逻辑

**信令流程：**
1. **Caller（呼叫者）：**
   - 获取本地媒体流
   - 创建 PeerConnection
   - 创建并发送 Offer
   - 接收并处理 Answer

2. **Callee（接收者）：**
   - 接收 Offer
   - 获取本地媒体流
   - 创建 PeerConnection
   - 创建并发送 Answer

**导出：**
```javascript
{
  peerConnection,          // PeerConnection 实例
  createPeerConnection,    // 创建连接
  startCall,              // 开始呼叫（Caller）
  handleOffer,            // 处理 Offer（Callee）
  handleAnswer,           // 处理 Answer（Caller）
  handleIceCandidate,     // 处理 ICE 候选
  handleRemoteHangup,     // 处理远程挂断
  hangUp                  // 挂断连接
}
```

---

## 🔄 模块间依赖关系

```
PeerConnectionView.vue
    ├── useLogger
    ├── useConnectionState
    ├── useMedia
    │     └── 依赖 addLog
    ├── useSignaling
    │     └── 依赖 addLog, messageHandler
    └── usePeerConnection
          ├── 依赖 addLog
          ├── 依赖 sendSignaling
          ├── 依赖 connectionState
          └── 依赖 mediaHandlers
```

## 💡 使用示例

在 `PeerConnectionView.vue` 中的使用：

```vue
<script setup>
import { useLogger } from './composables/useLogger'
import { useConnectionState } from './composables/useConnectionState'
import { useMedia } from './composables/useMedia'
import { useSignaling } from './composables/useSignaling'
import { usePeerConnection } from './composables/usePeerConnection'

// 1. 初始化日志
const { logs, addLog, clearLogs } = useLogger()

// 2. 初始化连接状态
const {
  role,
  isConnecting,
  isConnected,
  iceConnectionState,
  connectionStatusText,
  connectionStatusType,
  iceConnectionStateType
} = useConnectionState()

// 3. 初始化媒体管理
const {
  localVideoRef,
  remoteVideoRef,
  localStream,
  remoteStream,
  getLocalStream,
  addRemoteTrack,
  stopLocalStream,
  clearRemoteStream
} = useMedia(addLog)

// 4. 初始化信令通道
const { initSignalingChannel, sendSignaling, closeSignalingChannel } =
  useSignaling(addLog, handleSignalingMessage)

// 5. 初始化 PeerConnection
const peerConnectionHandlers = usePeerConnection(
  addLog,
  sendSignaling,
  { role, isConnecting, isConnected, iceConnectionState },
  { addRemoteTrack, stopLocalStream, clearRemoteStream }
)

const { startCall, hangUp } = peerConnectionHandlers
</script>
```

## ✅ 优势

### 1. **关注点分离**
每个模块专注于单一职责，代码清晰易懂。

### 2. **可重用性**
Composables 可以在不同组件中复用。

### 3. **可测试性**
每个模块可以独立测试。

### 4. **可维护性**
修改某个功能只需要关注对应的 composable。

### 5. **类型安全**
函数参数和返回值明确，减少错误。

## 🛠️ 开发建议

1. **单一职责**：每个 composable 只负责一个功能领域
2. **依赖注入**：通过参数传递依赖，而不是在内部创建
3. **清晰命名**：函数名要表达清楚做什么
4. **文档注释**：为每个函数添加 JSDoc 注释
5. **错误处理**：在合适的地方捕获和处理错误

## 📚 相关资源

- [Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
