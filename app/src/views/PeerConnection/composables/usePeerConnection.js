import { ref } from 'vue'
import { ElMessage } from 'element-plus'

// STUN 服务器配置
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

/**
 * PeerConnection 管理 Composable
 * 负责 RTCPeerConnection 的创建、信令处理和连接管理
 */
export function usePeerConnection(
  addLog,
  sendSignaling,
  connectionState,
  mediaHandlers,
  getLocalStreamFn
) {
  const peerConnection = ref(null)
  const pendingIceCandidates = ref([])

  /**
   * 创建 PeerConnection
   * @param {MediaStream} localStream - 本地媒体流
   * @returns {RTCPeerConnection}
   */
  const createPeerConnection = (localStream) => {
    addLog('info', '创建 PeerConnection...')

    const pc = new RTCPeerConnection(configuration)

    // 监听 ICE 候选
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addLog('info', `收集到 ICE 候选: ${event.candidate.type}`)
        sendSignaling('ice-candidate', event.candidate)
      } else {
        addLog('info', 'ICE 候选收集完成')
      }
    }

    // 监听 ICE 连接状态变化
    pc.oniceconnectionstatechange = () => {
      connectionState.iceConnectionState.value = pc.iceConnectionState
      addLog('info', `ICE 连接状态: ${pc.iceConnectionState}`)

      if (pc.iceConnectionState === 'connected') {
        connectionState.isConnected.value = true
        connectionState.isConnecting.value = false
        ElMessage.success('连接建立成功！')
      } else if (pc.iceConnectionState === 'failed') {
        connectionState.isConnected.value = false
        connectionState.isConnecting.value = false
        pendingIceCandidates.value = []
        ElMessage.error('连接失败')

        addLog('warn', '连接失败，已自动清理，可重新呼叫')
        if (peerConnection.value) {
          peerConnection.value.close()
          peerConnection.value = null
        }
      } else if (pc.iceConnectionState === 'disconnected') {
        connectionState.isConnected.value = false
        addLog('warn', '连接已断开')
        ElMessage.warning('连接已断开')

        // 等待一段时间，如果没有恢复，自动清理
        setTimeout(() => {
          if (
            pc.iceConnectionState === 'disconnected' &&
            peerConnection.value
          ) {
            addLog('warn', '连接断开超时，自动清理')
            ElMessage.info('连接已断开，已自动清理')
            hangUp(false)
          }
        }, 5000)
      } else if (pc.iceConnectionState === 'closed') {
        connectionState.isConnected.value = false
        connectionState.isConnecting.value = false
        pendingIceCandidates.value = []
        addLog('info', '连接已关闭')
      }
    }

    // 监听远程媒体流
    pc.ontrack = (event) => {
      mediaHandlers.addRemoteTrack(event.track)
    }

    // 添加本地媒体流到 PeerConnection
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream)
        addLog('info', `添加本地轨道: ${track.kind}`)
      })
    }

    peerConnection.value = pc
    addLog('success', 'PeerConnection 创建成功')

    return pc
  }

  /**
   * 开始呼叫（Caller）
   */
  const startCall = async () => {
    if (connectionState.role.value !== 'caller') {
      ElMessage.warning('只有呼叫者可以发起呼叫')
      return
    }

    try {
      connectionState.isConnecting.value = true
      addLog('info', '========== 开始呼叫流程 ==========')

      // 1. 获取本地媒体流
      const stream = await getLocalStreamFn()

      // 2. 创建 PeerConnection
      const pc = createPeerConnection(stream)

      // 3. 创建 Offer
      addLog('info', '正在创建 Offer...')
      const offer = await pc.createOffer()

      // 4. 设置本地描述
      addLog('info', '设置本地描述 (Offer)')
      await pc.setLocalDescription(offer)

      // 5. 发送 Offer 到远端
      addLog('send', '发送 Offer 到远端')
      sendSignaling('offer', offer)

      ElMessage.success('Offer 已发送，等待接收者响应...')
    } catch (error) {
      connectionState.isConnecting.value = false
      addLog('error', `呼叫失败: ${error.message}`)
      ElMessage.error(`呼叫失败: ${error.message}`)
    }
  }

  /**
   * 处理 Offer（Callee）
   * @param {RTCSessionDescriptionInit} offer - SDP Offer
   */
  const handleOffer = async (offer) => {
    if (connectionState.role.value !== 'callee') {
      addLog('warn', '非接收者角色，忽略 Offer')
      return
    }

    try {
      connectionState.isConnecting.value = true
      addLog('info', '========== 处理 Offer 流程 ==========')

      // 1. 获取本地媒体流
      const stream = await getLocalStreamFn()

      // 2. 创建 PeerConnection
      const pc = createPeerConnection(stream)

      // 3. 设置远程描述（Offer）
      addLog('info', '设置远程描述 (Offer)')
      await pc.setRemoteDescription(new RTCSessionDescription(offer))

      // 4. 处理缓存的 ICE 候选
      await processPendingIceCandidates()

      // 5. 创建 Answer
      addLog('info', '正在创建 Answer...')
      const answer = await pc.createAnswer()

      // 6. 设置本地描述（Answer）
      addLog('info', '设置本地描述 (Answer)')
      await pc.setLocalDescription(answer)

      // 7. 发送 Answer 到远端
      addLog('send', '发送 Answer 到远端')
      sendSignaling('answer', answer)

      ElMessage.success('Answer 已发送，正在建立连接...')
    } catch (error) {
      connectionState.isConnecting.value = false
      addLog('error', `处理 Offer 失败: ${error.message}`)
      ElMessage.error(`处理 Offer 失败: ${error.message}`)
    }
  }

  /**
   * 处理 Answer（Caller）
   * @param {RTCSessionDescriptionInit} answer - SDP Answer
   */
  const handleAnswer = async (answer) => {
    if (connectionState.role.value !== 'caller') {
      addLog('warn', '非呼叫者角色，忽略 Answer')
      return
    }

    if (!peerConnection.value) {
      addLog('error', 'PeerConnection 不存在')
      return
    }

    try {
      addLog('info', '设置远程描述 (Answer)')
      await peerConnection.value.setRemoteDescription(
        new RTCSessionDescription(answer)
      )
      addLog('success', 'Answer 处理完成，等待 ICE 连接建立...')
    } catch (error) {
      addLog('error', `处理 Answer 失败: ${error.message}`)
      ElMessage.error(`处理 Answer 失败: ${error.message}`)
    }
  }

  /**
   * 处理 ICE 候选
   * @param {RTCIceCandidateInit} candidate - ICE 候选
   */
  const handleIceCandidate = async (candidate) => {
    if (!peerConnection.value) {
      // PeerConnection 还未创建，缓存 ICE 候选
      addLog('warn', 'PeerConnection 不存在，缓存 ICE 候选')
      pendingIceCandidates.value.push(candidate)
      return
    }

    try {
      await peerConnection.value.addIceCandidate(new RTCIceCandidate(candidate))
      addLog('info', `添加远程 ICE 候选: ${candidate.type || 'unknown'}`)
    } catch (error) {
      addLog('error', `添加 ICE 候选失败: ${error.message}`)
    }
  }

  /**
   * 处理缓存的 ICE 候选
   */
  const processPendingIceCandidates = async () => {
    if (pendingIceCandidates.value.length === 0) return

    addLog('info', `处理 ${pendingIceCandidates.value.length} 个缓存的 ICE 候选`)

    for (const candidate of pendingIceCandidates.value) {
      try {
        await peerConnection.value.addIceCandidate(
          new RTCIceCandidate(candidate)
        )
        addLog('info', `添加缓存的 ICE 候选: ${candidate.type || 'unknown'}`)
      } catch (error) {
        addLog('error', `添加缓存的 ICE 候选失败: ${error.message}`)
      }
    }

    // 清空缓存
    pendingIceCandidates.value = []
  }

  /**
   * 挂断连接
   * @param {boolean} sendSignal - 是否发送挂断信令
   */
  const hangUp = (sendSignal = true) => {
    addLog('info', '挂断连接')

    // 通知对方挂断
    if (
      sendSignal &&
      peerConnection.value &&
      connectionState.isConnected.value
    ) {
      sendSignaling('hangup', {})
    }

    // 停止本地媒体流
    mediaHandlers.stopLocalStream()

    // 关闭 PeerConnection
    if (peerConnection.value) {
      peerConnection.value.close()
      peerConnection.value = null
    }

    // 清空远程流
    mediaHandlers.clearRemoteStream()

    // 清空缓存的 ICE 候选
    pendingIceCandidates.value = []

    // 重置连接状态
    connectionState.resetConnectionState()

    if (sendSignal) {
      ElMessage.info('已挂断')
    }
  }

  /**
   * 处理远程挂断
   */
  const handleRemoteHangup = () => {
    addLog('info', '对方已挂断')
    ElMessage.warning('对方已挂断通话')
    hangUp(false)
  }

  return {
    peerConnection,
    createPeerConnection,
    startCall,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleRemoteHangup,
    hangUp
  }
}
