import { ref } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * 媒体流管理 Composable
 * 负责本地和远程媒体流的获取、管理和播放
 */
export function useMedia(addLog) {
  const localVideoRef = ref(null)
  const remoteVideoRef = ref(null)
  const localStream = ref(null)
  const remoteStream = ref(null)

  /**
   * 获取本地媒体流（摄像头+麦克风）
   * @returns {Promise<MediaStream>}
   */
  const getLocalStream = async () => {
    try {
      addLog('info', '正在获取本地媒体流...')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // ideal 表示"理想值/偏好值"，浏览器会尽量满足
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: {
          echoCancellation: true, // 回声消除
          noiseSuppression: true, // 噪声抑制
          autoGainControl: true // 自动增益
        }
      })

      localStream.value = stream
      if (localVideoRef.value) {
        localVideoRef.value.srcObject = stream
      }

      addLog('success', '本地媒体流获取成功')
      ElMessage.success('摄像头已开启')

      return stream
    } catch (error) {
      addLog('error', `获取媒体流失败: ${error.message}`)
      ElMessage.error(`获取摄像头失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 设置远程媒体流
   * @param {MediaStreamTrack} track - 远程媒体轨道
   */
  const addRemoteTrack = (track) => {
    addLog('success', `收到远程媒体轨道: ${track.kind}`)

    if (!remoteStream.value) {
      remoteStream.value = new MediaStream()
    }

    remoteStream.value.addTrack(track)

    if (remoteVideoRef.value) {
      remoteVideoRef.value.srcObject = remoteStream.value
    }
  }

  /**
   * 停止本地媒体流
   */
  const stopLocalStream = () => {
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => {
        track.stop()
        addLog('info', `停止本地轨道: ${track.kind}`)
      })
      localStream.value = null
    }

    if (localVideoRef.value) {
      localVideoRef.value.srcObject = null
    }
  }

  /**
   * 清空远程媒体流
   */
  const clearRemoteStream = () => {
    // 停止所有远程轨道
    if (remoteStream.value) {
      remoteStream.value.getTracks().forEach((track) => {
        track.stop()
        addLog('info', `停止远程轨道: ${track.kind}`)
      })
      remoteStream.value = null
    }

    if (remoteVideoRef.value) {
      remoteVideoRef.value.srcObject = null
    }
  }

  return {
    localVideoRef,
    remoteVideoRef,
    localStream,
    remoteStream,
    getLocalStream,
    addRemoteTrack,
    stopLocalStream,
    clearRemoteStream
  }
}
