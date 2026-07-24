/**
 * AI投行专家 — API 服务端
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { getDb, migrate } = require('./database');
const ai = require('./ai');
const writeReport = require('./write-report');

const app = express();
const PORT = process.env.PORT || 3001;
const SALT_ROUNDS = 10;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files (no-cache for development)
const staticDir = path.join(__dirname, '..');
app.use(express.static(staticDir, {
  setHeaders: function(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
console.log('Static files served from:', staticDir);

migrate();

// ====================== CACHE ======================
var resultCache = {};
var CACHE_TTL = 55 * 60 * 1000;
function getCache(key) {
  var entry = resultCache[key];
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data;
  return null;
}
function setCache(key, data) {
  resultCache[key] = { data, time: Date.now() };
  var keys = Object.keys(resultCache);
  if (keys.length > 100) {
    var now = Date.now();
    for (var i = 0; i < keys.length; i++)
      if (now - resultCache[keys[i]].time > CACHE_TTL) delete resultCache[keys[i]];
  }
}

// ====================== RESPONSE HELPERS ======================
function ok(res, data) { res.json({ success: true, data, message: '操作成功' }); }
function fail(res, msg, code) { res.status(code || 400).json({ success: false, message: msg }); }

// ====================== 2. AUTH API ======================
app.post('/api/auth/register', async (req, res) => {
  try {
    var { phone, username, password } = req.body;
    if (!phone || !username || !password) return fail(res, '缺少必填字段');
    var db = getDb();
    var existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (existing) return fail(res, '该手机号已注册');
    var hash = await bcrypt.hash(password, SALT_ROUNDS);
    var result = db.prepare('INSERT INTO users (phone, username, password) VALUES (?, ?, ?)').run(phone, username, hash);
    var token = result.lastInsertRowid + '_' + Date.now();
    ok(res, { user: { id: result.lastInsertRowid, phone: maskPhone(phone), username, level: 'bronze', streak: 0, totalCheckins: 0 }, token });
  } catch (err) { fail(res, err.message, 500); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    var { phone, password } = req.body;
    if (!phone || !password) return fail(res, '请输入手机号和密码');
    var db = getDb();
    var user = db.prepare('SELECT * FROM users WHERE phone = ? AND is_guest = 0').get(phone);
    if (!user) return fail(res, '该手机号未注册');
    var valid = await bcrypt.compare(password, user.password);
    if (!valid) return fail(res, '密码错误');
    var token = user.id + '_' + Date.now();
    ok(res, { user: { id: user.id, phone: maskPhone(user.phone), username: user.username, level: user.level, streak: user.streak, lastCheckin: user.last_checkin, totalCheckins: user.total_checkins, isGuest: false, createdAt: user.created_at }, token, message: '登录成功' });
  } catch (err) { fail(res, err.message, 500); }
});

app.post('/api/auth/guest', (req, res) => {
  try {
    var db = getDb();
    var gid = 'guest_' + Date.now();
    var username = '游客' + Math.floor(Math.random() * 900 + 100);
    var result = db.prepare('INSERT INTO users (phone, username, password, is_guest) VALUES (?, ?, ?, 1)').run(gid, username, '');
    var token = result.lastInsertRowid + '_' + Date.now();
    ok(res, { user: { id: result.lastInsertRowid, phone: maskPhone(gid), username, level: 'bronze', streak: 0, lastCheckin: null, totalCheckins: 0, isGuest: true, createdAt: new Date().toISOString() }, token, message: '欢迎体验' });
  } catch (err) { fail(res, err.message, 500); }
});

function maskPhone(p) { if (!p || p.length < 11) return p; return p.slice(0, 3) + '****' + p.slice(7); }

// ====================== 3. MEMBERSHIP API ======================
app.post('/api/membership/checkin', (req, res) => {
  try {
    var { userId } = req.body;
    if (!userId) return fail(res, '缺少用户ID');
    var db = getDb();
    var user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return fail(res, '用户不存在');
    var today = new Date().toISOString().slice(0, 10);
    if (user.last_checkin === today) return fail(res, '今日已签到');
    var streak = user.last_checkin && daysBetween(user.last_checkin, today) === 1 ? (user.streak || 0) + 1 : 1;
    db.prepare('UPDATE users SET streak = ?, last_checkin = ?, total_checkins = total_checkins + 1 WHERE id = ?').run(streak, today, userId);
    db.prepare('INSERT INTO checkins (user_id, checkin_date, streak) VALUES (?, ?, ?)').run(userId, today, streak);
    ok(res, { streak, totalCheckins: (user.total_checkins || 0) + 1 });
  } catch (err) { fail(res, err.message, 500); }
});

app.get('/api/membership/status', (req, res) => {
  try {
    var userId = req.query.userId;
    if (!userId) return fail(res, '缺少用户ID');
    var db = getDb();
    var user = db.prepare('SELECT id, phone, username, level, streak, last_checkin, total_checkins FROM users WHERE id = ?').get(userId);
    if (!user) return fail(res, '用户不存在');
    ok(res, user);
  } catch (err) { fail(res, err.message, 500); }
});

function daysBetween(a, b) {
  var da = new Date(a), db = new Date(b);
  return Math.floor((db - da) / (1000 * 60 * 60 * 24));
}

// ====================== 4. EQUITY API ======================
app.get('/api/equity/news', async (req, res) => {
  try {
    var keyword = req.query.keyword || 'IPO 并购 重组 新三板 股权融资';
    console.log('[AI] 股权新闻:', keyword);
    if (ai.isConfigured()) {
      var data = await ai.generate('equityNews', keyword, '');
      return ok(res, Array.isArray(data) ? data : []);
    }
    ok(res, [
      { id:1, title:'某半导体企业科创板IPO获受理，拟募资50亿元', summary:'上交所受理某半导体企业科创板上市申请，保荐机构为头部券商', source:'证券时报', date:'2026-07-07', tag:'IPO' },
      { id:2, title:'上市公司并购重组审核显著提速', summary:'证监会表示将进一步优化并购重组审核流程', source:'21世纪经济报道', date:'2026-07-06', tag:'并购' },
      { id:3, title:'新三板企业业绩披露：超30家净利润超2500万', summary:'截至最新披露日，新三板已有30余家企业披露年报', source:'全国股转系统', date:'2026-07-05', tag:'新三板' },
      { id:4, title:'某新能源企业完成Pre-IPO轮融资', summary:'该企业完成Pre-IPO轮融资，估值超百亿', source:'36氪', date:'2026-07-04', tag:'股权融资' },
      { id:5, title:'科创板再融资新规落地', summary:'证监会发布科创板再融资新规', source:'证监会', date:'2026-07-03', tag:'再融资' }
    ]);
  } catch (err) { console.error('[EQ NEWS]', err); fail(res, err.message, 500); }
});

app.get('/api/equity/opportunities', async (req, res) => {
  try {
    var keyword = req.query.keyword || '股权投行 业务机会 IPO辅导 新三板 并购重组 股权融资';
    console.log('[AI] 股权机会:', keyword);
    if (ai.isConfigured()) {
      var data = await ai.generate('equityOpportunities', keyword);
      return ok(res, Array.isArray(data) ? data : []);
    }
    ok(res, [
      { title:'某半导体企业启动IPO辅导备案', description:'该企业已与券商签署IPO辅导协议', type:'IPO辅导', company:'某半导体公司', amount:'预计募资30亿', stage:'进行中', region:'上海' },
      { title:'某新三板企业净利润超3000万拟转板', description:'该企业最新年报净利润超3000万', type:'转板', company:'某新三板企业', amount:'-', stage:'筹备中', region:'北京' }
    ]);
  } catch (err) { console.error('[EQ OPP]', err); fail(res, err.message, 500); }
});

app.get('/api/equity/guidelines', async (req, res) => {
  try {
    var keyword = req.query.keyword || 'IPO指引 信息披露 并购重组 规则';
    console.log('[AI] 股权指引:', keyword);
    if (ai.isConfigured()) {
      var data = await ai.generate('equityGuidelines', keyword);
      return ok(res, Array.isArray(data) ? data : []);
    }
    ok(res, [
      { title:'首次公开发行股票并上市管理办法', description:'规范企业IPO条件与程序', authority:'证监会', category:'办法', date:'2026-01-01', status:'现行有效' }
    ]);
  } catch (err) { console.error('[EQ GUIDE]', err); fail(res, err.message, 500); }
});

app.post('/api/equity/due-diligence', async (req, res) => {
  try {
    var { company, userId } = req.body;
    if (!company) return fail(res, '请输入公司名称');
    console.log('[AI] 股权尽调:', company);
    if (ai.isConfigured()) {
      var content = await ai.generate('equityDD', company);
      if (userId) {
        try { getDb().prepare('INSERT INTO due_diligence_reports (user_id, type, company, content) VALUES (?, ?, ?, ?)').run(userId, 'equity', company, content); } catch(e) {}
      }
      return ok(res, { company, content });
    }
    ok(res, { company, content: '<div class="report-section"><h4 class="report-section-title">📋 公司基本信息</h4><div class="report-section-content"><p>AI服务未配置，无法生成尽调报告</p></div></div>' });
  } catch (err) { console.error('[EQ DD]', err); fail(res, err.message, 500); }
});

// ====================== 5. DEBT API ======================
app.get('/api/debt/news', async (req, res) => {
  try {
    var keyword = req.query.keyword || '债券 投行 金融';
    console.log('[AI] 债权新闻:', keyword);
    if (ai.isConfigured()) {
      var data = await ai.generate('debtNews', keyword, '');
      return ok(res, Array.isArray(data) ? data : []);
    }
    ok(res, []);
  } catch (err) { console.error('[DBT NEWS]', err); fail(res, err.message, 500); }
});

app.get('/api/debt/news/detail', async (req, res) => {
  try {
    var { id, title } = req.query;
    var content = '<div class="info-card"><h4>' + (title || '新闻详情') + '</h4><p style="line-height:1.8;">本条新闻由AI智能生成。如需查看完整原文，建议直接搜索相关标题获取原始报道。</p></div>';
    ok(res, { id, title, content });
  } catch (err) { fail(res, err.message, 500); }
});

app.get('/api/debt/opportunities', async (req, res) => {
  try {
    var keyword = req.query.keyword || '债权投行 业务机会 债券承销 招投标';
    console.log('[AI] 债权机会:', keyword);
    if (ai.isConfigured()) {
      var data = await ai.generate('debtOpportunities', keyword);
      return ok(res, Array.isArray(data) ? data : []);
    }
    ok(res, []);
  } catch (err) { console.error('[DBT OPP]', err); fail(res, err.message, 500); }
});

app.get('/api/debt/opportunities/detail', async (req, res) => {
  try {
    var { id, title, company } = req.query;
    if (!id && !title) return fail(res, '缺少机会标识');
    console.log('[AI] 机会详情:', title || id);
    if (ai.isConfigured()) {
      var prompt = '请根据以下业务机会信息，提供该项目的完整详细信息。\n\n项目名称：' + (title || '无') + '\n涉及企业：' + (company || '未知') + '\n\n要求生成以下内容（用HTML格式输出）：\n1. 项目概述（100-150字）\n2. 甲方（发行方）基本信息\n3. 甲方联系方式（联系人职务、联系电话、邮箱、办公地址 - 合理虚构但看起来真实）\n4. 项目进度与时间安排\n5. 承销商/中介机构信息\n6. 项目亮点\n\n格式要求：每段用<p>标签包裹，联系方式部分突出显示，重要信息加粗。只返回HTML正文内容。';
      var content = await ai.callLLM(prompt, { temperature: 0.5, maxTokens: 2048 });
      return ok(res, { id, title: title || '', company: company || '', content });
    }
    ok(res, { id, title: title || '', company: company || '', content: '<p>AI服务未配置，无法生成详情。</p>' });
  } catch (err) { console.error('[OPP DTL]', err); fail(res, err.message, 500); }
});

app.get('/api/debt/guidelines', async (req, res) => {
  try {
    var keyword = req.query.keyword || '债券 法规 指引';
    console.log('[AI] 债权指引:', keyword);
    if (ai.isConfigured()) {
      var data = await ai.generate('debtGuidelines', keyword);
      return ok(res, Array.isArray(data) ? data : []);
    }
    ok(res, []);
  } catch (err) { console.error('[DBT GUIDE]', err); fail(res, err.message, 500); }
});

app.get('/api/debt/guidelines/detail', async (req, res) => {
  try {
    var { id, title } = req.query;
    ok(res, { id, title: title || '', content: '<p>详细内容由AI生成，请以官方发布原文为准。</p>' });
  } catch (err) { fail(res, err.message, 500); }
});

app.post('/api/debt/due-diligence', async (req, res) => {
  try {
    var { company, userId } = req.body;
    if (!company) return fail(res, '请输入公司名称');
    console.log('[AI] 债权尽调:', company);
    if (ai.isConfigured()) {
      var content = await ai.generate('debtDD', company, '');
      if (userId) {
        try { getDb().prepare('INSERT INTO due_diligence_reports (user_id, type, company, content) VALUES (?, ?, ?, ?)').run(userId, 'debt', company, content); } catch(e) {}
      }
      return ok(res, { company, content });
    }
    ok(res, { company, content: '<div class="report-section"><h4 class="report-section-title">📋 融资分析报告</h4><div class="report-section-content"><p>AI服务未配置，无法生成报告。</p></div></div>' });
  } catch (err) { console.error('[DBT DD]', err); fail(res, err.message, 500); }
});

app.get('/api/debt/hot-news', async (req, res) => {
  try {
    console.log('[AI] 热搜新闻查询');
    if (ai.isConfigured()) {
      var data = await ai.generate('hotNews');
      return ok(res, Array.isArray(data) ? data : []);
    }
    ok(res, [
      { title:'央行意外降息10基点，债市应声大涨', url:'https://finance.sina.com.cn/' },
      { title:'中金公司获评最佳投行', url:'https://finance.sina.com.cn/' }
    ]);
  } catch (err) { console.error('[HOT NEWS]', err); fail(res, err.message, 500); }
});

app.get('/api/ai/status', (req, res) => {
  ok(res, { configured: ai.isConfigured(), model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', apiKeySet: !!process.env.DEEPSEEK_API_KEY });
});

// ====================== 撰写模块 API ======================
app.post('/api/write/generate', async (req, res) => {
  try {
    var body = req.body;
    var company = (body.company || '').trim();
    var industry = (body.industry || '').trim();
    var purpose = (body.purpose || '').trim();
    var files = body.files || {};
    var fileContents = body.fileContents || {};
    var extraInfo = body.extraInfo || '';
    var docType = body.docType || 'dd';
    
    if (!company) return fail(res, '请填写尽调企业全称');
    if (!industry) return fail(res, '请填写企业所属行业');
    if (!purpose) return fail(res, '请填写尽调目的说明');
    
    // File format check (optional - files are no longer mandatory)
    for (var key in files) {
      var filename = files[key];
      if (!filename) continue;
      var ext = filename.split('.').pop().toLowerCase();
      if (!['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'].includes(ext)) {
        return fail(res, '文件 "' + filename + '" 格式不支持，请上传 PDF/DOC/DOCX/XLS/XLSX/TXT 文件');
      }
    }
    
    console.log('[WRITE] 生成尽调报告:', company);
    var content = await writeReport.generate({ company, industry, purpose, files, fileContents, extraInfo, docType });
    console.log('[WRITE] 报告生成完成，长度:', content.length);
    ok(res, { company, content });
  } catch (err) {
    console.error('[WRITE ERROR]', err);
    fail(res, err.message, 500);
  }
});

// ====================== STARTUP ======================
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log('  AI投行专家 — API 服务已启动');
  console.log('  地址: http://localhost:' + PORT);
  console.log('  AI状态:', ai.isConfigured() ? '✅ 已配置' : '❌ 未配置');
  console.log('═══════════════════════════════════════════');
  console.log('  认证 & 会员:');
  console.log('  POST /api/auth/login        登录');
  console.log('  POST /api/auth/register     注册');
  console.log('  POST /api/auth/guest        游客模式');
  console.log('  POST /api/membership/checkin 签到');
  console.log('  GET  /api/membership/status  会员状态');
  console.log('');
  console.log('  股权投行（AI驱动）:');
  console.log('  GET  /api/equity/news          股权新闻');
  console.log('  GET  /api/equity/opportunities 股权机会');
  console.log('  GET  /api/equity/guidelines    股权指引');
  console.log('  POST /api/equity/due-diligence 股权尽调');
  console.log('');
  console.log('  债权投行（AI驱动 + 缓存）:');
  console.log('  GET  /api/debt/news          行业新闻');
  console.log('  GET  /api/debt/news/detail   新闻详情');
  console.log('  GET  /api/debt/opportunities 业务机会');
  console.log('  GET  /api/debt/opportunities/detail 机会详情');
  console.log('  GET  /api/debt/guidelines    发行指引');
  console.log('  GET  /api/debt/guidelines/detail 指引详情');
  console.log('  POST /api/debt/due-diligence 一键尽调');
  console.log('  GET  /api/debt/hot-news      热搜新闻');
  console.log('  GET  /api/ai/status          AI 状态检查');
  console.log('═══════════════════════════════════════════');
});

module.exports = app;
