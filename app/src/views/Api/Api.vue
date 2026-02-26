<template>
  <div class="api-demo">
    <h1>API 测试</h1>

    <el-button @click="api.MediaDevices.enumerateDevices" type="primary">enumerateDevices测试</el-button>
    <el-button @click="api.MediaDevices.getSupportedConstraints" type="primary">getSupportedConstraints测试</el-button>
    <el-button @click="api.MediaDevices.getUserMedia" type="primary">getUserMedia测试</el-button>
  </div>

</template>

<script setup>
import * as api from '../../api';
</script>

<style scoped lang="scss">
.api-demo {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;

  h1 {
    text-align: center;
    margin-bottom: 30px;
    font-size: 24px;
    font-weight: 500;
  }
}
</style>