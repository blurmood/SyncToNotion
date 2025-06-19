/**
 * 媒体文件处理模块 - TypeScript版本
 * 提供媒体文件上传、处理和存储功能，具有完整的类型安全
 * 
 * @fileoverview 媒体文件处理模块，支持图床和R2存储
 * @author Augment Agent
 * @version 3.0.0 (TypeScript)
 */

import { imageHostService, type ImageHostService } from './imageHost.js';
import { PROXY_CONFIG, MEDIA_PROCESSING_CONFIG } from './config.js';
import { log } from './logger.js';
import {
  createProxyUrl,
  shouldUseProxy,
  detectPlatform,
  formatFileSize as formatFileSizeProxy,
  parseProxyUrl
} from './proxyUrl.js';

// ==================== 类型定义 ====================

/** 环境变量接口 */
export interface MediaEnv {
  /** 图床用户名 */
  IMAGE_HOST_USERNAME?: string;
  /** 图床密码 */
  IMAGE_HOST_PASSWORD?: string;
}



/** 媒体文件类型 */
export type MediaFileType = 'video' | 'image' | 'audio' | 'unknown';

/** 文件数据类型 */
export type FileData = string | ArrayBuffer | Uint8Array;

/** 处理后的媒体数据接口 */
export interface ProcessedMediaData {
  /** 标题 */
  title?: string;
  /** 作者信息 */
  author?: {
    name: string;
    avatar?: string;
  };
  /** 内容描述 */
  content?: string;
  /** 封面图片URL */
  cover?: string;
  /** 视频URL */
  video?: string;
  /** 视频下载URL */
  video_download_url?: string;
  /** 所有视频URL（Live图等多视频内容） */
  videos?: string[];
  /** 图片数组 */
  images?: string[];
  /** 原始链接 */
  original_url?: string;
  /** 自定义标签 */
  custom_tags?: string[];
  /** 是否已处理 */
  processed?: boolean;
  /** 处理时间 */
  processed_at?: string;
  /** 时间戳 */
  _timestamp?: string;
  /** 原始数据 */
  _raw?: {
    id?: string;
    [key: string]: any;
  };
}

/** 媒体处理选项接口 */
export interface MediaProcessOptions {
  /** 文件大小阈值(字节) */
  fileSizeThreshold?: number;
  /** 是否强制使用图床 */
  forceImageHost?: boolean;
  /** 超时时间(毫秒) */
  timeout?: number;
  /** 是否是Live图视频（Live图视频不使用CDN代理，只上传到图床） */
  isLivePhoto?: boolean;
}

/** 文件信息接口 */
export interface FileInfo {
  /** 文件名 */
  fileName: string;
  /** 内容类型 */
  contentType: string;
  /** 文件大小 */
  size: number;
  /** 文件扩展名 */
  extension: string;
}

// ==================== 常量配置 ====================

/** 文件大小阈值：使用配置文件中的值 */
const FILE_SIZE_THRESHOLD = MEDIA_PROCESSING_CONFIG.SIZE_LIMITS.PROXY_THRESHOLD;

/** 支持的视频格式 */
const VIDEO_FORMATS = new Set(['.mp4', '.webm', '.avi', '.mov', '.wmv', '.flv', '.mkv']);

/** 支持的图片格式 */
const IMAGE_FORMATS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);

/** 内容类型映射 */
const CONTENT_TYPE_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
} as const;

// ==================== 全局变量 ====================

// ==================== 初始化函数 ====================

// ==================== 工具函数 ====================

/**
 * 检查URL是否已经被处理（包括代理URL、图床URL）
 * @param url - 要检查的URL
 * @returns 是否已处理
 */
