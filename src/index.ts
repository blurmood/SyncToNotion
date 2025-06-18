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
import { handleMediaFiles, processMediaFile, type MediaEnv, type ProcessedMediaData } from './media.js';
import { generateResponse, handleError, extractXiaohongshuLink, extractDouyinLink, type ResponseData } from './utils.js';
import { KV_CONFIG, IMAGE_HOST_CONFIG } from './config.js';
import { imageHostService } from './imageHost.js';
import { syncToNotion, type ParsedData, type SyncResult } from './notionSync.js';
import { BatchProcessingManager, type ProcessingTask, type BatchProcessResult } from './batchProcessor.js';

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
  /** 自定义批次大小 */
  batch_size?: number;
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

/** 分批处理响应接口 */
export interface BatchSyncResponse {
  /** 响应消息 */
  message: string;
  /** 任务ID */
  task_id?: string;
  /** 提取的链接 */
  extracted_link: string;
  /** 平台类型 */
  platform?: string;
  /** 批次信息 */
  batch_info?: {
    current_batch: number;
    total_batches: number;
    completed_batches: number;
    batch_size: number;
  };
  /** 已处理数量 */
  processed_count?: {
    videos: number;
    images: number;
  };
  /** 剩余数量 */
  remaining_count?: {
    videos: number;
    images: number;
  };
  /** Notion页面ID */
  notion_page_id?: string;
  /** Notion页面URL */
  notion_page_url?: string;
  /** 应用的标签 */
  applied_tags?: string[];
  /** 处理状态 */
  status: 'partial_complete' | 'completed' | 'processing' | 'failed';
  /** 续传URL */
  continue_url?: string | null;
  /** 是否更新了Notion */
  notion_updated?: boolean;
  /** 处理详情 */
  details?: {
    success_count: number;
    failed_count: number;
    errors?: string[];
  };
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

