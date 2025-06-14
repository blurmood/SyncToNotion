/**
 * 主入口文件 - TypeScript版本
 * 企微同步Notion项目的核心路由和业务逻辑，具有完整的类型安全
 * 
 * @fileoverview 主应用入口，处理HTTP路由和业务流程
 * @author Augment Agent
 * @version 3.0.0 (TypeScript)
 */

import { Router } from 'itty-router';
import { parseXiaohongshu } from './xiaohongshuParser.js';
import { parseDouyin } from './douyinParser.js';
import { handleMediaFiles, processMediaFile, initR2Binding, type MediaEnv, type ProcessedMediaData } from './media.js';
import { generateResponse, handleError, extractXiaohongshuLink, extractDouyinLink, type ResponseData } from './utils.js';
import { KV_CONFIG, IMAGE_HOST_CONFIG } from './config.js';
import { imageHostService } from './imageHost.js';
import { syncToNotion, type ParsedData, type SyncResult } from './notionSync.js';

// ==================== 类型定义 ====================

/** KV命名空间接口 */
interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<any>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<any>;
}

/** Cloudflare Workers 环境变量接口 */
export interface WorkerEnv extends MediaEnv {
  /** KV存储绑定 */
  CACHE_KV: KVNamespace;
  /** 管理员密钥 */
  ADMIN_KEY: string;
  /** 图床用户名 */
  IMAGE_HOST_USERNAME?: string;
  /** 图床密码 */
  IMAGE_HOST_PASSWORD?: string;
}

/** 执行上下文接口 */
export interface ExecutionContext {
  /** 等待异步操作完成 */
  waitUntil(promise: Promise<any>): void;
  /** 传递给下一个处理器 */
  passThroughOnException(): void;
}

/** 请求处理器类型 */
export type RequestHandler = (
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext
) => Promise<Response> | Response;

/** 链接提取结果接口 */
export interface LinkExtractionResult {
  /** 是否找到链接 */
  found: boolean;
  /** 提取的链接 */
  link?: string;
  /** 平台类型 */
  platform?: string;
  /** 原始文本 */
  original_text?: string;
  /** 错误信息 */
  message?: string;
}

/** 解析响应接口 */
export interface ParseResponse extends ProcessedMediaData {
  /** 是否正在处理 */
  _processing?: boolean;
  /** 缓存状态 */
  _cache?: 'hit' | 'miss';
  /** 缓存时间 */
  _cached_at?: string;
  /** 时间戳 */
  _timestamp?: string;
  /** 错误标识（兼容ResponseData） */
  error?: false;
  /** 数据字段（兼容ResponseData） */
  data?: any;
  /** 消息字段（兼容ResponseData） */
  message?: string;
  /** 时间戳字段（兼容ResponseData） */
  timestamp?: string;
}

/** 同步请求体接口 */
export interface SyncRequestBody {
  /** 文本内容 */
  text: string;
  /** 管理员密钥 */
  key: string;
  /** 自定义标签 */
  tags?: string[] | string;
}

/** 同步响应接口 */
export interface SyncResponse {
  /** 响应消息 */
  message: string;
  /** 提取的链接 */
  extracted_link: string;
  /** 平台类型 */
  platform?: string;
  /** Notion页面ID */
  notion_page_id: string;
  /** Notion页面URL */
  notion_page_url?: string;
  /** 应用的标签 */
  applied_tags: string[];
  /** 视频是否已处理 */
  video_processed: boolean;
  /** 视频是否正在处理 */
  video_processing: boolean;
  /** 视频URL */
  video_url: string | null;
  /** 视频下载URL */
  video_download_url: string | null;
  /** 是否异步处理 */
  async_processing: boolean;
  /** 备注 */
  note: string;
}

/** 错误响应接口 */
export interface ErrorResponse {
  /** 是否为错误 */
  error: true;
  /** 错误消息 */
  message: string;
  /** 错误详情 */
  details?: string;
  /** 相关URL */
  url?: string;
  /** 原始文本 */
  original_text?: string;
  /** 时间戳 */
  timestamp: string;
}

