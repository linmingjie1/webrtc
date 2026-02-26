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
    /*
        RTCPeerConnection 是 WebRTC 里负责建立点对点音视频/数据连接的核心对象。
        主要负责：
          - 在两个终端之间协商连接参数（SDP：编解码、网络能力等）
          - 借助 ICE/STUN/TURN 打洞和连通性检测，尽量直连，必要时走中继
          - 传输媒体流（摄像头/麦克风）和可选的数据通道（RTCDataChannel）
          - 处理连接状态变化（连接中、已连接、断开、失败）
          - 支持加密传输（DTLS/SRTP），保证通信安全

      https://developer.mozilla.org/zh-CN/docs/Web/API/RTCPeerConnection/RTCPeerConnection
    */
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
      /*
      设置当前连接方案（offer），并基于该方案收集可用的 ICE 候选地址。
      offer 是 SDP 描述，包含了媒体类型、编解码器、网络传输信息等。

      在你把 local description 设进去之后，浏览器才知道“这次连接该怎么建”，于是开始 ICE candidate 收集（打洞/找路径），
      每收集到一个 candidate 就触发一次 icecandidate 事件，让你通过信令发给对端。
      */
      await pc.setLocalDescription(offer)

      /*
      Trickle ICE 做法：
        1. 先发 SDP offer：先把“会话规则”定下来（媒体类型、编解码、DTLS、ICE 参数等）
        2. 再陆续发 candidate（触发 onicecandidate 事件）：候选地址边发现边通知，对端边加边尝试连通

        offer/answer ：先约定“我们怎么传输（协议与能力）”。如 ICE ufrag/pwd、媒体与传输参数
        candidate ：在这个约定下提供可尝试的连通候选（候选传输地址/候选连通端点）”。如 host/srflx/relay 等候选地址
      */
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
      /*
        1. 确认对端能力与参数：媒体方向、编解码、BUNDLE、DTLS、ICE ufrag/pwd 等
        2. 让本地进入正确信令状态：从 stable 进入 have-remote-offer，这样后面才能 createAnswer()
        3. 为后续 ICE 建立上下文：之后 addIceCandidate() 才知道这些 candidate 属于哪条 m-line/哪个会话
        4. 触发协商相关流程：本地据此生成匹配的 Answer，并开始/继续连通性检查
      */
      await pc.setRemoteDescription(new RTCSessionDescription(offer))

      // 处理缓存的 ICE 候选
      await flushPendingIce(from)

      // 创建并发送 Answer
      const answer = await pc.createAnswer()
      /*
        1. 信令状态收敛：从 have-remote-offer 进入 stable，这轮 O/A 协商在本端完成。
        2. 启动/继续 ICE 流程：浏览器开始或继续收集本地 candidate，触发 onicecandidate，你这边会通过信令发给对端。
        3. 开始连通性检查：结合已设置的远端 offer（含 ICE 参数）和后续双方 candidate，进行 ICE connectivity checks。
        4. 媒体/传输参数生效：answer 里确认后的编解码、方向（sendrecv/recvonly 等）、DTLS 参数被应用到连接。
        5. 等待对端确认完成闭环：你发送 answer 后，对端还要 setRemoteDescription(answer)，随后两边 ICE 检查通过才会进入 connected/completed。
        6. 后续事件推进：常见会看到 iceConnectionState 事件从 checking -> connected，媒体到达时触发 ontrack 事件。
       */
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
    /*
    找到->为对端创建的 PeerConnection 实例，即调用了 setRemoteDescription 的那个 RTCPeerConnection 实例
    */
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
      /*
      添加对方发来的 ICE candidate

      ICE 连接需要两类信息：
        - 本地 candidate（你自己收集的，发给对方）
        - 远端 candidate（对方收集的，你收到后 addIceCandidate）

      addIceCandidate 的作用就是：
        - 把“对端发现的候选网络地址”喂给本地 ICE Agent，让它有更多可尝试的路径去做 connectivity checks

        表示连通性进展/结果的是状态变化 (oniceconnectionstatechange 事件)：
          iceConnectionState: 'checking'（正在测）
          iceConnectionState: 'connected' 或 'completed'（测通了）
          iceConnectionState: 'failed'（没测通）
      */
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
   *
   * 是为了解决 ICE candidate 先到、SDP 后到 的时序问题：
   *   你先收到对端 ice-candidate，但此时本地 pc 还没 setRemoteDescription，这时直接 addIceCandidate 往往会失败（或不安全）
   *
   * 原因：
   *  1. Trickle ICE 天生并行：对端一旦 setLocalDescription(offer/answer)，就会持续产出 candidate；offer 和后续 candidate 都是独立消息，异步发送。
   *  2. 网络层乱序：即使同一条 WebSocket 连接通常保序，实际还有服务端转发、事件循环调度、客户端异步 await 处理等因素，导致你“处理”消息时顺序可能变化。
   *  3. 本地准备慢于消息到达：你收到 offer 后要 createPeerConnection、setRemoteDescription，这段是异步，这期间 candidate 可能已经到并触发了 handleIceCandidate。
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
