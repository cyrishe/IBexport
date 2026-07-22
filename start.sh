#!/bin/bash
# ============================================================
# AI投行专家 — 一键启动脚本（通用版）
# 要求：Node.js 18+，Python 3.9+
# ============================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$DIR/backend"

echo "═══════════════════════════════════════════"
echo "  AI投行专家 — 启动中..."
echo "═══════════════════════════════════════════"

cleanup() {
  echo ""
  echo "正在停止服务..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID 2>/dev/null
  wait $FRONTEND_PID 2>/dev/null
  echo "已停止"
  exit 0
}
trap cleanup SIGINT SIGTERM

# 检查环境
if ! command -v node &> /dev/null; then echo "❌ 请安装 Node.js 18+"; exit 1; fi
if ! command -v python3 &> /dev/null; then echo "❌ 请安装 Python 3.9+"; exit 1; fi

# 检查 .env
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "⚠️  未发现 .env 文件，正在从 .env.example 创建..."
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  echo "⚠️  请编辑 backend/.env 填入你的 DeepSeek API Key"
  echo "⚠️  获取地址: https://platform.deepseek.com/api_keys"
fi

# 安装依赖
echo "📦 安装后端依赖..."
cd "$BACKEND_DIR"
npm install --silent 2>/dev/null

# 启动后端 API
echo "📡 启动 API 服务 (端口 3001)..."
node server.js &
BACKEND_PID=$!
sleep 2

# 启动前端静态服务
echo "🌐 启动前端服务 (端口 8080)..."
cd "$DIR"
python3 -m http.server 8080 &
FRONTEND_PID=$!

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ 启动完成！"
echo "  🌐 前端:  http://localhost:8080"
echo "  📡 API:   http://localhost:3001"
echo "  按 Ctrl+C 停止所有服务"
echo "═══════════════════════════════════════════"

wait