/** 令牌刷新响应接口 */
export interface TokenRefreshResponse {
  /** 响应消息 */
  message: string;
  /** 过期时间 */
  expires_at: string;
}

/** 健康检查响应接口 */
export interface HealthResponse {
  /** 状态 */
  status: 'ok';
  /** 时间戳 */
  timestamp: string;
}

// ==================== 路由器初始化 ====================

/** 创建路由器实例 */
const router = Router();

// ==================== 工具函数 ====================

/**
 * 验证管理员权限
 * @param adminKey - 提供的管理员密钥
 * @param env - 环境变量
 * @returns 是否有效
 */
function validateAdminKey(adminKey: string | null, env: WorkerEnv): boolean {
  return !!(adminKey && adminKey === env.ADMIN_KEY);
}

/**
 * 处理自定义标签
 * @param tags - 标签数据
 * @returns 处理后的标签数组
 */
function processCustomTags(tags: string[] | string | undefined): string[] {
  if (!tags) return [];
  
  if (Array.isArray(tags)) {
    return tags
      .map(tag => typeof tag === 'string' ? tag.trim() : String(tag))
      .filter(tag => tag);
  }
  
  if (typeof tags === 'string') {
    return tags.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag);
  }
  
  return [];
}

/**
 * 检测是否为Live图内容
 * @param parsedData - 解析数据
 * @returns 是否为Live图
 */
function isLivePhoto(parsedData: ProcessedMediaData): boolean {
  // 首先检查解析器是否已经标识为Live图
  if ('isLivePhoto' in parsedData && parsedData.isLivePhoto === true) {
    return true;
  }

  // 检查是否有Live图视频数组
  if ('livePhotos' in parsedData && Array.isArray(parsedData.livePhotos) && parsedData.livePhotos.length > 0) {
    return true;
  }

  // 检查标签中是否包含实况图片标识
  if ('tags' in parsedData && typeof parsedData.tags === 'string' && parsedData.tags.includes('实况图片')) {
    return true;
  }

  // 回退到文本关键词检测（用于小红书等其他平台）
  // 注意：这里应该更严格，避免误判普通视频
  const title = parsedData.title || '';
  const content = parsedData.content || '';

  // 更严格的Live图关键词，避免误判
  const liveKeywords = [
    'live photo', 'livephoto', 'live图片',
    '实况照片', '实况图片', '动态照片'
  ];

  const text = (title + ' ' + content).toLowerCase();

  // 只有明确包含Live图关键词才判断为Live图
  const hasLiveKeyword = liveKeywords.some(keyword =>
    text.includes(keyword.toLowerCase())
  );

  // 额外检查：如果只是包含"live"但不是Live图关键词，不应该判断为Live图
  if (hasLiveKeyword) {
    console.log(`🔍 检测到Live图关键词: "${title}"`);
    return true;
  }

  return false;
}

/**
 * 生成系统标签
 * @param parsedData - 解析数据
 * @param platform - 平台类型
 * @returns 系统标签数组
 */
function generateSystemTags(parsedData: ProcessedMediaData, platform?: string): string[] {
  const tags: string[] = [];

  // 添加平台标签
  if (platform) {
    tags.push(platform);
  } else if (parsedData.original_url) {
    if (parsedData.original_url.includes('xhslink.com') ||
        parsedData.original_url.includes('xiaohongshu.com')) {
      tags.push('小红书');
    } else if (parsedData.original_url.includes('douyin.com')) {
      tags.push('抖音');
    }
  }

  // 检查是否为Live图或分组内容
  if (isLivePhoto(parsedData) || ('addLivePhotoTag' in parsedData && (parsedData as any).addLivePhotoTag === true)) {
    tags.push('实况图片');
  }

  // 添加内容类型标签
  if (Array.isArray(parsedData.images) && parsedData.images.length > 0) {
    tags.push('图文');
  }

  if (parsedData.video) {
    tags.push('视频');
  }

  return tags;
}

/**
 * 合并所有标签
 * @param parsedData - 解析数据
 * @param customTags - 自定义标签
 * @param platform - 平台类型
 * @returns 合并后的标签数组
 */
