<template>
  <div class="peer-connection-server-view">
    <!-- 标题居中 -->
    <h1>WebRTC 多人 Mesh 通话（WebSocket 信令）</h1>

    <div class="content">
      <!-- 左侧：操作栏 -->
      <div class="left-panel">
        <el-card class="operation-card">
          <template #header>
            <div class="card-header">
              <span>操作面板</span>
            </div>
          </template>

          <!-- 连接配置 -->
          <div class="section">
            <div class="section-title">连接配置</div>
            <el-form label-width="100px" size="large" label-position="top">
              <el-form-item label="服务器地址">
                <el-input v-model="serverUrl" placeholder="ws://localhost:8787" :disabled="isConnected" />
              </el-form-item>

              <el-form-item label="房间 ID">
                <el-input v-model="roomId" placeholder="demo" :disabled="isConnected" />
              </el-form-item>

              <el-form-item label="昵称">
                <el-input v-model="userName" placeholder="可选" :disabled="isConnected" />
              </el-form-item>

              <el-form-item>
                <el-button v-if="!isConnected" type="primary" @click="handleConnect" :loading="isConnecting"
                  size="large" style="width: 100%">
                  连接并加入房间
                </el-button>
                <el-button v-else type="danger" @click="handleDisconnect" size="large" style="width: 100%">
                  断开连接
                </el-button>
              </el-form-item>
            </el-form>
          </div>

          <el-divider />

          <!-- 连接状态 -->
          <div class="section">
            <div class="section-title">连接状态</div>
            <div class="status-list">
              <div class="status-item">
                <span class="status-label">服务器：</span>
                <el-tag :type="isConnected ? 'success' : 'info'">
                  {{ isConnected ? '已连接' : '未连接' }}
                </el-tag>
              </div>
              <div class="status-item" v-if="currentRoomId">
                <span class="status-label">房间：</span>
                <el-tag type="success">{{ currentRoomId }}</el-tag>
              </div>
              <div class="status-item" v-if="clientId">
                <span class="status-label">客户端 ID：</span>
                <el-tag type="primary">{{ clientId }}</el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">房间人数：</span>
                <el-tag type="info">{{ peers.size + 1 }}</el-tag>
              </div>
            </div>
          </div>

          <el-divider />

          <!-- 媒体控制 -->
          <div class="section">
            <div class="section-title">媒体控制</div>
            <div class="button-group">
              <el-button type="success" size="large" @click="handleStartMedia" :disabled="!isConnected || isMediaReady"
                style="width: 100%">
                {{ isMediaReady ? '媒体已就绪' : '开启本地媒体' }}
              </el-button>

              <el-button type="warning" size="large" @click="handleHangupAll" :disabled="!isMediaReady"
                style="width: 100%">
                挂断所有连接
              </el-button>
            </div>
          </div>
        </el-card>
      </div>

      <!-- 中间：视频区 -->
      <div class="center-panel">
        <!-- 本地视频 -->
        <el-card class="video-card">
          <template #header>
            <div class="card-header">
              <span>本地视频</span>
            </div>
          </template>
          <div class="video-wrapper">
            <video ref="localVideoRef" autoplay playsinline muted class="video-element" />
            <div v-if="!isMediaReady" class="video-placeholder">
              本地视频未开启
            </div>
          </div>
        </el-card>

        <!-- 远端视频网格 -->
        <el-card class="video-card remote-video-card">
          <template #header>
            <div class="card-header">
              <span>远端视频 ({{ remoteStreams.size }})</span>
            </div>
          </template>
          <div class="remote-video-grid">
            <div v-for="[peerId, stream] in remoteStreams" :key="peerId" class="remote-video-item">
              <video :ref="el => setRemoteVideoRef(peerId, el)" autoplay playsinline class="video-element" />
              <div class="video-label">
                {{ getPeerName(peerId) }}
              </div>
            </div>
            <div v-if="remoteStreams.size === 0" class="empty-remote">
              暂无远端视频
            </div>
          </div>
        </el-card>
      </div>

      <!-- 右侧：日志区 -->
      <div class="right-panel">
        <el-card class="log-card">
          <template #header>
            <div class="card-header">
              <span>操作日志</span>
              <el-button text type="primary" @click="clearLogs" size="small">
                清空
              </el-button>
            </div>
          </template>

          <div class="log-container">
            <div v-for="(log, index) in logs" :key="index" :class="['log-item', `log-${log.type}`]">
              <span class="log-time">{{ log.time }}</span>
              <span class="log-message">{{ log.message }}</span>
            </div>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useLogger } from '../PeerConnection/composables/useLogger'
