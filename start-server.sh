#!/bin/bash

# WebRTC 学习项目启动脚本

echo "==================================="
echo "WebRTC 多人 Mesh 通话 - 启动脚本"
echo "==================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo ""

# 启动信令服务器
echo "📡 启动信令服务器..."
cd server

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装服务器依赖..."
    pnpm install
fi

# 启动服务器
echo "🚀 启动 WebSocket 信令服务器 (ws://localhost:8787)..."
pnpm start &
SERVER_PID=$!

cd ..

echo ""
echo "==================================="
echo "✅ 信令服务器已启动 (PID: $SERVER_PID)"
echo ""
echo "接下来请执行以下步骤："
echo ""
echo "1. 打开新的终端窗口"
echo "2. 进入 app 目录: cd app"
echo "3. 启动前端应用: pnpm run dev"
echo "4. 在浏览器中访问: http://localhost:5173/pc-server"
echo ""
echo "要停止信令服务器，请按 Ctrl+C"
echo "==================================="

# 等待退出信号
wait $SERVER_PID