    // 检查是否为抖音链接
    if (xhsUrl.includes('douyin.com') || xhsUrl.includes('v.douyin.com')) {
      platform = '抖音';
      parsedData = await parseDouyin(xhsUrl);
    } else {
      parsedData = await parseXiaohongshu(xhsUrl);
    }
    // 如果请求原始数据，直接返回解析结果，不进行媒体处理
    if (rawOnly) {
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
        const processedData = await handleMediaFiles(parsedData as any, null, env);
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
      try {
        const rawData = await parseXiaohongshu(xhsUrl);

        // 准备同步到Notion的数据
        parsedData = { ...rawData };

        // 设置图床服务的环境变量
        imageHostService.setEnv(env);

        try {
          // 使用handleMediaFiles函数处理所有媒体文件
          const processedData = await handleMediaFiles(parsedData, null, env);

          // 更新parsedData为处理后的数据
          Object.assign(parsedData, processedData);

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
      const notionResponse = await syncToNotion(parsedData as ParsedData, {
        kv: env.CACHE_KV,
        originalUrl: xhsUrl,
        platform: '小红书'
      });
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

    let batchSize = 12;

    if (contentType.includes('application/json')) {
      try {
        const body = await request.json() as SyncRequestBody;
        text = body.text || '';
        adminKey = body.key || '';
        customTags = processCustomTags(body.tags);
        batchSize = body.batch_size || 12;
      } catch (jsonError) {
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

        // 处理分批参数
        batchSize = parseInt(formData.get('batch_size')?.toString() || '12') || 12;
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
    let extractedUrl = extractXiaohongshuLink(text);
    let platform = '小红书';

    if (!extractedUrl) {
      extractedUrl = extractDouyinLink(text);
      platform = '抖音';
    }

    if (!extractedUrl) {
      const errorResponse: ErrorResponse = {
        error: true,
        message: '未找到有效的小红书或抖音链接',
        original_text: text,
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 400);
    }

    // 检查缓存中是否有处理好的数据
    const cacheKey = platform === '小红书' ? `xhs:${extractedUrl}` : `dy:${extractedUrl}`;
    let parsedData = await env.CACHE_KV.get(cacheKey, { type: 'json' }) as ProcessedMediaData | null;

    // 如果缓存中没有数据，或者数据中没有处理好的媒体文件，则重新解析
    if (!parsedData || !parsedData.processed) {

      try {
        let rawData;
        if (platform === '小红书') {
          rawData = await parseXiaohongshu(extractedUrl);
        } else {
          rawData = await parseDouyin(extractedUrl);
        }

        // 准备同步到Notion的数据
        parsedData = rawData as ProcessedMediaData;

        // 添加自定义标签到解析数据中
        if (customTags.length > 0) {
          parsedData.custom_tags = customTags;
        }

        // 检查是否需要分批处理
        const totalVideos = parsedData.videos?.length || 0;
        const totalImages = parsedData.images?.length || 0;
        const estimatedSubrequests = BatchProcessingManager.estimateSubrequests(parsedData.videos, parsedData.images);

        // 自动启用分批模式
        const shouldUseBatch = BatchProcessingManager.shouldUseBatchProcessing(parsedData.videos, parsedData.images);

        if (shouldUseBatch && estimatedSubrequests > 45) {
          // 智能处理模式：根据文件数量选择处理策略
          const totalFiles = totalVideos + totalImages;
          console.log(`🔄 启用分批处理模式: ${totalVideos}个视频, ${totalImages}张图片, 总计${totalFiles}个文件`);

          if (totalFiles <= 24) {
            // 小批次：一次性同步处理所有批次（适合快捷指令）
            console.log(`📦 小批次模式: 一次性处理${totalFiles}个文件`);

            const batchManager = new BatchProcessingManager(env);
            const taskId = await batchManager.createTask(
              parsedData,
              {
                videos: parsedData.videos,
                images: parsedData.images
              },
              batchSize
            );

            // 处理所有批次
            let currentBatchResult = await batchManager.processNextBatch(taskId);
            let allProcessedVideos: string[] = currentBatchResult.processedItems.videos || [];
            let allProcessedImages: string[] = currentBatchResult.processedItems.images || [];

            // 创建第一批数据用于Notion同步
            const partialData = { ...parsedData };
            partialData.videos = allProcessedVideos;
            partialData.images = allProcessedImages;
            partialData.processed = true;

            // 同步第一批到Notion
            const notionResponse = await syncToNotion(partialData as ParsedData, {
              kv: env.CACHE_KV,
              originalUrl: extractedUrl,
              platform: platform as '小红书' | '抖音'
            });

            if (!notionResponse.success) {
              throw new Error(notionResponse.error || '同步到Notion失败');
            }

            // 保存任务的Notion信息
            let task = await batchManager.getTask(taskId);
            if (task) {
              task.notionInfo = {
                pageId: notionResponse.pageId || '',
                pageUrl: notionResponse.pageId ? `https://notion.so/${notionResponse.pageId}` : ''
              };
              await batchManager.updateTask(task);
            }

            // 如果还有剩余批次，继续处理
            while (!currentBatchResult.isComplete) {
              console.log(`🔄 处理第${currentBatchResult.batchInfo.current_batch + 1}批...`);

              // 添加延迟避免请求过快
              await new Promise(resolve => setTimeout(resolve, 500));

              // 处理下一批
              currentBatchResult = await batchManager.processNextBatch(taskId);

              // 累积处理结果
              if (currentBatchResult.processedItems.videos) {
                allProcessedVideos.push(...currentBatchResult.processedItems.videos);
              }
              if (currentBatchResult.processedItems.images) {
                allProcessedImages.push(...currentBatchResult.processedItems.images);
              }
            }

            // 所有批次处理完成，更新Notion页面
            if (task && task.notionInfo && allProcessedVideos.length > partialData.videos!.length) {
              console.log(`✅ 所有批次处理完成，更新Notion页面...`);

              const finalData = { ...parsedData };
              finalData.videos = allProcessedVideos;
              finalData.images = allProcessedImages;
              finalData.processed = true;

              try {
                // 更新Notion页面包含所有处理的媒体文件
                await syncToNotion(finalData as ParsedData, {
                  kv: env.CACHE_KV,
                  originalUrl: extractedUrl,
                  platform: platform as '小红书' | '抖音',
                  pageId: task.notionInfo.pageId // 更新现有页面
                });
                console.log(`✅ Notion页面更新成功: ${task.notionInfo.pageId}`);
              } catch (updateError) {
                console.error('❌ Notion页面更新失败:', updateError);
                // 更新失败不影响整体流程
              }
            }

            // 清理任务
            await batchManager.deleteTask(taskId);

            // 获取所有应用的标签
            const allTags = mergeAllTags(parsedData, customTags, platform);

            // 返回完整的处理结果
            const finalResponse: SyncResponse = {
              message: '所有媒体文件已同步到Notion',
              extracted_link: extractedUrl,
              platform: platform,
              notion_page_id: notionResponse.pageId || '',
              notion_page_url: notionResponse.pageId ? `https://notion.so/${notionResponse.pageId}` : undefined,
              applied_tags: allTags,
              video_processed: allProcessedVideos.length > 0,
              video_processing: false,
              video_url: allProcessedVideos[0] || null,
              video_download_url: null,
              async_processing: false,
              note: `处理完成: ${allProcessedVideos.length}个视频, ${allProcessedImages.length}张图片`
            };

            return generateResponse(finalResponse);

          } else {
            // 大批次：返回分批处理结果，需要续传（适合API调用）
            console.log(`📦 大批次模式: 返回分批处理结果，需要续传`);

            const batchManager = new BatchProcessingManager(env);
            const taskId = await batchManager.createTask(
              parsedData,
              {
                videos: parsedData.videos,
                images: parsedData.images
              },
              batchSize
            );

            // 处理第一批
            const firstBatchResult = await batchManager.processNextBatch(taskId);

            // 创建部分处理的数据用于Notion同步
            const partialData = { ...parsedData };
            partialData.videos = firstBatchResult.processedItems.videos || [];
            partialData.images = firstBatchResult.processedItems.images || [];
            partialData.processed = true;

            // 同步第一批到Notion
            const notionResponse = await syncToNotion(partialData as ParsedData, {
              kv: env.CACHE_KV,
              originalUrl: extractedUrl,
              platform: platform as '小红书' | '抖音'
            });

            if (!notionResponse.success) {
              throw new Error(notionResponse.error || '同步到Notion失败');
            }

            // 保存任务的Notion信息
            const task = await batchManager.getTask(taskId);
            if (task) {
              task.notionInfo = {
                pageId: notionResponse.pageId || '',
                pageUrl: notionResponse.pageId ? `https://notion.so/${notionResponse.pageId}` : ''
              };
              await batchManager.updateTask(task);
            }

            // 获取所有应用的标签
            const allTags = mergeAllTags(parsedData, customTags, platform);

            const batchResponse: BatchSyncResponse = {
              message: firstBatchResult.isComplete ? "处理完成" : "第一批处理完成，需要续传",
              task_id: taskId,
              extracted_link: extractedUrl,
              platform: platform,
              batch_info: firstBatchResult.batchInfo,
              processed_count: {
                videos: firstBatchResult.processedItems.videos?.length || 0,
                images: firstBatchResult.processedItems.images?.length || 0
              },
              remaining_count: {
                videos: Math.max(0, totalVideos - (firstBatchResult.processedItems.videos?.length || 0)),
                images: Math.max(0, totalImages - (firstBatchResult.processedItems.images?.length || 0))
              },
              notion_page_id: notionResponse.pageId,
              notion_page_url: notionResponse.pageId ? `https://notion.so/${notionResponse.pageId}` : undefined,
              applied_tags: allTags,
              status: firstBatchResult.isComplete ? "completed" : "partial_complete",
              continue_url: firstBatchResult.isComplete ? null : `/continue-processing/${taskId}`,
              notion_updated: true,
              details: firstBatchResult.details
            };

            return generateResponse(batchResponse);
          }
        } else {
          // 使用传统处理模式
          // 设置图床服务的环境变量
          imageHostService.setEnv(env);

          try {
            // 使用handleMediaFiles函数处理所有媒体文件
            const processedData = await handleMediaFiles(parsedData, null, env);

            // 更新parsedData为处理后的数据
            Object.assign(parsedData, processedData);

          } catch (mediaError) {
            throw new Error(`媒体文件处理失败: ${mediaError instanceof Error ? mediaError.message : String(mediaError)}`);
          }
        }

        // 更新缓存
        parsedData._timestamp = new Date().toISOString();
        await env.CACHE_KV.put(cacheKey, JSON.stringify(parsedData), {
          expirationTtl: KV_CONFIG.CACHE_TTL
        });
      } catch (parseError) {
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
      const notionResponse = await syncToNotion(parsedData as ParsedData, {
        kv: env.CACHE_KV,
        originalUrl: extractedUrl,
        platform: platform as '小红书' | '抖音'
      });

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

      return generateResponse(syncResponse);
    } catch (notionError) {
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
    return handleError(error);
  }
});

/**
 * 续传处理接口
 */
router.get('/continue-processing/:taskId', async (request: Request, env: WorkerEnv): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const taskId = url.pathname.split('/').pop();
    if (!taskId) {
      const errorResponse: ErrorResponse = {
        error: true,
        message: '缺少任务ID',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 400);
    }

    const batchManager = new BatchProcessingManager(env);
    const result = await batchManager.processNextBatch(taskId);

    if (result.isComplete) {
      // 任务完成，更新Notion页面
      const task = await batchManager.getTask(taskId);
      if (task && task.notionInfo && result.processedItems) {
        try {
          // 构建更新数据，包含所有已处理的媒体文件
          const updateData = { ...task.originalData };

          // 合并所有批次的处理结果
          updateData.videos = task.processedResults.videos || [];
          updateData.images = task.processedResults.images || [];

          // 添加当前批次的结果
          if (result.processedItems.videos && result.processedItems.videos.length > 0) {
            updateData.videos.push(...result.processedItems.videos);
          }
          if (result.processedItems.images && result.processedItems.images.length > 0) {
            updateData.images.push(...result.processedItems.images);
          }

          // 标记为已处理
          updateData.processed = true;

          // 更新Notion页面
          const notionUpdateResult = await syncToNotion(updateData as ParsedData, {
            kv: env.CACHE_KV,
            originalUrl: task.originalData.original_url || '',
            platform: task.originalData.platform || '未知平台',
            pageId: task.notionInfo.pageId // 更新现有页面而不是创建新页面
          });

          console.log(`✅ Notion页面更新成功: ${task.notionInfo.pageId}`);
        } catch (updateError) {
          console.error('❌ Notion页面更新失败:', updateError);
          // 更新失败不影响整体流程
        }
      }

      const response: BatchSyncResponse = {
        message: "所有批次处理完成",
        task_id: taskId,
        extracted_link: task?.originalData?.original_url || '',
        batch_info: result.batchInfo,
        status: "completed",
        notion_updated: true,
        details: result.details
      };

      // 清理任务
      await batchManager.deleteTask(taskId);

      return generateResponse(response);
    } else {
      const response: BatchSyncResponse = {
        message: `批次${result.batchInfo.current_batch}处理完成`,
        task_id: taskId,
        extracted_link: '',
        batch_info: result.batchInfo,
        processed_count: {
          videos: result.processedItems.videos?.length || 0,
          images: result.processedItems.images?.length || 0
        },
        status: "partial_complete",
        continue_url: `/continue-processing/${taskId}`,
        details: result.details
      };

      return generateResponse(response);
    }
  } catch (error) {
    return handleError(error);
  }
});

/**
 * 任务状态查询接口
 */
router.get('/task-status/:taskId', async (request: Request, env: WorkerEnv): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const taskId = url.pathname.split('/').pop();
    if (!taskId) {
      const errorResponse: ErrorResponse = {
        error: true,
        message: '缺少任务ID',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 400);
    }

    const batchManager = new BatchProcessingManager(env);
    const progress = await batchManager.getTaskProgress(taskId);

    if (!progress) {
      const errorResponse: ErrorResponse = {
        error: true,
        message: '任务不存在或已过期',
        timestamp: new Date().toISOString()
      };
      return generateResponse(errorResponse, 404);
    }

    return generateResponse(progress as any);
  } catch (error) {
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
      'GET /continue-processing/:taskId',
      'GET /task-status/:taskId',
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
      // R2绑定初始化已删除

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
