# 快速启动指南

## 🚀 5 分钟快速体验

### 步骤 1：启动信令服务器

打开终端，执行：

```bash
cd server
npm install
npm start
```

看到以下输出表示成功：
```
WebSocket signaling server listening on ws://localhost:8787
Ready for connections...
```

### 步骤 2：启动前端应用

**打开新的终端窗口**，执行：

```bash
cd app
npm run dev
```

看到以下输出表示成功：
```
➜ Local: http://localhost:5173/
```

### 步骤 3：测试两人通话

1. **打开浏览器标签页 1**
   - 访问：`http://localhost:5173/pc-server`
   - 房间 ID：`demo`
   - 昵称：`Alice`（可选）
   - 点击：**连接并加入房间**
   - 点击：**开启本地媒体**
   - 等待：看到本地视频

2. **打开浏览器标签页 2**
   - 访问：`http://localhost:5173/pc-server`
   - 房间 ID：`demo`（相同）
   - 昵称：`Bob`（可选）
   - 点击：**连接并加入房间**
   - 点击：**开启本地媒体**
   - 等待：看到本地视频和远端视频

3. **观察效果**
   - ✅ 标签页 1 能看到 Bob 的视频
   - ✅ 标签页 2 能看到 Alice 的视频
   - ✅ 状态栏显示"房间人数: 2"
   - ✅ 日志区域显示连接建立过程

### 步骤 4：测试三人通话（可选）

继续打开**第三个标签页**，重复步骤 3，使用相同的房间 ID。

观察：
- ✅ 所有标签页都能看到其他人的视频
- ✅ 状态栏显示"房间人数: 3"
- ✅ 建立了 3 条 P2P 连接

## 🎯 预期效果

### 成功标志

- 状态栏显示"已连接服务器"（绿色）
- 本地视频正常播放
- 远端视频网格显示其他人的视频
- 日志显示"ICE 连接状态: connected"
- 没有错误提示

### 连接流程（查看日志）

```
连接信令服务器
信令服务器连接成功
加入房间: demo
成功加入房间
本地媒体流已准备就绪
新用户加入: Bob
向 xxxxxxxxxx 发送 Offer
收到来自 xxxxxxxxxx 的 Answer
与 xxxxxxxxxx 的 ICE 状态: connected
收到来自 xxxxxxxxxx 的媒体轨道: video
收到来自 xxxxxxxxxx 的媒体轨道: audio
```

## 🔧 故障排查

### 问题 1：连接不上服务器

**检查：**
```bash
# 确认服务器正在运行
ps aux | grep node

# 检查端口是否监听
lsof -i :8787
```

**解决：**
- 确保在 `server/` 目录下执行 `npm start`
- 检查 8787 端口是否被占用

### 问题 2：看不到视频

**检查：**
- 浏览器是否允许摄像头权限？
- 双方是否都已点击"开启本地媒体"？
- ICE 连接状态是否为 connected？

**解决：**
- 在浏览器地址栏左侧点击摄像头图标，允许权限
- 确保双方都已开启媒体
- 查看日志区域的详细信息

### 问题 3：音频有回声

**解决：**
- 使用耳机
- 本地视频已自动静音，无需额外操作

## 📖 详细文档

- [功能说明](../app/src/views/PeerConnectionServer/README.md)
- [测试指南](./testing-guide.md)
- [实现总结](./implementation-summary.md)
- [设计文档](./webrtc-signaling-mesh.md)

## 🎉 成功！

如果你能看到彼此的视频，恭喜你已经成功运行了多人 Mesh 音视频通话系统！

现在你可以：
- 打开更多标签页测试多人通话
- 查看日志了解 WebRTC 协商过程
- 阅读文档深入理解实现原理
- 尝试修改代码添加新功能

## 🚪 退出

按 `Ctrl+C` 停止服务器和前端应用。
