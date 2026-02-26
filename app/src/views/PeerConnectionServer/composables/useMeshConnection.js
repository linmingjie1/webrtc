import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

// STUN 服务器配置
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

/**
 * Mesh 多人连接管理 Composable
 * 为每个远端 peer 维护独立的 RTCPeerConnection
 */
export function useMeshConnection(addLog, sendSignal, getLocalStreamFn) {
  // 房间内的所有 peers（不包括自己）
  const peers = ref(new Map())

  // 每个 peer 的 RTCPeerConnection
  const pcs = ref(new Map())

  // 每个 peer 的远程媒体流
  const remoteStreams = ref(new Map())

  // 缓存的 ICE 候选（按 peerId）
  const pendingIce = ref(new Map())

  // 本地媒体流
  const localStream = ref(null)

  // 是否已准备好本地媒体
  const isMediaReady = computed(() => localStream.value !== null)

  /**
   * 向指定 peer 发送信令
   */
  const sendSignalToPeer = (peerId, type, data) => {
    sendSignal(type, data, peerId)
  }

  /**
   * 设置本地媒体流
   */
  const setLocalStream = async () => {
    try {
      const stream = await getLocalStreamFn()
      localStream.value = stream
      addLog('success', '本地媒体流已准备就绪')

      // 为所有已存在的 PeerConnection 添加本地轨道并重新协商
      for (const [peerId, pc] of pcs.value.entries()) {
        try {
          const senders = pc.getSenders()
          let needsRenegotiation = false

          // 检查是否需要添加轨道
          stream.getTracks().forEach((track) => {
            const existingSender = senders.find(sender =>
              sender.track && sender.track.kind === track.kind
            )

            if (!existingSender) {
              // 添加新轨道
              pc.addTrack(track, stream)
              addLog('info', `为 ${peerId} 添加本地轨道: ${track.kind}`)
              needsRenegotiation = true
            }
          })

          // 如果添加了新轨道，需要重新协商
          if (needsRenegotiation) {
            addLog('info', `向 ${peerId} 发送重新协商的 Offer`)
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            sendSignalToPeer(peerId, 'offer', offer)
          }
        } catch (error) {
          addLog('error', `为 ${peerId} 添加轨道失败: ${error.message}`)
        }
      }

      // 如果已有 peers 但还没有建立连接，发起 offer
      peers.value.forEach((peer, peerId) => {
        if (!pcs.value.has(peerId)) {
          createPeerConnectionAndOffer(peerId)
        }
      })

      return stream
    } catch (error) {
      addLog('error', `获取本地媒体失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 创建 PeerConnection 并添加本地轨道
   */
  const createPeerConnection = (peerId) => {
    if (pcs.value.has(peerId)) {
      return pcs.value.get(peerId)
    }

    addLog('info', `为 ${peerId} 创建 PeerConnection`)
    const pc = new RTCPeerConnection(configuration)

    // 监听 ICE 候选
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addLog('info', `为 ${peerId} 收集到 ICE 候选`)
        sendSignalToPeer(peerId, 'ice-candidate', event.candidate)
      }
    }

    // 监听连接状态
    pc.oniceconnectionstatechange = () => {
      addLog('info', `与 ${peerId} 的 ICE 状态: ${pc.iceConnectionState}`)

      if (pc.iceConnectionState === 'connected') {
        ElMessage.success(`与 ${peerId} 连接成功`)
      } else if (pc.iceConnectionState === 'failed') {
        addLog('error', `与 ${peerId} 连接失败`)
        ElMessage.error(`与 ${peerId} 连接失败`)
      } else if (pc.iceConnectionState === 'disconnected') {
        addLog('warn', `与 ${peerId} 断开连接`)
      }
    }

    // 监听远程媒体轨道
    pc.ontrack = (event) => {
      addLog('success', `收到来自 ${peerId} 的媒体轨道: ${event.track.kind}`)

      if (!remoteStreams.value.has(peerId)) {
        remoteStreams.value.set(peerId, new MediaStream())
      }

      const stream = remoteStreams.value.get(peerId)
      stream.addTrack(event.track)

      // 触发响应式更新
      remoteStreams.value = new Map(remoteStreams.value)
    }

    // 添加本地媒体轨道
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.value)
        addLog('info', `为 ${peerId} 添加本地轨道: ${track.kind}`)
      })
    }

    pcs.value.set(peerId, pc)
    return pc
  }

  /**
   * 创建 PeerConnection 并发起 Offer
   */
  const createPeerConnectionAndOffer = async (peerId) => {
    try {
      const pc = createPeerConnection(peerId)

      addLog('info', `向 ${peerId} 发送 Offer`)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      sendSignalToPeer(peerId, 'offer', offer)
      addLog('send', `已向 ${peerId} 发送 Offer`)
    } catch (error) {
      addLog('error', `向 ${peerId} 发送 Offer 失败: ${error.message}`)
    }
  }

  /**
   * 处理新 peer 加入
   */
  const handlePeerJoined = (peer) => {
    const { clientId: peerId, name } = peer

    addLog('info', `新用户加入: ${name || peerId}`)
    peers.value.set(peerId, { name, joinedAt: Date.now() })

    // 如果本地媒体已就绪，立即发起 offer
    if (isMediaReady.value) {
      createPeerConnectionAndOffer(peerId)
    } else {
      addLog('info', `本地媒体未就绪，等待开启后再连接 ${peerId}`)
    }
  }

  /**
   * 处理 peer 离开
   */
  const handlePeerLeft = (peerId) => {
    addLog('info', `用户离开: ${peerId}`)

    // 关闭 PeerConnection
    const pc = pcs.value.get(peerId)
    if (pc) {
      pc.close()
      pcs.value.delete(peerId)
    }

    // 清理远程流
    const stream = remoteStreams.value.get(peerId)
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      remoteStreams.value.delete(peerId)
      remoteStreams.value = new Map(remoteStreams.value)
    }

    // 清理缓存的 ICE
    pendingIce.value.delete(peerId)

    // 从 peers 列表移除
    peers.value.delete(peerId)

    ElMessage.info(`${peerId} 已离开`)
  }

  /**
   * 处理收到的 Offer
   */
  const handleOffer = async (from, offer) => {
    try {
      addLog('info', `收到来自 ${from} 的 Offer`)

      // 即使本地媒体未就绪，也要建立连接以接收对方的媒体流
      const pc = createPeerConnection(from)
      await pc.setRemoteDescription(new RTCSessionDescription(offer))

      // 处理缓存的 ICE 候选
      await flushPendingIce(from)

      // 创建并发送 Answer
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      sendSignalToPeer(from, 'answer', answer)
      addLog('send', `已向 ${from} 发送 Answer${!isMediaReady.value ? '（本地媒体未就绪，仅接收模式）' : ''}`)
    } catch (error) {
      addLog('error', `处理来自 ${from} 的 Offer 失败: ${error.message}`)
    }
  }

  /**
   * 处理收到的 Answer
   */
  const handleAnswer = async (from, answer) => {
    try {
      addLog('info', `收到来自 ${from} 的 Answer`)

      const pc = pcs.value.get(from)
      if (!pc) {
        addLog('error', `未找到 ${from} 的 PeerConnection`)
        return
      }

      await pc.setRemoteDescription(new RTCSessionDescription(answer))

      // 处理缓存的 ICE 候选
      await flushPendingIce(from)

      addLog('success', `已处理来自 ${from} 的 Answer`)
    } catch (error) {
      addLog('error', `处理来自 ${from} 的 Answer 失败: ${error.message}`)
    }
  }

  /**
   * 处理收到的 ICE 候选
   */
  const handleIceCandidate = async (from, candidate) => {
    const pc = pcs.value.get(from)

    if (!pc || !pc.remoteDescription) {
      // PeerConnection 不存在或远程描述未设置，缓存 ICE
      if (!pendingIce.value.has(from)) {
        pendingIce.value.set(from, [])
      }
      pendingIce.value.get(from).push(candidate)
      addLog('info', `缓存来自 ${from} 的 ICE 候选`)
      return
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
      addLog('info', `已添加来自 ${from} 的 ICE 候选`)
    } catch (error) {
      addLog('error', `添加来自 ${from} 的 ICE 候选失败: ${error.message}`)
    }
  }

  /**
   * 处理收到的 Hangup
   */
  const handleHangup = (from) => {
    addLog('info', `${from} 挂断了连接`)

    // 关闭 PeerConnection
    const pc = pcs.value.get(from)
    if (pc) {
      pc.close()
      pcs.value.delete(from)
    }

    // 清理远程流
    const stream = remoteStreams.value.get(from)
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      remoteStreams.value.delete(from)
      remoteStreams.value = new Map(remoteStreams.value)
    }

    // 清理缓存的 ICE
    pendingIce.value.delete(from)

    // 注意：不从 peers 列表移除，因为对方可能只是暂时挂断，还在房间里
    // 只有收到 peer-left 消息时才真正移除

    ElMessage.info(`${from} 挂断了连接`)
  }

  /**
   * 清空指定 peer 的缓存 ICE 候选
   */
  const flushPendingIce = async (peerId) => {
    const candidates = pendingIce.value.get(peerId)
    if (!candidates || candidates.length === 0) return

    const pc = pcs.value.get(peerId)
    if (!pc) return

    addLog('info', `处理来自 ${peerId} 的 ${candidates.length} 个缓存 ICE 候选`)

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        addLog('error', `添加缓存 ICE 失败: ${error.message}`)
      }
    }

    pendingIce.value.delete(peerId)
  }

  /**
   * 挂断所有连接
   */
  const hangupAll = () => {
    addLog('info', '挂断所有连接')

    // 向每个 peer 发送 hangup 信令
    pcs.value.forEach((pc, peerId) => {
      sendSignalToPeer(peerId, 'hangup', {})
      pc.close()
      addLog('info', `已关闭与 ${peerId} 的连接`)
    })
    pcs.value.clear()

    // 停止所有远程流
    remoteStreams.value.forEach((stream, peerId) => {
      stream.getTracks().forEach(track => track.stop())
    })
    remoteStreams.value.clear()

    // 停止本地流
    if (localStream.value) {
      localStream.value.getTracks().forEach(track => track.stop())
      localStream.value = null
    }

    // 清空缓存的 ICE 候选
    pendingIce.value.clear()

    // 注意：不清空 peers 列表，因为房间内的成员还在
    // 这样重新开启媒体时，可以继续与房间内的成员建立连接
  }

  /**
   * 清理所有资源（断开 socket 连接时调用，彻底重置）
   */
  const cleanup = () => {
    hangupAll()
    // 断开连接时彻底清空 peers 列表
    peers.value.clear()
  }

  return {
    peers,
    pcs,
    remoteStreams,
    localStream,
    isMediaReady,
    setLocalStream,
    handlePeerJoined,
    handlePeerLeft,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleHangup,
    hangupAll,
    cleanup
  }
}
