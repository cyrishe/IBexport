/**
 * AI投行专家 — 实时新闻抓取器
 * 
 * 从多个来源获取实时金融新闻，支持中文财经新闻搜索。
 * 如果所有来源都失败，返回空数组让 AI 根据知识生成。
 */

const axios = require('axios');

// ================================================================
// 1. 新闻来源配置
// ================================================================

const SOURCES = {
  /**
   * 东方财富 — 新闻搜索
   * 通过东方财富的搜索接口获取新闻
   */
  eastmoney: async function(keyword) {
    const url = 'https://search-api-web.eastmoney.com/search/jsonp';
    const params = {
      cb: 'jQuery',
      param: JSON.stringify({
        uid: '',
        keyword: keyword,
        type: ['cmsArticleWebOld'],
        client: 'web',
        clientType: 'web',
        clientVersion: 'curr',
        param: {
          cmsArticleWebOld: {
            searchScope: 'default',
            sort: 'default',
            pageIndex: 1,
            pageSize: 8,
            preTag: '',
            postTag: ''
          }
        }
      })
    };

    const res = await axios.get(url, {
      params: params,
      timeout: 3000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://so.eastmoney.com/'
      }
    });

    // 解析 JSONP 格式
    const match = res.data.match(/jQuery\((\[.*\])\)/);
    if (!match) return [];

    const articles = JSON.parse(match[1]);
    return articles.slice(0, 5).map(item => ({
      title: item.title || item.article_title || '',
      summary: item.content || item.abstract || '',
      source: item.source || '东方财富',
      date: (item.date || item.show_date || '').slice(0, 10),
      url: item.article_url || item.url || ''
    }));
  },

  /**
   * 使用通用搜索（Bing 新闻搜索）
   * 作为备选来源，可靠性较高
   */
  bingNews: async function(keyword) {
    const encoded = encodeURIComponent(keyword + ' 金融');
    const url = 'https://www.bing.com/news/search?q=' + encoded + '&setlang=zh-Hans';

    // 使用普通 axios 获取（可能会被限制）
    const res = await axios.get(url, {
      timeout: 3000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });

    // 从 HTML 中提取新闻卡片
    const html = res.data;
    const items = [];
    
    // 简单的正则提取
    const titleRegex = /<a[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<div[^>]*class="snippet"[^>]*>([\s\S]*?)<\/div>/gi;
    const sourceRegex = /<div[^>]*class="source"[^>]*>([\s\S]*?)<\/div>/gi;

    let match;
    const titles = [];
    while ((match = titleRegex.exec(html)) !== null) {
      titles.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    const snippets = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    for (let i = 0; i < Math.min(titles.length, 5); i++) {
      items.push({
        title: titles[i] || '',
        summary: snippets[i] || '',
        source: 'Bing新闻',
        date: '',
        url: ''
      });
    }

    return items;
  }
};

// ================================================================
// 2. 主函数
// ================================================================

/**
 * 获取实时新闻
 * 
 * 依次尝试多个来源，返回最先成功的。
 * 
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<string>} 格式化的新闻文本，供 AI 使用
 */
async function fetchRealTimeNews(keyword) {
  const sources = [
    { name: '东方财富', fn: () => SOURCES.eastmoney(keyword) },
    { name: 'Bing新闻', fn: () => SOURCES.bingNews(keyword) }
  ];

  // 随机打乱来源顺序，避免单一来源被封
  for (let i = sources.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sources[i], sources[j]] = [sources[j], sources[i]];
  }

  let lastError = null;

  for (const source of sources) {
    try {
      console.log('[News] 尝试来源:', source.name);
      const items = await source.fn();

      if (items && items.length > 0) {
        console.log('[News] 从', source.name, '获取到', items.length, '条新闻');
        
        // 格式化为文本，供 AI 作为上下文
        return items.map((item, i) => {
          return `【新闻${i + 1}】\n标题: ${item.title}\n摘要: ${item.summary}\n来源: ${item.source}\n日期: ${item.date}\n---`;
        }).join('\n');
      }
    } catch (err) {
      console.warn('[News] 来源', source.name, '失败:', err.message);
      lastError = err;
    }
  }

  console.warn('[News] 所有新闻来源均失败，将由 AI 直接生成');
  return ''; // 返回空，让 AI 根据知识自行生成
}

module.exports = { fetchRealTimeNews };
