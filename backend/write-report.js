var axios = require('axios');
var path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

var apiConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
};

function isConfigured() {
  return !!apiConfig.apiKey && apiConfig.apiKey !== 'sk-your-deepseek-api-key-here';
}

async function callLLM(messages, temperature) {
  var response = await axios.post(
    apiConfig.baseUrl + '/v1/chat/completions',
    {
      model: apiConfig.model,
      messages: messages,
      temperature: temperature || 0.3,
      max_tokens: 16384,
      stream: false
    },
    {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiConfig.apiKey },
      timeout: 180000
    }
  );
  return response.data.choices[0].message.content.trim();
}

// Phase 1: Anti-hallucination data gathering
function buildDataGatheringPrompt(company, industry) {
  return '** 绝对禁止编造工商信息 **\n\n'
    + '你无法访问国家企业信用信息公示系统、企查查、天眼查等数据库。\n'
    + '你只能基于训练数据中有把握的信息作答。不确定就是不确定。\n\n'
    + '禁止编造：法定代表人姓名、注册资本金额、成立日期、注册地址、\n'
    + '股东姓名和持股比例、统一社会信用代码、联系电话、融资轮次金额。\n\n'
    + '不确定时写：暂未检索到权威公开信息\n\n'
    + '---\n\n'
    + '你是资深企业信息调研分析师。仅基于公开权威信息作答。\n\n'
    + '本次调研主体：' + company + '（' + industry + '行业）\n\n'
    + '第一步：企业主体唯一性核验\n'
    + '确认统一社会信用代码、注册地、成立时间。排除同名不同主体。\n\n'
    + '第二步：按信源优先级检索\n'
    + '优先级：国家企业信用信息公示系统 > 证监会/交易所 > 政府部门 > 企业官网 > 正规工商平台 > 持牌媒体\n\n'
    + '需覆盖6个维度：\n'
    + '1.工商基础：注册资本、实缴资本、法定代表人、成立日期、经营状态、注册地址、经营范围、统一社会信用代码\n'
    + '2.股权控制：前十大股东(含持股比例)、实际控制人、最终受益人、核心关联企业\n'
    + '3.联系方式：官方联系电话、官方邮箱、官网地址\n'
    + '4.风险合规：行政处罚、经营异常、失信被执行、限制高消费、重大司法诉讼\n'
    + '5.经营动态：融资历史、中标公告、招投标记录、企业重大公告\n'
    + '6.公开新闻：近2年正规媒体报道，区分正面/负面\n\n'
    + '第三步：信息交叉校验\n'
    + '同一字段不同信源差异分别标注，不自行合并取舍。\n\n'
    + '输出要求：\n'
    + '1.分模块呈现，工商信息用表格\n'
    + '2.每条信息末尾标注[信息来源+时间]\n'
    + '3.无权威来源的字段标注：暂未检索到权威公开信息\n'
    + '4.仅客观事实，不加入主观评价推测';
}

// Phase 2: Report generation from gathered data
function buildReportPrompt(params, dataGathered) {
  var company = params.company || '';
  var industry = params.industry || '';
  var purpose = params.purpose || '';
  var extraInfo = params.extraInfo || '';
  var fileList = params.files || {};
  var fileContents = params.fileContents || {};
  var today = new Date().toLocaleDateString('zh-CN');
  
  var keys = Object.keys(fileList);
  var fileSection = '';
  if (keys.length > 0) {
    fileSection = '[用户上传文件]\n';
    for (var ii = 0; ii < keys.length; ii++) {
      var key = keys[ii];
      var labelMap = {financial:'会计报表',audit:'审计报告',legal:'法律意见书',dd_report:'尽调报告',industry:'行业研究',bank_flow:'银行流水',contract:'重大合同'};
      fileSection += '---' + (labelMap[key]||key) + '(' + fileList[key] + ')---\n' + (fileContents[key]||'[未读取]') + '\n\n';
    }
  }
  
  var dataSection = dataGathered || '(数据搜集未完成)';
  
  return '你是投行尽调报告撰写专家。基于以下已搜集数据生成14章HTML报告。\n\n'
    + '========[企业信息]========\n'
    + '企业：' + company + '\n行业：' + industry + '\n目的：' + purpose + '\n日期：' + today + '\n\n'
    + '========[已搜集数据 - 必须在报告中引用]========\n\n'
    + dataSection + '\n\n'
    + (extraInfo ? '========[用户补充]\n' + extraInfo + '\n\n' : '')
    + fileSection
    + '========[14章结构]========\n'
    + '一尽调摘要|二基本情况|三股权治理|四主营经营|五行业分析|六财务尽调\n'
    + '七资产负债|八税务合规|九人力资源|十法律诉讼处罚|十一重大合同|十二风险汇总|十三结论建议|十四附件\n\n'
    + '要求：\n'
    + '1.严格基于已搜集数据填写，不编造\n'
    + '2.无数据的章节写：暂无相关信息\n'
    + '3.HTML格式：<div class=report-section><div class=report-section-title>标题</div><div class=report-section-content>内容</div></div>\n'
    + '4.表格：<table class=report-table><tr><td>A</td><td>B</td></tr></table>\n'
    + '5.末尾添加免责声明\n'
    + '6.不使用白色背景，保持深色主题\n';
}

// Two-phase generation
async function generateReport(params) {
  if (!isConfigured()) throw new Error('AI API Key 未配置');

  var company = params.company || '';
  var industry = params.industry || '';

  // Phase 1: Gather data
  console.log('[WRITE] Phase 1:', company);
  var dataGathered = '';
  try {
    dataGathered = await callLLM([
      {role:'system',content:'你是企业信息调研分析师。仅基于公开权威信息作答。不确定就说不确定。严禁编造工商数据。'},
      {role:'user',content:buildDataGatheringPrompt(company,industry)}
    ], 0.3);
    console.log('[WRITE] Phase 1 done, length:', dataGathered.length);
  } catch(e) {
    console.log('[WRITE] Phase 1 failed:', e.message);
  }

  // Phase 2: Generate report
  console.log('[WRITE] Phase 2: generating report');
  var content = await callLLM([
    {role:'system',content:'你是投行尽调报告撰写专家。仅使用已搜集数据，不编造。HTML格式，深色主题。'},
    {role:'user',content:buildReportPrompt(params,dataGathered)}
  ], 0.3);
  console.log('[WRITE] Phase 2 done, length:', content.length);
  return content;
}

module.exports = { generate: generateReport, isConfigured: isConfigured };
