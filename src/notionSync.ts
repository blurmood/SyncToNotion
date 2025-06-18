/**
 * Notion 同步模块 - TypeScript版本
 * 将解析后的内容同步到 Notion 数据库，具有完整的类型安全
 * 
 * @fileoverview Notion API集成模块，支持小红书和抖音内容同步
 * @author Augment Agent
 * @version 3.0.0 (TypeScript)
 */

import { NOTION_CONFIG, type NotionConfig } from './config.js';

// ==================== 类型定义 ====================

/** Notion API 版本 */
const NOTION_API_VERSION = '2022-06-28';

/** 数据库ID配置 */
const DATABASE_IDS = {
  /** 小红书数据库ID */
  XIAOHONGSHU: '1f83eb3c2d5580bdb008c77603d13f7f',
  /** 抖音数据库ID */
  DOUYIN: '2013eb3c2d5580a390abdbba834e952a'
} as const;

/** 内容类型枚举 */
export type ContentType = 'xiaohongshu' | 'douyin';

/** 媒体类型枚举 */
export type MediaType = 'image' | 'video' | 'audio';

/** 作者信息接口 */
export interface Author {
  /** 作者名称 */
  name: string;
  /** 头像链接 */
  avatar?: string;
  /** 作者ID */
  id?: string;
}

/** 解析数据接口 */
export interface ParsedData {
  /** 标题 */
  title?: string;
  /** 内容描述 */
  content?: string;
  /** 详细描述 */
  description?: string;
  /** 作者信息 */
  author?: Author;
  /** 原始链接 */
  original_url?: string;
  /** 封面图片 */
  cover?: string;
  /** 视频链接 */
  video?: string;
  /** 视频下载链接 */
  video_download_url?: string;
  /** 所有视频链接（Live图等多视频内容） */
  videos?: string[];
  /** 图片数组 */
  images?: string[];
  /** 是否正在处理视频 */
  video_processing?: boolean;
  /** 自定义标签 */
  custom_tags?: string[];
  /** 原始数据 */
  _raw?: {
    /** 内容ID */
    id?: string;
    /** 内容类型 */
    contentType?: 'image' | 'video' | 'text';
    /** 描述 */
    desc?: string;
    /** 其他原始数据 */
    [key: string]: any;
  };
}

/** Notion 富文本接口 */
export interface NotionRichText {
  type: 'text';
  text: {
    content: string;
    link?: {
      url: string;
    };
  };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
}

/** Notion 页面属性接口 */
export interface NotionPageProperties {
  /** 标题属性 */
  [key: string]: {
    title?: Array<NotionRichText>;
    rich_text?: Array<NotionRichText>;
    url?: string | null;
    multi_select?: Array<{ name: string }>;
    files?: Array<NotionFile>;
    date?: {
      start: string;
      end?: string;
    };
  };
}

/** Notion 文件接口 */
export interface NotionFile {
  type: 'external';
  name: string;
  external: {
    url: string;
  };
}

/** Notion 块接口 */
export interface NotionBlock {
  object: 'block';
  type: string;
  [key: string]: any;
}

/** Notion 图片块接口 */
export interface NotionImageBlock extends NotionBlock {
  type: 'image';
  image: {
    type: 'external';
    external: {
      url: string;
    };
  };
}

/** Notion 视频块接口 */
export interface NotionVideoBlock extends NotionBlock {
  type: 'embed';
  embed: {
    url: string;
  };
}

/** Notion 段落块接口 */
export interface NotionParagraphBlock extends NotionBlock {
  type: 'paragraph';
  paragraph: {
    rich_text: Array<NotionRichText>;
  };
}

/** Notion 标注块接口 */
export interface NotionCalloutBlock extends NotionBlock {
  type: 'callout';
  callout: {
    rich_text: Array<NotionRichText>;
    icon: {
      emoji: string;
    };
    color: string;
  };
}

/** Notion API 响应接口 */
export interface NotionApiResponse {
  /** 页面ID */
  id: string;
  /** 创建时间 */
  created_time: string;
  /** 最后编辑时间 */
  last_edited_time: string;
  /** 页面属性 */
  properties: NotionPageProperties;
  /** 其他响应数据 */
  [key: string]: any;
}

/** KV命名空间接口 */
interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<any>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<any>;
}

