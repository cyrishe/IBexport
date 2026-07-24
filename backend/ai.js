/**
 * AI投行专家 — AI 大模型交互层
 * 
 * 封装大模型 API 调用，提供统一的 prompt 执行接口。
 * 替换模型时只需修改本文件中的 apiConfig。
 * 
 * 使用：require('./ai.js')
 *   const ai = require('./ai');
 *   const result = await ai.generate('prompt', { type: 'news' });
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ================================================================
// 1. API 配置
// ================================================================

const apiConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  maxTokens: 4096,
  temperature: 0.7,
  // 是否启用流式输出（暂不支持）
  stream: false
};


// ================================================================
// 2. Prompt 模板仓库
// ================================================================

const PROMPTS = {
  /**
   * 股权投行 — 行业新闻
   * 需要实时搜索结果作为上下文
   */
  equityNews: (keyword, searchContext) => {
    var now = new Date();
    var d = new Date(now);
    d.setDate(d.getDate() - 90);
    var minD = d.toISOString().slice(0,10);
    var maxD = now.toISOString().slice(0,10);
    return `你是一位专业的投资银行分析师。用户正在查询股权投行相关的最新新闻。
  
核心关键词：IPO、并购重组、新三板、股权融资、Pre-IPO、再融资、科创板、创业板、北交所

用户搜索关键词：${keyword}

当前日期范围：${minD} 至 ${maxD}

${
  searchContext
    ? `以下是搜索到的最新相关新闻素材，请基于这些素材整理成10条新闻：\n${searchContext}`
    : `请根据你的知识，围绕上述核心关键词，生成10条当前最新的股权投行相关的新闻。日期必须在${minD}至${maxD}之间。`
}

请以JSON数组格式返回，每条新闻包含：
- id: 数字ID (从1开始递增)
- title: 新闻标题（简洁有力，包含具体机构名和数字）
- summary: 内容摘要（30-50字）
- source: 来源机构
- date: 日期（YYYY-MM-DD，必须在${minD}至${maxD}之间）
- tag: 标签（如"IPO""并购""再融资"等）

严格要求：
1. 按日期从最近到最远排序
2. 日期必须在${minD}至${maxD}之间
3. 必须生成10条

只返回JSON数组，不要加任何其他文字。`;
  },

  /**
   * 股权投行 — 业务机会
   */
  equityOpportunities: (keyword) => {
    var now = new Date();
    var d = new Date(now);
    d.setDate(d.getDate() - 30);
    var minD = d.toISOString().slice(0,10);
    var maxD = now.toISOString().slice(0,10);
    return `你是一位专业的投资银行项目经理，专注于寻找最新的股权投行业务机会。你需要从以下线索中识别和生成当前正在进行的业务机会：

线索方向：
1. 某企业刚刚启动IPO辅导备案
2. 新三板企业最新业绩披露，净利润超过2500万/年
3. 新闻报道中有企业透露即将筹备IPO
4. 新闻报道中有企业意向进行C轮融资或Pre-IPO融资
5. 上市公司公开信息披露寻求新的业务机会，推断可能存在并购或FA业务机会

用户搜索关键词：${keyword}

当前日期范围：${minD} 至 ${maxD}（严禁使用此范围之外的日期）

请根据以上线索方向和当前市场环境，生成10条最近30天内出现的最新股权投行业务机会。每条必须包含具体的时间信息。

每次生成的业务机会要求：
- 必须是${minD}之后的最新信息
- 包含真实或合理虚构的公司名称
- 业务描述要具体，说明为什么这是一个业务机会（如"刚启动IPO辅导""刚披露业绩达标""刚发布融资意向"等）

每条机会应包含：
- title: 项目名称（含公司名和项目类型）
- company: 涉及企业名称
- description: 项目描述（80-120字，说明项目背景和业务机会来源）
- type: 业务类型（"IPO辅导""新三板转板""Pre-IPO融资""并购重组""FA业务机会"等）
- amount: 预计规模
- stage: 当前阶段（"进行中""筹备中""已立项"）
- region: 地区
- date: 日期（YYYY-MM-DD，必须在${minD}至${maxD}之间）

严格要求：
1. 所有日期必须在${minD}至${maxD}之间，使用最新日期
2. 每条机会都要描述其"为什么是现在"（近期触发因素）
3. 按日期从最近到最远排序
4. 内容必须看起来像是最新发现的业务机会

只返回JSON数组，不要加任何其他文字。`;
  },

  /**
   * 股权投行 — 发行指引
   */
  equityGuidelines: (keyword) => `你是一位资深的证券法律顾问。用户正在查询股权投行相关的监管指引和法规。

用户查询关键词：${keyword}

请根据你的专业知识，生成5-8条相关的监管指引或法规摘要。
每条指引应包含：
- title: 法规/指引名称
- description: 核心内容摘要（80-120字）
- authority: 发布机构（如"证监会""交易所""发改委"等）
- category: 类别（"法规""指引""通知""办法"等）
- date: 发布日期
- status: 状态（"现行有效""征求意见中""即将实施"）

请确保信息准确，如果涉及具体条款请谨慎表述。
只返回JSON数组，不要加任何其他文字。`,

  /**
   * 股权投行 — 一键尽调
   */
  equityDD: (company) => `你是一位专业的投资银行尽职调查分析师。用户需要对以下公司进行股权投行方向的尽职调查。

公司名称：${company}

请基于公开信息和行业知识，生成一份专业的尽调报告。
报告结构请包含以下部分（每部分用HTML格式输出）：

1. 公司基本信息（行业、主营业务、成立时间、注册资本等）
2. 财务指标摘要（总资产、净资产、营收、利润、现金流等 - 合理估算）
3. 股权结构（合理推测的股权结构）
4. 业务分析（核心竞争力、市场地位）
5. 主要风险提示（行业风险、经营风险、财务风险等）
6. 综合评估（是否具备IPO/并购条件，建议的资本运作路径）

请使用以下HTML模板输出：
<div class="report-section">
  <h4 class="report-section-title">📋 标题</h4>
  <div class="report-section-content">
    <p>内容</p>
  </div>
</div>

重要：所有财务数据需标注"模拟数据，仅供参考"。
最后请加入免责声明。`,

  /**
   * 热搜新闻 — 投行/债券/金融相关的24小时内热搜标题
   * 前端滚动条使用，精简输出
   */
  hotNews: () => {
    var now = new Date();
    var d = new Date(now);
    d.setDate(d.getDate() - 1);
    var minD = d.toISOString().slice(0,10);
    var maxD = now.toISOString().slice(0,10);
    return `你是一位金融新闻编辑。请生成10条当前最热的金融/投行/债券相关新闻标题。

搜索关键词：投行 债券 金融 热搜

严格要求：
1. 标题必须简短（15-30字），适合滚动条显示
2. 日期必须在${minD}到${maxD}之间（24小时内）
3. 内容必须真实合理，包含具体机构、人物或数字
4. 涵盖范围：债券市场、IPO、并购、监管政策、央行、券商、银行、金融科技等
5. 按热度从高到低排序

请以JSON数组格式返回，每条新闻包含：
- title: 热搜标题（15-30字，简洁有力）
- url: 新闻链接（用 "https://finance.sina.com.cn/" 作为占位，留待后续替换）

只返回JSON数组，不要加任何其他文字。`;
  },

  /**
   * 债权投行 — 行业新闻（实时搜索版）
   * 输出20-30条，时间优先，3个月内，可点击查看详情
   */
  debtNews: (keyword, searchContext) => {
    var now = new Date();
    var d = new Date(now);
    d.setDate(d.getDate() - 90);
    var minD = d.toISOString().slice(0,10);
    var maxD = now.toISOString().slice(0,10);
    return `你是一位专业债券市场分析师。用户正在查询债券市场最新新闻。

核心关键词：券商固定收益业务、公司债、企业债、ABS、REITs、PPN、中期票据、短期融资券、可转债、债券承销、信用评级

用户搜索关键词：${keyword}

${
  searchContext
    ? `以下是搜索到的最新新闻素材，请据此整理：\n${searchContext}`
    : `请根据专业知识，围绕上述核心关键词，生成15条与债券业务直接相关的专业新闻。数量必须15条。`
}

严格要求：
1. 日期必须在${minD}至${maxD}之间（最近3个月内，禁止使用未来日期）
2. 按日期从最近到最远排序
3. 新闻标题必须专业、具体，包含具体机构名称和数字
4. 摘要控制在30-50字，简洁为要

请以JSON数组格式返回，每条新闻包含：
- id: 数字ID (从1开始递增)
- title: 新闻标题（必须包含具体机构名和数据）
- summary: 简短摘要（30-50字）
- source: 来源（如"证券时报""21世纪经济报道"等）
- date: 日期（YYYY-MM-DD，必须在${minD}至${maxD}之间，严禁未来日期）
- tag: 标签（如"公司债""ABS"等）

只返回JSON数组，不要加任何其他文字。`;
  },

  /**
   * 债权投行 — 业务机会
   * 包含招投标、项目信息、评级提升、债券续期等
   */
  debtOpportunities: (keyword) => {
    var now = new Date();
    var d = new Date(now);
    d.setDate(d.getDate() - 90);
    var minD = d.toISOString().slice(0,10);
    var maxD = now.toISOString().slice(0,10);
    return `你是一位专业的债券承销项目经理。用户正在查询债权投行相关的业务机会。

核心领域：券商固定收益业务、公司债、企业债、ABS、REITs、PPN（定向工具）、中期票据、短期融资券、可转债、债券承销

用户搜索关键词：${keyword}

请根据专业知识，生成15条当前真实的债权投行业务机会，类型包括：
1. 招投标信息（承销商招标）
2. 项目信息（待发行的债券项目）
3. 评级提升（企业信用评级上调）
4. 债券续期（12个月内到期的债券，需续期或借新还旧）
5. 首次发行（首次发债企业）

严格要求：
1. 日期必须在${minD}至${maxD}之间，禁止使用未来日期
2. 按日期从最近到最远排序
3. 内容必须真实合理，符合当前中国债券市场现状

每条机会应包含：
- id: 数字ID (从1开始递增)
- title: 项目名称（含公司名和债券类型）
- description: 项目描述（80-120字，说明具体信息）
- type: 业务类型（"招投标""项目信息""评级提升""债券续期""首次发行"等）
- company: 涉及企业名称
- amount: 发行/涉及规模
- date: 日期（YYYY-MM-DD，${minD}至${maxD}）
- region: 地区
- tag: 业务标签

只返回JSON数组，不要加任何其他文字。`;
  },

  /**
   * 债权投行 — 发行指引
   * 涵盖交易所、证监会、发改委等发布的法规
   */
  debtGuidelines: (keyword) => `你是一位资深的债券法律顾问。用户正在查询债权投行相关的监管指引和法规。

核心领域：公司债、企业债、ABS、REITs、PPN、中期票据、短期融资券等债券相关法规

用户查询关键词：${keyword}

请根据你的专业知识，生成15条近年来与债券业务直接相关的监管指引和法规，涵盖：
1. 证监会发布（公司债管理办法、信息披露等）
2. 交易所发布（上市规则、审核指引等）
3. 发改委发布（企业债管理规定等）
4. 交易商协会发布（债务融资工具规则等）
5. 央行/金监局发布（相关通知）

严格要求：
1. 日期从2024年至今
2. 按发布日期从最近到最远排序
3. 法规名称和内容必须准确

每条指引应包含：
- id: 数字ID (从1开始递增)
- title: 法规/指引名称（全称）
- description: 核心内容摘要（100-150字）
- authority: 发布机构（全称）
- category: 类别（"法规""指引""通知""办法""规则""公告"等）
- date: 发布日期（YYYY-MM-DD）
- status: 状态（"现行有效"为主）

只返回JSON数组，不要加任何其他文字。`,

  /**
   * 债权投行 — 一键尽调
   * 基于真实公开信息生成融资分析报告
   */
  debtDD: (company, searchContext) => `你是一位专业的投资银行分析师。用户需要对"${company}"进行债权融资方向的尽调和融资分析。

${
  searchContext
    ? `以下是通过公开搜索获取的"${company}"相关信息，请严格基于这些信息进行分析：\n\n${searchContext}\n\n`
    : ''
}

请基于你的训练知识中关于"${company}"的公开信息，生成一份专业的融资分析报告。

【重要原则】
1. 只陈述你确定知道的信息，不确定的不要编造
2. 财务数据如果无法确认，请使用"约"、"估计"等措辞，或标注行业平均水平作为参考
3. 所有陈述需要注明信息来源的确定性级别：✅ 已知 | ⚠️ 推测 | 📊 行业参考
4. 严禁虚构财务数据，如果不知道具体数字，就写"数据待查"或提供行业参考值

报告结构请包含以下部分（每部分用HTML格式输出）：

1. 公司基本情况
   - 行业分类、主营业务、市场地位（基于训练知识）
   - 公开信息中可确认的财务概况

2. 融资能力分析
   - 可确认的信用评级信息（如有）
   - 已发行债券/融资记录（基于训练知识）
   - 融资渠道分析

3. 行业对比定位
   - 行业整体信用状况
   - 可比公司融资利率参考（基于行业公开信息）
   - 公司在行业中的相对位置

4. 信用与风险评估
   - 行业风险（宏观经济、政策变化对行业的影响）
   - 经营风险（市场竞争、技术迭代等）
   - 财务风险（杠杆水平、流动性等 - 用行业标准衡量）

5. 债券融资建议
   - 适合的债券品种（公司债/企业债/中票等）
   - 建议发行规模和期限
   - 关键条款建议

请使用以下HTML模板输出：
<div class="report-section">
  <h4 class="report-section-title">📋 标题</h4>
  <div class="report-section-content">
    <p>内容</p>
  </div>
</div>

每部分末尾请标注：
<p style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:8px;border-top:1px solid rgba(255,255,255,0.05);padding-top:6px;">
📌 信息来源说明：本报告基于公开可获取的信息生成。财务数据如未特别标注均为预估参考值，不构成投资建议。具体融资方案需结合公司最新财务数据、现场尽调及专业第三方意见综合判断。
</p>`
};


