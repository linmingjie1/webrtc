<template>
  <div class="peer-connection-container">
    <h1>WebRTC 点对点视频通话</h1>

    <div class="info-panel">
      <el-alert type="info" :closable="false" show-icon>
        <template #title>
          <span>使用说明</span>
        </template>
        <ol>
          <li>打开两个浏览器标签页,都访问此页面</li>
          <li><strong>第一个标签页</strong>：选择"呼叫者"角色</li>
          <li><strong>第二个标签页</strong>：选择"接收者"角色</li>
          <li>在第一个标签页（呼叫者）点击"开始呼叫"按钮</li>
          <li>接收者会自动收到 Offer 并处理</li>
          <li>观察信令交换日志，等待连接建立成功</li>
        </ol>
      </el-alert>
    </div>

    <!-- 视频显示区 -->
    <div class="video-section">
      <div class="video-box">
        <div class="video-label">本地视频</div>
        <video ref="localVideoRef" autoplay playsinline muted></video>
        <div v-if="!localStream" class="placeholder">等待开启摄像头</div>
      </div>

      <div class="video-box">
        <div class="video-label">远程视频</div>
        <video ref="remoteVideoRef" autoplay playsinline></video>
        <div v-if="!remoteStream" class="placeholder">等待远程连接</div>
      </div>
    </div>

    <!-- 控制面板 -->
    <div class="control-panel">
      <el-card>
        <template #header>
          <span>连接控制</span>
        </template>

        <!-- 角色选择 -->
        <div class="control-section">
          <label>选择角色：</label>
          <el-radio-group v-model="role" :disabled="isConnecting || isConnected" @change="handleRoleChange">
            <el-radio value="caller">呼叫者 (Caller)</el-radio>
            <el-radio value="callee">接收者 (Callee)</el-radio>
          </el-radio-group>
        </div>

        <!-- 连接状态 -->
        <div class="control-section">
          <label>连接状态：</label>
          <el-tag :type="connectionStatusType">
            {{ connectionStatusText }}
          </el-tag>
        </div>

        <!-- ICE 连接状态 -->
        <div class="control-section">
          <label>ICE 状态：</label>
          <el-tag :type="iceConnectionStateType">
            {{ iceConnectionState }}
          </el-tag>
        </div>

        <!-- 操作按钮 -->
        <div class="control-section">
          <el-button-group>
            <el-button type="primary" @click="startCall"
              :disabled="!role || isConnecting || isConnected || role !== 'caller'" :loading="isConnecting">
              开始呼叫
            </el-button>
            <el-button type="danger" @click="hangUp" :disabled="!isConnected && !isConnecting">
              挂断
            </el-button>
            <el-button @click="clearConnection" :disabled="isConnecting || isConnected">
              清除连接
            </el-button>
          </el-button-group>
        </div>
      </el-card>
    </div>

    <!-- 信令日志 -->
    <div class="log-panel">
      <el-card>
        <template #header>
          <div class="log-header">
            <span>信令交换日志</span>
            <el-button size="small" @click="clearLogs">清空</el-button>
          </div>
        </template>
        <div class="log-content">
          <div v-for="(log, index) in logs" :key="index" class="log-item" :class="log.type">
            <span class="log-time">[{{ log.time }}]</span>
            <span class="log-type">[{{ log.type.toUpperCase() }}]</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
          <div v-if="logs.length === 0" class="log-empty">暂无日志</div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useLogger } from './composables/useLogger'
import { useConnectionState } from './composables/useConnectionState'
import { useMedia } from './composables/useMedia'
import { useSignaling } from './composables/useSignaling'
import { usePeerConnection } from './composables/usePeerConnection'

// ========== 初始化各个功能模块 ==========
// 日志管理
const { logs, addLog, clearLogs } = useLogger()

// 连接状态管理
const {
  role,
  isConnecting,
  isConnected,
  iceConnectionState,
  connectionStatusText,
  connectionStatusType,
  iceConnectionStateType,
  resetConnectionState
} = useConnectionState()

// 媒体流管理
const {
  localVideoRef,
  remoteVideoRef,
  localStream,
  remoteStream,
  getLocalStream,
  addRemoteTrack,
  stopLocalStream,
  clearRemoteStream
} = useMedia(addLog)

// 信令通道管理（先初始化，稍后设置消息处理器）
let peerConnectionHandlers = null
const handleSignalingMessage = async (type, data) => {
  if (!peerConnectionHandlers) return

  switch (type) {
    case 'offer':
      await peerConnectionHandlers.handleOffer(data)
      break
    case 'answer':
      await peerConnectionHandlers.handleAnswer(data)
      break
    case 'ice-candidate':
      await peerConnectionHandlers.handleIceCandidate(data)
      break
    case 'hangup':
      peerConnectionHandlers.handleRemoteHangup()
      break
    default:
      console.warn('未知的信令类型:', type)
  }
}

const { initSignalingChannel, sendSignaling, closeSignalingChannel } =
  useSignaling(addLog, handleSignalingMessage)

// PeerConnection 管理（使用已初始化的 sendSignaling）
peerConnectionHandlers = usePeerConnection(
  addLog,
  sendSignaling,
  { role, isConnecting, isConnected, iceConnectionState, resetConnectionState },
  { addRemoteTrack, stopLocalStream, clearRemoteStream },
  getLocalStream
)

const { startCall, hangUp } = peerConnectionHandlers

// ========== UI 事件处理 ==========
/**
 * 清除连接
 */
const clearConnection = () => {
  hangUp()
  clearLogs()
  ElMessage.info('已清除连接')
}

/**
 * 角色切换
 */
const handleRoleChange = () => {
  addLog('info', `切换角色: ${role.value}`)
}

// ========== 生命周期 ==========
onMounted(() => {
  // 检查浏览器支持
  if (!('RTCPeerConnection' in window)) {
    ElMessage.error('您的浏览器不支持 WebRTC')
    addLog('error', '浏览器不支持 WebRTC')
    return
  }

  if (!('BroadcastChannel' in window)) {
    ElMessage.error('您的浏览器不支持 BroadcastChannel API')
    addLog('error', '浏览器不支持 BroadcastChannel API')
    return
  }

  initSignalingChannel()
  addLog('info', 'mounted->页面加载完成，请选择角色')
})

onUnmounted(() => {
  hangUp()
  closeSignalingChannel()
})
</script>

<style scoped lang="scss">
@use './main.scss';
</style>
