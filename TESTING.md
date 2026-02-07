# WebRTC 多人通话测试指南

## 修复说明

已修复"后开启本地媒体的一端看不到对方画面"的问题。

### 修复内容

1. **信令服务器点对点转发**：支持 `to` 字段，实现精准的信令转发
2. **客户端信令指定目标**：所有 offer、answer、ice-candidate 都指定明确的接收方
3. **协商时序优化**：只有本地媒体就绪后才响应 offer，避免单向连接

## 测试场景

### 场景1：先开媒体再加入
**步骤：**
1. 打开浏览器标签1，连接并加入房间 `demo`
2. 标签1点击"开启本地媒体"
3. 打开浏览器标签2，连接并加入房间 `demo`
4. 标签2点击"开启本地媒体"

**预期结果：**
- ✅ 标签1能看到标签2的画面
- ✅ 标签2能看到标签1的画面
- ✅ 日志显示双向ICE连接状态为 `connected`

### 场景2：先加入再开媒体
**步骤：**
1. 打开浏览器标签1，连接并加入房间 `demo`
2. 打开浏览器标签2，连接并加入房间 `demo`
3. 标签1点击"开启本地媒体"
4. 标签2点击"开启本地媒体"

**预期结果：**
- ✅ 标签1能看到标签2的画面
- ✅ 标签2能看到标签1的画面
- ✅ 日志显示双向ICE连接状态为 `connected`

### 场景3：三人通话
**步骤：**
1. 标签1：加入房间并开启媒体
2. 标签2：加入房间并开启媒体
3. 标签3：加入房间并开启媒体

**预期结果：**
- ✅ 标签1能看到标签2和标签3的画面（远端视频显示2人）
- ✅ 标签2能看到标签1和标签3的画面（远端视频显示2人）
- ✅ 标签3能看到标签1和标签2的画面（远端视频显示2人）

### 场景4：异步开启媒体
**步骤：**
1. 标签1：加入房间并开启媒体
2. 标签2：只加入房间（不开媒体）
3. 标签3：加入房间并开启媒体
4. 标签2：开启本地媒体

**预期结果：**
- ✅ 标签1能看到标签2和标签3
- ✅ 标签2能看到标签1和标签3
- ✅ 标签3能看到标签1和标签2

## 关键日志检查

### 正常的连接建立日志

**发起方（已开启媒体）：**
```
[INFO] 新用户加入: xxx
[INFO] 向 xxx 发送 Offer
[SEND] 已向 xxx 发送 Offer
[INFO] 为 xxx 收集到 ICE 候选
[SEND] 发送信令: ice-candidate -> xxx
[INFO] 收到来自 xxx 的 Answer
[SUCCESS] 已处理来自 xxx 的 Answer
[INFO] 与 xxx 的 ICE 状态: connected
```

**接收方（已开启媒体）：**
```
[INFO] 收到来自 xxx 的 Offer
[INFO] 为 xxx 创建 PeerConnection
[SEND] 已向 xxx 发送 Answer
[INFO] 为 xxx 收集到 ICE 候选
[SUCCESS] 收到来自 xxx 的媒体轨道: video
[SUCCESS] 收到来自 xxx 的媒体轨道: audio
[INFO] 与 xxx 的 ICE 状态: connected
```

### 接收方未开启媒体的日志

**接收方（未开启媒体）：**
```
[INFO] 收到来自 xxx 的 Offer
[WARN] 本地媒体未就绪，暂不处理来自 xxx 的 Offer，等待媒体开启后重新协商
```

**等开启媒体后：**
```
[SUCCESS] 本地媒体流已准备就绪
[INFO] 向 xxx 发送 Offer
[SEND] 已向 xxx 发送 Offer
... (后续正常连接流程)
```

## 故障排查

### 问题1：看不到远端画面

**检查项：**
1. 打开浏览器控制台，查看是否有错误
2. 检查操作日志，确认ICE状态是否为 `connected`
3. 检查是否有信令发送失败的日志
4. 确认远端媒体数量是否正确显示

**可能原因：**
- 防火墙阻止了 WebRTC 连接
- STUN 服务器无法访问
- 本地媒体未正确添加到 PeerConnection

### 问题2：连接一段时间后断开

**检查项：**
1. 查看 ICE 连接状态变化
2. 检查网络是否稳定
3. 查看是否有 peer-left 消息

### 问题3：信令服务器连接失败

**检查项：**
1. 确认信令服务器是否启动：`cd server && npm start`
2. 确认端口 8787 是否被占用
3. 检查 WebSocket URL 是否正确

## 性能监控

### 查看 PeerConnection 统计信息

在浏览器控制台执行：
```javascript
// 获取所有 PeerConnection 实例
const pcs = Array.from(window.$vm.pcs.value.values())

// 查看每个连接的统计
pcs.forEach(async (pc, i) => {
  const stats = await pc.getStats()
  console.log(`PC ${i} stats:`, stats)
})
```

### 监控网络质量

```javascript
pcs.forEach(async (pc, i) => {
  const stats = await pc.getStats()
  stats.forEach(report => {
    if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
      console.log(`PC ${i} 接收视频:`, {
        packetsLost: report.packetsLost,
        jitter: report.jitter,
        bytesReceived: report.bytesReceived
      })
    }
  })
})
```

## 开发调试

### 启用详细日志

在 `useMeshConnection.js` 中启用更详细的日志输出，可以在关键位置添加 `console.log`：

```javascript
pc.onicecandidate = (event) => {
  console.log('[DEBUG] ICE candidate:', event.candidate)
  // ...
}

pc.ontrack = (event) => {
  console.log('[DEBUG] Remote track:', event.track, event.streams)
  // ...
}
```

### 使用 chrome://webrtc-internals

Chrome 浏览器内置了 WebRTC 调试工具：
1. 打开新标签页
2. 访问 `chrome://webrtc-internals`
3. 可以看到所有 PeerConnection 的详细信息、统计数据和事件日志