function mergeAllTags(parsedData: ProcessedMediaData, customTags: string[], platform?: string): string[] {
  const systemTags = generateSystemTags(parsedData, platform);
  const allTags = [...systemTags];

  // 添加自定义标签，避免重复
  for (const tag of customTags) {
    if (tag && !allTags.includes(tag)) {
      allTags.push(tag);
    }
  }

  return allTags;
}

/**
 * 初始化图床配置
 * @param env - 环境变量
 */
function initImageHostConfig(env: WorkerEnv): void {
  if (env.IMAGE_HOST_USERNAME && env.IMAGE_HOST_PASSWORD) {
    console.log(`使用环境变量中的图床凭据: ${env.IMAGE_HOST_USERNAME}`);
    IMAGE_HOST_CONFIG.AUTH.USERNAME = env.IMAGE_HOST_USERNAME;
    IMAGE_HOST_CONFIG.AUTH.PASSWORD = env.IMAGE_HOST_PASSWORD;
  } else {
    console.log(`使用默认图床凭据: ${IMAGE_HOST_CONFIG.AUTH.USERNAME}`);
  }
}

/**
 * 预获取图床令牌
 * @param ctx - 执行上下文
 */
function prefetchImageHostToken(ctx: ExecutionContext): void {
  ctx.waitUntil((async () => {
    try {
      console.log('预获取图床令牌...');
      const token = await imageHostService.getToken();
      console.log('图床令牌预获取成功');
    } catch (error) {
      console.error('预获取图床令牌失败:', error);
    }
  })());
}

// ==================== 路由处理器 ====================

/**
 * 健康检查端点
 */
router.get('/health', (): Response => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString()
  };
  return generateResponse(response);
});

/**
 * POST版本的提取链接端点
 */
router.post('/extract-link', async (request: Request): Promise<Response> => {
  try {
    // 解析请求体
    const contentType = request.headers.get('content-type') || '';
    let text = '';
    
    if (contentType.includes('application/json')) {
      const body = await request.json() as { text?: string };
      text = body.text || '';
    } else {
      text = await request.text();
    }
    
    // 验证输入
    if (!text) {
      const errorResponse: ErrorResponse = {
        error: true,
        message: '缺少文本内容',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 400);
    }
    
    // 提取链接 - 先尝试小红书，再尝试抖音
    let link = extractXiaohongshuLink(text);
    let platform = '小红书';

    if (!link) {
      link = extractDouyinLink(text);
      platform = '抖音';
    }

    const result: LinkExtractionResult = link ? {
      found: true,
      link,
      platform,
      original_text: text
    } : {
      found: false,
      message: '未找到小红书或抖音链接'
    };

    return generateResponse(result);
    
  } catch (error) {
    return handleError(error);
  }
});

/**
 * GET版本的提取链接端点
 */
router.get('/extract-link', async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const text = url.searchParams.get('text');
    
    // 验证输入
    if (!text) {
      const errorResponse: ErrorResponse = {
        error: true,
        message: '缺少text参数',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 400);
    }
    
    // 提取链接 - 先尝试小红书，再尝试抖音
    let link = extractXiaohongshuLink(text);
    let platform = '小红书';

    if (!link) {
      link = extractDouyinLink(text);
      platform = '抖音';
    }

    const result: LinkExtractionResult = link ? {
      found: true,
      link,
      platform,
      original_text: text
    } : {
      found: false,
      message: '未找到小红书或抖音链接'
    };

    return generateResponse(result);
    
  } catch (error) {
    return handleError(error);
  }
});

/**
 * 主要解析端点
 */
