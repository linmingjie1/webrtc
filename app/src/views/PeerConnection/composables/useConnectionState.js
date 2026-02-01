import { ref, computed } from 'vue'

/**
 * 连接状态管理 Composable
 * 负责管理连接状态、ICE 状态和角色信息
 */
export function useConnectionState() {
  const role = ref('') // 'caller' 或 'callee'
  const isConnecting = ref(false)
  const isConnected = ref(false)
  const iceConnectionState = ref('new')

  // 连接状态文本
  const connectionStatusText = computed(() => {
    if (isConnected.value) return '已连接'
    if (isConnecting.value) return '连接中'
    return '未连接'
  })

  // 连接状态类型（用于 UI 显示）
  const connectionStatusType = computed(() => {
    if (isConnected.value) return 'success'
    if (isConnecting.value) return 'warning'
    return 'info'
  })

  // ICE 连接状态类型（用于 UI 显示）
  const iceConnectionStateType = computed(() => {
    const state = iceConnectionState.value
    if (state === 'connected' || state === 'completed') return 'success'
    if (state === 'checking' || state === 'new') return 'warning'
    if (state === 'disconnected' || state === 'failed' || state === 'closed')
      return 'danger'
    return 'info'
  })

  /**
   * 重置所有连接状态
   */
  const resetConnectionState = () => {
    isConnecting.value = false
    isConnected.value = false
    iceConnectionState.value = 'new'
  }

  return {
    role,
    isConnecting,
    isConnected,
    iceConnectionState,
    connectionStatusText,
    connectionStatusType,
    iceConnectionStateType,
    resetConnectionState
  }
}