/** 同步选项接口 */
export interface SyncOptions {
  /** 强制使用特定数据库 */
  forceDatabaseId?: string;
  /** 是否跳过媒体处理 */
  skipMedia?: boolean;
  /** 是否跳过封面设置 */
  skipCover?: boolean;
  /** 自定义标签 */
  customTags?: string[];
  /** KV存储实例（用于页面-文件关联） */
  kv?: KVNamespace;
  /** 原始链接（用于页面-文件关联） */
  originalUrl?: string;
  /** 平台类型（用于页面-文件关联） */
  platform?: '小红书' | '抖音';
  /** 要更新的页面ID（如果提供，则更新现有页面而不是创建新页面） */
  pageId?: string;
}

/** 同步结果接口 */
export interface SyncResult {
  /** 是否成功 */
  success: boolean;
  /** 页面ID */
  pageId?: string;
  /** 错误信息 */
  error?: string;
  /** 同步的内容类型 */
  contentType: ContentType;
  /** 处理的媒体数量 */
  mediaCount: {
    images: number;
    videos: number;
  };
}

// ==================== 工具函数 ====================

/**
 * 判断内容类型
 * @param parsedData - 解析数据
 * @returns 内容类型
 */
function determineContentType(parsedData: ParsedData): ContentType {
  const originalUrl = parsedData.original_url || '';

  console.log('🔍 determineContentType 调试信息:', {
    original_url: originalUrl,
    includes_douyin: originalUrl.includes('douyin.com'),
    includes_v_douyin: originalUrl.includes('v.douyin.com'),
    includes_xiaohongshu: originalUrl.includes('xiaohongshu.com') || originalUrl.includes('xhslink.com')
  });

  if (originalUrl.includes('douyin.com') || originalUrl.includes('v.douyin.com')) {
    console.log('🎯 识别为抖音内容');
    return 'douyin';
  }

  console.log('🎯 识别为小红书内容');
  return 'xiaohongshu';
}

/**
 * 获取数据库ID
 * @param contentType - 内容类型
 * @returns 数据库ID
 */
function getDatabaseId(contentType: ContentType): string {
  return contentType === 'douyin' ? DATABASE_IDS.DOUYIN : DATABASE_IDS.XIAOHONGSHU;
}

/**
 * 处理标题和内容
 * @param parsedData - 解析数据
 * @param contentType - 内容类型
 * @returns 处理后的标题和内容
 */
function processTitle(parsedData: ParsedData, contentType: ContentType): { title: string; content: string } {
  let title = '无标题';
  let content = parsedData.content || '';
  
  // 提取【】及其内容作为标题
  const titleRegex = /【[^【】]+】/;
  const titleMatch = content.match(titleRegex);
  if (titleMatch?.[0]) {
    title = titleMatch[0].trim();
    // 从正文中移除标题部分
    content = content.replace(titleMatch[0], '').trim();
  } else if (parsedData.title && parsedData.title !== '抖音视频' && parsedData.title !== '无标题') {
    // 如果没有【】格式的标题，但有title字段，使用title字段
    title = parsedData.title;
  }
  
  // 如果内容为空但有description字段，使用description作为内容
  if (!content && parsedData.description) {
    content = parsedData.description;
  }
  
  // 如果内容为空但有desc字段（抖音API可能返回的字段），使用desc作为内容
  if (!content && parsedData._raw?.desc) {
    content = parsedData._raw.desc;
  }
  
  // 去除内容前后的换行符
  content = content.trim();
  
  // 如果是抖音内容但标题仍为"无标题"，使用更具描述性的标题
  if (title === '无标题' && contentType === 'douyin') {
    // 使用作者名称作为标题的一部分
    const authorName = parsedData.author?.name || '抖音用户';
    title = `${authorName}的抖音视频`;
    
    // 如果内容不为空，使用内容的前20个字符作为标题的一部分
    if (content && content.length > 0) {
      const shortContent = content.substring(0, 20) + (content.length > 20 ? '...' : '');
      title = `${shortContent} - ${authorName}`;
    }
  }
  
  // 如果是抖音内容，将标题和正文合并到标题属性中
  if (contentType === 'douyin' && content) {
    // 如果标题不包含完整内容，则合并
    if (!title.includes(content)) {
      title = content;
    }
    console.log('抖音内容：将标题和正文合并到标题属性中');
  }
  
  return { title, content };
}

/**
 * 检测是否为Live图内容
 * @param parsedData - 解析数据
 * @returns 是否为Live图
 */
