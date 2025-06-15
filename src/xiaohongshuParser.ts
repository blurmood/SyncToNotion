/**
 * 小红书链接解析器 - TypeScript版本
 * 专为Cloudflare Workers环境优化，具有完整的类型安全
 * 支持解析小红书短链接和完整链接
 * 
 * @fileoverview 小红书内容解析器，支持图文和视频内容
 * @author Augment Agent
 * @version 3.0.0 (TypeScript)
 */

// ==================== 类型定义 ====================

/** 网络请求配置接口 */
export interface NetworkConfig {
  /** 请求超时时间(ms) */
  timeout: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试延迟(ms) */
  retryDelay: number;
}

/** 调试配置接口 */
export interface DebugConfig {
  /** 是否启用详细日志 */
  verbose: boolean;
}

/** 解析器配置接口 */
export interface XiaohongshuParserConfig {
  /** 网络请求配置 */
  network?: Partial<NetworkConfig>;
  /** 调试配置 */
  debug?: Partial<DebugConfig>;
}

/** 作者信息接口 */
export interface XiaohongshuAuthor {
  /** 作者名称 */
  name: string;
  /** 作者ID */
  id: string;
  /** 头像链接 */
  avatar: string;
}

/** Live图媒体组件接口 */
export interface LivePhotoComponent {
  /** 组件类型 */
  type: 'WB_PRV' | 'WB_DFT' | 'VIDEO';
  /** JSON索引 */
  jsonIndex: number;
  /** 组件数据 */
  data: {
    url: string;
    imageScene?: string;
    backupUrls?: string[];
    scriptIndex?: number;
    jsonIndex?: number;
  };
}

/** Live图分组接口 */
export interface LivePhotoGroup {
  /** WB_PRV图片 */
  wbPrv?: LivePhotoComponent['data'];
  /** WB_DFT图片 */
  wbDft?: LivePhotoComponent['data'];
  /** 视频 */
  video?: LivePhotoComponent['data'];
  /** 所有视频 */
  videos?: LivePhotoComponent['data'][];
}

/** 媒体结构分析结果接口 */
export interface MediaStructureAnalysis {
  /** 普通图片数量 */
  regularImages: number;
  /** Live图分组数量 */
  livePhotoGroups: number;
  /** 总内容数量 */
  totalGroups: number;
  /** Live图分组详情 */
  liveGroups: LivePhotoGroup[];
  /** 普通图片详情 */
  regularImageDetails: any[];
}

/** 小红书解析结果接口 */
export interface XiaohongshuResult {
  /** 标题 */
  title: string;
  /** 作者信息 */
  author: XiaohongshuAuthor;
  /** 内容描述 */
  content: string;
  /** 图片数组 */
  images: string[];
  /** 视频链接（如果有） */
  video?: string;
  /** 所有视频链接（Live图等多视频内容） */
  videos?: string[];
  /** 封面图 */
  cover?: string;
  /** 内容类型 */
  contentType: 'image' | 'video' | 'text';
  /** 笔记ID */
  noteId: string;
  /** 原始链接 */
  originalUrl: string;
  /** 原始链接（兼容字段） */
  original_url?: string;
  /** 解析时间 */
  timestamp: string;
  /** 封面图片（视频内容专用） */
  coverImage?: string;
  /** 原始图片数量 */
  originalImageCount?: number;
  /** 媒体结构分析结果 */
  mediaAnalysis?: MediaStructureAnalysis;
  /** 是否为Live图 */
  isLivePhoto?: boolean;
  /** 是否为分组内容 */
  isGroupedContent?: boolean;
}

/** 错误结果接口 */
export interface XiaohongshuErrorResult {
  error: true;
  message: string;
  url: string;
  timestamp: string;
}

/** 解析结果联合类型 */
export type XiaohongshuParseResult = XiaohongshuResult | XiaohongshuErrorResult;

/** 基础解析结果接口 */
export interface XiaohongshuBasicResult {
  title: string;
  author: string;
  content: string;
  contentType: 'image' | 'video' | 'text';
  imageCount: number;
  videoCount: number;
  firstImage: string | null;
  firstVideo: string | null;
}

/** 请求选项接口 */
interface FetchOptions {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

// ==================== 配置常量 ====================

/** 默认配置 */
const DEFAULT_CONFIG = {
  network: {
    timeout: 15000,
    maxRetries: 3,
    retryDelay: 1000
  },
  debug: {
    verbose: false
  }
};

/** 桌面端User-Agent（专门用于获取og:image无水印图片） */
const DESKTOP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";

/** 正则表达式模式 */
const PATTERNS = {
  // 图片URL匹配
  imageUrl: /https:\/\/sns-[a-z0-9-]+\.xhscdn\.com\/[^"'\s]+/g,
  
  // 视频URL匹配
  videoUrl: [
    /https:\/\/sns-video[^"'\s]+\.mp4/g,
    /https:\/\/v\.xhscdn\.com[^"'\s]+/g,
    /"masterUrl":"([^"]+)"/g,
    /"url":"(https:\/\/v\.xhscdn\.com[^"]+)"/g
  ] as const,
  
