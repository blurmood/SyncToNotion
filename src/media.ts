/**
 * 媒体文件处理模块 - TypeScript版本
 * 提供媒体文件上传、处理和存储功能，具有完整的类型安全
 * 
 * @fileoverview 媒体文件处理模块，支持图床和R2存储
 * @author Augment Agent
 * @version 3.0.0 (TypeScript)
 */

import { imageHostService, type ImageHostService } from './imageHost.js';
import { R2_CONFIG, type R2Config } from './config.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ==================== 类型定义 ====================

/** 环境变量接口 */
export interface MediaEnv {
  /** 媒体存储桶绑定 */
  MEDIA_BUCKET?: R2Bucket;
  /** 图床用户名 */
  IMAGE_HOST_USERNAME?: string;
  /** 图床密码 */
  IMAGE_HOST_PASSWORD?: string;
}

/** R2存储桶接口 */
export interface R2Bucket {
  /** 上传文件到R2 */
  put(key: string, data: ArrayBuffer | Uint8Array, options?: R2PutOptions): Promise<void>;
  /** 从R2获取文件 */
  get(key: string): Promise<R2Object | null>;
  /** 删除R2文件 */
  delete(key: string): Promise<void>;
}

/** R2上传选项接口 */
export interface R2PutOptions {
  /** HTTP元数据 */
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    contentLanguage?: string;
    expires?: Date;
  };
  /** 自定义元数据 */
  customMetadata?: Record<string, string>;
}

/** R2对象接口 */
export interface R2Object {
  /** 对象键 */
  key: string;
  /** 对象大小 */
  size: number;
  /** 最后修改时间 */
  uploaded: Date;
  /** HTTP元数据 */
  httpMetadata: {
    contentType?: string;
  };
  /** 获取对象体 */
  arrayBuffer(): Promise<ArrayBuffer>;
  /** 获取对象流 */
  body: ReadableStream;
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
  /** 是否强制使用R2存储 */
  forceR2?: boolean;
  /** 是否强制使用图床 */
  forceImageHost?: boolean;
  /** 超时时间(毫秒) */
  timeout?: number;
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

/** 文件大小阈值：19MB（字节） */
const FILE_SIZE_THRESHOLD = 19 * 1024 * 1024;

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

/** R2存储绑定，通过initR2Binding函数初始化 */
let r2Binding: R2Bucket | null = null;

/** S3客户端，用于与R2交互 */
const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_CONFIG.S3_API_URL,
  credentials: {
    accessKeyId: R2_CONFIG.ACCESS_KEY_ID,
    secretAccessKey: R2_CONFIG.SECRET_ACCESS_KEY
  },
  forcePathStyle: true // 使用路径样式而不是虚拟主机样式
});

// ==================== 初始化函数 ====================

/**
 * 初始化R2存储绑定
 * @param env - Worker环境变量
 */
export function initR2Binding(env: MediaEnv): void {
  if (env?.MEDIA_BUCKET) {
    r2Binding = env.MEDIA_BUCKET;
    console.log('R2存储绑定初始化成功');
  } else {
    console.warn('未找到R2存储绑定，某些功能可能不可用');
  }
}

// ==================== 工具函数 ====================

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
    console.warn(`无法从URL解析扩展名: ${url}`, error);
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
    // 尝试从URL中提取视频ID
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // 检查是否是R2 URL
    if (pathname.includes('/videos/')) {
      const parts = pathname.split('/');
      return parts[parts.length - 1].replace(/\.\w+$/, ''); // 移除文件扩展名
    }
    
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
 * 上传数据到R2存储
 * @param data - 数据
 * @param fileName - 文件名
 * @param contentType - 内容类型
 * @returns 上传后的URL
 */