function isLivePhoto(parsedData: ParsedData): boolean {
  // 检查解析器是否已经标识为Live图
  if ('isLivePhoto' in parsedData && (parsedData as any).isLivePhoto === true) {
    return true;
  }

  // 检查是否有Live图视频数组
  if ('livePhotos' in parsedData && Array.isArray((parsedData as any).livePhotos) && (parsedData as any).livePhotos.length > 0) {
    return true;
  }

  // 检查_raw中的isLivePhoto标识
  if (parsedData._raw && 'isLivePhoto' in parsedData._raw && parsedData._raw.isLivePhoto === true) {
    return true;
  }

  return false;
}

/**
 * 生成标签
 * @param parsedData - 解析数据
 * @param contentType - 内容类型
 * @returns 标签数组
 */
function generateTags(parsedData: ParsedData, contentType: ContentType): string[] {
  const tags: string[] = [];

  // 根据内容类型添加基础标签
  if (contentType === 'xiaohongshu') {
    tags.push('小红书');
  } else if (contentType === 'douyin') {
    tags.push('抖音');
  }

  // 检查是否为Live图
  const isLive = isLivePhoto(parsedData);

  if (isLive) {
    // Live图笔记：只添加"实况图片"标签
    tags.push('实况图片');
    console.log('🔍 检测到Live图，添加"实况图片"标签');
  } else {
    // 非Live图笔记：根据内容添加相应标签

    // 如果笔记有图片，添加"图文"标签
    if (Array.isArray(parsedData.images) && parsedData.images.length > 0) {
      tags.push('图文');
    }

    // 如果笔记有视频或视频正在处理中，添加"视频"标签
    if (parsedData.video || parsedData.video_processing || parsedData._raw?.contentType === 'video') {
      tags.push('视频');
    }
  }

  // 添加自定义标签
  if (Array.isArray(parsedData.custom_tags)) {
    for (const tag of parsedData.custom_tags) {
      if (tag && !tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }

  return tags;
}

/**
 * 验证图片URL是否有效
 * @param url - 图片URL
 * @returns 是否有效
 */
function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    // 检查协议是否为http或https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false;
    }

    // 检查是否包含常见的图片扩展名或图片服务域名
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const imageHosts = ['xhscdn.com', 'douyin.com', 'bytedance.com'];

    const hasImageExtension = imageExtensions.some(ext =>
      parsedUrl.pathname.toLowerCase().includes(ext)
    );

    const isImageHost = imageHosts.some(host =>
      parsedUrl.hostname.includes(host)
    );

    return hasImageExtension || isImageHost;
  } catch (error) {
    console.warn(`验证图片URL失败: ${url}`, error);
    return false;
  }
}

/**
 * 从URL中提取文件名
 * @param url - URL
 * @returns 文件名
 */
function getFileNameFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const fileName = pathname.split('/').pop() || 'file';

    // 如果文件名没有扩展名，根据URL特征添加扩展名
    if (!fileName.includes('.')) {
      if (url.includes('video') || url.includes('mp4')) {
        return `${fileName}.mp4`;
      } else if (url.includes('image') || url.includes('img')) {
        return `${fileName}.jpg`;
      }
    }

    return fileName;
  } catch (error) {
    // 如果URL解析失败，生成一个默认文件名
    const timestamp = Date.now();
    return `file_${timestamp}`;
  }
}

// ==================== 核心同步函数 ====================

/**
 * 同步内容到 Notion
 * @param parsedData - 解析后的数据
 * @param options - 同步选项
 * @returns 同步结果
 */
