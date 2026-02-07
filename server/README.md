# WebRTC 信令服务器

基于原生 WebSocket 的 WebRTC 信令服务器，支持多人 Mesh 音视频通话。

## 功能特性

- ✅ 房间管理（自动创建/清理）
- ✅ 成员列表同步
- ✅ 信令消息转发（Offer/Answer/ICE）
- ✅ 自动补齐 `from` 字段
- ✅ 消息验证与大小限制
- ✅ 断线自动清理

## 安装依赖

```bash
npm install
# 或
pnpm install
```

## 启动服务器

```bash
# 生产模式
npm start

# 开发模式（自动重启）
npm run dev

# 自定义端口
PORT=9000 npm start
```

默认监听端口：`ws://localhost:8787`

## 信令协议

### 客户端 → 服务端

#### 1. 加入房间

```json
{
  "action": "join",
  "roomId": "demo",
  "name": "Alice"
}
```

#### 2. 离开房间

```json
{
  "action": "leave",
  "roomId": "demo"
}
```

#### 3. 发送信令

```json
{
  "action": "signal",
  "roomId": "demo",
  "type": "offer|answer|ice-candidate|hangup",
  "data": { /* 信令数据 */ }
}
```

### 服务端 → 客户端

#### 1. 加入成功

```json
{
  "action": "joined",
  "roomId": "demo",
  "clientId": "abc123",
  "peers": [
    { "clientId": "xyz789", "name": "Bob" }
  ]
}
```

#### 2. 新成员加入

```json
{
  "action": "peer-joined",
  "roomId": "demo",
  "peer": { "clientId": "new123", "name": "Charlie" }
}
```

#### 3. 成员离开

```json
{
  "action": "peer-left",
  "roomId": "demo",
  "clientId": "abc123"
}
```

#### 4. 转发信令

```json
{
  "action": "signal",
  "roomId": "demo",
  "from": "abc123",
  "type": "offer",
  "data": { /* SDP/ICE 数据 */ }
}
```

#### 5. 错误消息

```json
{
  "action": "error",
  "message": "错误描述"
}
```

## 协商策略

**老用户向新用户发 Offer**：

- 当收到 `peer-joined` 消息时，已在房间的用户主动向新用户发送 Offer
- 新加入用户只需等待 Offer 并回复 Answer
- 避免了 Offer 冲突（glare）问题

## 限制与约束

- 单条消息最大：256KB
- 房间 ID 最大长度：64 字符
- 连接方式：Mesh（每个客户端连接所有其他客户端）
- 推荐人数：2-6 人（Mesh 限制）

## 目录结构

```
server/
├── package.json
├── README.md
└── src/
    └── index.js      # 主服务器代码
```

## 技术栈

- Node.js (ESM)
- ws (WebSocket 库)

## 后续扩展

- [ ] 房间密码/鉴权
- [ ] 连接超时管理
- [ ] 消息速率限制
- [ ] 详细日志与监控
- [ ] HTTPS/WSS 支持
- [ ] 持久化房间信息
