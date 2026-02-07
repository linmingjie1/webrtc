import { ref } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * WebSocket 信令通道管理 Composable
 * 负责与信令服务器的 WebSocket 连接和消息处理
 */
export function useWebSocketSignaling(addLog, messageHandler) {
  const ws = ref(null)
  const clientId = ref(null)
  const isConnected = ref(false)
  const currentRoomId = ref(null)
  const serverUrl = ref('ws://localhost:8787')

  /**
   * 连接到信令服务器
   */
  const connect = () => {
    return new Promise((resolve, reject) => {
      try {
        addLog('info', `连接信令服务器: ${serverUrl.value}`)
        
        const socket = new WebSocket(serverUrl.value)

        socket.onopen = () => {
          addLog('success', '信令服务器连接成功')
          isConnected.value = true
          ws.value = socket
          ElMessage.success('已连接到信令服务器')
          resolve()
        }

        socket.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data)
            addLog('receive', `收到消息: ${message.action}`, message)

            // 处理 joined 消息，获取 clientId
            if (message.action === 'joined') {
              clientId.value = message.clientId
              addLog('success', `分配的客户端 ID: ${clientId.value}`)
            }

            // 调用消息处理器
            await messageHandler(message)
          } catch (error) {
            addLog('error', `处理消息失败: ${error.message}`)
          }
        }

        socket.onerror = (error) => {
          addLog('error', 'WebSocket 错误')
          console.error('WebSocket error:', error)
          ElMessage.error('信令服务器连接错误')
          reject(error)
        }

        socket.onclose = () => {
          addLog('warn', '信令服务器连接已断开')
          isConnected.value = false
          ws.value = null
          clientId.value = null
          ElMessage.warning('信令服务器连接已断开')
        }
      } catch (error) {
        addLog('error', `连接失败: ${error.message}`)
        reject(error)
      }
    })
  }

  /**
   * 断开连接
   */
  const disconnect = () => {
    if (ws.value) {
      ws.value.close()
      ws.value = null
      isConnected.value = false
      clientId.value = null
      currentRoomId.value = null
      addLog('info', '已断开信令服务器连接')
    }
  }

  /**
   * 加入房间
   */
  const joinRoom = (roomId, name) => {
    if (!ws.value || !isConnected.value) {
      ElMessage.error('请先连接到信令服务器')
      return
    }

    const message = {
      action: 'join',
      roomId,
      name: name || undefined
    }

    ws.value.send(JSON.stringify(message))
    currentRoomId.value = roomId
    addLog('send', `加入房间: ${roomId}`, message)
  }

  /**
   * 离开房间
   */
  const leaveRoom = () => {
    if (!ws.value || !currentRoomId.value) {
      return
    }

    const message = {
      action: 'leave',
      roomId: currentRoomId.value
    }

    ws.value.send(JSON.stringify(message))
    addLog('send', `离开房间: ${currentRoomId.value}`)
    currentRoomId.value = null
  }

  /**
   * 发送信令消息
   * @param {string} type - 信令类型 (offer, answer, ice-candidate, hangup)
   * @param {object} data - 信令数据
   * @param {string} to - 目标客户端 ID（可选，不指定则广播）
   */
  const sendSignal = (type, data, to) => {
    if (!ws.value || !currentRoomId.value) {
      addLog('error', '未连接或未加入房间')
      return
    }

    const message = {
      action: 'signal',
      roomId: currentRoomId.value,
      type,
      data
    }

    // 如果指定了目标客户端，添加 to 字段
    if (to) {
      message.to = to
    }

    ws.value.send(JSON.stringify(message))
    addLog('send', `发送信令: ${type}${to ? ` -> ${to}` : ' (广播)'}`)
  }

  return {
    ws,
    clientId,
    isConnected,
    currentRoomId,
    serverUrl,
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    sendSignal
  }
}