export async function syncToNotion(
  parsedData: ParsedData,
  options: SyncOptions = {}
): Promise<SyncResult> {
  try {
    // 确定内容类型和数据库ID
    const contentType = determineContentType(parsedData);
    const databaseId = options.forceDatabaseId || getDatabaseId(contentType);

    // 处理标题和内容
    const { title, content } = processTitle(parsedData, contentType);

    // 生成标签
    const tags = generateTags(parsedData, contentType);
    if (options.customTags) {
      tags.push(...options.customTags.filter(tag => !tags.includes(tag)));
    }



    // 准备 Notion 页面属性
    const properties = createPageProperties(title, content, parsedData, tags, contentType);

    // 准备页面内容块
    const children = createPageBlocks(parsedData, contentType);

    let response: NotionApiResponse;

    // 检查是否为更新现有页面
    if (options.pageId) {
      console.log(`🔄 更新现有Notion页面: ${options.pageId}`);
      response = await updateNotionPage(options.pageId, properties, children);
    } else {
      // 创建新的 Notion 页面
      response = await createNotionPage(properties, children, databaseId);
    }

    // 处理媒体文件和封面
    let mediaCount = { images: 0, videos: 0 };

    if (response.id && !options.skipMedia) {
      const pageId = response.id;

      // 检查是否为视频内容
      const isVideoContent = parsedData._raw?.contentType === 'video' || parsedData.video;

      // 检查是否为Live图
      const isLive = isLivePhoto(parsedData);

      // 处理图片
      if (Array.isArray(parsedData.images) && parsedData.images.length > 0) {
        if (isLive) {
          console.log(`📸 Live图内容: 处理并添加 ${parsedData.images.length} 张图片到页面属性`);
          await addMediaToPage(pageId, parsedData.images, '图片', true);
          mediaCount.images = parsedData.images.length;
        } else if (!isVideoContent) {
          console.log(`📸 图文内容: 处理并添加 ${parsedData.images.length} 张图片到页面属性`);
          await addMediaToPage(pageId, parsedData.images, '图片', false);
          mediaCount.images = parsedData.images.length;
        } else {
          console.log(`🎬 视频内容: 跳过图片属性，不添加图片到页面属性`);
        }
      }

      // 处理视频（包括Live图多视频）
      if (parsedData.video) {
        console.log(`🔍 开始处理视频数据...`);
        console.log(`🔍 parsedData.video: ${parsedData.video}`);
        console.log(`🔍 parsedData.video_download_url: ${parsedData.video_download_url}`);
        console.log(`🔍 parsedData.videos: ${JSON.stringify(parsedData.videos)}`);

        const videoUrls: string[] = [];

        // 检查是否为真正的Live图（不仅仅是多个视频URL）
        const isLive = isLivePhoto(parsedData);
        if (isLive && parsedData.videos && Array.isArray(parsedData.videos) && parsedData.videos.length > 1) {
          console.log(`📸 Live图内容: 处理 ${parsedData.videos.length} 个视频`);
          console.log(`📸 Live图视频列表:`, parsedData.videos);

          // 去重处理
          const uniqueVideos = [...new Set(parsedData.videos)];
          console.log(`📸 去重后的Live图视频: ${uniqueVideos.length} 个`);

          videoUrls.push(...uniqueVideos);
          mediaCount.videos = uniqueVideos.length;
        } else {
          // 单个视频（包括被错误识别为多视频的普通视频笔记）
          const videoDownloadUrl = parsedData.video_download_url || parsedData.video;
          console.log(`🎬 单个视频URL: ${videoDownloadUrl}`);

          // 检查视频URL是否有效
          if (!videoDownloadUrl || videoDownloadUrl === 'undefined' || typeof videoDownloadUrl !== 'string') {
            console.error('❌ 页面属性：视频URL无效，跳过添加到页面属性:', videoDownloadUrl);
            console.error('❌ parsedData.video_download_url:', parsedData.video_download_url);
            console.error('❌ parsedData.video:', parsedData.video);
          } else {
            videoUrls.push(videoDownloadUrl);
            mediaCount.videos = 1;
          }
        }

        console.log(`🔍 最终视频URL数组:`, videoUrls);
        console.log(`🔍 视频数组长度: ${videoUrls.length}`);

        // 添加所有视频到页面属性
        await addMediaToPage(pageId, videoUrls, '视频', isLive);
        console.log(`✅ 视频链接已添加到页面属性中: ${videoUrls.length} 个视频`);
      }

      // 设置封面图片
      if (parsedData.cover && !options.skipCover) {
        console.log(`🖼️ 设置页面封面: ${isVideoContent ? '视频封面' : '图文封面'}`);
        await setPageCover(pageId, parsedData.cover);
      }
    }

    console.log('同步到 Notion 完成');

    return {
      success: true,
      pageId: response.id,
      contentType,
      mediaCount
    };

  } catch (error) {
    console.error('❌ 同步到 Notion 失败:', error);
    console.error('❌ 错误详情:', error instanceof Error ? error.message : String(error));
    console.error('❌ 错误堆栈:', error instanceof Error ? error.stack : '无堆栈信息');

    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: `同步到 Notion 失败: ${errorMessage}`,
      contentType: determineContentType(parsedData),
      mediaCount: { images: 0, videos: 0 }
    };
  }
}