import { useWebSocketSignaling } from './composables/useWebSocketSignaling'
import { useMeshConnection } from './composables/useMeshConnection'

// 日志
const { logs, addLog, clearLogs } = useLogger()

// 本地视频 ref
const localVideoRef = ref(null)

// 配置
const serverUrl = ref(localStorage.getItem('serverUrl') || 'ws://localhost:8787')
const roomId = ref('demo')
const userName = ref('')
const isConnecting = ref(false)

// Mesh 连接管理
const meshConnection = useMeshConnection(
  addLog,
  (type, data, to) => signaling.sendSignal(type, data, to),
  async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })

    // 绑定本地视频
    if (localVideoRef.value) {
      localVideoRef.value.srcObject = stream
    }

    addLog('success', '本地媒体流获取成功')
    ElMessage.success('摄像头已开启')

    return stream
  }
)

const {
  peers,
  remoteStreams,
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
} = meshConnection

// WebSocket 信令
const signaling = useWebSocketSignaling(addLog, async (message) => {
  const { action, peers: initialPeers, peer, clientId: leftClientId, from, type, data } = message

  switch (action) {
    case 'joined': //加入房间成功
      // 加入房间成功，处理已有成员
      addLog('success', `成功加入房间，当前有 ${initialPeers.length} 人`)
      initialPeers.forEach(p => {
        peers.value.set(p.clientId, { name: p.name, joinedAt: Date.now() })
        addLog('info', `房间内成员: ${p.name || p.clientId}`)
      })

      // 如果本地媒体已就绪，立即向所有已有成员发起连接
      if (isMediaReady.value && initialPeers.length > 0) {
        addLog('info', '本地媒体已就绪，开始向房间内已有成员发起连接')
        initialPeers.forEach(p => {
          handlePeerJoined(p)
        })
      }
      break

    case 'peer-joined':
      // 新成员加入
      handlePeerJoined(peer)
      ElMessage.info(`${peer.name || peer.clientId} 加入了房间`)
      break

    case 'peer-left':
      // 成员离开
      handlePeerLeft(leftClientId)
      break

    case 'signal':
      // 处理信令消息
      switch (type) {
        case 'offer':
          await handleOffer(from, data)
          break
        case 'answer':
          await handleAnswer(from, data)
          break
        case 'ice-candidate':
          await handleIceCandidate(from, data)
          break
        case 'hangup':
          handleHangup(from)
          break
        default:
          addLog('warn', `未知的信令类型: ${type}`)
      }
      break

    case 'error':
      addLog('error', `服务器错误: ${message.message}`)
      ElMessage.error(`服务器错误: ${message.message}`)
      break
  }
})

const {
  clientId,
  isConnected,
  currentRoomId,
  connect,
  disconnect,
  joinRoom,
  leaveRoom
} = signaling

// 同步 serverUrl
watch(serverUrl, (newUrl) => {
  signaling.serverUrl.value = newUrl
})

// 连接到服务器并加入房间
const handleConnect = async () => {
  if (!roomId.value) {
    ElMessage.warning('请输入房间 ID')
    return
  }

  try {
    isConnecting.value = true
    await connect() // 连接Websocket服务器
    joinRoom(roomId.value, userName.value)
  } catch (error) {
    addLog('error', `连接失败: ${error.message}`)
    ElMessage.error('连接失败')
  } finally {
    isConnecting.value = false
  }
}

// 断开连接
const handleDisconnect = () => {
  leaveRoom() // 离开房间
  disconnect()
  cleanup()
  ElMessage.info('已断开连接')
}

// 开启本地媒体
const handleStartMedia = async () => {
  try {
    await setLocalStream()
  } catch (error) {
    addLog('error', `开启媒体失败: ${error.message}`)
  }
}

