<script setup>
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const menuItems = [
  { path: '/media', title: '媒体设备测试' },
  { path: '/peer-connection', title: '点对点连接' },
]

const handleMenuClick = (path) => {
  router.push(path)
}
</script>

<template>
  <div id="app">
    <div class="app-header">
      <div class="header-content">
        <h1 class="logo">WebRTC 学习</h1>
        <el-menu :default-active="route.path" mode="horizontal" @select="handleMenuClick" class="nav-menu">
          <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
            {{ item.title }}
          </el-menu-item>
        </el-menu>
      </div>
    </div>
    <div class="app-main">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
#app {
  min-height: 100vh;
  background-color: #f5f7fa;
}

.app-header {
  background-color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.logo {
  font-size: 20px;
  font-weight: 600;
  color: #409eff;
  margin: 0;
  white-space: nowrap;
}

.nav-menu {
  flex: 1;
  border-bottom: none;
}

.app-main {
  min-height: calc(100vh - 60px);
}
</style>