/**
 * 创建页面属性
 * @param title - 标题
 * @param content - 内容
 * @param parsedData - 解析数据
 * @param tags - 标签
 * @param contentType - 内容类型
 * @returns 页面属性
 */
function createPageProperties(
  title: string,
  content: string,
  parsedData: ParsedData,
  tags: string[],
  contentType: ContentType
): NotionPageProperties {
  // 获取当前时间作为创建时间
  const now = new Date();
  const createTime = now.toISOString();

  const properties: NotionPageProperties = {
    // 标题属性
    "标题": {
      title: [
        {
          type: "text",
          text: {
            content: title
          }
        }
      ]
    },
    // 原帖链接属性
    "原帖链接": {
      url: parsedData.original_url || null
    },
    // 作者属性
    "作者": {
      rich_text: [
        {
          type: "text",
          text: {
            content: parsedData.author?.name || '未知作者'
          }
        }
      ]
    },
    // 创建时间属性 - 记录同步到Notion的时间
    "创建时间": {
      date: {
        start: createTime
      }
    }
  };

  // 只有非抖音内容才单独添加正文属性
  if (contentType !== 'douyin') {
    properties["正文"] = {
      rich_text: [
        {
          type: "text",
          text: {
            content: content
          }
        }
      ]
    };
  }

  // 添加标签
  if (tags.length > 0) {
    properties["标签"] = {
      multi_select: tags.map(tag => ({ name: tag }))
    };
  }

  return properties;
}

/**
 * 创建页面内容块
 * @param parsedData - 解析数据
 * @param contentType - 内容类型
 * @returns 内容块数组
 */
function createPageBlocks(parsedData: ParsedData, contentType: ContentType): NotionBlock[] {
  const children: NotionBlock[] = [];

  // 检查是否为视频内容
  const isVideoContent = parsedData._raw?.contentType === 'video' || parsedData.video;

  // 检查是否为Live图
  const isLive = isLivePhoto(parsedData);

  // 添加图片块
  if (Array.isArray(parsedData.images) && parsedData.images.length > 0) {
    if (isLive) {
      console.log(`📸 Live图内容: 添加 ${parsedData.images.length} 张图片到页面内容`);
    } else if (!isVideoContent) {
      console.log(`📸 图文内容: 添加 ${parsedData.images.length} 张图片到页面内容`);
    } else {
      console.log(`🎬 视频内容: 跳过图片块，仅显示视频内容`);
      if (parsedData.images && parsedData.images.length > 0) {
        console.log(`🎬 已过滤 ${parsedData.images.length} 张图片，避免在视频笔记中显示`);
      }
    }

    // 为Live图或图文内容添加图片块
    if (isLive || !isVideoContent) {
      // 为每张图片创建图片块（使用已处理的图片URL）
      for (const imageUrl of parsedData.images) {
        console.log(`📸 创建图片块: ${imageUrl}`);

        // 验证图片URL
        if (!isValidImageUrl(imageUrl)) {
          console.error(`❌ 跳过无效的图片URL: ${imageUrl}`);
          continue;
        }

        // 检查是否为处理后的URL（应该包含图床域名或R2域名）
        const isProcessedUrl = imageUrl.includes('tg-image.oox-20b.workers.dev') ||
                             imageUrl.includes('pub-13891ccdad9f4aababe3cc021e21947e.r2.dev');

        if (!isProcessedUrl) {
          console.warn(`⚠️ 图片URL似乎未经处理: ${imageUrl}`);
          console.warn(`⚠️ 原始小红书链接可能无法在Notion中显示`);
        }

        const imageBlock: NotionImageBlock = {
          object: "block",
          type: "image",
          image: {
            type: "external",
            external: {
              url: imageUrl
            }
          }
        };

        children.push(imageBlock);
        console.log(`✅ 图片块创建完成: ${imageUrl.substring(0, 50)}...`);
      }
    }
  }

  // 添加视频块或处理提示（支持Live图多视频）
  if (parsedData.video) {
    console.log(`🔍 页面内容：开始处理视频块...`);
    console.log(`🔍 页面内容：parsedData.video: ${parsedData.video}`);
    console.log(`🔍 页面内容：parsedData.video_download_url: ${parsedData.video_download_url}`);
    console.log(`🔍 页面内容：parsedData.videos: ${JSON.stringify(parsedData.videos)}`);

    // 检查是否为真正的Live图（不仅仅是多个视频URL）
    const isLive = isLivePhoto(parsedData);
    if (isLive && parsedData.videos && Array.isArray(parsedData.videos) && parsedData.videos.length > 1) {
      console.log(`📸 Live图内容: 添加 ${parsedData.videos.length} 个视频到页面内容`);

      // 去重处理
      const uniqueVideos = [...new Set(parsedData.videos)];
      console.log(`📸 页面内容：去重后的Live图视频: ${uniqueVideos.length} 个`);

      // 添加Live图说明
      const livePhotoHeader: NotionParagraphBlock = {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `📸 Live图内容 (${uniqueVideos.length} 个视频):`
              }
            }
          ]
        }
      };
      children.push(livePhotoHeader);

      // 为每个视频创建嵌入块（显示所有视频）
      uniqueVideos.forEach((videoUrl, index) => {
        console.log(`添加Live图视频 ${index + 1}/${uniqueVideos.length}: ${videoUrl}`);

        // 只创建视频嵌入块，不创建额外的链接块
        const videoBlock = createVideoBlock(videoUrl);
        if (videoBlock) {
          children.push(videoBlock);
        }
      });

    } else {
      // 单个视频的处理逻辑（包括被错误识别为多视频的普通视频笔记）
      const finalVideoUrl = parsedData.video_download_url || parsedData.video;

      // 检查视频URL是否有效
      if (!finalVideoUrl || finalVideoUrl === 'undefined' || typeof finalVideoUrl !== 'string') {
        console.error('❌ 页面内容：视频URL无效，跳过视频块创建:', finalVideoUrl);
        console.error('❌ parsedData.video_download_url:', parsedData.video_download_url);
        console.error('❌ parsedData.video:', parsedData.video);
      } else {
        // 视频链接应该已经是处理后的图床链接
        console.log('🎬 页面内容：使用处理后的视频链接同步到Notion:', finalVideoUrl);

        // 创建视频嵌入块（视频笔记只需要嵌入块，不需要额外的链接）
        const videoBlock = createVideoBlock(finalVideoUrl);
        if (videoBlock) {
          children.push(videoBlock);
          console.log('✅ 页面内容：视频笔记已添加视频嵌入块');
        } else {
          console.log('❌ 页面内容：视频笔记视频嵌入块创建失败');
        }
      }
    }
  } else if (parsedData.video_processing) {
    // 如果视频正在处理中，添加提示信息
    const processingBlock: NotionCalloutBlock = {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "🎬 视频正在处理中，处理完成后将自动添加到此页面..."
            }
          }
        ],
        icon: {
          emoji: "⏳"
        },
        color: "blue"
      }
    };

    children.push(processingBlock);
  }

  return children;
}

