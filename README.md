# AI投行专家 — 完整版

AI 智能投行辅助工具，集成 DeepSeek 大模型能力，提供行业新闻、业务机会、发行指引、一键尽调等功能。

## 功能模块

### 股权投行
- **行业新闻**：搜索 IPO、并购、新三板、股权融资等最新新闻（10条，AI实时生成）
- **业务机会**：根据 IPO辅导、新三板业绩达标、融资意向等线索，AI 搜索业务机会并显示联系方式
- **业务指引**：查询 IPO指引、信息披露、并购重组等最新监管规则
- **一键尽调**：输入公司名，AI 生成专业尽调报告（含股权结构、财务概况、风险提示、资本运作建议）

### 债权投行
- **行业新闻**：债券市场最新动态
- **业务机会**：招投标信息、项目信息、评级提升等
- **发行指引**：证监会、交易所等发布的相关法规指引
- **一键尽调**：AI 生成债券融资分析报告

### 其他功能
- 用户注册/登录/游客模式
- 每日签到 + 积分系统
- 会员等级体系
- 热搜新闻滚动条

## 技术架构

```
前端 (index.html)  →  HTTP  →  后端 API (Express, port 3001)
                                    │
                    ┌───────────────┴───────────────┐
              DeepSeek 大模型                  SQLite 数据库
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 纯 HTML/CSS/JS（单页面应用，无框架依赖） |
| 后端 | Node.js + Express |
| 数据库 | SQLite（better-sqlite3） |
| AI 模型 | DeepSeek Chat API |
| 其他 | bcryptjs（密码加密）、cors、dotenv |

## 快速启动

### 前提条件

- Node.js 18+
- Python 3.9+（仅用于前端静态文件服务）
- DeepSeek API Key（[免费注册获取](https://platform.deepseek.com/api_keys)）

### 启动步骤

```bash
# 1. 进入项目目录
cd ai-ib-expert

# 2. 配置 API Key
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入你的 DEEPSEEK_API_KEY

# 3. 安装后端依赖
cd backend && npm install

# 4. 一键启动
cd .. && bash start.sh
```

启动后访问：
- 前端界面：http://localhost:8080
- API 接口：http://localhost:3001

### 测试账号

登录页直接注册，或使用游客模式。

## 项目结构

```
ai-ib-expert/
├── index.html              # 前端界面（完整）
├── start.sh                # 一键启动脚本
├── backend/
│   ├── server.js           # API 服务（认证/会员/债权/股权接口）
│   ├── ai.js               # AI 交互层（prompt 模板 + LLM 调用）
│   ├── database.js         # 数据库层（SQLite 迁移 + 连接）
│   ├── news-fetcher.js     # 新闻抓取工具
│   ├── package.json        # 依赖配置
│   ├── .env.example        # 环境变量模板
│   └── data/               # SQLite 数据库文件
└── outputs/                # 演示版文件
```

## API 接口一览

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录 |
| POST | /api/auth/register | 注册 |
| POST | /api/auth/guest | 游客登录 |

### 会员
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/membership/checkin | 签到 |
| GET | /api/membership/status | 会员状态 |

### 股权投行
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/equity/news | 股权行业新闻 |
| GET | /api/equity/opportunities | 股权业务机会 |
| GET | /api/equity/guidelines | 股权业务指引 |
| POST | /api/equity/due-diligence | 股权一键尽调 |

### 债权投行
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/debt/news | 债权行业新闻 |
| GET | /api/debt/opportunities | 债权业务机会 |
| GET | /api/debt/opportunities/detail | 机会详情（含联系方式） |
| GET | /api/debt/guidelines | 债权发行指引 |
| POST | /api/debt/due-diligence | 债权一键尽调 |
| GET | /api/debt/hot-news | 热搜新闻 |

## 二次开发说明

### 前端
`index.html` 是单页应用，所有 CSS 和 JS 都在一个文件中。
- 搜索 `API_BASE` 找到后端配置
- 搜索 `function show` 找到各功能函数
- 搜索 `MOCK_` 找到本地降级数据

### 后端
- `server.js`：路由和控制器，按业务模块划分
- `ai.js`：所有 AI prompt 模板在 `PROMPTS` 对象中
- `database.js`：数据库迁移和连接

### 替换大模型
修改 `backend/ai.js` 中的 `apiConfig` 配置即可对接其他模型：
```javascript
const apiConfig = {
  apiKey: process.env.YOUR_API_KEY,
  baseUrl: 'https://api.your-model.com',
  model: 'your-model-name',
};
```