// ================================================================
// 3. 核心 API 调用
// ================================================================

/**
 * 检查 API Key 是否已配置
 */
function isConfigured() {
  return !!apiConfig.apiKey && apiConfig.apiKey !== 'sk-your-deepseek-api-key-here';
}

/**
 * 调用大模型
 * 
 * @param {string} prompt - 完整提示词
 * @param {object} [options]
 * @param {number} [options.temperature] - 创造度 (0-2)
 * @param {number} [options.maxTokens] - 最大输出 token 数
 * @param {boolean} [options.returnJson] - 是否期望 JSON 输出
 * @returns {Promise<string>} 模型返回文本
 */
async function callLLM(prompt, options = {}) {
  if (!isConfigured()) {
    throw new Error('AI API Key 未配置。请在 backend/.env 文件中设置 API_KEY');
  }

  const temperature = options.temperature ?? apiConfig.temperature;
  const maxTokens = options.maxTokens ?? apiConfig.maxTokens;

  try {
    const response = await axios.post(
      apiConfig.baseUrl + '/v1/chat/completions',
      {
        model: apiConfig.model,
        messages: [
          {
            role: 'system',
            content: '你是一位专业的投资银行分析师，精通中国资本市场。请用专业、准确的语言回答问题。所有输出请使用简体中文。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: temperature,
        max_tokens: maxTokens,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiConfig.apiKey
        },
        timeout: 120000
      }
    );

    const content = response.data.choices[0].message.content.trim();
    return content;

  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      if (status === 401) throw new Error('API Key 无效，请检查 .env 配置');
      if (status === 429) throw new Error('API 调用过于频繁，请稍后重试');
      throw new Error('API 错误 (' + status + '): ' + JSON.stringify(data));
    }
    if (err.code === 'ECONNREFUSED') throw new Error('无法连接 API 服务，请检查网络');
    throw new Error('请求失败: ' + err.message);
  }
}