router.get('/parse', async (request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const xhsUrl = url.searchParams.get('url');
    const refresh = url.searchParams.get('refresh') === 'true';
    const rawOnly = url.searchParams.get('raw_only') === 'true';

    // 验证输入
    if (!xhsUrl) {
      const errorResponse: ErrorResponse = {
        error: true,
        message: '缺少 url 参数',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 400);
    }

    // 检查缓存（除非强制刷新）
    // 根据链接类型生成不同的缓存键
    const isDouyinUrl = xhsUrl.includes('douyin.com') || xhsUrl.includes('v.douyin.com');
    const cacheKey = isDouyinUrl ? `dy:${xhsUrl}` : `xhs:${xhsUrl}`;
    let cached: ParseResponse | null = null;

    if (!refresh) {
      cached = await env.CACHE_KV.get(cacheKey, { type: 'json' }) as ParseResponse | null;
    }

    if (cached) {
      const cachedResponse: ParseResponse = {
        ...cached,
        _cache: 'hit',
        _cached_at: cached._timestamp
      };
      return generateResponse(cachedResponse);
    }

    // 初始化图床配置
    initImageHostConfig(env);

    // 预先获取图床令牌（异步）
    prefetchImageHostToken(ctx);

    // 智能识别链接类型并选择对应的解析器
    let parsedData;
    let platform = '小红书';

    // 添加详细的调试信息
    console.log(`🔍 URL类型检测:`, {
      url: xhsUrl,
      includes_douyin: xhsUrl.includes('douyin.com'),
      includes_v_douyin: xhsUrl.includes('v.douyin.com'),
      url_length: xhsUrl.length,
      url_type: typeof xhsUrl
    });

    // 检查是否为抖音链接
    if (xhsUrl.includes('douyin.com') || xhsUrl.includes('v.douyin.com')) {
      platform = '抖音';
      console.log(`🎯 识别为抖音链接，开始解析: ${xhsUrl}`);
      parsedData = await parseDouyin(xhsUrl);
    } else {
      console.log(`🎯 识别为小红书链接，开始解析: ${xhsUrl}`);
      parsedData = await parseXiaohongshu(xhsUrl);
    }
    console.log(`✅ 解析成功: ${platform}内容`);
    console.log(`📊 内容类型: ${(parsedData as any).contentType}, 图片: ${parsedData.images?.length || 0}张, 视频: ${(parsedData as any).videos?.length || 0}个`);

    // 如果请求原始数据，直接返回解析结果，不进行媒体处理
    if (rawOnly) {
      console.log('返回原始解析数据，跳过媒体处理');
      const rawResponse: ParseResponse = {
        ...parsedData,
        _processing: false
      } as any;
      return generateResponse(rawResponse);
    }

    // 处理媒体文件（异步）
    ctx.waitUntil((async () => {
      try {
        console.log('开始处理媒体文件...');
        const processedData = await handleMediaFiles(parsedData as any, env.MEDIA_BUCKET, env);
        console.log('媒体文件处理完成，保存到缓存');

        // 保存到缓存
        processedData._timestamp = new Date().toISOString();
        await env.CACHE_KV.put(cacheKey, JSON.stringify(processedData), {
          expirationTtl: KV_CONFIG.CACHE_TTL
        });
        console.log('数据已保存到缓存');
      } catch (error) {
        console.error('处理媒体文件或缓存数据失败:', error);
      }
    })());

    // 返回初步结果（媒体处理可能仍在进行）
    const response: ParseResponse = {
      ...(parsedData as any),
      _processing: true
    };

    return generateResponse(response);

  } catch (error) {
    return handleError(error);
  }
});

/**
 * 同步到 Notion 端点
 */