  // 内容提取
  title: [
    /<meta\s+property="og:title"\s+content="([^"]+)"/i,
    /<title[^>]*>(.*?)<\/title>/i,
    /"title":"([^"]+)"/i
  ] as const,
  
  author: [
    /"nickname":"([^"]+)"/i,
    /"nickName":"([^"]+)"/i,
    /<meta\s+name="author"\s+content="([^"]+)"/i
  ] as const,
  
  content: [
    /"desc":"([^"]+)"/i,
    /"content":"([^"]+)"/i,
    /"text":"([^"]+)"/i
  ] as const,
  
  noteId: [
    /\/item\/([a-zA-Z0-9]+)/,
    /"noteId":"([a-zA-Z0-9]+)"/
  ] as const,

  // og:image meta标签匹配（用于提取无水印图片）- 使用所有模式确保完整提取
  ogImage: [
    // 1. 标准格式：property在前
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    // 2. 反向格式：content在前
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/gi,
    // 3. 宽松匹配：包含og:image和content的任何meta标签
    /<meta[^>]*og:image[^>]*content=["']([^"']+)["'][^>]*>/gi,
    // 4. 超宽松匹配：任何包含xhscdn的content
    /content=["']([^"']*xhscdn[^"']*)["']/gi
  ]
} as const;

// ==================== 工具函数 ====================

/**
 * 获取桌面端User-Agent（专门用于获取og:image无水印图片）
 * @returns 桌面端User-Agent字符串
 */
function getDesktopUserAgent(): string {
  return DESKTOP_USER_AGENT;
}

/**
 * 清理文本内容
 * @param text - 原始文本
 * @returns 清理后的文本
 */
function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  
  return text
    .replace(/\s*-\s*小红书/, '')
    .replace(/\\n/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 清理URL，处理转义字符
 * @param url - 原始URL
 * @returns 清理后的URL
 */
function cleanUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  return url
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003D/g, '=')
    .replace(/\\u003F/g, '?')
    .replace(/\\u003A/g, ':')
    .replace(/\\"/g, '"')
    .replace(/^"|"$/g, '');
}

/**
 * 延迟函数
 * @param ms - 延迟时间(毫秒)
 * @returns Promise
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 调试日志
 * @param message - 日志消息
 * @param force - 是否强制输出
 */
function debugLog(message: string, force: boolean = false): void {
  if (DEFAULT_CONFIG.debug.verbose || force) {
    console.log(`[XHS Parser] ${message}`);
  }
}

// ==================== 内容提取函数 ====================

/**
 * 从HTML中提取标题
 * @param html - HTML内容
 * @returns 提取的标题
 */
function extractTitle(html: string): string {
  for (const pattern of PATTERNS.title) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const title = cleanText(match[1]);
      if (title && title !== '小红书') {
        debugLog(`提取到标题: ${title}`);
        return title;
      }
    }
  }
  return '小红书内容';
}

/**
 * 从HTML中提取作者
 * @param html - HTML内容
 * @returns 提取的作者名称
 */
function extractAuthor(html: string): string {
  for (const pattern of PATTERNS.author) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const author = cleanText(match[1]);
      if (author) {
        debugLog(`提取到作者: ${author}`);
        return author;
      }
    }
  }
  return '未知作者';
}

/**
 * 从HTML中提取正文内容
 * @param html - HTML内容
 * @returns 提取的正文内容
 */
function extractContent(html: string): string {
  for (const pattern of PATTERNS.content) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const content = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"');
      if (content) {
        debugLog(`提取到正文: ${content.substring(0, 50)}...`);
        return content;
      }
    }
  }
  return '';
}

/**
 * 从HTML中提取笔记ID
 * @param html - HTML内容
 * @param url - 页面URL
 * @returns 提取的笔记ID
 */
function extractNoteId(html: string, url: string): string {
  // 先从URL中提取
  for (const pattern of PATTERNS.noteId) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  
  // 再从HTML中提取
  for (const pattern of PATTERNS.noteId) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  
  return '';
}

/**
 * 从HTML中提取图片链接 - 简单直接，有什么链接就用什么链接
 * @param html - HTML内容
 * @returns 图片URL数组
 */