// 挂断所有连接
const handleHangupAll = () => {
  hangupAll()
  ElMessage.info('已挂断所有连接')
}

// 设置远端视频元素
const setRemoteVideoRef = (peerId, el) => {
  if (el && remoteStreams.value.has(peerId)) {
    el.srcObject = remoteStreams.value.get(peerId)
  }
}

// 获取 peer 名称
const getPeerName = (peerId) => {
  const peer = peers.value.get(peerId)
  return peer?.name || peerId
}

// 生命周期
onMounted(() => {
  addLog('info', '页面已加载')
})

onUnmounted(() => {
  handleDisconnect()
})
</script>

<style scoped lang="scss">
.peer-connection-server-view {
  padding: 10px;
  margin: 0 auto;

  // 标题居中
  h1 {
    text-align: center;
    margin: 0 0 20px 0;
    font-size: 24px;
    color: #333;
  }
}

// 左中右三栏布局
.content {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 10px;
  height: calc(100vh - 140px);
}

// 左侧操作栏
.left-panel {
  overflow-y: auto;

  .operation-card {
    height: 100%;
    display: flex;
    flex-direction: column;

    .card-header {
      font-weight: bold;
    }

    :deep(.el-card__body) {
      flex: 1;
      overflow-y: auto;
    }
  }

  .section {
    margin-bottom: 20px;

    &:last-child {
      margin-bottom: 0;
    }

    .section-title {
      font-size: 15px;
      font-weight: 600;
      color: #303133;
      margin-bottom: 15px;
    }
  }

  :deep(.el-form-item) {
    margin-bottom: 18px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(.el-divider) {
    margin: 20px 0;
  }

  .status-list {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .status-item {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .status-label {
        font-size: 14px;
        color: #606266;
      }
    }
  }

  .button-group {
    display: flex;
    flex-direction: column;
    gap: 10px;

    :deep(.el-button) {
      margin: 0;
    }
  }
}

// 中间视频区
.center-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;

  .video-card {
    flex: 1; // 让本地视频和远端视频各占一半
    display: flex;
    flex-direction: column;
    min-height: 0; // 确保 flex 子元素能正确缩小

    .card-header {
      font-weight: bold;
    }

    :deep(.el-card__body) {
      flex: 1;
      overflow-y: auto;
      min-height: 0; // 确保内容能正确缩小
    }
  }
}

// 右侧日志区
.right-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .log-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: bold;
    }

    :deep(.el-card__body) {
      flex: 1;
      overflow: hidden;
      padding: 0;
    }
  }
}

.log-container {
  height: 100%;
  overflow-y: auto;
  padding: 15px;
  font-family: 'Courier New', monospace;
  font-size: 11px;

  .log-item {
    margin-bottom: 8px;
    padding: 4px 8px;
    border-radius: 4px;

    .log-time {
      color: #909399;
      margin-right: 8px;
    }

    &.log-info {
      background-color: #f4f4f5;
    }

    &.log-success {
      background-color: #f0f9ff;
      color: #0066cc;
    }

    &.log-error {
      background-color: #fef0f0;
      color: #f56c6c;
    }

    &.log-warn {
      background-color: #fdf6ec;
      color: #e6a23c;
    }

    &.log-send {
      background-color: #f0f9ff;
      color: #409eff;
    }

    &.log-receive {
      background-color: #f0f9ff;
      color: #67c23a;
    }
  }
}

.video-wrapper {
  position: relative;
  min-width: 50%;
  height: 100%; // 改为占满整个卡片高度
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  margin: auto;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  aspect-ratio: 16 / 9;
}

.video-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  background: rgba(0, 0, 0, 0.7);
}

.remote-video-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  // height: 100%; // 确保网格占满容器高度
  overflow-y: auto; // 当视频数量多时可滚动

  .remote-video-item {
    position: relative;
    aspect-ratio: 16 / 9;
    background: #000;
    border-radius: 8px;
    overflow: hidden;

    .video-label {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 14px;
    }
  }

  .empty-remote {
    grid-column: 1 / -1;
    padding: 40px;
    text-align: center;
    color: #909399;
    font-size: 16px;
    background: #f5f7fa;
    border-radius: 8px;
  }
}
</style>
