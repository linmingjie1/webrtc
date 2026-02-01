<template>
  <div class="media-container">
    <h1>媒体设备测试</h1>

    <div class="video-wrapper">
      <video ref="videoRef" autoplay playsinline muted></video>
      <div v-if="!videoStream && !audioStream" class="placeholder">
        请点击下方按钮开启设备
      </div>
    </div>

    <div class="status">
      <el-tag :type="videoStream ? 'success' : 'info'">
        {{ videoStream ? '摄像头已开启' : '摄像头未开启' }}
      </el-tag>
      <el-tag :type="audioStream ? 'success' : 'info'">
        {{ audioStream ? '麦克风已开启' : '麦克风未开启' }}
      </el-tag>
    </div>

    <div class="controls">
      <el-button-group>
        <el-button type="primary" :icon="VideoCamera" @click="toggleVideo" :loading="videoLoading">
          {{ videoStream ? '关闭摄像头' : '开启摄像头' }}
        </el-button>
        <el-button type="primary" :icon="Microphone" @click="toggleAudio" :loading="audioLoading">
          {{ audioStream ? '关闭麦克风' : '开启麦克风' }}
        </el-button>
        <el-button type="primary" :icon="VideoPlay" @click="startBoth" :loading="videoLoading || audioLoading"
          :disabled="!!(videoStream && audioStream)">
          全部开启
        </el-button>
      </el-button-group>

      <el-button type="danger" :icon="VideoPause" @click="stopAll" :disabled="!videoStream && !audioStream">
        全部停止
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoCamera, Microphone, VideoPlay, VideoPause } from '@element-plus/icons-vue'

const videoRef = ref(null)
const videoStream = ref(null)
const audioStream = ref(null)
const videoLoading = ref(false)
const audioLoading = ref(false)

// 检查浏览器支持
const checkBrowserSupport = () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('您的浏览器不支持访问媒体设备')
  }
}

// 检测可用设备
const checkDeviceAvailability = async (deviceType) => {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const kindMap = {
    video: 'videoinput',
    audio: 'audioinput'
  }
  const hasDevice = devices.some(device => device.kind === kindMap[deviceType])

  if (!hasDevice) {
    const deviceNames = { video: '摄像头', audio: '麦克风' }
    throw new Error(`未检测到${deviceNames[deviceType]}设备`)
  }

  return devices.filter(device => device.kind === kindMap[deviceType])
}

// 格式化错误消息
const formatErrorMessage = (error, deviceType) => {
  const deviceNames = { video: '摄像头', audio: '麦克风' }
  const deviceName = deviceNames[deviceType]

  const errorMessages = {
    'NotFoundError': `未找到${deviceName}设备，请检查设备是否已连接`,
    'NotAllowedError': `权限被拒绝，请允许浏览器访问${deviceName}`,
    'NotReadableError': `${deviceName}正在被其他应用使用，请关闭其他应用后重试`,
    'OverconstrainedError': `${deviceName}不满足请求的约束条件`,
    'SecurityError': '安全错误，请确保页面在 HTTPS 或 localhost 下运行'
  }

  return errorMessages[error.name] || `获取${deviceName}失败: ${error.message}`
}

// 更新视频元素的媒体流
// 只设置视频轨道，音频轨道不需要绑定到 video 元素
const updateVideoSource = () => {
  if (!videoRef.value) return

  if (!videoStream.value) {
    videoRef.value.srcObject = null
    return
  }
  // 只设置视频流，音频流保持独立
  videoRef.value.srcObject = videoStream.value
}

// 获取视频流
const startVideo = async () => {
  try {
    checkBrowserSupport()
    videoLoading.value = true

    await checkDeviceAvailability('video')

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    })

    videoStream.value = stream
    updateVideoSource()
    ElMessage.success('摄像头已开启')

    // 监听轨道结束事件
    stream.getVideoTracks()[0].onended = () => {
      videoStream.value = null
      updateVideoSource()
      ElMessage.info('摄像头已被停止')
    }
  } catch (error) {
    console.error('获取视频流失败:', error)
    ElMessage.error(formatErrorMessage(error, 'video'))
  } finally {
    videoLoading.value = false
  }
}

// 获取音频流
const startAudio = async () => {
  try {
    checkBrowserSupport()
    audioLoading.value = true

    await checkDeviceAvailability('audio')

    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    audioStream.value = stream
    ElMessage.success('麦克风已开启')

    // 监听轨道结束事件
    stream.getAudioTracks()[0].onended = () => {
      audioStream.value = null
      ElMessage.info('麦克风已被停止')
    }
  } catch (error) {
    console.error('获取音频流失败:', error)
    ElMessage.error(formatErrorMessage(error, 'audio'))
  } finally {
    audioLoading.value = false
  }
}

// 停止视频流
const stopVideo = () => {
  if (videoStream.value) {
    videoStream.value.getTracks().forEach(track => track.stop())
    videoStream.value = null
    updateVideoSource()
    ElMessage.info('摄像头已关闭')
  }
}

// 停止音频流
const stopAudio = () => {
  if (audioStream.value) {
    audioStream.value.getTracks().forEach(track => track.stop())
    audioStream.value = null
    ElMessage.info('麦克风已关闭')
  }
}

// 切换视频
const toggleVideo = () => {
  if (videoLoading.value) return
  if (videoStream.value) {
    stopVideo()
  } else {
    startVideo()
  }
}

// 切换音频
const toggleAudio = () => {
  if (audioLoading.value) return
  if (audioStream.value) {
    stopAudio()
  } else {
    startAudio()
  }
}

// 同时开启
const startBoth = async () => {
  const promises = []
  if (!videoStream.value) promises.push(startVideo())
  if (!audioStream.value) promises.push(startAudio())
  await Promise.all(promises)
}

// 全部停止
const stopAll = () => {
  stopVideo()
  stopAudio()
}

// 组件卸载时清理资源
onUnmounted(() => {
  // 停止所有轨道，释放设备
  if (videoStream.value) {
    videoStream.value.getTracks().forEach(track => track.stop())
  }
  if (audioStream.value) {
    audioStream.value.getTracks().forEach(track => track.stop())
  }
})
</script>

<style scoped lang="scss">
.media-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;

  h1 {
    text-align: center;
    margin-bottom: 30px;
    font-size: 24px;
    font-weight: 500;
  }

  .video-wrapper {
    position: relative;
    display: flex;
    justify-content: center;
    margin-bottom: 20px;

    video {
      width: 100%;
      max-width: 640px;
      height: auto;
      aspect-ratio: 16/9;
      background-color: #000;
      border-radius: 4px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    }

    .placeholder {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #909399;
      font-size: 16px;
      text-align: center;
      pointer-events: none;
    }
  }

  .status {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-bottom: 20px;
  }

  .controls {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }
}
</style>