function extractImages(html: string): string[] {
  const images: string[] = [];
  const ogImagePatterns = PATTERNS.ogImage;

  console.log('🔍 开始提取图片，调试正则表达式匹配结果...');

  let totalMatchCount = 0;

  // 尝试所有正则表达式模式
  for (let patternIndex = 0; patternIndex < ogImagePatterns.length; patternIndex++) {
    const pattern = ogImagePatterns[patternIndex];
    console.log(`📋 尝试模式${patternIndex + 1}...`);

    let match;
    let matchCount = 0;
    while ((match = pattern.exec(html)) !== null) {
      matchCount++;
      totalMatchCount++;
      const url = cleanUrl(match[1]);
      const fullMatch = match[0];

      console.log(`📋 模式${patternIndex + 1}匹配${matchCount}: ${fullMatch.substring(0, 100)}...`);
      console.log(`📋 提取URL: ${url}`);

      if (url && url.includes('http') && !images.includes(url)) {
        images.push(url);
        console.log(`✅ 添加到结果: ${url}`);
      } else {
        console.log(`❌ 跳过无效或重复URL: ${url}`);
      }
      console.log('---');
    }

    // 重置正则表达式的lastIndex
    pattern.lastIndex = 0;

    console.log(`📋 模式${patternIndex + 1}找到 ${matchCount} 个匹配`);

    // 如果已经找到图片，就停止尝试其他模式
    if (images.length > 0) {
      console.log(`✅ 已找到图片，停止尝试其他模式`);
      break;
    }
  }

  console.log(`📊 所有正则表达式总共匹配到 ${totalMatchCount} 个结果`);
  console.log(`📊 最终提取到 ${images.length} 张有效图片`);

  // 显示所有提取的图片URL
  images.forEach((img, index) => {
    console.log(`📸 图片${index + 1}: ${img}`);
  });

  return images;
}




/**
 * 从HTML中提取所有JSON数据并进行智能分析
 * @param html - HTML内容
 * @returns 提取的数据结构
 */
function extractAllJsonData(html: string): {
  metaTags: Record<string, string>;
  scriptJsonData: any[];
  livePhotoData: {
    videos: any[];
    wbDftImages: any[];
    wbPrvImages: any[];
  };
} {
  const result = {
    metaTags: {} as Record<string, string>,
    scriptJsonData: [] as any[],
    livePhotoData: {
      videos: [] as any[],
      wbDftImages: [] as any[],
      wbPrvImages: [] as any[]
    }
  };

  // 提取meta标签
  debugLog('🏷️ 提取meta标签...');
  const metaMatches = html.match(/<meta[^>]+>/g) || [];
  metaMatches.forEach(meta => {
    const nameMatch = meta.match(/name=["']([^"']+)["']/);
    const propertyMatch = meta.match(/property=["']([^"']+)["']/);
    const contentMatch = meta.match(/content=["']([^"']+)["']/);

    if ((nameMatch || propertyMatch) && contentMatch) {
      const key = nameMatch ? nameMatch[1] : propertyMatch![1];
      result.metaTags[key] = contentMatch[1];
    }
  });

  // 提取script中的JSON数据
  debugLog('📊 提取script中的JSON数据...');
  const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gs) || [];

  scriptMatches.forEach((script, scriptIndex) => {
    const content = script.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

    // 查找可能的JSON对象
    const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];

    jsonMatches.forEach((jsonStr, jsonIndex) => {
      if (jsonStr.length > 50) {
        try {
          const parsed = JSON.parse(jsonStr);

          // 检查是否是Live图相关的媒体数据
          if (parsed.imageScene || parsed.h264 || parsed.h265) {
            if (parsed.h264 && Array.isArray(parsed.h264) && parsed.h264.length > 0) {
              // 视频对象
              const videoData = parsed.h264[0];
              if (videoData.masterUrl) {
                result.livePhotoData.videos.push({
                  url: videoData.masterUrl,
                  backupUrls: videoData.backupUrls || [],
                  scriptIndex,
                  jsonIndex
                });
                debugLog(`📹 找到视频: ${videoData.masterUrl}`);
              }
            } else if (parsed.imageScene && parsed.url) {
              // 图片对象
              if (parsed.imageScene === 'WB_DFT') {
                result.livePhotoData.wbDftImages.push({
                  url: parsed.url,
                  imageScene: parsed.imageScene,
                  scriptIndex,
                  jsonIndex
                });
                debugLog(`📸 找到WB_DFT图片: ${parsed.url}`);
              } else if (parsed.imageScene === 'WB_PRV') {
                result.livePhotoData.wbPrvImages.push({
                  url: parsed.url,
                  imageScene: parsed.imageScene,
                  scriptIndex,
                  jsonIndex
                });
                debugLog(`📸 找到WB_PRV图片: ${parsed.url}`);
              }
            }
          }

          // 保存所有JSON对象（用于调试）
          if (jsonStr.includes('video') || jsonStr.includes('image') || jsonStr.includes('title') || jsonStr.includes('WB_')) {
            result.scriptJsonData.push({
              scriptIndex,
              jsonIndex,
              size: jsonStr.length,
              hasVideo: jsonStr.includes('video'),
              hasImage: jsonStr.includes('image'),
              hasWB: jsonStr.includes('WB_'),
              data: parsed
            });
          }
        } catch (e) {
          // 忽略解析失败的JSON
        }
      }
    });
  });

  return result;
}