/**
 * 从返回文本中提取 JSON 数组
 * 大模型有时会在 JSON 前后加 markdown 代码块标记
 */
function extractJSON(text) {
  // 尝试去掉 ```json ... ``` 包裹
  let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '').trim();
  
  // 尝试解析
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // 如果直接解析失败，尝试找到第一个 [ 和最后一个 ]
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.substring(start, end + 1));
      } catch (e2) {
        throw new Error('AI 返回数据格式异常，无法解析 JSON');
      }
    }
    throw new Error('AI 返回数据格式异常，无法解析 JSON');
  }
}

// ================================================================
// 4. 业务生成函数
// ================================================================

/**
 * 生成内容（通用入口）
 * 
 * @param {string} type - 内容类型: debtNews/debtOpportunities/debtGuidelines/debtDD
 * @param {string} keyword - 用户输入的关键词
 * @param {string} [searchContext] - （可选）实时搜索结果上下文
 * @returns {Promise<object|string>} 如果是列表型返回解析后的 JSON，如果是报告返回 HTML
 */
async function generate(type, keyword, searchContext) {
  const promptFn = PROMPTS[type];
  if (!promptFn) {
    throw new Error('未知的内容类型: ' + type);
  }

  const prompt = promptFn(keyword, searchContext);
  const isJSONType = ['debtNews', 'debtOpportunities', 'debtGuidelines',
                      'equityNews', 'equityOpportunities', 'equityGuidelines',
                      'hotNews'].includes(type);
  const isLargeOutput = ['debtNews', 'debtOpportunities', 'debtGuidelines'].includes(type);

  const result = await callLLM(prompt, {
    temperature: isJSONType ? 0.3 : 0.7,
    maxTokens: isLargeOutput ? 8192 : (isJSONType ? 2048 : 4096),
    returnJson: isJSONType
  });

  if (isJSONType) {
    return extractJSON(result);
  }

  return result;
}

module.exports = {
  generate,
  callLLM,
  isConfigured,
  PROMPTS
};