router.get('/sync-to-notion', async (request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> => {
  try {
    console.log('收到同步到Notion请求');
    const url = new URL(request.url);
    let xhsUrl = url.searchParams.get('url');
    const adminKey = url.searchParams.get('key');

    console.log('原始URL参数:', xhsUrl);

    // 验证管理员权限
    if (!validateAdminKey(adminKey, env)) {
      console.log('验证失败: 管理员密钥不匹配');
      const errorResponse: ErrorResponse = {
        error: true,
        message: '未授权',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 401);
    }

    // 验证输入
    if (!xhsUrl) {
      console.log('验证失败: 缺少url参数');
      const errorResponse: ErrorResponse = {
        error: true,
        message: '缺少 url 参数',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 400);
    }

    // 尝试从文本中提取小红书链接
    if (!xhsUrl.startsWith('http://') && !xhsUrl.startsWith('https://')) {
      console.log('输入不是URL，尝试从文本中提取链接');
      const extractedLink = extractXiaohongshuLink(xhsUrl);
      if (extractedLink) {
        console.log(`从文本中提取到小红书链接: ${extractedLink}`);
        xhsUrl = extractedLink;
      } else {
        console.log('未找到有效的小红书链接');
        const errorResponse: ErrorResponse = {
          error: true,
          message: '未找到有效的小红书链接',
          original_text: xhsUrl,
          timestamp: new Date().toISOString()
        };
        return generateResponse(errorResponse, 400);
      }
    } else if (!xhsUrl.includes('xiaohongshu.com') && !xhsUrl.includes('xhslink.com')) {
      console.log('URL不是小红书链接，尝试从文本中提取链接');
      const extractedLink = extractXiaohongshuLink(xhsUrl);
      if (extractedLink) {
        console.log(`从文本中提取到小红书链接: ${extractedLink}`);
        xhsUrl = extractedLink;
      } else {
        console.log('未找到有效的小红书链接');
        const errorResponse: ErrorResponse = {
          error: true,
          message: '未找到有效的小红书链接',
          original_text: xhsUrl,
          timestamp: new Date().toISOString()
        };
        return generateResponse(errorResponse, 400);
      }
    }

    console.log('处理的链接:', xhsUrl);

    // 检查缓存中是否有处理好的数据
    const cacheKey = `xhs:${xhsUrl}`;
    let parsedData = await env.CACHE_KV.get(cacheKey, { type: 'json' }) as ProcessedMediaData | null;

    // 如果缓存中没有数据，或者数据中没有处理好的图片，则重新解析
    if (!parsedData || !parsedData.processed) {
      console.log(`没有找到已处理的缓存数据，开始重新解析: ${xhsUrl}`);

      try {
        const rawData = await parseXiaohongshu(xhsUrl);
        console.log('小红书内容解析成功');

        // 准备同步到Notion的数据
        parsedData = { ...rawData };

        // 处理所有媒体文件（图片、封面、视频）
        console.log('开始处理所有媒体文件...');

        // 设置图床服务的环境变量
        imageHostService.setEnv(env);

        try {
          // 使用handleMediaFiles函数处理所有媒体文件
          const processedData = await handleMediaFiles(parsedData, env.MEDIA_BUCKET, env);

          // 更新parsedData为处理后的数据
          Object.assign(parsedData, processedData);

          console.log('所有媒体文件处理成功，可以同步到Notion');
          console.log('处理后的数据:', {
            cover: parsedData.cover ? '已处理' : '无',
            images: parsedData.images ? parsedData.images.length : 0,
            video: parsedData.video ? '已处理' : '无'
          });

        } catch (mediaError) {
          console.error('媒体文件处理失败:', mediaError);
          throw new Error(`媒体文件处理失败: ${mediaError instanceof Error ? mediaError.message : String(mediaError)}`);
        }

        // 更新缓存
        parsedData._timestamp = new Date().toISOString();
        await env.CACHE_KV.put(cacheKey, JSON.stringify(parsedData), {
          expirationTtl: KV_CONFIG.CACHE_TTL
        });
      } catch (parseError) {
        console.error('解析小红书内容失败:', parseError);
        const errorResponse: ErrorResponse = {
          error: true,
          message: '解析小红书内容失败',
          details: parseError instanceof Error ? parseError.message : String(parseError),
          url: xhsUrl,
          timestamp: new Date().toISOString()
        };
        return generateResponse(errorResponse, 500);
      }
    }

    // 同步到 Notion
    console.log('开始同步到 Notion...');
    try {
      const notionResponse = await syncToNotion(parsedData as ParsedData);
      console.log('同步到Notion成功');

      // 视频已在同步处理中完成，无需异步处理
      console.log('所有媒体文件（包括视频）已同步处理完成');

      // 获取所有应用的标签（系统标签 + 自定义标签）
      const allTags = mergeAllTags(parsedData, []);

      const syncResponse: SyncResponse = {
        message: '同步到 Notion 成功',
        extracted_link: xhsUrl,
        notion_page_id: notionResponse.pageId || '',
        notion_page_url: notionResponse.pageId ? `https://notion.so/${notionResponse.pageId}` : undefined,
        applied_tags: allTags,
        video_processed: !!parsedData.video,
        video_processing: false,
        video_url: parsedData.video || null,
        video_download_url: parsedData.video_download_url || null,
        async_processing: false,
        note: '同步完成'
      };

      return generateResponse(syncResponse);
    } catch (notionError) {
      console.error('同步到Notion失败:', notionError);
      const errorResponse: ErrorResponse = {
        error: true,
        message: '同步到Notion失败',
        details: notionError instanceof Error ? notionError.message : String(notionError),
        url: xhsUrl,
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 500);
    }

  } catch (error) {
    console.error('同步到 Notion 失败:', error);
    return handleError(error);
  }
});

/**
 * 图床令牌刷新端点（仅限管理员访问）
 */
router.get('/admin/refresh-token', async (request: Request, env: WorkerEnv): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const adminKey = url.searchParams.get('key');

    console.log('收到令牌刷新请求');

    if (!validateAdminKey(adminKey, env)) {
      console.log('管理员验证失败');
      const errorResponse: ErrorResponse = {
        error: true,
        message: '未授权',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 401);
    }

    console.log('管理员验证成功，开始刷新令牌');

    // 强制刷新图床令牌
    (imageHostService as any).token = null;
    (imageHostService as any).tokenExpiresAt = 0;

    try {
      const newToken = await imageHostService.getToken();
      console.log('令牌刷新成功');

      const refreshResponse: TokenRefreshResponse = {
        message: '令牌已刷新',
        expires_at: new Date((imageHostService as any).tokenExpiresAt).toISOString()
      };

      return generateResponse(refreshResponse);
    } catch (tokenError) {
      console.error('刷新令牌失败:', tokenError);
      const errorResponse: ErrorResponse = {
        error: true,
        message: '刷新令牌失败',
        details: tokenError instanceof Error ? tokenError.message : String(tokenError),
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 500);
    }
  } catch (error) {
    console.error('令牌刷新端点错误:', error);
    return handleError(error);
  }
});

