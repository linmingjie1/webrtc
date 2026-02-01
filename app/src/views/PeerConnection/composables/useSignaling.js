import { ElMessage } from 'element-plus'

/**
 * 信令通道管理 Composable
 * 负责通过 BroadcastChannel 实现标签页间的信令交换
 */
export function useSignaling(addLog, messageHandler) {
  let signalingChannel = null

  /**
   * 初始化信令通道
   */
  const initSignalingChannel = () => {
    // 使用 BroadcastChannel API 实现标签页间通信
    signalingChannel = new BroadcastChannel('webrtc-signaling')

    signalingChannel.onmessage = async (event) => {
      const { type, data } = event.data
      addLog('receive', `收到信令: ${type}`)

      try {
        /**
         * 信令消息格式（通过 BroadcastChannel 传递）：
         * - 统一结构: { type: string, data: any }
         *
         * 当前支持的信令类型：
         * - offer: 主叫发起协商（SDP Offer）
         * - answer: 被叫应答协商（SDP Answer）
         * - ice-candidate: 传递 ICE 候选
         * - hangup: 远端挂断/结束通话
         */
        await messageHandler(type, data)
      } catch (error) {
        addLog('error', `处理信令失败: ${error.message}`)
        ElMessage.error(`处理信令失败: ${error.message}`)
      }
    }

    addLog('info', '信令通道已初始化')
  }

  /**
   * 发送信令消息
   * @param {string} type - 信令类型
   * @param {any} data - 信令数据
   */
  const sendSignaling = (type, data) => {
    if (!signalingChannel) {
      addLog('error', '信令通道未初始化')
      return
    }

    // 将 WebRTC 对象转换为纯 JSON 对象，避免 DataCloneError
    let serializedData = data
    if (type === 'ice-candidate' && data) {
      serializedData = {
        candidate: data.candidate,
        sdpMLineIndex: data.sdpMLineIndex,
        sdpMid: data.sdpMid
      }
    } else if ((type === 'offer' || type === 'answer') && data) {
      serializedData = {
        type: data.type,
        sdp: data.sdp
      }
    }

    signalingChannel.postMessage({ type, data: serializedData })
    addLog('send', `发送信令: ${type}`, serializedData)
  }

  /**
   * 关闭信令通道
   */
  const closeSignalingChannel = () => {
    if (signalingChannel) {
      signalingChannel.close()
      signalingChannel = null
    }
  }

  return {
    initSignalingChannel,
    sendSignaling,
    closeSignalingChannel
  }
}