/**
 * 创建视频块
 * @param videoUrl - 视频URL
 * @returns 视频块或null
 */
function createVideoBlock(videoUrl: string): NotionVideoBlock | null {
  console.log('创建视频块:', videoUrl);

  try {
    // 检查URL是否有效
    if (!videoUrl || videoUrl === 'undefined' || typeof videoUrl !== 'string') {
      console.error('❌ 视频URL无效:', videoUrl);
      return null;
    }

    // 检查URL是否以.mp4结尾，如果不是，强制添加.mp4扩展名
    let processedUrl = videoUrl;
    if (!processedUrl.toLowerCase().endsWith('.mp4')) {
      // 检查URL是否包含查询参数
      if (processedUrl.includes('?')) {
        // 在查询参数前添加.mp4扩展名
        processedUrl = processedUrl.replace('?', '.mp4?');
      } else {
        // 直接添加.mp4扩展名
        processedUrl = `${processedUrl}.mp4`;
      }
      console.log('添加.mp4扩展名后的URL:', processedUrl);
    }

    // 使用嵌入块处理视频
    console.log('使用嵌入块处理视频:', processedUrl);
    return {
      object: "block",
      type: "embed",
      embed: {
        url: processedUrl
      }
    };
  } catch (error) {
    console.error('创建视频块失败:', error);
    return null;
  }
}

/**
 * 创建 Notion 页面
 * @param properties - 页面属性
 * @param children - 页面内容块
 * @param databaseId - 数据库ID
 * @returns Notion API 响应
 */