async function uploadToR2(data: ArrayBuffer | Uint8Array, fileName: string, contentType: string): Promise<string> {
  try {
    if (!r2Binding) {
      throw new Error('R2存储未初始化');
    }

    console.log(`上传文件到R2: ${fileName}, 类型: ${contentType}, 大小: ${formatFileSize(data.byteLength)}`);

    // 上传到R2
    await r2Binding.put(fileName, data, {
      httpMetadata: {
        contentType: contentType
      }
    });

    // 构建公共访问URL - 使用配置中的PUBLIC_URL
    const publicUrl = `${R2_CONFIG.PUBLIC_URL}/${fileName}`;
    console.log(`文件上传成功: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error(`上传到R2失败: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * 处理单个媒体文件
 * 根据文件大小选择上传到图床或R2存储
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
    forceR2 = false,
    forceImageHost = false,
    timeout = 60000
  } = options;

  // 如果输入是ArrayBuffer或Uint8Array，直接使用
  if (typeof url !== 'string') {
    console.log(`使用已缓存的媒体文件数据, 大小: ${url.byteLength} 字节`);
    const contentType = 'video/mp4'; // 默认视频类型
    const fileName = `${key}.mp4`;

    try {
      // 根据配置选择存储方式
      if (forceImageHost || (!forceR2 && url.byteLength < fileSizeThreshold)) {
        console.log(`文件小于${formatFileSize(fileSizeThreshold)}，上传到图床: ${fileName} (${formatFileSize(url.byteLength)})`);
        try {
          return await imageHostService.uploadFile(url, fileName, contentType);
        } catch (imageHostError) {
          console.error(`图床上传失败，尝试R2存储: ${imageHostError instanceof Error ? imageHostError.message : String(imageHostError)}`);
          // 如果图床上传失败，尝试上传到R2作为备选方案
          try {
            const r2Url = await uploadToR2(url, fileName, contentType);
            console.log(`R2备选上传成功: ${r2Url}`);
            return r2Url;
          } catch (r2Error) {
            console.error(`R2备选上传也失败: ${r2Error instanceof Error ? r2Error.message : String(r2Error)}`);
            throw new Error(`所有上传方式都失败: 图床(${imageHostError instanceof Error ? imageHostError.message : String(imageHostError)}), R2(${r2Error instanceof Error ? r2Error.message : String(r2Error)})`);
          }
        }
      } else {
        console.log(`文件大于等于${formatFileSize(fileSizeThreshold)}，上传到R2存储: ${fileName} (${formatFileSize(url.byteLength)})`);
        const r2Url = await uploadToR2(url, fileName, contentType);
        console.log(`上传到R2成功: ${r2Url}`);
        return r2Url;
      }
    } catch (error) {
      console.error('上传文件失败:', error);
      throw error;
    }
  }

  // 处理URL情况
  try {
    console.log(`处理媒体文件: ${url}`);

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
    console.log(`使用fetch获取视频数据: ${url}`);

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
    console.log(`视频类型: ${contentType}`);

    // 检查文件大小，避免内存溢出
    const contentLength = response.headers.get('content-length');
    const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

    console.log(`视频文件大小: ${fileSize > 0 ? formatFileSize(fileSize) : '未知'}`);

    // 如果文件过大（超过110MB），跳过处理
    const MAX_FILE_SIZE = 110 * 1024 * 1024; // 110MB
    if (fileSize > MAX_FILE_SIZE) {
      console.warn(`文件过大 (${formatFileSize(fileSize)})，跳过处理，返回原始链接`);
      return url; // 返回原始链接而不是处理后的链接
    }

    // 如果文件大小未知或过大，也跳过处理
    if (fileSize === 0 || fileSize > MAX_FILE_SIZE) {
      console.warn(`文件大小未知或过大，跳过处理，返回原始链接`);
      return url;
    }

    // 获取媒体数据
    const buffer = await response.arrayBuffer();
    console.log(`媒体数据获取完成，大小: ${buffer.byteLength} 字节`);

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

    console.log(`处理媒体文件: ${url.substring(0, 100)}...`);
    console.log(`文件格式: ${fileExtension}, Content-Type: ${finalContentType}`);

    // 生成唯一的文件名
    const fileName = `${key}${fileExtension}`;

    // 根据配置选择存储方式
    if (forceImageHost || (!forceR2 && processedBuffer.byteLength < fileSizeThreshold)) {
      console.log(`文件小于${formatFileSize(fileSizeThreshold)}，上传到图床: ${fileName} (${formatFileSize(processedBuffer.byteLength)})`);
      try {
        return await imageHostService.uploadFile(processedBuffer, fileName, finalContentType);
      } catch (imageHostError) {
        console.error(`图床上传失败，尝试R2存储: ${imageHostError instanceof Error ? imageHostError.message : String(imageHostError)}`);
        // 如果图床上传失败，尝试上传到R2作为备选方案
        try {
          const r2Url = await uploadToR2(processedBuffer, fileName, finalContentType);
          console.log(`R2备选上传成功: ${r2Url}`);
          return r2Url;
        } catch (r2Error) {
          console.error(`R2备选上传也失败: ${r2Error instanceof Error ? r2Error.message : String(r2Error)}`);
          throw new Error(`所有上传方式都失败: 图床(${imageHostError instanceof Error ? imageHostError.message : String(imageHostError)}), R2(${r2Error instanceof Error ? r2Error.message : String(r2Error)})`);
        }
      }
    } else {
      console.log(`文件大于等于${formatFileSize(fileSizeThreshold)}，上传到R2存储: ${fileName} (${formatFileSize(processedBuffer.byteLength)})`);
      const r2Url = await uploadToR2(processedBuffer, fileName, finalContentType);
      console.log(`上传到R2成功: ${r2Url}`);
      return r2Url;
    }
  } catch (error) {
    console.error(`处理媒体文件失败: ${url}`, error instanceof Error ? error.message : String(error));
    throw new Error(`处理媒体文件失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 处理解析数据中的所有媒体文件
 * @param parsedData - 解析的数据
 * @param mediaBucket - R2存储桶对象（已废弃）
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
    console.log(`🎬 [${new Date().toISOString()}] 开始处理媒体文件...`);

    // 设置图床服务的环境变量
    if (env) {
      imageHostService.setEnv(env);
      console.log('图床服务环境变量已设置');
    }

    // 如果没有解析数据，直接返回
    if (!parsedData) {
      return parsedData;
    }

    // 复制一份数据进行处理
    const processedData: ProcessedMediaData = { ...parsedData };

    // 处理封面图片 - 必须成功
    if (processedData.cover) {
      console.log(`处理封面图片: ${processedData.cover}`);
      const coverKey = `covers/${processedData._raw?.id || `cover_${Date.now()}`}`;
      const processedCover = await processMediaFile(processedData.cover, mediaBucket, coverKey, options);

      // 验证处理后的URL不是原始小红书链接
      if (processedCover === processedData.cover || processedCover.includes('xhscdn.com')) {
        throw new Error(`封面图片上传失败，仍然是原始链接: ${processedCover}`);
      }

      processedData.cover = processedCover;
      console.log(`封面图片处理完成: ${processedData.cover}`);
    }

    // 处理视频 - 允许跳过处理（文件过大时）
    if (processedData.video) {
      console.log(`处理视频: ${processedData.video}`);
      const videoKey = `videos/${processedData._raw?.id || `video_${Date.now()}`}`;
      const processedVideoUrl = await processMediaFile(processedData.video, mediaBucket, videoKey, options);

      // 检查是否成功处理（如果返回原始链接，说明跳过了处理）
      if (processedVideoUrl === processedData.video ||
          processedVideoUrl.includes('xhscdn.com') ||
          processedVideoUrl.includes('douyin.com') ||
          processedVideoUrl.includes('aweme.snssdk.com')) {
        console.warn(`视频文件跳过处理（可能因文件过大），使用原始链接: ${processedVideoUrl}`);
        // 不抛出错误，而是使用原始链接
        processedData.video_download_url = processedVideoUrl;
        processedData.video = processedVideoUrl;
      } else {
        // 成功处理的情况
        processedData.video_download_url = processedVideoUrl;
        processedData.video = processedData.video_download_url;
        console.log(`视频处理完成: ${processedData.video}`);
      }
    }

    // 处理多视频（Live图等）
    if (processedData.videos && Array.isArray(processedData.videos) && processedData.videos.length > 1) {
      console.log(`📸 处理Live图多视频: ${processedData.videos.length} 个视频`);

      try {
        // 检查视频数量，如果过多则使用批量处理
        const videoCount = processedData.videos.length;
        const BATCH_SIZE = 5; // 每批处理5个视频，避免subrequests过多

        if (videoCount > BATCH_SIZE) {
          console.log(`📸 Live图视频数量较多(${videoCount})，使用批量处理，每批${BATCH_SIZE}个`);

          const processedVideos: string[] = [];

          // 分批处理视频
          for (let i = 0; i < processedData.videos.length; i += BATCH_SIZE) {
            const batch = processedData.videos.slice(i, i + BATCH_SIZE);
            console.log(`📸 处理第${Math.floor(i/BATCH_SIZE) + 1}批视频 (${batch.length}个): ${i + 1}-${Math.min(i + BATCH_SIZE, videoCount)}`);

            const batchResults = await Promise.all(
              batch.map(async (videoUrl: string, batchIndex: number): Promise<string> => {
                const globalIndex = i + batchIndex;
                console.log(`处理Live图视频 ${globalIndex + 1}/${videoCount}: ${videoUrl}`);
                const videoKey = `videos/${processedData._raw?.id || Date.now()}_live_${globalIndex}`;

                const processedVideoUrl = await processMediaFile(videoUrl, mediaBucket, videoKey, options);

                // 检查是否成功处理（如果返回原始链接，说明跳过了处理）
                if (processedVideoUrl === videoUrl ||
                    processedVideoUrl.includes('xhscdn.com') ||
                    processedVideoUrl.includes('douyin.com') ||
                    processedVideoUrl.includes('aweme.snssdk.com')) {
                  console.warn(`Live图视频 ${globalIndex + 1} 跳过处理（可能因文件过大），使用原始链接: ${processedVideoUrl}`);
                  return processedVideoUrl;
                }

                console.log(`Live图视频 ${globalIndex + 1} 处理完成: ${processedVideoUrl}`);
                return processedVideoUrl;
              })
            );

            processedVideos.push(...batchResults);

            // 批次间添加短暂延迟，避免请求过于密集
            if (i + BATCH_SIZE < processedData.videos.length) {
              console.log(`📸 批次处理完成，等待500ms后处理下一批...`);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }

          processedData.videos = processedVideos;
        } else {
          // 视频数量较少，使用原有的并发处理
          const processedVideos = await Promise.all(
            processedData.videos.map(async (videoUrl: string, index: number): Promise<string> => {
              console.log(`处理Live图视频 ${index + 1}/${processedData.videos!.length}: ${videoUrl}`);
              const videoKey = `videos/${processedData._raw?.id || Date.now()}_live_${index}`;

              const processedVideoUrl = await processMediaFile(videoUrl, mediaBucket, videoKey, options);

              // 检查是否成功处理（如果返回原始链接，说明跳过了处理）
              if (processedVideoUrl === videoUrl ||
                  processedVideoUrl.includes('xhscdn.com') ||
                  processedVideoUrl.includes('douyin.com') ||
                  processedVideoUrl.includes('aweme.snssdk.com')) {
                console.warn(`Live图视频 ${index + 1} 跳过处理（可能因文件过大），使用原始链接: ${processedVideoUrl}`);
                return processedVideoUrl;
              }

              console.log(`Live图视频 ${index + 1} 处理完成: ${processedVideoUrl}`);
              return processedVideoUrl;
            })
          );

          processedData.videos = processedVideos;
        }

        console.log(`📸 Live图多视频处理完成: ${processedData.videos.length} 个视频`);

        // 如果主视频URL还是原始链接，使用第一个处理后的视频
        if (processedData.video && (
            processedData.video.includes('xhscdn.com') ||
            processedData.video.includes('douyin.com') ||
            processedData.video.includes('aweme.snssdk.com')
        )) {
          processedData.video = processedData.videos[0];
          processedData.video_download_url = processedData.videos[0];
          console.log(`📸 Live图主视频已更新为处理后的URL: ${processedData.video}`);
        }

      } catch (error) {
        console.error('处理Live图多视频失败:', error);
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

        console.log(`处理 ${processedData.images.length} 张图片...`);

        // 检查是否为Live图笔记
        if (isLivePhoto) {
          console.log(`📸 检测到Live图笔记，原始图片数量: ${processedData.images.length}`);

          if (isGroupedContent) {
            console.log(`📸 检测到分组内容，将添加"实况图片"标签`);
            // 添加实况图片标签标识
            (processedData as any).addLivePhotoTag = true;
          }

          // 检查是否有媒体分析结果，用于区分Live图和普通图片
          const mediaAnalysis = (processedData as any).mediaAnalysis;
          if (mediaAnalysis && mediaAnalysis.regularImages > 0) {
            console.log(`📸 检测到混合内容: ${mediaAnalysis.livePhotoGroups}组Live图 + ${mediaAnalysis.regularImages}张普通图片`);

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

            console.log(`📸 提取到${regularImageUrls.length}张普通图片URL，将保留这些图片进行处理`);

            // 只保留普通图片，过滤掉Live图相关的图片
            processedData.images = regularImageUrls;

          } else {
            console.log(`📸 纯Live图内容：跳过所有图片上传和同步，只保留Live视频`);
            // 纯Live图内容，清空所有图片
            processedData.images = [];
          }

          // 处理封面图片
          if (processedData.cover) {
            console.log(`📸 Live图封面图片: ${processedData.cover}`);
            const coverKey = `covers/cover_${processedData._raw?.id || Date.now()}`;
            const processedCover = await processMediaFile(processedData.cover, mediaBucket, coverKey, options);
            processedData.cover = processedCover;
            console.log(`📸 Live图封面处理完成: ${processedCover}`);
          }

          console.log(`📸 Live图处理完成：保留${processedData.images.length}张普通图片，${processedData.videos?.length || 0}个视频`);
        }

        // 处理图片 - 支持批量处理避免subrequests过多
        console.log(`📸 [${new Date().toISOString()}] 开始处理 ${processedData.images.length} 张图片，必须全部上传成功...`);

        const imageCount = processedData.images.length;
        const IMAGE_BATCH_SIZE = 6; // 每批处理6张图片

        // 设置总超时时间（每张图片最多30秒，总共不超过5分钟）
        const totalTimeout = Math.min(imageCount * 30000, 300000);
        console.log(`图片处理总超时时间: ${totalTimeout/1000}秒`);

        const processImagesWithTimeout = async (): Promise<string[]> => {
          if (imageCount > IMAGE_BATCH_SIZE) {
            console.log(`📸 图片数量较多(${imageCount})，使用批量处理，每批${IMAGE_BATCH_SIZE}张`);

            const processedImages: string[] = [];

            // 分批处理图片
            for (let i = 0; i < processedData.images!.length; i += IMAGE_BATCH_SIZE) {
              const batch = processedData.images!.slice(i, i + IMAGE_BATCH_SIZE);
              console.log(`📸 处理第${Math.floor(i/IMAGE_BATCH_SIZE) + 1}批图片 (${batch.length}张): ${i + 1}-${Math.min(i + IMAGE_BATCH_SIZE, imageCount)}`);

              const batchResults = await Promise.all(
                batch.map(async (image: string, batchIndex: number): Promise<string> => {
                  const globalIndex = i + batchIndex;
                  console.log(`开始处理图片 ${globalIndex}: ${image}`);
                  const imageKey = `images/${processedData._raw?.id || Date.now()}_${globalIndex}`;

                  try {
                    const processedUrl = await processMediaFile(image, mediaBucket, imageKey, options);
                    console.log(`图片 ${globalIndex} 处理完成: ${processedUrl}`);

                    // 验证处理后的URL不是原始小红书链接
                    if (processedUrl === image || processedUrl.includes('xhscdn.com')) {
                      throw new Error(`图片 ${globalIndex} 上传失败，仍然是原始链接: ${processedUrl}`);
                    }

                    return processedUrl;
                  } catch (error) {
                    console.error(`图片 ${globalIndex} 处理失败:`, error instanceof Error ? error.message : String(error));
                    throw new Error(`图片 ${globalIndex} 处理失败: ${error instanceof Error ? error.message : String(error)}`);
                  }
                })
              );

              processedImages.push(...batchResults);

              // 批次间添加短暂延迟，避免请求过于密集
              if (i + IMAGE_BATCH_SIZE < processedData.images!.length) {
                console.log(`📸 图片批次处理完成，等待300ms后处理下一批...`);
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            }

            return processedImages;
          } else {
            // 图片数量较少，使用原有的并发处理
            return await Promise.all(
              processedData.images!.map(async (image: string, index: number): Promise<string> => {
                console.log(`开始处理图片 ${index}: ${image}`);
                const imageKey = `images/${processedData._raw?.id || Date.now()}_${index}`;

                try {
                  const processedUrl = await processMediaFile(image, mediaBucket, imageKey, options);
                  console.log(`图片 ${index} 处理完成: ${processedUrl}`);

                  // 验证处理后的URL不是原始小红书链接
                  if (processedUrl === image || processedUrl.includes('xhscdn.com')) {
                    throw new Error(`图片 ${index} 上传失败，仍然是原始链接: ${processedUrl}`);
                  }

                  return processedUrl;
                } catch (error) {
                  console.error(`图片 ${index} 处理失败:`, error instanceof Error ? error.message : String(error));
                  throw new Error(`图片 ${index} 处理失败: ${error instanceof Error ? error.message : String(error)}`);
                }
              })
            );
          }
        };

        // 使用AbortController实现可控制的超时
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log(`图片处理超时，正在中止所有请求...`);
          abortController.abort();
        }, totalTimeout);

        let processedImages: string[];
        try {
          processedImages = await processImagesWithTimeout();
          clearTimeout(timeoutId);
          console.log('图片处理在超时前完成');
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`图片处理超时（${totalTimeout/1000}秒）`);
          }
          throw error;
        }

        processedData.images = processedImages;
        console.log('所有图片处理完成');
      } catch (error) {
        console.error('处理图片数组失败:', error);
        console.error('错误详情:', error instanceof Error ? error.stack : String(error));
        // 抛出错误，不要静默失败
        throw new Error(`图片处理失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 标记为已处理
    processedData.processed = true;
    processedData.processed_at = new Date().toISOString();

    return processedData;
  } catch (error) {
    console.error('处理媒体文件失败:', error);
    console.error('错误详情:', error instanceof Error ? error.stack : String(error));
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
      forceR2: options.forceR2 ?? false,
      forceImageHost: options.forceImageHost ?? false,
      timeout: options.timeout ?? 30000
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