/**
 * 智能分析媒体内容结构
 * @param extractedData - 提取的数据
 * @returns 媒体结构分析结果
 */
function analyzeMediaStructure(extractedData: {
  livePhotoData: any;
  scriptJsonData: any[];
}): MediaStructureAnalysis {
  const { livePhotoData, scriptJsonData } = extractedData;

  debugLog('🔍 智能分析媒体内容结构...');

  // 查找明确标记为普通图片的对象 (livePhoto: false)
  const regularImages = scriptJsonData.filter(item =>
    item.data && item.data.livePhoto === false
  );

  debugLog(`📸 发现普通图片: ${regularImages.length}张`);
  regularImages.forEach((img, index) => {
    debugLog(`   普通图片${index + 1}: ${img.data.infoList ? img.data.infoList.length : 0}个版本`);
  });

  // 分析Live图结构 - 通过jsonIndex顺序智能匹配
  const liveGroups = analyzeLivePhotoGroups(livePhotoData);

  debugLog(`📹 Live图分组: ${liveGroups.length}组`);
  liveGroups.forEach((group, index) => {
    const components = [];
    if (group.wbPrv) components.push('WB_PRV');
    if (group.wbDft) components.push('WB_DFT');
    if (group.video) components.push('视频');
    debugLog(`   Live图${index + 1}: ${components.join(' + ')}`);
  });

  return {
    regularImages: regularImages.length,
    livePhotoGroups: liveGroups.length,
    totalGroups: regularImages.length + liveGroups.length,
    liveGroups: liveGroups,
    regularImageDetails: regularImages
  };
}

/**
 * 智能分组Live图组件
 * @param livePhotoData - Live图数据
 * @returns Live图分组数组
 */
function analyzeLivePhotoGroups(livePhotoData: {
  videos: any[];
  wbDftImages: any[];
  wbPrvImages: any[];
}): LivePhotoGroup[] {
  const { videos, wbDftImages, wbPrvImages } = livePhotoData;

  // 按jsonIndex排序所有媒体组件
  const allMediaComponents: LivePhotoComponent[] = [];

  wbPrvImages.forEach(img => {
    allMediaComponents.push({
      type: 'WB_PRV',
      jsonIndex: img.jsonIndex,
      data: img
    });
  });

  wbDftImages.forEach(img => {
    allMediaComponents.push({
      type: 'WB_DFT',
      jsonIndex: img.jsonIndex,
      data: img
    });
  });

  videos.forEach(video => {
    allMediaComponents.push({
      type: 'VIDEO',
      jsonIndex: video.jsonIndex,
      data: video
    });
  });

  // 按jsonIndex排序
  allMediaComponents.sort((a, b) => a.jsonIndex - b.jsonIndex);

  // 智能分组：WB_PRV + WB_DFT + VIDEO(s) 为一组
  const groups: LivePhotoGroup[] = [];
  let currentGroup: LivePhotoGroup = {};

  for (const component of allMediaComponents) {
    if (component.type === 'WB_PRV') {
      // 开始新组
      if (Object.keys(currentGroup).length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = { wbPrv: component.data };
    } else if (component.type === 'WB_DFT') {
      currentGroup.wbDft = component.data;
    } else if (component.type === 'VIDEO') {
      if (!currentGroup.videos) {
        currentGroup.videos = [];
      }
      currentGroup.videos.push(component.data);
      // 如果有视频，标记为Live图
      currentGroup.video = component.data;
    }
  }

  // 添加最后一组
  if (Object.keys(currentGroup).length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * 从Live图数据中提取视频URL
 * @param livePhotoData - Live图数据
 * @returns 视频URL数组
 */
function extractLivePhotoVideos(livePhotoData: { videos: any[] }): string[] {
  return livePhotoData.videos.map(video => cleanUrl(video.url)).filter(Boolean);
}

/**
 * 从HTML中提取视频URL
 * @param html - HTML内容
 * @returns 视频URL数组
 */
function extractVideos(html: string): string[] {
  const videoUrls = new Set<string>();

  // 使用视频URL匹配模式
  for (const pattern of PATTERNS.videoUrl) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const url = cleanUrl(match[1] || match[0]);
      if (url && url.includes('http') && (url.includes('.mp4') || url.includes('xhscdn'))) {
        // 优先选择无水印版本
        if (!url.includes('_259.mp4')) {
          videoUrls.add(url);
        }
      }
    }
  }

  return Array.from(videoUrls);
}

// ==================== 网络请求函数 ====================

/**
 * 发送HTTP请求（带重试机制）
 * @param url - 请求URL
 * @param options - 请求选项
 * @returns Promise<Response>
 */
async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const timeout: number = options.timeout ?? DEFAULT_CONFIG.network.timeout;
  const maxRetries: number = options.maxRetries ?? DEFAULT_CONFIG.network.maxRetries;
  const retryDelay: number = options.retryDelay ?? DEFAULT_CONFIG.network.retryDelay;

  let lastError: Error = new Error('未知错误');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      debugLog(`第${attempt + 1}次尝试请求: ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const userAgent = getDesktopUserAgent();
      debugLog(`使用桌面端User-Agent: ${userAgent}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal,
        redirect: 'follow'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      debugLog(`请求成功: ${response.status} ${response.statusText}`);
      return response;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      debugLog(`请求失败: ${lastError.message}`);

      if (attempt < maxRetries) {
        const waitTime = retryDelay * (attempt + 1);
        debugLog(`等待${waitTime}ms后重试...`);
        await delay(waitTime);
      }
    }
  }

  throw new Error(`请求失败，已重试${maxRetries}次: ${lastError.message}`);
}

