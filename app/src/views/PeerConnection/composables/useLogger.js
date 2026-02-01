import { ref } from 'vue'

/**
 * 日志管理 Composable
 * 负责记录和管理应用日志
 */
export function useLogger() {
  const logs = ref([])

  /**
   * 添加日志
   * @param {string} type - 日志类型：info, success, error, warn, send, receive
   * @param {string} message - 日志消息
   * @param {any[]} rest - 额外的控制台输出参数
   */
  const addLog = (type, message, ...rest) => {
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    logs.value.push({ type, message, time })
    console.log(`[${type.toUpperCase()}] ${message}`, ...rest)
  }

  /**
   * 清空所有日志
   */
  const clearLogs = () => {
    logs.value = []
  }

  return {
    logs,
    addLog,
    clearLogs
  }
}
