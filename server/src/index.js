import { WebSocketServer } from 'ws'
import { randomBytes } from 'crypto'

const PORT = process.env.PORT || 8787
const MAX_MESSAGE_SIZE = 256 * 1024 // 256KB
const MAX_ROOM_ID_LENGTH = 64

// 房间管理：roomId -> Set<WebSocket>
const rooms = new Map()
// 客户端管理：clientId -> WebSocket
const clients = new Map()

/**
 * 生成短随机 ID (8-12 位 base36)
 */
function generateClientId() {
  return randomBytes(6).toString('hex').slice(0, 10)
}

/**
 * 验证消息格式和大小
 */
function validateMessage(msg, size) {
  if (size > MAX_MESSAGE_SIZE) {
    return { valid: false, error: 'Message too large' }
  }

  try {
    const data = JSON.parse(msg)

    if (!data.action || typeof data.action !== 'string') {
      return { valid: false, error: 'Invalid action' }
    }

    if (data.roomId && typeof data.roomId !== 'string') {
      return { valid: false, error: 'Invalid roomId type' }
    }

    if (data.roomId && data.roomId.length > MAX_ROOM_ID_LENGTH) {
      return { valid: false, error: 'RoomId too long' }
    }

    return { valid: true, data }
  } catch (error) {
    return { valid: false, error: 'Invalid JSON' }
  }
}

/**
 * 广播消息给房间内除发送者外的所有成员
 */
function broadcastToRoom(roomId, senderId, message) {
  const room = rooms.get(roomId)
  if (!room) return

  room.forEach((ws) => {
    if (ws.clientId !== senderId && ws.readyState === 1) {
      ws.send(JSON.stringify(message))
    }
  })
}

/**
 * 获取房间内的所有成员列表（除了指定的客户端）
 */
function getRoomPeers(roomId, excludeClientId) {
  const room = rooms.get(roomId)
  if (!room) return []

  const peers = []
  room.forEach((ws) => {
    if (ws.clientId !== excludeClientId) {
      peers.push({
        clientId: ws.clientId,
        name: ws.name || undefined // 成员名称
      })
    }
  })

  return peers
}

/**
 * 处理客户端加入房间
 */
function handleJoin(ws, data) {
  const { roomId, name } = data
  const clientId = ws.clientId

  // 如果已经在其他房间，先离开
  if (ws.roomId && ws.roomId !== roomId) {
    handleLeave(ws, { roomId: ws.roomId })
  }

  // 创建房间（如果不存在）
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set())
  }

  // 加入房间
  const room = rooms.get(roomId)
  room.add(ws)
  ws.roomId = roomId
  ws.name = name || null

  // 获取当前房间内的其他成员
  const peers = getRoomPeers(roomId, clientId)

  // 回复 joined 消息，并返回成员列表
  ws.send(
    JSON.stringify({
      action: 'joined',
      roomId,
      clientId,
      peers
    })
  )

  // 通知其他成员有新人加入
  broadcastToRoom(roomId, clientId, {
    action: 'peer-joined',
    roomId,
    peer: {
      clientId,
      name: ws.name || undefined
    }
  })

  console.log(
    `[JOIN] Client ${clientId} (${name || 'anonymous'}) joined room ${roomId}, current members: ${room.size}`
  )
}

/**
 * 处理客户端离开房间
 */
function handleLeave(ws, data) {
  const { roomId } = data
  const clientId = ws.clientId

  const room = rooms.get(roomId)
  if (!room) return

  // 从房间移除
  room.delete(ws)

  // 通知其他成员
  broadcastToRoom(roomId, clientId, {
    action: 'peer-left',
    roomId,
    clientId
  })

  // 清理空房间
  if (room.size === 0) {
    rooms.delete(roomId)
    console.log(`[ROOM] Room ${roomId} deleted (empty)`)
  }

  console.log(
    `[LEAVE] Client ${clientId} left room ${roomId}, remaining: ${room.size}`
  )

  ws.roomId = null
}

/**
 * 处理信令消息转发
 */
function handleSignal(ws, data) {
  const { roomId, to, type, data: signalData } = data
  const clientId = ws.clientId

  // 验证客户端在房间内
  if (ws.roomId !== roomId) {
    ws.send(
      JSON.stringify({
        action: 'error',
        message: 'Not in this room'
      })
    )
    return
  }

  // 如果指定了目标客户端，直接转发给该客户端
  if (to) {
    const targetWs = clients.get(to)
    if (targetWs && targetWs.readyState === 1 && targetWs.roomId === roomId) {
      targetWs.send(
        JSON.stringify({
          action: 'signal',
          roomId,
          from: clientId,
          type,
          data: signalData
        })
      )
      console.log(
        `[SIGNAL] Client ${clientId} sent ${type} to ${to}`
      )
    } else {
      ws.send(
        JSON.stringify({
          action: 'error',
          message: `Target client ${to} not found or not in room`
        })
      )
    }
  } else {
    // 如果没有指定目标，广播给房间内所有其他成员
    broadcastToRoom(roomId, clientId, {
      action: 'signal',
      roomId,
      from: clientId,
      type,
      data: signalData
    })
    console.log(
      `[SIGNAL] Client ${clientId} broadcast ${type} to room ${roomId}`
    )
  }
}

/**
 * 清理断开的客户端
 */
function cleanupClient(ws) {
  const clientId = ws.clientId

  // 离开房间
  if (ws.roomId) {
    handleLeave(ws, { roomId: ws.roomId })
  }

  // 从客户端列表移除
  clients.delete(clientId)

  console.log(`[DISCONNECT] Client ${clientId} disconnected`)
}

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  // 分配客户端 ID
  const clientId = generateClientId()
  ws.clientId = clientId
  ws.roomId = null
  ws.name = null

  clients.set(clientId, ws)
  console.log(`[CONNECT] New client connected: ${clientId}`)

  // 处理消息
  ws.on('message', (message) => {
    // 解析json，并校验格式，返回校验结果和解析对象
    const validation = validateMessage(message.toString(), message.length)

    if (!validation.valid) {
      console.error(`[ERROR] Invalid message: ${validation.error}`)
      ws.send(
        JSON.stringify({
          action: 'error',
          message: validation.error
        })
      )
      return
    }

    const data = validation.data

    // 路由消息
    switch (data.action) {
      case 'join':
        handleJoin(ws, data)
        break
      case 'leave':
        handleLeave(ws, data)
        break
      case 'signal':
        handleSignal(ws, data)
        break
      default: // 未知动作，返回错误消息，提示未知动作
        ws.send(
          JSON.stringify({
            action: 'error',
            message: `Unknown action: ${data.action}`
          })
        )
    }
  })

  // 处理断开
  ws.on('close', () => {
    cleanupClient(ws)
  })

  // 处理错误
  ws.on('error', (error) => {
    console.error(`[ERROR] Client ${clientId}:`, error.message)
  })
})

console.log(`WebSocket signaling server listening on ws://localhost:${PORT}`)
console.log('Ready for connections...')