// ==================== 主要解析函数 ====================

/**
 * 解析小红书链接
 * @param url - 小红书链接（支持短链接和完整链接）
 * @param options - 选项
 * @returns 解析结果
 */
export async function parseXiaohongshuLink(
  url: string,
  options: XiaohongshuParserConfig = {}
): Promise<XiaohongshuParseResult> {
  try {
    debugLog(`开始解析链接: ${url}`, true);

    // 合并配置
    const config = {
      network: { ...DEFAULT_CONFIG.network, ...options.network },
      debug: { ...DEFAULT_CONFIG.debug, ...options.debug }
    };

    // 更新全局配置
    Object.assign(DEFAULT_CONFIG, config);

    // 发送请求获取页面内容
    const response = await fetchWithRetry(url, config.network);
    const html = await response.text();

    debugLog(`获取到HTML内容: ${html.length} 字节`);

    // 检查是否包含错误信息
    if (html.includes('internal error') || html.includes('验证码') || html.includes('captcha')) {
      throw new Error('页面返回错误或需要验证码');
    }

    // 提取内容信息
    const result: XiaohongshuResult = {
      title: extractTitle(html),
      author: {
        name: extractAuthor(html),
        id: extractNoteId(html, response.url),
        avatar: '' // 新解析器暂不提供作者头像
      },
      content: extractContent(html),
      noteId: extractNoteId(html, response.url),
      originalUrl: response.url,
      images: extractImages(html),
      video: extractVideos(html)[0], // 取第一个视频
      videos: extractVideos(html), // 所有视频
      cover: undefined,
      contentType: 'text', // 默认值，后面会更新
      timestamp: new Date().toISOString()
    };

    // 使用新的智能分析系统
    console.log('🔍 开始智能分析媒体内容...');
    const extractedData = extractAllJsonData(html);
    const mediaAnalysis = analyzeMediaStructure(extractedData);

    // 保存分析结果到result中
    result.mediaAnalysis = mediaAnalysis;

    // 确定内容类型并优化视频内容的图片处理
    const allVideos = extractVideos(html);

    // 使用新的基于URL参数和livePhotoData的笔记类型判断
    const noteTypeResult = determineNoteType(response.url, html);
    result.contentType = noteTypeResult.contentType;
    const isLivePhoto = noteTypeResult.isLivePhoto;

    if (allVideos.length > 0 || mediaAnalysis.livePhotoGroups > 0) {
      // 优先使用URL参数的判断结果，避免误判
      if (result.contentType === 'video' && !isLivePhoto) {
        console.log(`🎬 URL参数明确指定为视频内容 (type=video)，跳过Live图分析`);

        // 视频内容处理逻辑：只保留主视频
        result.video = allVideos[0];
        result.videos = [allVideos[0]]; // 视频内容只保留一个主视频

        console.log(`🎬 视频内容处理：主视频 = ${result.video}`);
        console.log(`🎬 过滤掉 ${allVideos.length - 1} 个额外视频，只保留主视频`);

        // 普通视频内容优化：封面图片单独处理，不放入图片列表
        if (result.images.length > 0) {
          const originalImageCount = result.images.length;
          console.log(`🎬 检测到视频内容，原始图片数量: ${originalImageCount}`);

          // 保存第一张图片作为封面，但清空图片列表
          const coverImage = result.images[0];
          result.coverImage = coverImage; // 单独保存封面图片
          result.cover = coverImage;
          result.images = []; // 清空图片列表，视频笔记不显示图片

          // 记录原始图片数量用于统计
          result.originalImageCount = originalImageCount;

          console.log(`🎬 视频内容优化完成，封面图片单独保存: ${coverImage}`);
          console.log(`🎬 清空图片列表，视频笔记不显示图片内容`);
          console.log(`🎬 过滤掉 ${originalImageCount} 张图片，避免冗余显示`);
        }

      } else {
        // 判断是否为真正的Live图内容
        // 优先级：URL参数 > 媒体分析结果
        const isRealLivePhoto = (
          // 如果URL参数明确指定为视频且不是Live图，则不应该被识别为Live图
          result.contentType === 'video' && !isLivePhoto ? false :
          (
            mediaAnalysis.livePhotoGroups > 1 || // 多组Live图
            (mediaAnalysis.livePhotoGroups > 0 && mediaAnalysis.regularImages > 0 && result.contentType !== 'video') || // 混合内容但非视频
            (mediaAnalysis.livePhotoGroups > 0 && result.contentType === 'image') || // 图文类型但有Live图组件
            isLivePhoto // URL参数明确指定为Live图
          )
        );

        if (isRealLivePhoto) {
        console.log(`📸 智能分析检测到真正的Live图内容: ${mediaAnalysis.livePhotoGroups}组Live图, ${mediaAnalysis.regularImages}张普通图片`);

        // 提取Live图视频
        const livePhotoVideos = extractLivePhotoVideos(extractedData.livePhotoData);

        result.videos = livePhotoVideos;
        result.video = livePhotoVideos.length > 0 ? livePhotoVideos[0] : undefined;

        // 设置Live图标识
        result.isLivePhoto = true;
        result.isGroupedContent = true;

        console.log(`📸 Live图内容设置完成:`);
        console.log(`📸 - Live图视频: ${livePhotoVideos.length}个`);
        console.log(`📸 - 图片: ${result.images.length}张`);
        console.log(`📸 - 总分组: ${mediaAnalysis.livePhotoGroups}组`);

        // 设置封面
        if (result.images.length > 0) {
          result.cover = result.images[0];
        }

        } else {
          // 传统视频处理逻辑
          result.video = allVideos[0];

          // 如果是视频内容，只保留主视频；否则保留所有视频
          if (result.contentType === 'video') {
            result.videos = [allVideos[0]]; // 视频内容只保留一个主视频
            console.log(`🎬 传统视频处理：只保留主视频，过滤掉 ${allVideos.length - 1} 个额外视频`);
          } else {
            result.videos = allVideos; // 非视频内容保留所有视频
          }

          if (result.contentType === 'video') {
            // 普通视频内容优化：封面图片单独处理，不放入图片列表
            if (result.images.length > 0) {
              const originalImageCount = result.images.length;
              console.log(`🎬 检测到视频内容，原始图片数量: ${originalImageCount}`);

              // 保存第一张图片作为封面，但清空图片列表
              const coverImage = result.images[0];
              result.coverImage = coverImage; // 单独保存封面图片
              result.cover = coverImage;
              result.images = []; // 清空图片列表，视频笔记不显示图片

              // 记录原始图片数量用于统计
              result.originalImageCount = originalImageCount;

              console.log(`🎬 视频内容优化完成，封面图片单独保存: ${coverImage}`);
              console.log(`🎬 清空图片列表，视频笔记不显示图片内容`);
              console.log(`🎬 过滤掉 ${originalImageCount} 张图片，避免冗余显示`);
            }
          }
        }
      }
    }

    // 处理图文笔记的封面
    if (result.contentType === 'image' && !result.isLivePhoto && result.images.length > 0) {
      result.cover = result.images[0]; // 第一张图片作为封面
    }

    // 如果没有任何内容，标记为文本类型
    if (result.contentType === 'image' && result.images.length === 0 && (result.videos?.length || 0) === 0) {
      result.contentType = 'text';
    }

    // 输出智能分析结果
    if (result.mediaAnalysis) {
      console.log(`📊 智能分析结果:`);
      console.log(`   - Live图: ${result.mediaAnalysis.livePhotoGroups}组`);
      console.log(`   - 普通图片: ${result.mediaAnalysis.regularImages}张`);
      console.log(`   - 总内容: ${result.mediaAnalysis.totalGroups}项`);
    }

    debugLog(`解析完成: ${result.contentType}类型，${result.images.length}张图片，${result.videos?.length || 0}个视频`, true);

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debugLog(`解析失败: ${errorMessage}`, true);

    return {
      error: true,
      message: errorMessage,
      url: url,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 设置调试模式
 * @param enabled - 是否启用调试模式
 */
export function setDebugMode(enabled: boolean): void {
  DEFAULT_CONFIG.debug.verbose = enabled;
}

/**
 * 简化的解析函数，只返回基本信息
 * @param url - 小红书链接
 * @returns 基本解析结果
 */
export async function parseXiaohongshuBasic(url: string): Promise<XiaohongshuBasicResult | XiaohongshuErrorResult> {
  const result = await parseXiaohongshuLink(url);

  if ('error' in result) {
    return result;
  }

  return {
    title: result.title,
    author: result.author.name,
    content: result.content,
    contentType: result.contentType,
    imageCount: result.images.length,
    videoCount: result.video ? 1 : 0,
    firstImage: result.images[0] || null,
    firstVideo: result.video || null
  };
}

/**
 * 验证链接是否为小红书链接
 * 与utils.js中的extractXiaohongshuLink函数保持一致
 * @param url - 要验证的URL
 * @returns 是否为小红书链接
 */
export function isXiaohongshuLink(url: string | null | undefined): boolean {
  if (!url) return false;

  const xiaohongshuPatterns: readonly RegExp[] = [
    /xhslink\.com/i,
    /xiaohongshu\.com/i,
    /xhs\.link/i
  ];

  return xiaohongshuPatterns.some(pattern => pattern.test(url));
}

// ==================== 系统兼容性适配器 ====================

/**
 * 解析小红书链接，提取结构化数据
 * 与现有系统兼容的适配器函数
 * @param xhsUrl - 小红书链接
 * @param maxRetries - 最大重试次数
 * @returns 标准化的解析结果
 */
export async function parseXiaohongshu(xhsUrl: string, maxRetries: number = 2): Promise<XiaohongshuResult> {
  try {
    console.log(`🔍 开始解析小红书链接: ${xhsUrl}`);

    // 启用调试模式以获取详细日志
    setDebugMode(true);

    // 使用新的ES6解析器
    const extractedData = await parseXiaohongshuLink(xhsUrl, {
      network: {
        maxRetries: maxRetries,
        timeout: 15000,
        retryDelay: 1000
      },
      debug: {
        verbose: true
      }
    });

    // 检查是否有错误
    if ('error' in extractedData) {
      console.error(`❌ 解析失败: ${extractedData.message}`);
      throw new Error(extractedData.message || '解析失败');
    }

    console.log(`✅ 解析成功: ${extractedData.title}`);
    console.log(`📊 内容类型: ${extractedData.contentType}, 图片: ${extractedData.images.length}张, 视频: ${extractedData.video ? 1 : 0}个`);

    // 视频内容优化提示
    if (extractedData.contentType === 'video') {
      if (extractedData.coverImage) {
        console.log(`🎬 视频内容已优化: 封面图片单独处理，图片列表已清空`);
      }
      if (extractedData.originalImageCount && extractedData.originalImageCount > 0) {
        console.log(`🎬 过滤了 ${extractedData.originalImageCount} 张图片，避免在视频笔记中显示`);
      }
    }

    // 标准化数据结构，与原API返回格式保持一致
    const standardizedData: XiaohongshuResult = {
      title: extractedData.title || '',
      author: {
        name: extractedData.author.name || '',
        id: extractedData.noteId || '',
        avatar: '' // 新解析器暂不提供作者头像
      },
      content: extractedData.content || extractedData.title || '', // 使用正文或标题
      images: extractedData.images || [], // 视频笔记时为空数组
      // 封面图片处理：视频笔记使用coverImage，图文笔记使用第一张图片
      cover: extractedData.coverImage || (extractedData.images && extractedData.images[0]) || undefined,
      video: extractedData.video || undefined,
      videos: extractedData.videos || undefined,
      contentType: extractedData.contentType,
      noteId: extractedData.noteId,
      originalUrl: extractedData.originalUrl,
      original_url: extractedData.originalUrl,
      timestamp: extractedData.timestamp
    };

    // 添加视频内容的特殊字段
    if (extractedData.coverImage) {
      standardizedData.coverImage = extractedData.coverImage;
    }
    if (extractedData.originalImageCount) {
      standardizedData.originalImageCount = extractedData.originalImageCount;
    }

    // 添加Live图标识
    if (extractedData.isLivePhoto === true) {
      (standardizedData as any).isLivePhoto = true;
      console.log(`📸 Live图标识已传递到标准化数据中`);
    }

    // 添加分组内容标识
    if (extractedData.isGroupedContent === true) {
      (standardizedData as any).isGroupedContent = true;
      console.log(`📸 分组内容标识已传递到标准化数据中，将添加"实况图片"标签`);
    }

    // 添加媒体分析结果
    if (extractedData.mediaAnalysis) {
      (standardizedData as any).mediaAnalysis = extractedData.mediaAnalysis;
      console.log(`📊 媒体分析结果已传递到标准化数据中`);
    }

    console.log(`📋 标准化数据完成，返回结果`);
    return standardizedData;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ 小红书解析失败: ${errorMessage}`);

    // 返回错误结果，但保持类型一致
    throw new Error(`小红书内容解析失败: ${errorMessage}`);
  }
}

// ==================== 辅助函数 ====================

/**
 * 从小红书URL中提取type参数
 * @param url - 小红书URL
 * @returns type参数值
 */
function extractTypeFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('type');
  } catch (error) {
    console.warn('提取URL参数失败:', error);
    return null;
  }
}

/**
 * 检查HTML中是否包含livePhotoData
 * @param html - HTML内容
 * @returns 是否包含livePhotoData
 */
function hasLivePhotoData(html: string): boolean {
  try {
    // 查找所有script标签中的JSON数据
    const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gs) || [];

    for (const script of scriptMatches) {
      const content = script.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');

      // 查找可能的JSON对象
      const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];

      for (const jsonStr of jsonMatches) {
        if (jsonStr.length > 50) {
          try {
            const parsed = JSON.parse(jsonStr);

            // 检查是否是Live图视频数据
            if (parsed.h264 && Array.isArray(parsed.h264) && parsed.h264.length > 0) {
              return true;
            }
          } catch (e) {
            // 忽略JSON解析失败
          }
        }
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 基于URL参数和内容判断小红书笔记类型
 * @param finalUrl - 重定向后的最终URL
 * @param html - HTML内容
 * @returns 笔记类型和是否为Live图
 */
function determineNoteType(finalUrl: string, html: string): {
  contentType: 'image' | 'video' | 'text';
  isLivePhoto: boolean;
} {
  const typeParam = extractTypeFromUrl(finalUrl);

  console.log(`🔍 URL类型参数检测:`, {
    finalUrl: finalUrl.substring(0, 100) + '...',
    typeParam
  });

  // 方案1: type=video → 视频笔记
  if (typeParam === 'video') {
    console.log(`🎬 URL参数识别为视频笔记 (type=video)`);
    return {
      contentType: 'video',
      isLivePhoto: false
    };
  }

  // 方案2: type=normal → 需要进一步判断
  if (typeParam === 'normal') {
    const hasLiveData = hasLivePhotoData(html);

    if (hasLiveData) {
      console.log(`📸 URL参数为normal且有livePhotoData，识别为实况图片笔记`);
      return {
        contentType: 'image', // Live图本质上是图片+动态效果
        isLivePhoto: true
      };
    } else {
      console.log(`📄 URL参数为normal且无livePhotoData，识别为图文笔记`);
      return {
        contentType: 'image',
        isLivePhoto: false
      };
    }
  }

  // 回退方案: 没有type参数时，使用传统逻辑
  console.log(`⚠️ 未找到type参数，使用回退逻辑判断`);
  const hasLiveData = hasLivePhotoData(html);

  if (hasLiveData) {
    console.log(`📸 回退逻辑：有livePhotoData，识别为实况图片笔记`);
    return {
      contentType: 'image',
      isLivePhoto: true
    };
  } else {
    console.log(`📄 回退逻辑：无livePhotoData，识别为图文笔记`);
    return {
      contentType: 'image',
      isLivePhoto: false
    };
  }
}

// ==================== 类型守卫函数 ====================

/**
 * 检查解析结果是否为错误
 * @param result - 解析结果
 * @returns 是否为错误结果
 */
export function isErrorResult(result: XiaohongshuParseResult): result is XiaohongshuErrorResult {
  return 'error' in result && result.error === true;
}

/**
 * 检查解析结果是否为成功结果
 * @param result - 解析结果
 * @returns 是否为成功结果
 */
export function isSuccessResult(result: XiaohongshuParseResult): result is XiaohongshuResult {
  return !('error' in result);
}

// 类型已通过interface导出，无需重复导出