/**
 * 从文本同步到Notion端点
 */
router.post('/sync-from-text', async (request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> => {
  try {
    console.log(`🚀 [${new Date().toISOString()}] 收到从文本同步到Notion请求`);

    // 解析请求体
    const contentType = request.headers.get('content-type') || '';
    console.log('Content-Type:', contentType);

    let text = '';
    let adminKey = '';
    let customTags: string[] = [];

    if (contentType.includes('application/json')) {
      try {
        console.log(`📥 [${new Date().toISOString()}] 开始解析JSON请求体...`);
        const body = await request.json() as SyncRequestBody;
        console.log(`📥 [${new Date().toISOString()}] JSON解析成功:`, JSON.stringify(body));
        text = body.text || '';
        adminKey = body.key || '';
        customTags = processCustomTags(body.tags);

        console.log('处理后的自定义标签:', customTags);
      } catch (jsonError) {
        console.error('解析JSON请求体失败:', jsonError);
        const errorResponse: ErrorResponse = {
          error: true,
          message: '无效的JSON格式',
          details: jsonError instanceof Error ? jsonError.message : String(jsonError),
          timestamp: new Date().toISOString()
        };
        return generateResponse(errorResponse, 400);
      }
    } else {
      try {
        const formData = await request.formData();
        const formEntries: string[] = [];
        formData.forEach((value, key) => {
          formEntries.push(`${key}=${value}`);
        });
        console.log('请求体 (FormData):', formEntries.join(', '));
        text = formData.get('text')?.toString() || '';
        adminKey = formData.get('key')?.toString() || '';

        // 处理表单中的标签
        const tagsValue = formData.get('tags')?.toString() || '';
        customTags = processCustomTags(tagsValue);

        console.log('处理后的自定义标签:', customTags);
      } catch (formError) {
        console.error('解析表单数据失败:', formError);
        const errorResponse: ErrorResponse = {
          error: true,
          message: '无效的表单数据',
          details: formError instanceof Error ? formError.message : String(formError),
          timestamp: new Date().toISOString()
        };
        return generateResponse(errorResponse, 400);
      }
    }

    console.log(`📝 [${new Date().toISOString()}] 提取的文本:`, text);
    console.log(`🔑 [${new Date().toISOString()}] 提取的密钥:`, adminKey ? '已提供' : '未提供');

    // 验证管理员权限
    if (!validateAdminKey(adminKey, env)) {
      console.log(`❌ [${new Date().toISOString()}] 验证失败: 管理员密钥不匹配`);
      const errorResponse: ErrorResponse = {
        error: true,
        message: '未授权',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 401);
    }

    // 验证输入
    if (!text) {
      console.log(`❌ [${new Date().toISOString()}] 验证失败: 缺少文本内容`);
      const errorResponse: ErrorResponse = {
        error: true,
        message: '缺少文本内容',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 400);
    }

    // 从文本中提取链接 - 支持小红书和抖音
    console.log(`🔗 [${new Date().toISOString()}] 开始提取链接...`);
    let extractedUrl = extractXiaohongshuLink(text);
    let platform = '小红书';

    if (!extractedUrl) {
      extractedUrl = extractDouyinLink(text);
      platform = '抖音';
    }

    if (!extractedUrl) {
      console.log(`❌ [${new Date().toISOString()}] 未找到有效的小红书或抖音链接`);
      const errorResponse: ErrorResponse = {
        error: true,
        message: '未找到有效的小红书或抖音链接',
        original_text: text,
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 400);
    }

    console.log(`✅ [${new Date().toISOString()}] 提取到${platform}链接: ${extractedUrl}`);

    // 检查缓存中是否有处理好的数据
    const cacheKey = platform === '小红书' ? `xhs:${extractedUrl}` : `dy:${extractedUrl}`;
    let parsedData = await env.CACHE_KV.get(cacheKey, { type: 'json' }) as ProcessedMediaData | null;

    // 如果缓存中没有数据，或者数据中没有处理好的媒体文件，则重新解析
    if (!parsedData || !parsedData.processed) {
      console.log(`🔄 [${new Date().toISOString()}] 没有找到已处理的缓存数据，开始重新解析: ${extractedUrl}`);

      try {
        let rawData;
        if (platform === '小红书') {
          rawData = await parseXiaohongshu(extractedUrl);
        } else {
          rawData = await parseDouyin(extractedUrl);
        }
        console.log(`✅ [${new Date().toISOString()}] ${platform}内容解析成功`);

        // 准备同步到Notion的数据
        parsedData = rawData as ProcessedMediaData;

        // 添加自定义标签到解析数据中
        if (customTags.length > 0) {
          parsedData.custom_tags = customTags;
          console.log(`🏷️ [${new Date().toISOString()}] 添加自定义标签:`, customTags);
        }

        // 处理所有媒体文件（图片、封面、视频）
        console.log(`🎬 [${new Date().toISOString()}] 开始处理所有媒体文件...`);

        // 设置图床服务的环境变量
        imageHostService.setEnv(env);

        try {
          // 使用handleMediaFiles函数处理所有媒体文件
          const processedData = await handleMediaFiles(parsedData, env.MEDIA_BUCKET, env);

          // 更新parsedData为处理后的数据
          Object.assign(parsedData, processedData);

          console.log(`✅ [${new Date().toISOString()}] 所有媒体文件处理成功，可以同步到Notion`);
          console.log(`📊 [${new Date().toISOString()}] 处理后的数据:`, {
            cover: parsedData.cover ? '已处理' : '无',
            images: parsedData.images ? parsedData.images.length : 0,
            video: parsedData.video ? '已处理' : '无'
          });

        } catch (mediaError) {
          console.error(`❌ [${new Date().toISOString()}] 媒体文件处理失败:`, mediaError);
          throw new Error(`媒体文件处理失败: ${mediaError instanceof Error ? mediaError.message : String(mediaError)}`);
        }

        // 更新缓存
        parsedData._timestamp = new Date().toISOString();
        await env.CACHE_KV.put(cacheKey, JSON.stringify(parsedData), {
          expirationTtl: KV_CONFIG.CACHE_TTL
        });
        console.log(`💾 [${new Date().toISOString()}] 数据已保存到缓存`);
      } catch (parseError) {
        console.error(`❌ [${new Date().toISOString()}] 解析${platform}内容失败:`, parseError);
        const errorResponse: ErrorResponse = {
          error: true,
          message: `解析${platform}内容失败`,
          details: parseError instanceof Error ? parseError.message : String(parseError),
          url: extractedUrl,
          timestamp: new Date().toISOString()
        };
        return generateResponse(errorResponse, 500);
      }
    } else {
      console.log(`💾 [${new Date().toISOString()}] 使用缓存中的已处理数据`);

      // 如果有新的自定义标签，添加到现有数据中
      if (customTags.length > 0) {
        const existingTags = parsedData.custom_tags || [];
        const mergedTags = [...existingTags];

        // 添加新标签，避免重复
        for (const tag of customTags) {
          if (!mergedTags.includes(tag)) {
            mergedTags.push(tag);
          }
        }

        parsedData.custom_tags = mergedTags;
        console.log(`🏷️ [${new Date().toISOString()}] 合并自定义标签:`, mergedTags);
      }
    }

    // 同步到 Notion
    console.log(`📝 [${new Date().toISOString()}] 开始同步到 Notion...`);
    try {
      const notionResponse = await syncToNotion(parsedData as ParsedData);

      // 检查同步是否成功
      if (!notionResponse.success) {
        console.error(`❌ [${new Date().toISOString()}] 同步到Notion失败:`, notionResponse.error);
        const errorResponse: ErrorResponse = {
          error: true,
          message: '同步到Notion失败',
          details: notionResponse.error || '未知错误',
          url: extractedUrl,
          timestamp: new Date().toISOString()
        };
        return generateResponse(errorResponse, 500);
      }

      console.log(`✅ [${new Date().toISOString()}] 同步到Notion成功`);

      // 获取所有应用的标签（系统标签 + 自定义标签）
      const allTags = mergeAllTags(parsedData, customTags, platform);

      const syncResponse: SyncResponse = {
        message: '同步到 Notion 成功',
        extracted_link: extractedUrl,
        platform: platform,
        notion_page_id: notionResponse.pageId || '',
        notion_page_url: notionResponse.pageId ? `https://notion.so/${notionResponse.pageId}` : undefined,
        applied_tags: allTags,
        video_processed: !!parsedData.video,
        video_processing: false,
        video_url: parsedData.video || null,
        video_download_url: parsedData.video_download_url || null,
        async_processing: false,
        note: '同步完成'
      };

      console.log(`🎉 [${new Date().toISOString()}] 从文本同步到Notion完成`);
      return generateResponse(syncResponse);
    } catch (notionError) {
      console.error(`❌ [${new Date().toISOString()}] 同步到Notion失败:`, notionError);
      const errorResponse: ErrorResponse = {
        error: true,
        message: '同步到Notion失败',
        details: notionError instanceof Error ? notionError.message : String(notionError),
        url: extractedUrl,
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 500);
    }

  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] 从文本同步到Notion失败:`, error);
    return handleError(error);
  }
});

// ==================== 默认处理器和导出 ====================

/**
 * 404处理器
 */
router.all('*', (): Response => {
  const errorResponse: ErrorResponse = {
    error: true,
    message: '未找到请求的端点',
    details: JSON.stringify([
      'GET /health',
      'GET /extract-link',
      'POST /extract-link',
      'GET /parse',
      'GET /sync-to-notion',
      'POST /sync-from-text',
      'GET /admin/refresh-token'
    ]),
    timestamp: new Date().toISOString()
  };
  return generateResponse(errorResponse, 404);
});

/**
 * 主要的fetch处理器
 * Cloudflare Workers的入口点
 */
export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      // 初始化R2绑定
      if (env.MEDIA_BUCKET) {
        initR2Binding(env);
      }

      // 设置CORS头
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      };

      // 处理预检请求
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: corsHeaders
        });
      }

      // 路由处理
      const response = await router.handle(request, env, ctx);

      // 添加CORS头到响应
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;

    } catch (error) {
      console.error('全局错误处理:', error);
      return handleError(error);
    }
  }
};

// 类型已通过interface导出，无需重复导出
