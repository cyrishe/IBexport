# AI投行专家 — 部署说明

## 环境要求
- Node.js >= 18
- npm

## 快速部署

### 1. 安装依赖
```bash
cd backend
npm install
```

### 2. 配置 API Key（可选）
编辑 `backend/.env`，确认 DeepSeek API Key 已配置：
```
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
PORT=3001
```

### 3. 启动服务
```bash
cd backend
node server.js
```

访问 http://localhost:3001

## 生产部署建议

### 使用 PM2 守护进程
```bash
npm install -g pm2
cd backend
pm2 start server.js --name ai-ib-expert
pm2 save
pm2 startup
```

### 使用 Nginx 反向代理（可选）
```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

### 目录结构
```
├── index.html          # 前端页面
├── assets/
│   └── qrcode.png      # 广告栏二维码
└── backend/
    ├── server.js        # Express 服务端
    ├── ai.js            # AI 调用模块（DeepSeek）
    ├── write-report.js  # 尽调报告生成模块
    ├── database.js      # SQLite 数据库
    ├── package.json     # 依赖配置
    └── .env             # 环境变量（含API Key）
```

## 端口
- 默认端口: 3001
- 如需修改，编辑 backend/.env 中的 PORT 变量
