# 测试说明 - 多人 Mesh 通话

## 测试前准备

### 1. 启动信令服务器

```bash
cd server
npm install
npm start
```

预期输出：
```
WebSocket signaling server listening on ws://localhost:8787
Ready for connections...
```

### 2. 启动前端应用

在新的终端窗口中：

```bash
cd app
npm run dev
```

预期输出：
```
VITE ready in xxx ms
➜ Local: http://localhost:5173/
```

## 测试步骤

### 测试场景 1：两人通话

**步骤 1：用户 A 加入房间**

1. 打开浏览器，访问 `http://localhost:5173/pc-server`
2. 配置：
   - 服务器地址：`ws://localhost:8787`（默认）
   - 房间 ID：`demo`
   - 昵称：`Alice`（可选）
3. 点击"连接并加入房间"
4. 观察日志：
   ```
   连接信令服务器: ws://localhost:8787
   信令服务器连接成功
   加入房间: demo
   收到消息: joined
   分配的客户端 ID: xxxxxxxxxx
   成功加入房间，当前有 0 人
   ```
5. 点击"开启本地媒体"
6. 观察：本地视频开始播放（静音）

**步骤 2：用户 B 加入房间**

1. 打开**新的浏览器标签页**，访问 `http://localhost:5173/pc-server`
2. 配置：
   - 房间 ID：`demo`（与用户 A 相同）
   - 昵称：`Bob`（可选）
3. 点击"连接并加入房间"
4. 观察用户 A 的日志：
   ```
   收到消息: peer-joined
   新用户加入: Bob
   向 xxxxxxxxxx 发送 Offer
   已向 xxxxxxxxxx 发送 Offer
   为 xxxxxxxxxx 收集到 ICE 候选
   收到消息: signal
   收到来自 xxxxxxxxxx 的 Answer
   已处理来自 xxxxxxxxxx 的 Answer
   与 xxxxxxxxxx 的 ICE 状态: connected
   收到来自 xxxxxxxxxx 的媒体轨道: video
   收到来自 xxxxxxxxxx 的媒体轨道: audio
   ```
5. 点击"开启本地媒体"
6. 观察用户 B 的日志：
   ```
   成功加入房间，当前有 1 人
   房间内成员: Alice
   收到消息: signal
   收到来自 xxxxxxxxxx 的 Offer
   为 xxxxxxxxxx 创建 PeerConnection
   已向 xxxxxxxxxx 发送 Answer
   与 xxxxxxxxxx 的 ICE 状态: connected
   收到来自 xxxxxxxxxx 的媒体轨道: video
   收到来自 xxxxxxxxxx 的媒体轨道: audio
   ```

**预期结果：**
- ✅ 用户 A 看到 Bob 的视频（远端视频区域）
- ✅ 用户 B 看到 Alice 的视频（远端视频区域）
- ✅ 双方状态栏显示"房间人数: 2"
- ✅ ICE 连接状态为 connected
- ✅ 双方都收到成功提示

### 测试场景 2：三人通话（Mesh 网络）

**步骤 1：用户 C 加入房间**

1. 打开**第三个浏览器标签页**
2. 配置房间 ID 为 `demo`，昵称为 `Charlie`
3. 点击"连接并加入房间"
4. 点击"开启本地媒体"

**预期结果：**
- ✅ 用户 A 和 B 同时收到 `peer-joined` 消息
- ✅ 用户 A 和 B 分别向 C 发送 Offer
- ✅ 用户 C 收到两个 Offer 并分别回复 Answer
- ✅ 建立 3 条 P2P 连接：A-B、A-C、B-C
- ✅ 每个用户都能看到其他两个用户的视频
- ✅ 状态栏显示"房间人数: 3"

**连接拓扑：**
```
    A
   / \
  /   \
 B --- C
```

### 测试场景 3：用户离开

**步骤 1：用户 B 点击"断开连接"**

**预期结果：**
- ✅ 用户 A 和 C 收到 `peer-left` 消息
- ✅ 用户 A 和 C 的远端视频网格中 Bob 的视频消失
- ✅ 用户 A 和 C 的状态栏更新为"房间人数: 2"
- ✅ 用户 B 的所有连接被清理
- ✅ 用户 A 和 C 之间的连接仍然保持

### 测试场景 4：挂断所有连接

**步骤 1：用户 A 点击"挂断所有连接"**

**预期结果：**
- ✅ 用户 A 的本地视频停止
- ✅ 用户 A 的远端视频全部消失
- ✅ 用户 C 收到 `hangup` 信令
- ✅ 用户 C 的远端视频中 A 消失
- ✅ 用户 A 的所有 PeerConnection 关闭