function isProcessedUrl(url: string): boolean {
  try {
    // 检查是否是代理URL
    const proxyMetadata = parseProxyUrl(url);
    if (proxyMetadata) {
      return true;
    }

    // 检查是否是图床URL
    if (url.includes('tg-image.oox-20b.workers.dev')) {
      return true;
    }

    // 检查是否是代理Worker URL
    if (url.includes(PROXY_CONFIG.WORKER_URL)) {
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 检查URL是否是原始平台链接
 * @param url - 要检查的URL
 * @returns 是否是原始链接
 */
function isOriginalPlatformUrl(url: string): boolean {
  return url.includes('xhscdn.com') ||
         url.includes('douyin.com') ||
         url.includes('aweme.snssdk.com') ||
         url.includes('zjcdn.com') ||
         url.includes('bytecdn.com');
}

/**
 * 格式化文件大小
 * @param bytes - 字节数
 * @returns 格式化后的文件大小
 */
function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '未知大小';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}



/**
 * 从URL中获取文件扩展名
 * @param url - URL
 * @returns 文件扩展名
 */
function getFileExtension(url: string): string {
  try {
    // 首先尝试从URL路径中提取扩展名
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const lastDotIndex = pathname.lastIndexOf('.');
    
    if (lastDotIndex !== -1 && lastDotIndex > pathname.lastIndexOf('/')) {
      return pathname.substring(lastDotIndex);
    }
  } catch (error) {
    // URL解析失败，忽略错误
    log.warn(`无法从URL解析扩展名: ${url}`, error);
  }
  
  // 尝试从URL参数或路径中猜测文件类型
  const lowerUrl = url.toLowerCase();

  // 特殊处理：小红书图片URL格式识别
  if (lowerUrl.includes('xhscdn.com') || lowerUrl.includes('sns-webpic')) {
    // 检查URL末尾的格式标识
    if (lowerUrl.includes('jpg_') || lowerUrl.includes('jpeg_') || lowerUrl.includes('!nd_dft_wgth_jpg')) {
      return '.jpg';
    } else if (lowerUrl.includes('webp_') || lowerUrl.includes('!nd_dft_wgth_webp')) {
      return '.webp';
    } else if (lowerUrl.includes('png_') || lowerUrl.includes('!nd_dft_wgth_png')) {
      return '.png';
    } else if (lowerUrl.includes('gif_') || lowerUrl.includes('!nd_dft_wgth_gif')) {
      return '.gif';
    }
    // 小红书图片默认为JPEG格式
    return '.jpg';
  }

  // 通用格式检测
  if (lowerUrl.includes('video') || lowerUrl.includes('mp4')) {
    return '.mp4';
  } else if (lowerUrl.includes('image') || lowerUrl.includes('img') || lowerUrl.includes('photo')) {
    return '.jpg';
  } else if (lowerUrl.includes('webp')) {
    return '.webp';
  } else if (lowerUrl.includes('gif')) {
    return '.gif';
  } else if (lowerUrl.includes('png')) {
    return '.png';
  }

  // 无法确定扩展名，默认使用jpg（图片比视频更常见）
  return '.jpg';
}

/**
 * 获取内容类型
 * @param fileName - 文件名或扩展名
 * @returns 内容类型
 */
function getContentType(fileName: string): string {
  const extension = fileName.startsWith('.') ? fileName : getFileExtension(fileName);
  return CONTENT_TYPE_MAP[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * 判断文件类型
 * @param fileName - 文件名或URL
 * @returns 文件类型
 */
function getFileType(fileName: string): MediaFileType {
  const extension = getFileExtension(fileName).toLowerCase();
  
  if (VIDEO_FORMATS.has(extension)) {
    return 'video';
  } else if (IMAGE_FORMATS.has(extension)) {
    return 'image';
  } else if (extension === '.mp3' || extension === '.wav' || extension === '.ogg') {
    return 'audio';
  } else {
    return 'unknown';
  }
}

/**
 * 从URL中提取视频ID
 * @param url - 视频URL
 * @returns 视频ID或null
 */
function extractVideoId(url: string): string | null {
  try {
    // 检查是否是抖音URL
    if (url.includes('douyin.com')) {
      const match = url.match(/\/(\w+)\/$/);
      return match ? `douyin_${match[1]}` : null;
    }

    return null;
  } catch (e) {
    return null;
  }
}

// ==================== 核心处理函数 ====================



/**
 * 处理带有解析数据的媒体文件（支持备用URL）
 * @param url - 媒体文件URL
 * @param mediaBucket - 已废弃参数，保留为null
 * @param key - 存储键
 * @param options - 处理选项
 * @param parseData - 解析数据（用于提取备用URL）
 * @returns 处理后的URL
 */
export async function processMediaFileWithParseData(
  url: string,
  mediaBucket: any,
  key: string,
  options: MediaProcessOptions = {},
  parseData?: any
): Promise<string> {
  const {
    fileSizeThreshold = FILE_SIZE_THRESHOLD,
    forceImageHost = false,
    timeout = 60000,
    isLivePhoto = false
  } = options;

  try {
    log.media(`处理媒体文件: ${url}`);

    // 获取文件大小
    let fileSize = 0;
    try {
      const headResponse = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(timeout)
      });

      if (headResponse.ok) {
        const headContentLength = headResponse.headers.get('content-length');
        fileSize = headContentLength ? parseInt(headContentLength, 10) : 0;
        log.network(`HEAD请求获取文件大小: ${fileSize > 0 ? formatFileSize(fileSize) : '未知'}`);
      }
    } catch (headError) {
      log.warn('HEAD请求失败，继续使用原始响应:', headError instanceof Error ? headError.message : String(headError));
    }

    log.media(`视频文件大小: ${fileSize > 0 ? formatFileSize(fileSize) : '未知'}`);

    if (fileSize === 0) {
      log.warn(`文件大小未知，无法确定处理方式`);
      throw new Error(`无法获取文件大小，无法确定处理方式`);
    }

    // 简化的文件大小处理逻辑：只有图床和CDN代理两种方式
    if (fileSize >= fileSizeThreshold) {
      log.media(`文件大小 ${formatFileSize(fileSize)} 超过${formatFileSize(fileSizeThreshold)}，检查CDN代理方案`);

      // Live图视频不使用CDN代理，只上传到图床
      if (isLivePhoto) {
        log.livePhoto(`Live图视频不使用CDN代理，强制上传到图床`);
      } else {
        // 检测平台并判断是否支持CDN代理
        const platformInfo = detectPlatform(url);
        const shouldProxy = shouldUseProxy(fileSize, platformInfo.platform);

        if (shouldProxy && platformInfo.supportsProxy) {
          log.success(`使用CDN代理方案: ${platformInfo.platform} 平台，文件大小 ${formatFileSize(fileSize)}`);

          try {
            // 创建代理URL，传递解析数据以提取备用URL
            const proxyUrl = createProxyUrl(url, parseData);
            log.network(`CDN代理URL生成成功: ${proxyUrl.substring(0, 100)}...`);
            return proxyUrl;
          } catch (proxyError) {
            log.failure(`CDN代理URL生成失败`, proxyError);
            throw new Error(`CDN代理URL生成失败: ${proxyError instanceof Error ? proxyError.message : String(proxyError)}`);
          }
        } else {
          log.warn(`不支持CDN代理: 平台=${platformInfo.platform}, 支持代理=${platformInfo.supportsProxy}, 应该使用代理=${shouldProxy}`);
          log.warn(`大文件无法使用CDN代理，返回原始URL: ${url}`);
          return url;
        }
      }
    }

    // 常规处理流程（小于110MB的文件或Live图视频）
    log.media(`文件小于${formatFileSize(fileSizeThreshold)}或为Live图视频，上传到图床`);

    // 获取文件内容
    const response = await fetch(url, {
      headers: {
        'Referer': url.includes('douyin.com') ? 'https://www.douyin.com/' : 'https://www.xiaohongshu.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`获取文件失败: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'video/mp4';
    const fileExtension = getFileExtension(url);
    const fileName = `${key}${fileExtension}`;

    // 直接上传到图床
    log.media(`上传到图床: ${fileName} (${formatFileSize(buffer.byteLength)})`);
    return await imageHostService.uploadFile(buffer, fileName, contentType);

  } catch (error) {
    log.failure(`处理媒体文件失败: ${url}`, error);
    throw new Error(`处理媒体文件失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 处理单个媒体文件
 * 根据文件大小选择上传到图床或使用CDN代理
 * @param url - 媒体文件URL或者已缓存的文件内容
 * @param mediaBucket - 已废弃参数，保留为null
 * @param key - 存储键
 * @param options - 处理选项
 * @returns 处理后的URL
 */
export async function processMediaFile(
  url: FileData,
  mediaBucket: any,
  key: string,
  options: MediaProcessOptions = {}
): Promise<string> {
  const {
    fileSizeThreshold = FILE_SIZE_THRESHOLD,
    forceImageHost = false,
    timeout = 60000,
    isLivePhoto = false
  } = options;

  // 如果输入是ArrayBuffer或Uint8Array，直接上传到图床
  if (typeof url !== 'string') {
    log.media(`使用已缓存的媒体文件数据, 大小: ${url.byteLength} 字节`);
    const contentType = 'video/mp4'; // 默认视频类型
    const fileName = `${key}.mp4`;

    log.media(`上传到图床: ${fileName} (${formatFileSize(url.byteLength)})`);
    return await imageHostService.uploadFile(url, fileName, contentType);
  }

  // 处理URL情况
  try {
    log.media(`处理媒体文件: ${url}`);

    // Live图视频跳过文件大小检测，直接上传到图床
    if (isLivePhoto) {
      log.livePhoto(`Live图视频跳过文件大小检测，直接上传到图床`);

      // 判断是否是抖音视频
      const isDouyinVideo = url.includes('douyin.com') ||
                           url.includes('aweme.snssdk.com') ||
                           url.includes('bytecdn.com') ||
                           url.includes('365yg.com') ||
                           url.includes('zjcdn.com') ||  // 抖音Live图CDN
                           url.includes('dy-o.zjcdn.com'); // 抖音视频CDN

      // 构建简化的请求头
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': isDouyinVideo ? 'https://www.douyin.com/' : 'https://www.xiaohongshu.com/'
      };

      // 直接获取文件内容，不检测大小
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: headers,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`获取Live图视频数据失败: ${response.status} ${response.statusText}`);
      }

      // 获取文件内容并直接上传
      const buffer = await response.arrayBuffer();
      log.livePhoto(`Live图视频数据获取完成，大小: ${buffer.byteLength} 字节`);

      const contentType = response.headers.get('content-type') || 'video/mp4';
      const fileExtension = contentType.includes('video') ? '.mp4' : '.jpg';
      const fileName = `${key}${fileExtension}`;

      log.livePhoto(`上传Live图视频到图床: ${fileName} (${formatFileSize(buffer.byteLength)})`);
      return await imageHostService.uploadFile(buffer, fileName, contentType);
    }

    // 非Live图视频的正常处理流程
    // 判断是否是抖音视频
    const isDouyinVideo = url.includes('douyin.com') ||
                         url.includes('aweme.snssdk.com') ||
                         url.includes('bytecdn.com') ||
                         url.includes('365yg.com') ||
                         url.includes('zjcdn.com') ||  // 抖音Live图CDN
                         url.includes('dy-o.zjcdn.com'); // 抖音视频CDN

    // 构建请求头
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': isDouyinVideo ? 'https://www.douyin.com/' : 'https://www.xiaohongshu.com/',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'sec-ch-ua': '"Google Chrome";v="91", "Chromium";v="91", ";Not A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-site',
      'Origin': isDouyinVideo ? 'https://www.douyin.com' : 'https://www.xiaohongshu.com',
      'Range': 'bytes=0-',
    };

    // 使用fetch API获取视频数据，带超时控制
    log.network(`使用fetch获取视频数据: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: headers,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`获取视频数据失败: ${response.status} ${response.statusText}`);
    }

    // 获取内容类型
    const contentType = response.headers.get('content-type') || 'video/mp4';
    log.media(`视频类型: ${contentType}`);

    // 检查文件大小，避免内存溢出
    let contentLength = response.headers.get('content-length');
    let fileSize = contentLength ? parseInt(contentLength, 10) : 0;

    // 如果第一次请求没有Content-Length（可能是重定向），尝试HEAD请求获取真实大小
    if (fileSize === 0) {
      log.network('第一次请求未获取到文件大小，尝试HEAD请求...');
      try {
        const headResponse = await fetch(url, {
          method: 'HEAD',
          headers: headers
        });

        if (headResponse.ok) {
          const headContentLength = headResponse.headers.get('content-length');
          fileSize = headContentLength ? parseInt(headContentLength, 10) : 0;
          log.network(`HEAD请求获取文件大小: ${fileSize > 0 ? formatFileSize(fileSize) : '未知'}`);
        }
      } catch (headError) {
        log.warn('HEAD请求失败，继续使用原始响应:', headError instanceof Error ? headError.message : String(headError));
      }
    }

    log.media(`视频文件大小: ${fileSize > 0 ? formatFileSize(fileSize) : '未知'}`);

    if (fileSize === 0) {
      log.warn(`文件大小未知，无法确定处理方式`);
      throw new Error(`无法获取文件大小，无法确定处理方式`);
    }

    // 简化的文件大小处理逻辑：只有图床和CDN代理两种方式
    if (fileSize >= fileSizeThreshold) {
      log.media(`文件大小 ${formatFileSize(fileSize)} 超过${formatFileSize(fileSizeThreshold)}，检查CDN代理方案`);

      // Live图视频不使用CDN代理，只上传到图床
      if (isLivePhoto) {
        log.livePhoto(`Live图视频不使用CDN代理，强制上传到图床`);
      } else {
        // 检测平台并判断是否支持CDN代理
        const platformInfo = detectPlatform(url);
        const shouldProxy = shouldUseProxy(fileSize, platformInfo.platform);

        if (shouldProxy && platformInfo.supportsProxy) {
          log.success(`使用CDN代理方案: ${platformInfo.platform} 平台，文件大小 ${formatFileSize(fileSize)}`);

          try {
            // 创建代理URL（在processMediaFile中没有parseData，所以不传递）
            const proxyUrl = createProxyUrl(url);
            log.network(`CDN代理URL生成成功: ${proxyUrl.substring(0, 100)}...`);
            return proxyUrl;
          } catch (proxyError) {
            log.failure(`CDN代理URL生成失败`, proxyError);
            throw new Error(`CDN代理URL生成失败: ${proxyError instanceof Error ? proxyError.message : String(proxyError)}`);
          }
        } else {
          log.warn(`不支持CDN代理: 平台=${platformInfo.platform}, 支持代理=${platformInfo.supportsProxy}, 应该使用代理=${shouldProxy}`);
          throw new Error(`文件大小${formatFileSize(fileSize)}超过${formatFileSize(fileSizeThreshold)}，但平台${platformInfo.platform}不支持CDN代理，无法处理此文件`);
        }
      }
    }

    // 获取媒体数据
    const buffer = await response.arrayBuffer();
    log.media(`媒体数据获取完成，大小: ${buffer.byteLength} 字节`);

    // 直接处理媒体文件，无需WebP转换（已在URL选择阶段优先选择JPEG）
    let processedBuffer = buffer;
    let finalContentType = contentType;

    // 根据实际Content-Type确定文件扩展名
    let fileExtension: string;
    if (contentType.includes('video')) {
      fileExtension = '.mp4';
    } else if (contentType.includes('image')) {
      // 根据具体的图片类型确定扩展名
      if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        fileExtension = '.jpg';
      } else if (contentType.includes('png')) {
        fileExtension = '.png';
      } else if (contentType.includes('webp')) {
        fileExtension = '.webp';
      } else if (contentType.includes('gif')) {
        fileExtension = '.gif';
      } else {
        fileExtension = '.jpg'; // 默认图片格式
      }
    } else {
      // 如果Content-Type不明确，使用URL推测
      fileExtension = getFileExtension(url);
    }

    log.media(`处理媒体文件: ${url.substring(0, 100)}...`);
    log.media(`文件格式: ${fileExtension}, Content-Type: ${finalContentType}`);

    // 生成唯一的文件名
    const fileName = `${key}${fileExtension}`;

    // 直接上传到图床（简化逻辑）
    log.media(`上传到图床: ${fileName} (${formatFileSize(processedBuffer.byteLength)})`);
    return await imageHostService.uploadFile(processedBuffer, fileName, finalContentType);
  } catch (error) {
    log.failure(`处理媒体文件失败: ${url}`, error);
    throw new Error(`处理媒体文件失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 处理解析数据中的所有媒体文件
 * @param parsedData - 解析的数据
 * @param mediaBucket - 已废弃参数，保留为null
 * @param env - 环境变量
 * @param options - 处理选项
 * @returns 处理后的数据
 */
export async function handleMediaFiles(
  parsedData: ProcessedMediaData,
  mediaBucket: any,
  env: MediaEnv | null = null,
  options: MediaProcessOptions = {}
): Promise<ProcessedMediaData> {
  try {
    log.sync(`开始处理媒体文件...`);

    // 设置图床服务的环境变量
    if (env) {
      imageHostService.setEnv(env);
      log.config('图床服务环境变量已设置');
    }

    // 如果没有解析数据，直接返回
    if (!parsedData) {
      return parsedData;
    }

    // 复制一份数据进行处理
    const processedData: ProcessedMediaData = { ...parsedData };

    // 处理封面图片 - 必须成功
    if (processedData.cover) {
      log.media(`处理封面图片: ${processedData.cover}`);
      const coverKey = `covers/${processedData._raw?.id || `cover_${Date.now()}`}`;
      const processedCover = await processMediaFile(processedData.cover, mediaBucket, coverKey, options);

      // 验证处理后的URL不是原始小红书链接
      if (processedCover === processedData.cover || processedCover.includes('xhscdn.com')) {
        throw new Error(`封面图片上传失败，仍然是原始链接: ${processedCover}`);
      }

      processedData.cover = processedCover;
      log.success(`封面图片处理完成: ${processedData.cover}`);
    }

    // 处理视频 - 允许跳过处理（文件过大时）
    if (processedData.video) {
      // 检查是否为Live图内容，如果是则跳过主视频处理（主视频会在Live图视频中处理）
      const isLivePhotoContent = processedData.videos && Array.isArray(processedData.videos) && processedData.videos.length > 1;

      if (isLivePhotoContent) {
        log.info(`📸 检测到Live图内容，跳过主视频处理（主视频将在Live图视频中处理）`);
        // 将主视频URL设置为第一个Live图视频的处理结果（稍后会被替换）
        processedData.video_download_url = processedData.video;
      } else {
        log.info(`处理视频: ${processedData.video}`);
        const videoKey = `videos/${processedData._raw?.id || `video_${Date.now()}`}`;
        const processedVideoUrl = await processMediaFileWithParseData(processedData.video, mediaBucket, videoKey, options, processedData);

        // 成功处理的情况（包括代理URL）
        processedData.video_download_url = processedVideoUrl;
        processedData.video = processedData.video_download_url;
        log.success(`视频处理完成: ${processedData.video}`);
      }
    }

    // 处理多视频（Live图等）
    if (processedData.videos && Array.isArray(processedData.videos) && processedData.videos.length > 1) {
      log.info(`📸 处理Live图多视频: ${processedData.videos.length} 个视频`);

      try {
        // 检查视频数量，如果过多则使用批量处理
        const videoCount = processedData.videos.length;
        const BATCH_SIZE = MEDIA_PROCESSING_CONFIG.BATCH_SIZES.VIDEOS;

        if (videoCount > BATCH_SIZE) {
          log.livePhoto(`Live图视频数量较多(${videoCount})，使用批量处理，每批${BATCH_SIZE}个`);

          const processedVideos: string[] = [];

          // 分批处理视频
          for (let i = 0; i < processedData.videos.length; i += BATCH_SIZE) {
            const batch = processedData.videos.slice(i, i + BATCH_SIZE);
            log.info(`📸 处理第${Math.floor(i/BATCH_SIZE) + 1}批视频 (${batch.length}个): ${i + 1}-${Math.min(i + BATCH_SIZE, videoCount)}`);

            const batchResults = await Promise.all(
              batch.map(async (videoUrl: string, batchIndex: number): Promise<string> => {
                const globalIndex = i + batchIndex;
                log.info(`处理Live图视频 ${globalIndex + 1}/${videoCount}: ${videoUrl}`);
                const videoKey = `videos/${processedData._raw?.id || Date.now()}_live_${globalIndex}`;

                const livePhotoOptions = { ...options, isLivePhoto: true };
                const processedVideoUrl = await processMediaFile(videoUrl, mediaBucket, videoKey, livePhotoOptions);

                log.info(`Live图视频 ${globalIndex + 1} 处理完成: ${processedVideoUrl}`);
                return processedVideoUrl;
              })
            );

            processedVideos.push(...batchResults);

            // 批次间添加短暂延迟，避免请求过于密集
            if (i + BATCH_SIZE < processedData.videos.length) {
              log.batch(Math.floor(i/BATCH_SIZE) + 1, Math.ceil(processedData.videos.length / BATCH_SIZE), `批次处理完成，等待${MEDIA_PROCESSING_CONFIG.DELAYS.BATCH_INTERVAL}ms后处理下一批...`);
              await new Promise(resolve => setTimeout(resolve, MEDIA_PROCESSING_CONFIG.DELAYS.BATCH_INTERVAL));
            }
          }

          processedData.videos = processedVideos;
        } else {
          // 视频数量较少，使用原有的并发处理
          const processedVideos = await Promise.all(
            processedData.videos.map(async (videoUrl: string, index: number): Promise<string> => {
              log.info(`处理Live图视频 ${index + 1}/${processedData.videos!.length}: ${videoUrl}`);
              const videoKey = `videos/${processedData._raw?.id || Date.now()}_live_${index}`;

              const livePhotoOptions = { ...options, isLivePhoto: true };
              const processedVideoUrl = await processMediaFile(videoUrl, mediaBucket, videoKey, livePhotoOptions);

              log.info(`Live图视频 ${index + 1} 处理完成: ${processedVideoUrl}`);
              return processedVideoUrl;
            })
          );

          processedData.videos = processedVideos;
        }

        log.livePhoto(`Live图多视频处理完成: ${processedData.videos.length} 个视频`);

        // 将第一个Live图视频设置为主视频
        if (processedData.videos.length > 0) {
          processedData.video = processedData.videos[0];
          processedData.video_download_url = processedData.videos[0];
          log.livePhoto(`Live图主视频设置为第一个视频: ${processedData.video}`);
        }

        log.success(`Live图多视频处理完成，主视频: ${processedData.video}`);

      } catch (error) {
        log.error('处理Live图多视频失败:', error);
        throw new Error(`Live图多视频处理失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 处理图片
    if (processedData.images && Array.isArray(processedData.images)) {
      try {
        // 检查是否为Live图笔记
        const isLivePhoto = ('isLivePhoto' in processedData && (processedData as any).isLivePhoto === true) ||
                           (processedData._raw && 'isLivePhoto' in processedData._raw && processedData._raw.isLivePhoto === true);

        // 检查是否为分组内容（需要添加"实况图片"标签）
        const isGroupedContent = ('isGroupedContent' in processedData && (processedData as any).isGroupedContent === true) ||
                                 (processedData._raw && 'isGroupedContent' in processedData._raw && processedData._raw.isGroupedContent === true);

        log.info(`处理 ${processedData.images.length} 张图片...`);

        // 检查是否为Live图笔记
        if (isLivePhoto) {
          log.info(`📸 检测到Live图笔记，原始图片数量: ${processedData.images.length}`);

          if (isGroupedContent) {
            log.info(`📸 检测到分组内容，将添加"实况图片"标签`);
            // 添加实况图片标签标识
            (processedData as any).addLivePhotoTag = true;
          }

          // 检查是否有媒体分析结果，用于区分Live图和普通图片
          const mediaAnalysis = (processedData as any).mediaAnalysis;
          if (mediaAnalysis && mediaAnalysis.regularImages > 0) {
            log.info(`📸 检测到混合内容: ${mediaAnalysis.livePhotoGroups}组Live图 + ${mediaAnalysis.regularImages}张普通图片`);

            // 从regularImageDetails中提取普通图片的URL
            const regularImageUrls: string[] = [];
            if (mediaAnalysis.regularImageDetails && Array.isArray(mediaAnalysis.regularImageDetails)) {
              for (const imageDetail of mediaAnalysis.regularImageDetails) {
                if (imageDetail.data && imageDetail.data.infoList) {
                  // 优先使用WB_DFT图片，如果没有则使用WB_PRV
                  const dftImage = imageDetail.data.infoList.find((info: any) => info.imageScene === 'WB_DFT');
                  const prvImage = imageDetail.data.infoList.find((info: any) => info.imageScene === 'WB_PRV');
                  const imageUrl = dftImage?.url || prvImage?.url;
                  if (imageUrl) {
                    regularImageUrls.push(imageUrl);
                  }
                }
              }
            }

            log.info(`📸 提取到${regularImageUrls.length}张普通图片URL，将保留这些图片进行处理`);

            // 只保留普通图片，过滤掉Live图相关的图片
            processedData.images = regularImageUrls;

          } else {
            log.info(`📸 纯Live图内容：跳过所有图片上传和同步，只保留Live视频`);
            // 纯Live图内容，清空所有图片
            processedData.images = [];
          }

          // 处理封面图片
          if (processedData.cover) {
            log.info(`📸 Live图封面图片: ${processedData.cover}`);
            const coverKey = `covers/cover_${processedData._raw?.id || Date.now()}`;
            const processedCover = await processMediaFile(processedData.cover, mediaBucket, coverKey, options);
            processedData.cover = processedCover;
            log.info(`📸 Live图封面处理完成: ${processedCover}`);
          }

          log.info(`📸 Live图处理完成：保留${processedData.images.length}张普通图片，${processedData.videos?.length || 0}个视频`);
        }

        // 处理图片 - 支持批量处理避免subrequests过多
        log.info(`📸 [${new Date().toISOString()}] 开始处理 ${processedData.images.length} 张图片，必须全部上传成功...`);

        const imageCount = processedData.images.length;
        const IMAGE_BATCH_SIZE = MEDIA_PROCESSING_CONFIG.BATCH_SIZES.IMAGES;

        // 设置总超时时间（使用配置文件中的值）
        const totalTimeout = Math.min(imageCount * MEDIA_PROCESSING_CONFIG.TIMEOUTS.PER_IMAGE, MEDIA_PROCESSING_CONFIG.TIMEOUTS.TOTAL_MAX);
        log.config(`图片处理总超时时间: ${totalTimeout/1000}秒`);

        const processImagesWithTimeout = async (): Promise<string[]> => {
          if (imageCount > IMAGE_BATCH_SIZE) {
            log.info(`📸 图片数量较多(${imageCount})，使用批量处理，每批${IMAGE_BATCH_SIZE}张`);

            const processedImages: string[] = [];

            // 分批处理图片
            for (let i = 0; i < processedData.images!.length; i += IMAGE_BATCH_SIZE) {
              const batch = processedData.images!.slice(i, i + IMAGE_BATCH_SIZE);
              log.info(`📸 处理第${Math.floor(i/IMAGE_BATCH_SIZE) + 1}批图片 (${batch.length}张): ${i + 1}-${Math.min(i + IMAGE_BATCH_SIZE, imageCount)}`);

              const batchResults = await Promise.all(
                batch.map(async (image: string, batchIndex: number): Promise<string> => {
                  const globalIndex = i + batchIndex;
                  log.info(`开始处理图片 ${globalIndex}: ${image}`);
                  const imageKey = `images/${processedData._raw?.id || Date.now()}_${globalIndex}`;

                  try {
                    const processedUrl = await processMediaFile(image, mediaBucket, imageKey, options);
                    log.info(`图片 ${globalIndex} 处理完成: ${processedUrl}`);

                    // 验证处理后的URL不是原始小红书链接
                    if (processedUrl === image || processedUrl.includes('xhscdn.com')) {
                      throw new Error(`图片 ${globalIndex} 上传失败，仍然是原始链接: ${processedUrl}`);
                    }

                    return processedUrl;
                  } catch (error) {
                    log.error(`图片 ${globalIndex} 处理失败:`, error instanceof Error ? error.message : String(error));
                    throw new Error(`图片 ${globalIndex} 处理失败: ${error instanceof Error ? error.message : String(error)}`);
                  }
                })
              );

              processedImages.push(...batchResults);

              // 批次间添加短暂延迟，避免请求过于密集
              if (i + IMAGE_BATCH_SIZE < processedData.images!.length) {
                log.batch(Math.floor(i/IMAGE_BATCH_SIZE) + 1, Math.ceil(processedData.images!.length / IMAGE_BATCH_SIZE), `图片批次处理完成，等待${MEDIA_PROCESSING_CONFIG.DELAYS.IMAGE_INTERVAL}ms后处理下一批...`);
                await new Promise(resolve => setTimeout(resolve, MEDIA_PROCESSING_CONFIG.DELAYS.IMAGE_INTERVAL));
              }
            }

            return processedImages;
          } else {
            // 图片数量较少，使用原有的并发处理
            return await Promise.all(
              processedData.images!.map(async (image: string, index: number): Promise<string> => {
                log.info(`开始处理图片 ${index}: ${image}`);
                const imageKey = `images/${processedData._raw?.id || Date.now()}_${index}`;

                try {
                  const processedUrl = await processMediaFile(image, mediaBucket, imageKey, options);
                  log.info(`图片 ${index} 处理完成: ${processedUrl}`);

                  // 验证处理后的URL不是原始小红书链接
                  if (processedUrl === image || processedUrl.includes('xhscdn.com')) {
                    throw new Error(`图片 ${index} 上传失败，仍然是原始链接: ${processedUrl}`);
                  }

                  return processedUrl;
                } catch (error) {
                  log.error(`图片 ${index} 处理失败:`, error instanceof Error ? error.message : String(error));
                  throw new Error(`图片 ${index} 处理失败: ${error instanceof Error ? error.message : String(error)}`);
                }
              })
            );
          }
        };

        // 使用AbortController实现可控制的超时
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
          log.info(`图片处理超时，正在中止所有请求...`);
          abortController.abort();
        }, totalTimeout);

        let processedImages: string[];
        try {
          processedImages = await processImagesWithTimeout();
          clearTimeout(timeoutId);
          log.info('图片处理在超时前完成');
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`图片处理超时（${totalTimeout/1000}秒）`);
          }
          throw error;
        }

        processedData.images = processedImages;
        log.success('所有图片处理完成');
      } catch (error) {
        log.error('处理图片数组失败:', error);
        log.error('错误详情:', error instanceof Error ? error.stack : String(error));
        // 抛出错误，不要静默失败
        throw new Error(`图片处理失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 标记为已处理
    processedData.processed = true;
    processedData.processed_at = new Date().toISOString();

    return processedData;
  } catch (error) {
    log.error('处理媒体文件失败:', error);
    log.error('错误详情:', error instanceof Error ? error.stack : String(error));
    // 抛出错误，不要返回原始数据
    throw new Error(`媒体文件处理失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ==================== 工具类 ====================

/**
 * 媒体处理器类
 * 提供更高级的媒体处理功能
 */
export class MediaProcessor {
  private readonly options: Required<MediaProcessOptions>;
  private readonly env: MediaEnv | null;

  /**
   * 创建媒体处理器实例
   * @param options - 处理选项
   * @param env - 环境变量
   */
  constructor(options: MediaProcessOptions = {}, env: MediaEnv | null = null) {
    this.options = {
      fileSizeThreshold: options.fileSizeThreshold ?? FILE_SIZE_THRESHOLD,
      forceImageHost: options.forceImageHost ?? false,
      timeout: options.timeout ?? 30000,
      isLivePhoto: options.isLivePhoto ?? false
    };
    this.env = env;

    // 设置环境变量
    if (env) {
      imageHostService.setEnv(env);
    }
  }

  /**
   * 处理单个文件
   * @param fileData - 文件数据
   * @param key - 存储键
   * @returns 处理后的URL
   */
  public async processFile(fileData: FileData, key: string): Promise<string> {
    return await processMediaFile(fileData, null, key, this.options);
  }

  /**
   * 批量处理文件
   * @param files - 文件数组
   * @param keyPrefix - 键前缀
   * @returns 处理后的URL数组
   */
  public async processFiles(files: FileData[], keyPrefix: string): Promise<string[]> {
    return await Promise.all(
      files.map((file, index) =>
        this.processFile(file, `${keyPrefix}_${index}`)
      )
    );
  }

  /**
   * 获取文件信息
   * @param fileData - 文件数据
   * @param fileName - 文件名
   * @returns 文件信息
   */
  public getFileInfo(fileData: FileData, fileName: string): FileInfo {
    const extension = getFileExtension(fileName);
    const contentType = getContentType(fileName);
    const size = typeof fileData === 'string' ? 0 : fileData.byteLength;

    return {
      fileName,
      contentType,
      size,
      extension
    };
  }
}

// 类型已通过interface导出，无需重复导出

/**
 * 从URL中提取标题
 * @param url - 原始URL
 * @returns 标题或null
 */
function extractTitleFromUrl(url: string): string | null {
  try {
    // 尝试从抖音URL中提取标题
    if (url && url.includes('douyin.com')) {
      // 抖音分享文本通常包含标题，格式如: "复制打开抖音，看看【标题】..."
      const titleMatch = url.match(/看看【(.+?)】/);
      if (titleMatch?.[1]) {
        return titleMatch[1].substring(0, 50); // 限制标题长度
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}