async function createNotionPage(
  properties: NotionPageProperties,
  children: NotionBlock[] = [],
  databaseId: string
): Promise<NotionApiResponse> {
  console.log('🔍 开始创建Notion页面...');
  console.log('📊 数据库ID:', databaseId);
  console.log('📋 页面属性:', JSON.stringify(properties, null, 2));

  const requestBody: any = {
    parent: {
      database_id: databaseId
    },
    properties: properties
  };

  // 如果有内容块，添加到请求体
  if (children.length > 0) {
    requestBody.children = children;
    console.log('📝 页面内容块数量:', children.length);
  }

  console.log('🚀 发送Notion API请求...');
  console.log('📤 请求体:', JSON.stringify(requestBody, null, 2));

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NOTION_CONFIG.API_KEY}`,
      'Notion-Version': NOTION_API_VERSION
    },
    body: JSON.stringify(requestBody)
  });

  console.log('📊 Notion API响应状态:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Notion API错误响应:', errorText);
    throw new Error(`Notion API 错误 (${response.status}): ${errorText}`);
  }

  const responseData = await response.json() as NotionApiResponse;
  console.log('✅ Notion页面创建成功!');
  console.log('📝 页面ID:', responseData.id);
  console.log('🔗 页面URL:', `https://notion.so/${responseData.id.replace(/-/g, '')}`);

  return responseData;
}

/**
 * 更新现有的 Notion 页面
 * @param pageId - 页面ID
 * @param properties - 页面属性
 * @param children - 页面内容块
 * @returns Notion API 响应
 */
async function updateNotionPage(
  pageId: string,
  properties: NotionPageProperties,
  children: NotionBlock[] = []
): Promise<NotionApiResponse> {
  console.log('🔄 开始更新Notion页面...');
  console.log('📝 页面ID:', pageId);
  console.log('📋 更新属性:', JSON.stringify(properties, null, 2));

  // 首先更新页面属性
  const updatePropertiesResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NOTION_CONFIG.API_KEY}`,
      'Notion-Version': NOTION_API_VERSION
    },
    body: JSON.stringify({
      properties: properties
    })
  });

  console.log('📊 更新属性响应状态:', updatePropertiesResponse.status, updatePropertiesResponse.statusText);

  if (!updatePropertiesResponse.ok) {
    const errorText = await updatePropertiesResponse.text();
    console.error('❌ 更新页面属性失败:', errorText);
    throw new Error(`更新页面属性失败 (${updatePropertiesResponse.status}): ${errorText}`);
  }

  const updatedPageData = await updatePropertiesResponse.json() as NotionApiResponse;
  console.log('✅ 页面属性更新成功!');

  // 如果有新的内容块，追加到页面末尾
  if (children.length > 0) {
    console.log('📝 追加新的内容块数量:', children.length);

    const appendBlocksResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NOTION_CONFIG.API_KEY}`,
        'Notion-Version': NOTION_API_VERSION
      },
      body: JSON.stringify({
        children: children
      })
    });

    console.log('📊 追加内容块响应状态:', appendBlocksResponse.status, appendBlocksResponse.statusText);

    if (!appendBlocksResponse.ok) {
      const errorText = await appendBlocksResponse.text();
      console.error('❌ 追加内容块失败:', errorText);
      // 内容块追加失败不影响整体更新，只记录错误
      console.warn('⚠️ 页面属性已更新，但内容块追加失败');
    } else {
      console.log('✅ 内容块追加成功!');
    }
  }

  console.log('🔗 更新后页面URL:', `https://notion.so/${pageId.replace(/-/g, '')}`);
  return updatedPageData;
}

/**
 * 将媒体添加到 Notion 页面属性
 * @param pageId - Notion 页面 ID
 * @param mediaUrls - 媒体 URL 数组
 * @param propertyName - 属性名称
 * @param isLivePhoto - 是否为Live图内容
 */