## 服务器端日志

信令服务器的预期日志输出：

```bash
# 用户 A 加入
[CONNECT] New client connected: abc123
[JOIN] Client abc123 (Alice) joined room demo, current members: 1

# 用户 B 加入
[CONNECT] New client connected: xyz789
[JOIN] Client xyz789 (Bob) joined room demo, current members: 2
[SIGNAL] Client abc123 sent offer to room demo
[SIGNAL] Client xyz789 sent answer to room demo
[SIGNAL] Client abc123 sent ice-candidate to room demo
[SIGNAL] Client xyz789 sent ice-candidate to room demo

# 用户 C 加入
[CONNECT] New client connected: def456
[JOIN] Client def456 (Charlie) joined room demo, current members: 3
[SIGNAL] Client abc123 sent offer to room demo
[SIGNAL] Client xyz789 sent offer to room demo
[SIGNAL] Client def456 sent answer to room demo
[SIGNAL] Client def456 sent answer to room demo

# 用户 B 离开
[LEAVE] Client xyz789 left room demo, remaining: 2
[DISCONNECT] Client xyz789 disconnected
```

## 常见问题排查

### 问题 1：连接不上信令服务器

**症状：** 前端显示"信令服务器连接错误"

**检查：**
1. 信令服务器是否正在运行？
   ```bash
   ps aux | grep node
   ```
2. 端口 8787 是否被占用？
   ```bash
   lsof -i :8787
   ```
3. 浏览器控制台是否有错误？

**解决：**
- 确保服务器已启动：`cd server && npm start`
- 更换端口：`PORT=9000 npm start`，并更新前端配置

### 问题 2：看不到远端视频

**症状：** 连接显示成功，但远端视频区域为空

**检查：**
1. 查看日志是否有 `ontrack` 事件
2. 检查 ICE 连接状态是否为 connected
3. 查看浏览器控制台是否有错误

**可能原因：**
- 对方未开启本地媒体
- 防火墙阻止 UDP 流量
- NAT 类型不兼容（需要 TURN）

**解决：**
- 确保双方都已点击"开启本地媒体"
- 使用 `localhost` 测试（排除网络问题）
- 检查防火墙设置

### 问题 3：音频有回声

**症状：** 听到自己的声音回声

**解决：**
- 使用耳机
- 或确认本地视频已设置 `muted` 属性

### 问题 4：多人时卡顿

**症状：** 4 人以上通话时视频卡顿

**原因：**
- Mesh 拓扑的天然限制
- 上行带宽不足（N 人需要 N-1 路上行）
- CPU 编码压力大

**解决：**
- 限制房间人数在 2-6 人
- 降低视频分辨率
- 考虑使用 SFU 架构

## 性能指标

### 预期指标

| 指标 | 2 人 | 3 人 | 4 人 | 6 人 |
|------|------|------|------|------|
| 连接数 | 1 | 3 | 6 | 15 |
| 上行带宽 | ~1Mbps | ~2Mbps | ~3Mbps | ~5Mbps |
| CPU 使用 | 低 | 中 | 中高 | 高 |
| 建立时间 | <2s | <3s | <5s | <8s |

### 查看统计信息

在浏览器控制台执行：

```javascript
// 获取所有 PeerConnection
const pcs = Array.from(document.querySelectorAll('video'))
  .map(v => v.srcObject)
  .filter(Boolean)

// 查看统计信息
for (let pc of pcs) {
  const stats = await pc.getStats()
  console.log(stats)
}
```

## 测试检查清单

- [ ] 信令服务器成功启动
- [ ] 前端应用成功启动
- [ ] 用户能够连接到信令服务器
- [ ] 用户能够加入房间
- [ ] 用户能够开启本地媒体
- [ ] 两人能够建立 P2P 连接
- [ ] 两人能够看到彼此的视频
- [ ] 第三人加入时自动建立连接
- [ ] 用户离开时其他人收到通知
- [ ] 挂断所有连接功能正常
- [ ] 断开连接后资源正确清理
- [ ] 日志输出清晰完整
- [ ] 没有控制台错误

## 测试完成

如果以上所有检查项都通过，说明多人 Mesh 通话功能实现正确！🎉

## 后续测试

### 压力测试

- [ ] 测试 6-8 人同时通话
- [ ] 测试快速加入/离开
- [ ] 测试网络抖动情况

### 兼容性测试

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

### 网络测试

- [ ] 局域网测试
- [ ] 不同 NAT 类型测试
- [ ] 跨网段测试