async function addMediaToPage(pageId: string, mediaUrls: string[], propertyName: string, isLivePhoto: boolean = false): Promise<void> {
  try {
    console.log(`开始添加${propertyName}到 Notion 页面...`);
    console.log(`媒体URL列表:`, mediaUrls);

    if (!mediaUrls || mediaUrls.length === 0) {
      console.log(`没有${propertyName}需要添加`);
      return;
    }

    // 准备文件数组，根据类型生成友好的文件名
    const files: NotionFile[] = mediaUrls.map((url, index) => {
      let fileName: string;

      if (propertyName === '图片') {
        fileName = `图片${index + 1}.jpg`;
      } else if (propertyName === '视频') {
        if (isLivePhoto) {
          fileName = `实况${index + 1}.mp4`;
        } else {
          fileName = `视频${index + 1}.mp4`;
        }
      } else {
        // 降级到原来的逻辑
        fileName = getFileNameFromUrl(url);
      }

      return {
        type: 'external',
        name: fileName,
        external: {
          url: url
        }
      };
    });

    console.log(`准备更新页面属性，文件数量: ${files.length}`);

    // 直接更新页面属性，使用外部URL
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NOTION_CONFIG.API_KEY}`,
        'Notion-Version': NOTION_API_VERSION
      },
      body: JSON.stringify({
        properties: {
          [propertyName]: {
            files: files
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`更新页面${propertyName}失败 (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(`添加${propertyName}到 Notion 页面完成`, result.id);

  } catch (error) {
    console.error(`添加${propertyName}到 Notion 页面失败:`, error);
    // 不抛出错误，让流程继续
  }
}

/**
 * 设置页面封面
 * @param pageId - 页面ID
 * @param coverUrl - 封面图片URL
 */
async function setPageCover(pageId: string, coverUrl: string): Promise<void> {
  try {
    console.log(`🖼️ 开始设置页面封面...`);
    console.log(`📝 页面ID: ${pageId}`);
    console.log(`🔗 封面URL: ${coverUrl}`);

    // 验证URL格式
    if (!coverUrl || !coverUrl.startsWith('http')) {
      console.error(`❌ 封面URL格式无效: ${coverUrl}`);
      return;
    }

    const requestBody = {
      cover: {
        type: 'external',
        external: {
          url: coverUrl
        }
      }
    };

    console.log(`📤 封面设置请求体:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NOTION_CONFIG.API_KEY}`,
        'Notion-Version': NOTION_API_VERSION
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📊 封面设置响应状态: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ 设置页面封面失败 (${response.status}): ${errorText}`);
      console.error(`🔍 失败的封面URL: ${coverUrl}`);
      return;
    }

    const responseData = await response.json();
    console.log('✅ 页面封面设置成功!');
    console.log(`🎯 封面已设置为: ${coverUrl}`);

  } catch (error) {
    console.error('❌ 设置页面封面异常:', error);
    console.error(`🔍 异常时的封面URL: ${coverUrl}`);
    // 不抛出错误，让流程继续
  }
}

// ==================== 高级功能 ====================

/**
 * Notion 同步器类
 * 提供更高级的同步功能
 */
export class NotionSyncer {
  private readonly config: NotionConfig;
  private readonly defaultOptions: SyncOptions;

  /**
   * 创建 Notion 同步器实例
   * @param config - Notion 配置
   * @param defaultOptions - 默认同步选项
   */
  constructor(config: NotionConfig = NOTION_CONFIG, defaultOptions: SyncOptions = {}) {
    this.config = config;
    this.defaultOptions = defaultOptions;
  }

  /**
   * 同步单个内容
   * @param parsedData - 解析数据
   * @param options - 同步选项
   * @returns 同步结果
   */
  public async sync(parsedData: ParsedData, options: SyncOptions = {}): Promise<SyncResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    return await syncToNotion(parsedData, mergedOptions);
  }

  /**
   * 批量同步内容
   * @param dataList - 解析数据数组
   * @param options - 同步选项
   * @returns 同步结果数组
   */
  public async syncBatch(dataList: ParsedData[], options: SyncOptions = {}): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const data of dataList) {
      try {
        const result = await this.sync(data, options);
        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          success: false,
          error: errorMessage,
          contentType: determineContentType(data),
          mediaCount: { images: 0, videos: 0 }
        });
      }
    }

    return results;
  }

  /**
   * 获取同步统计
   * @param results - 同步结果数组
   * @returns 统计信息
   */
  public getStats(results: SyncResult[]): {
    total: number;
    success: number;
    failed: number;
    byType: Record<ContentType, number>;
    totalMedia: { images: number; videos: number };
  } {
    const stats = {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      byType: { xiaohongshu: 0, douyin: 0 } as Record<ContentType, number>,
      totalMedia: { images: 0, videos: 0 }
    };

    for (const result of results) {
      stats.byType[result.contentType]++;
      stats.totalMedia.images += result.mediaCount.images;
      stats.totalMedia.videos += result.mediaCount.videos;
    }

    return stats;
  }
}

// ==================== 导出 ====================

// 创建默认同步器实例
export const notionSyncer = new NotionSyncer();

// 类型已通过interface导出，无需重复导出
