/**
 * 现代化抖音视频/图片解析模块 - TypeScript版本
 * 使用最新ES6+语法和现代化设计模式，具有完整的类型安全
 * 通过第三方API获取抖音视频/图片的无水印地址和相关信息
 * 
 * @fileoverview 抖音内容解析器，支持视频和图集解析
 * @author Augment Agent
 * @version 3.0.0 (TypeScript)
 */

import { processMediaFile } from './media.js';
import { fetchWithTimeout } from './utils.js';

// ==================== 类型定义 ====================

/** 作者信息接口 */
export interface Author {
  /** 作者名称 */
  name: string;
  /** 头像链接 */
  avatar: string;
  /** 作者ID（可选） */
  id?: string;
  /** 作者签名（可选） */
  signature?: string;
}

/** 统计数据接口 */
export interface Stats {
  /** 点赞数 */
  likes: number;
  /** 评论数 */
  comments: number;
  /** 收藏数 */
  collects: number;
  /** 分享数 */
  shares: number;
}

/** Live图视频信息接口 */
export interface LivePhotoVideoInfo {
  /** 视频URL */
  url: string;
  /** 视频时长(ms) */
  duration: number;
  /** 视频宽度 */
  width: number;
  /** 视频高度 */
  height: number;
  /** 文件大小(bytes) */
  fileSize: number;
  /** 文件哈希 */
  fileHash: string;
}

/** 抖音解析结果接口 */
export interface DouyinResult {
  /** 视频标题 */
  title: string;
  /** 作者信息 */
  author: Author;
  /** 内容描述 */
  content: string;
  /** 详细描述 */
  description: string;
  /** 视频下载链接 */
  video: string | null;
  /** 视频下载链接（别名） */
  video_download_url: string | null;
  /** 原始视频链接 */
  original_video_url: string;
  /** 封面图链接 */
  cover?: string;
  /** 统计数据 */
  stats: Stats;
  /** 视频时长（秒） */
  duration: number;
  /** 背景音乐链接 */
  music_url: string;
  /** 原始链接 */
  original_url: string;
  /** 解析时间 */
  parsed_at: string;
  /** 图片数组（图集类型） */
  images?: string[];
  /** 视频URL数组（用于兼容Notion同步逻辑） */
  videos?: string[];
  /** Live图视频数组 */
  livePhotos?: LivePhotoVideoInfo[];
  /** 是否为Live图 */
  isLivePhoto?: boolean;
  /** 标签信息（可选） */
  tags?: string;
  /** 原始API数据 */
  _raw: any;
  /** 数据来源（可选） */
  _source?: string;
}

/** 抖音解析器配置接口 */
export interface DouyinParserConfig {
  /** 请求超时时间(ms) */
  timeout?: number;
  /** 重试次数 */
  retries?: number;
  /** 重试延迟(ms) */
  retryDelay?: number;
  /** 启用缓存 */
  enableCache?: boolean;
  /** 启用日志 */
  enableLogging?: boolean;
  /** 用户代理 */
  userAgent?: string;
}



/** 重试选项接口 */
interface RetryOptions {
  retries: number;
  delay: number;
}

/** 日志记录器接口 */
interface Logger {
  log: (level: string, message: string, data?: Record<string, any>) => void;
}

// ==================== 错误类 ====================

/**
 * 自定义抖音解析错误类
 */
export class DouyinParseError extends Error {
  /** 错误代码 */
  public readonly code: string;
  /** 原始错误 */
  public readonly originalError: Error | null;
  /** 错误时间戳 */
  public readonly timestamp: string;

  /**
   * 创建抖音解析错误实例
   * @param message - 错误消息
   * @param code - 错误代码
   * @param originalError - 原始错误对象
   */
  constructor(message: string, code: string = 'PARSE_ERROR', originalError: Error | null = null) {
    super(message);
    this.name = 'DouyinParseError';
    this.code = code;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }
}

// ==================== 主解析器类 ====================

/**
 * 现代化抖音解析器类
 * 使用ES6+特性：私有字段、可选链、空值合并、Map/Set等
 * 
 * @example
 * // 基本使用
 * const parser = new DouyinParser();
 * const result = await parser.parse('https://v.douyin.com/xxx/');
 * 
 * // 自定义配置
 * const parser = new DouyinParser({
 *   timeout: 20000,
 *   retries: 5,
 *   enableLogging: true
 * });
 */
export class DouyinParser {
  /** 私有配置对象 */
  readonly #config: Required<DouyinParserConfig>;
  /** 私有缓存对象 */
  readonly #cache = new WeakMap<object, DouyinResult>();
  /** 私有重试选项 */
  readonly #retryOptions: RetryOptions;
  /** 私有日志记录器 */
  readonly #logger: Logger;



  /**
   * 默认配置选项
   */
  private static readonly defaultConfig: Required<DouyinParserConfig> = {
    timeout: 15000,
    retries: 3,
    retryDelay: 1000,
    enableCache: true,
    enableLogging: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15'
  };

  /**
   * 创建抖音解析器实例
   * @param options - 配置选项
   */
  constructor(options: DouyinParserConfig = {}) {
    this.#config = { ...DouyinParser.defaultConfig, ...options };
    this.#retryOptions = {
      retries: this.#config.retries,
      delay: this.#config.retryDelay
    };
    this.#logger = this.createLogger();
  }

  /**
   * 解析抖音链接 - 主要公共方法
   * 
   * @param url - 抖音链接，支持以下格式：
   *   - https://v.douyin.com/xxx/
   *   - https://www.douyin.com/video/xxx
   *   - https://www.iesdouyin.com/share/video/xxx
   * 
   * @returns 解析后的内容信息
   * 
   * @throws 当URL无效或解析失败时抛出DouyinParseError
   * 
   * @example
   * // 基本使用
   * const result = await parser.parse('https://v.douyin.com/RZiYuRoAlFM/');
   * console.log(result.title); // 视频标题
   * console.log(result.author.name); // 作者名称
   * console.log(result.video); // 视频下载链接
   * 
   * @example
   * // 错误处理
   * try {
   *   const result = await parser.parse(url);
   * } catch (error) {
   *   if (error instanceof DouyinParseError) {
   *     console.error('解析错误:', error.code, error.message);
   *   }
   * }
   */
  public async parse(url: string): Promise<DouyinResult> {
    const startTime = performance.now();
    
    try {
      this.log('info', '开始解析抖音链接', { url });
      
      // 验证和清理URL
      const cleanUrl = this.validateAndCleanUrl(url);
      this.log('debug', 'URL验证通过', { original: url, cleaned: cleanUrl });
      
      // 获取完整URL（处理短链接跳转）
      const fullUrl = await this.followRedirects(cleanUrl);
      this.log('debug', '重定向处理完成', { 
        original: cleanUrl, 
        final: fullUrl, 
        redirected: cleanUrl !== fullUrl 
      });
      
      // 首先尝试Live图检测
      this.log('info', '检测是否为Live图内容');
      const livePhotoResult = await this.detectLivePhoto(fullUrl);

      if (livePhotoResult.isLivePhoto && livePhotoResult.success) {
        this.log('info', 'Live图检测成功', {
          videoCount: livePhotoResult.videos.length,
          title: livePhotoResult.title
        });

        // 格式化Live图数据
        const formattedData = this.formatLivePhotoResponse(livePhotoResult, url, livePhotoResult.rawApiData);

        const endTime = performance.now();
        this.log('info', 'Live图解析完成', {
          title: formattedData.title,
          author: formattedData.author?.name,
          livePhotoCount: formattedData.livePhotos?.length || 0,
          duration: `${(endTime - startTime).toFixed(2)}ms`
        });

        return formattedData;
      }

      // 如果不是Live图，使用原有的HTML解析方法
      this.log('info', '使用HTML解析方法');
      const extractedData = await this.retry(
        () => this.fetchFromHTMLParser(fullUrl),
        this.#retryOptions
      );

      // 格式化响应数据
      const formattedData = this.formatResponse(extractedData, url);
      
      const endTime = performance.now();
      this.log('info', '解析完成', { 
        title: formattedData.title,
        author: formattedData.author?.name,
        duration: `${(endTime - startTime).toFixed(2)}ms`
      });
      
      return formattedData;
      
    } catch (error) {
      const endTime = performance.now();
      this.log('error', '解析失败', { 
        error: error instanceof Error ? error.message : String(error),
        duration: `${(endTime - startTime).toFixed(2)}ms`,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      throw new DouyinParseError(
        `抖音内容解析失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof DouyinParseError ? error.code : 'PARSE_ERROR',
        error instanceof Error ? error : null
      );
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 验证和清理URL
   * @param url - 原始URL
   * @returns 清理后的URL
   */
  private validateAndCleanUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      throw new DouyinParseError('URL不能为空', 'INVALID_URL');
    }

    // 抖音链接格式验证 - 使用Set提高查找效率
    const validDomains = new Set(['douyin.com', 'v.douyin.com', 'iesdouyin.com']);
    const hasValidDomain = Array.from(validDomains).some(domain => url.includes(domain));

    if (!hasValidDomain) {
      throw new DouyinParseError('不是有效的抖音链接', 'INVALID_DOUYIN_URL');
    }

    // 提取实际链接 - 使用更精确的正则表达式
    const linkPatterns: RegExp[] = [
      /(https?:\/\/v\.douyin\.com\/[a-zA-Z0-9_-]+\/?)/,  // 包含下划线和连字符
      /(https?:\/\/(?:www\.)?douyin\.com\/[^\s]+)/,
      /(https?:\/\/(?:www\.)?iesdouyin\.com\/[^\s]+)/
    ];

    for (const pattern of linkPatterns) {
      const match = url.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return url;
  }

  /**
   * 跟随重定向获取完整URL
   * @param url - 原始URL（可能是短链接）
   * @returns 重定向后的完整URL
   */
  private async followRedirects(url: string): Promise<string> {
    try {
      this.log('debug', '开始处理重定向', { url });

      let currentUrl = url;
      let redirectCount = 0;
      const maxRedirects = 10;

      while (redirectCount < maxRedirects) {
        const response = await fetchWithTimeout(currentUrl, {
          method: 'HEAD',
          redirect: 'manual', // 手动处理重定向
          headers: {
            'User-Agent': this.#config.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
          }
        }, this.#config.timeout);

        // 检查是否是重定向响应
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (location) {
            // 处理相对URL
            currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
            redirectCount++;
            this.log('debug', `重定向 ${redirectCount}`, { from: url, to: currentUrl });
            continue;
          }
        }

        // 如果不是重定向或者是200响应，返回当前URL
        if (response.status === 200 || response.status < 300) {
          this.log('debug', '重定向处理完成', {
            original: url,
            final: currentUrl,
            redirectCount
          });
          return currentUrl;
        }

        // 其他状态码，停止重定向
        break;
      }

      if (redirectCount >= maxRedirects) {
        this.log('warn', '重定向次数过多，使用最后一个URL', {
          url: currentUrl,
          redirectCount
        });
      }

      this.log('debug', '重定向处理完成', {
        original: url,
        final: currentUrl,
        redirectCount
      });
      return currentUrl;

    } catch (error) {
      this.log('warn', '重定向处理失败，使用原始URL', {
        url,
        error: error instanceof Error ? error.message : String(error)
      });
      return url;
    }
  }

  /**
   * 检测是否为Live图内容
   * @param url - 抖音链接
   * @returns Live图检测结果
   */
  private async detectLivePhoto(url: string): Promise<{
    success: boolean;
    isLivePhoto: boolean;
    videoId?: string;
    title?: string;
    author?: string;
    videos: LivePhotoVideoInfo[];
    metadata?: {
      originalUrl: string;
      finalUrl?: string;
      apiUrl?: string;
      extractedAt: string;
      totalVideos: number;
    };
    rawApiData?: any;
    error?: string;
  }> {
    try {
      this.log('debug', '开始Live图检测', { url });

      // 步骤1: 处理重定向，获取视频ID
      const redirectResult = await this.followLivePhotoRedirects(url);
      this.log('debug', 'Live图重定向结果', redirectResult);

      if (!redirectResult.success || !redirectResult.videoId) {
        return {
          success: false,
          isLivePhoto: false,
          videos: [],
          error: '无法获取视频ID'
        };
      }

      // 步骤2: 检查路径类型并决定处理策略
      const isSlides = redirectResult.finalUrl?.includes('/slides/');
      const isVideo = redirectResult.finalUrl?.includes('/video/');
      this.log('debug', 'Live图路径类型', { isSlides, isVideo });

      // 步骤3: 调用slidesinfo API获取详细数据
      const apiResult = await this.callSlidesInfoAPI(redirectResult.videoId, redirectResult.finalUrl);
      this.log('debug', 'Live图API调用结果', { success: apiResult.success });

      // 步骤4: 检查API响应是否包含live图数据
      const hasLivePhotoData = apiResult.success && this.checkIfLivePhoto(apiResult.data);
      this.log('debug', '包含live图数据', { hasLivePhotoData });

      if (!hasLivePhotoData) {
        if (isSlides) {
          // slides路径但API失败
          return {
            success: false,
            isLivePhoto: true,
            videoId: redirectResult.videoId,
            videos: [],
            metadata: {
              originalUrl: url,
              finalUrl: redirectResult.finalUrl,
              extractedAt: new Date().toISOString(),
              totalVideos: 0
            },
            error: apiResult.error || 'API调用失败'
          };
        } else {
          // video路径且无live图数据，确定是普通视频
          return {
            success: true,
            isLivePhoto: false,
            videoId: redirectResult.videoId,
            videos: [],
            metadata: {
              originalUrl: url,
              finalUrl: redirectResult.finalUrl,
              extractedAt: new Date().toISOString(),
              totalVideos: 0
            }
          };
        }
      }

      // 步骤5: 解析API响应，提取视频数据
      const extractedData = this.parseLivePhotoApiResponse(apiResult.data);

      return {
        success: true,
        isLivePhoto: true,
        videoId: redirectResult.videoId,
        title: extractedData.title,
        author: extractedData.author,
        videos: extractedData.videos,
        metadata: {
          originalUrl: url,
          finalUrl: redirectResult.finalUrl,
          apiUrl: apiResult.apiUrl,
          extractedAt: new Date().toISOString(),
          totalVideos: extractedData.videos.length
        },
        rawApiData: apiResult.data
      };

    } catch (error) {
      this.log('error', 'Live图检测失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        success: false,
        isLivePhoto: false,
        videos: [],
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 使用HTML解析方法获取数据（基于CSDN博客方法）
   * @param url - 抖音链接
   * @returns 解析后的数据
   */
  private async fetchFromHTMLParser(url: string): Promise<any> {
    try {
      this.log('debug', '开始HTML解析方法', { url });

      // 直接获取HTML页面（传入的URL已经是重定向后的完整URL）
      const htmlResponse = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; V2166BA Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/121.0.6167.71 MQQBrowser/6.2 TBS/047205 Mobile Safari/537.36',
          'Cookie': 'ttwid=1%7Chf7h6KY-9QJzBZPLTeMn9TvQ3FjVPiUOGO1TvdN2ypk%7C1727744584%7Ca13c6d514bfb4de5703116a1278df7d0e7ac2331a3ea22dc5a6d5a5416916944;_tea_utm_cache_1243={%22utm_source%22:%22copy%22%2C%22utm_medium%22:%22android%22%2C%22utm_campaign%22:%22client_share%22}',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      }, this.#config.timeout);

      if (!htmlResponse.ok) {
        throw new Error(`HTML请求失败: ${htmlResponse.status} ${htmlResponse.statusText}`);
      }

      const htmlContent = await htmlResponse.text();
      this.log('debug', 'HTML页面获取成功', {
        contentLength: htmlContent.length,
        hasRouterData: htmlContent.includes('window._ROUTER_DATA')
      });

      // 解析HTML中的JSON数据
      const routerDataStart = htmlContent.indexOf('window._ROUTER_DATA = ');
      if (routerDataStart === -1) {
        throw new Error('未找到 window._ROUTER_DATA');
      }

      const jsonStart = routerDataStart + 22; // 'window._ROUTER_DATA = '.length
      const substring = htmlContent.substring(jsonStart);
      const jsonEnd = substring.indexOf('}</script>');

      if (jsonEnd === -1) {
        throw new Error('未找到JSON结束标记');
      }

      const jsonString = substring.substring(0, jsonEnd + 1);
      const routerData = JSON.parse(jsonString);

      this.log('debug', 'JSON解析成功', {
        jsonLength: jsonString.length,
        hasLoaderData: !!routerData.loaderData
      });

      // 查找视频或图集数据
      const loaderData = routerData.loaderData;
      if (!loaderData) {
        throw new Error('未找到 loaderData');
      }

      let videoData = null;
      let contentType = '';

      // 检查视频数据
      for (const key of Object.keys(loaderData)) {
        if (key.includes('video') && loaderData[key]?.videoInfoRes?.item_list) {
          videoData = loaderData[key].videoInfoRes.item_list[0];
          contentType = 'video';
          this.log('debug', '找到视频数据', { key });
          break;
        }
        if (key.includes('note') && loaderData[key]?.videoInfoRes?.item_list) {
          videoData = loaderData[key].videoInfoRes.item_list[0];
          contentType = 'note';
          this.log('debug', '找到图集数据', { key });
          break;
        }
      }

      if (!videoData) {
        throw new Error('未找到视频或图集数据');
      }

      // 返回标准化的数据格式
      return {
        item_list: [videoData],
        status_code: 0,
        _source: 'html_parser',
        _content_type: contentType
      };

    } catch (error) {
      this.log('error', 'HTML解析方法失败', {
        error: error instanceof Error ? error.message : String(error),
        url
      });
      throw new DouyinParseError(
        `HTML解析方法失败: ${error instanceof Error ? error.message : String(error)}`,
        'HTML_PARSER_ERROR',
        error instanceof Error ? error : null
      );
    }
  }





  /**
   * 格式化API响应数据
   * @param apiResponse - API返回的原始数据
   * @param originalUrl - 原始抖音链接
   * @returns 格式化后的数据
   */
  private formatResponse(apiResponse: any, originalUrl: string): DouyinResult {
    // 只处理HTML解析器的响应格式
    if (apiResponse.item_list && Array.isArray(apiResponse.item_list) && apiResponse._source === 'html_parser') {
      return this.formatHTMLParserResponse(apiResponse, originalUrl);
    }

    throw new DouyinParseError('不支持的响应格式', 'UNSUPPORTED_RESPONSE_FORMAT');
  }

  /**
   * 格式化HTML解析器响应数据
   * @param apiResponse - HTML解析器返回的原始数据
   * @param originalUrl - 原始抖音链接
   * @returns 格式化后的数据
   */
  private formatHTMLParserResponse(apiResponse: any, originalUrl: string): DouyinResult {
    const item = apiResponse.item_list[0];
    if (!item) {
      throw new DouyinParseError('HTML解析器返回的数据格式无效', 'INVALID_HTML_PARSER_RESPONSE');
    }

    const contentType = apiResponse._content_type;
    this.log('debug', '格式化HTML解析器响应', {
      contentType,
      desc: item.desc?.substring(0, 50) + '...',
      author: item.author?.nickname
    });

    // 提取视频下载链接
    let videoUrl: string | null = null;
    if (contentType === 'video' && item.video?.play_addr?.uri) {
      // 使用官方的无水印播放链接格式
      videoUrl = `https://www.douyin.com/aweme/v1/play/?video_id=${item.video.play_addr.uri}&ratio=1040p`;
      this.log('debug', '构造无水印视频链接', { uri: item.video.play_addr.uri, videoUrl });
    }

    // 提取图片（如果是图集）- 优先选择JPEG格式
    const images: string[] = [];
    if (contentType === 'note' && item.images && Array.isArray(item.images)) {
      for (const img of item.images) {
        if (img.url_list && Array.isArray(img.url_list) && img.url_list.length > 0) {
          // 优先选择JPEG格式的URL，避免WebP格式
          const jpegUrl = img.url_list.find((url: string) => url.includes('.jpeg') || url.includes('.jpg'));
          const selectedUrl = jpegUrl || img.url_list[0]; // 如果没有JPEG，则使用第一个
          images.push(selectedUrl);

          this.log('debug', '图片URL选择', {
            totalUrls: img.url_list.length,
            selectedUrl: selectedUrl.substring(0, 100) + '...',
            isJpeg: !!(jpegUrl),
            format: jpegUrl ? 'JPEG' : (selectedUrl.includes('.webp') ? 'WebP' : '未知')
          });
        }
      }
    }

    // 提取标签
    const tags = this.extractTags(item.text_extra);

    // 构造结果对象
    const result: DouyinResult = {
      title: item.desc || '抖音内容',
      author: {
        name: item.author?.nickname || '抖音用户',
        avatar: item.author?.avatar_medium?.url_list?.[0] || '',
        id: item.author?.unique_id || item.author?.sec_uid,
        signature: item.author?.signature
      },
      content: item.desc || '抖音内容',
      description: item.desc || '抖音内容',
      video: videoUrl,
      video_download_url: videoUrl,
      original_video_url: originalUrl,
      cover: this.selectBestCoverUrl(item.video?.cover?.url_list) || undefined,
      stats: {
        likes: item.statistics?.digg_count || 0,
        comments: item.statistics?.comment_count || 0,
        collects: item.statistics?.collect_count || 0,
        shares: item.statistics?.share_count || 0
      },
      duration: item.music?.duration || item.video?.duration || 0,
      music_url: item.music?.play_url?.url_list?.[0] || '',
      tags,
      original_url: originalUrl,
      parsed_at: new Date().toISOString(),
      _raw: item,
      _source: 'html_parser'
    };

    // 如果是图集，添加图片数组
    if (images.length > 0) {
      result.images = images;
    }

    return result;
  }

  /**
   * 提取标签信息
   * @param textExtra - 文本额外信息
   * @returns 标签字符串
   */
  private extractTags(textExtra: any[]): string {
    if (!textExtra || !Array.isArray(textExtra) || textExtra.length === 0) {
      return '';
    }

    const tags = textExtra
      .filter(item => item.hashtag_name)
      .map(item => `#${item.hashtag_name}`)
      .join(' ');

    return tags;
  }



  /**
   * 重试机制
   * @param fn - 要重试的函数
   * @param options - 重试选项
   * @returns 函数执行结果
   */
  private async retry<T>(fn: () => Promise<T>, { retries = 3, delay = 1000 }: Partial<RetryOptions> = {}): Promise<T> {
    let lastError: Error;

    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (i === retries) {
          break;
        }

        this.log('warn', `重试 ${i + 1}/${retries}`, {
          error: lastError.message,
          nextRetryIn: `${delay}ms`
        });

        // 指数退避
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }

    throw lastError!;
  }

  /**
   * 创建日志记录器
   * @returns 日志记录器对象
   */
  private createLogger(): Logger {
    return {
      log: (level: string, message: string, data: Record<string, any> = {}) => {
        if (!this.#config.enableLogging) return;

        const timestamp = new Date().toISOString();
        const logData = {
          timestamp,
          level,
          message,
          ...data
        };

        const logMethod = (console as any)[level] || console.log;
        logMethod(`[${level.toUpperCase()}] ${message}`, logData);
      }
    };
  }

  /**
   * 日志记录方法
   * @param level - 日志级别
   * @param message - 日志消息
   * @param data - 附加数据
   */
  private log(level: string, message: string, data: Record<string, any> = {}): void {
    this.#logger.log(level, message, data);
  }

  // ==================== Live图相关方法 ====================

  /**
   * 处理Live图重定向并提取视频ID
   * @param url - 原始URL
   * @returns 重定向结果
   */
  private async followLivePhotoRedirects(url: string): Promise<{
    success: boolean;
    finalUrl?: string;
    videoId?: string;
  }> {
    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirects = 5;

    while (redirectCount < maxRedirects) {
      try {
        const response = await fetchWithTimeout(currentUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
          },
          redirect: 'manual'
        }, this.#config.timeout);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (location) {
            this.log('debug', `Live图重定向 ${redirectCount + 1}`, { from: currentUrl, to: location });
            currentUrl = location;
            redirectCount++;
            continue;
          }
        }

        break;
      } catch (error) {
        this.log('warn', 'Live图重定向检测失败', { error: error instanceof Error ? error.message : String(error) });
        break;
      }
    }

    // 提取视频ID (支持video和slides路径)
    const videoIdMatch = currentUrl.match(/(?:video|slides)\/(\d+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    return {
      success: !!videoId,
      finalUrl: currentUrl,
      videoId: videoId || undefined
    };
  }

  /**
   * 调用slidesinfo API
   * @param videoId - 视频ID
   * @param refererUrl - 引用页面URL
   * @returns API调用结果
   */
  private async callSlidesInfoAPI(videoId: string, refererUrl?: string): Promise<{
    success: boolean;
    data?: any;
    apiUrl?: string;
    error?: string;
  }> {
    try {
      // 基于Network数据构造API URL
      const webId = this.generateWebId();
      const deviceId = webId;

      const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/slidesinfo/?` +
        `reflow_source=reflow_page&` +
        `web_id=${webId}&` +
        `device_id=${deviceId}&` +
        `aweme_ids=%5B${videoId}%5D&` +
        `request_source=200&` +
        `a_bogus=${this.generateABogus()}`;

      this.log('debug', '调用Live图API', { apiUrl: apiUrl.substring(0, 100) + '...' });

      const response = await fetchWithTimeout(apiUrl, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'zh-CN,zh;q=0.9',
          'agw-js-conv': 'str',
          'referer': refererUrl || `https://www.iesdouyin.com/share/slides/${videoId}/`,
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
        }
      }, this.#config.timeout);

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        data: data,
        apiUrl: apiUrl
      };

    } catch (error) {
      this.log('error', 'Live图API调用失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 检查API响应是否包含live图数据
   * @param data - API响应数据
   * @returns 是否包含live图数据
   */
  private checkIfLivePhoto(data: any): boolean {
    try {
      const awemeDetails = data.aweme_details?.[0];
      if (!awemeDetails) {
        return false;
      }

      // 检查是否有images数组且不为空
      const images = awemeDetails.images || [];
      if (images.length === 0) {
        return false;
      }

      // 检查images中是否包含video字段（live图的特征）
      const hasVideoInImages = images.some((image: any) =>
        image.video && image.video.play_addr && image.video.play_addr.url_list
      );

      return hasVideoInImages;
    } catch (error) {
      this.log('error', '检查live图数据失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * 解析Live图API响应数据
   * @param data - API响应数据
   * @returns 解析后的数据
   */
  private parseLivePhotoApiResponse(data: any): {
    title?: string;
    author?: string;
    videos: LivePhotoVideoInfo[];
  } {
    const result = {
      videos: [] as LivePhotoVideoInfo[]
    };

    try {
      this.log('debug', '开始解析Live图API响应', {
        hasAwemeDetails: !!data.aweme_details,
        awemeDetailsLength: data.aweme_details?.length || 0
      });

      const awemeDetails = data.aweme_details?.[0];
      if (!awemeDetails) {
        throw new Error('无法找到aweme_details数据');
      }

      // 提取基本信息
      const title = awemeDetails.desc || awemeDetails.preview_title || '';
      const author = awemeDetails.author?.nickname || '';



      // 提取images数据（live图的核心）- 只提取视频部分
      const images = awemeDetails.images || [];

      images.forEach((image: any) => {
        // 只提取视频信息（每个live图都有对应的视频）
        if (image.video && image.video.play_addr && image.video.play_addr.url_list) {
          const video = image.video;
          const playAddr = video.play_addr;

          result.videos.push({
            url: playAddr.url_list[0],
            duration: video.duration || 0,
            width: video.width || playAddr.width || 0,
            height: video.height || playAddr.height || 0,
            fileSize: playAddr.data_size || 0,
            fileHash: playAddr.file_hash || ''
          });
        }


      });

      return {
        title,
        author,
        videos: result.videos
      };

    } catch (error) {
      this.log('error', '解析Live图API响应失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      return result;
    }
  }

  /**
   * 格式化Live图响应数据
   * @param livePhotoResult - Live图检测结果
   * @param originalUrl - 原始URL
   * @param rawApiData - 原始API数据
   * @returns 格式化后的数据
   */
  private formatLivePhotoResponse(livePhotoResult: any, originalUrl: string, rawApiData?: any): DouyinResult {
    this.log('debug', '格式化Live图响应', {
      videoCount: livePhotoResult.videos?.length || 0,
      title: livePhotoResult.title?.substring(0, 50) + '...'
    });

    // 🎯 从原始API数据提取Live图主封面
    let coverUrl: string | undefined = undefined;
    if (rawApiData?.aweme_details?.[0]?.video?.cover?.url_list) {
      const awemeDetail = rawApiData.aweme_details[0];
      coverUrl = this.selectBestCoverUrl(awemeDetail.video.cover.url_list);
      this.log('debug', 'Live图封面提取', {
        source: 'video.cover.url_list',
        cover: coverUrl?.substring(0, 100) + '...'
      });
    }

    // 提取Live图视频URL数组（用于兼容Notion同步逻辑）
    const livePhotoVideoUrls = livePhotoResult.videos.map((video: any) => video.url);

    // 构造结果对象
    const result: DouyinResult = {
      title: livePhotoResult.title || '抖音实况图片',
      author: {
        name: livePhotoResult.author || '抖音用户',
        avatar: '',
        id: livePhotoResult.videoId
      },
      content: livePhotoResult.title || '抖音实况图片',
      description: livePhotoResult.title || '抖音实况图片',
      video: livePhotoVideoUrls.length > 0 ? livePhotoVideoUrls[0] : null, // 设置第一个视频作为主视频
      video_download_url: livePhotoVideoUrls.length > 0 ? livePhotoVideoUrls[0] : null,
      original_video_url: originalUrl,
      cover: coverUrl || undefined,
      stats: {
        likes: 0,
        comments: 0,
        collects: 0,
        shares: 0
      },
      duration: 0,
      music_url: '',
      tags: '实况图片', // 标记为实况图片
      original_url: originalUrl,
      parsed_at: new Date().toISOString(),
      videos: livePhotoVideoUrls, // ✅ 添加videos字段，兼容Notion同步逻辑
      livePhotos: livePhotoResult.videos || [], // Live图视频数组（详细信息）
      isLivePhoto: true, // 标记为Live图
      _raw: rawApiData || livePhotoResult,
      _source: 'live_photo_extractor'
    };

    return result;
  }

  /**
   * 生成WebID
   * @returns WebID字符串
   */
  private generateWebId(): string {
    return '75' + Math.floor(Math.random() * 100000000000000).toString();
  }

  /**
   * 生成a_bogus参数（简化版本）
   * @returns a_bogus字符串
   */
  private generateABogus(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 选择最佳封面URL（优先JPEG格式）
   * @param urlList - URL列表
   * @returns 最佳URL
   */
  private selectBestCoverUrl(urlList?: string[]): string | undefined {
    if (!urlList || !Array.isArray(urlList) || urlList.length === 0) {
      return undefined;
    }

    // 优先选择JPEG格式的URL，避免WebP格式
    const jpegUrl = urlList.find(url => url.includes('.jpeg') || url.includes('.jpg'));
    const selectedUrl = jpegUrl || urlList[0]; // 如果没有JPEG，则使用第一个

    this.log('debug', '封面URL选择', {
      totalUrls: urlList.length,
      selectedUrl: selectedUrl.substring(0, 100) + '...',
      isJpeg: !!(jpegUrl),
      format: jpegUrl ? 'JPEG' : (selectedUrl.includes('.webp') ? 'WebP' : '未知')
    });

    return selectedUrl;
  }

  /**
   * 静态工厂方法
   * @param options - 配置选项
   * @returns 解析器实例
   */
  public static create(options: DouyinParserConfig = {}): DouyinParser {
    return new DouyinParser(options);
  }
}

// ==================== 导出函数 ====================

// 创建默认解析器实例
const defaultParser = new DouyinParser();

/**
 * 向后兼容的抖音解析函数
 *
 * 这是主要的导出函数，保持与原有代码的完全兼容性
 *
 * @param url - 抖音链接
 * @returns 解析后的内容信息
 *
 * @throws 当URL无效或解析失败时抛出DouyinParseError
 *
 * @example
 * import { parseDouyin } from './douyinParser.js';
 *
 * const result = await parseDouyin('https://v.douyin.com/RZiYuRoAlFM/');
 * console.log(result.title); // 视频标题
 * console.log(result.author.name); // 作者名称
 * console.log(result.video); // 视频下载链接
 *
 * @since 1.0.0
 */
export async function parseDouyin(url: string): Promise<DouyinResult> {
  return await defaultParser.parse(url);
}

/**
 * 工厂函数，用于创建自定义配置的解析器
 *
 * @param options - 配置选项
 * @returns 解析器实例
 *
 * @example
 * import { createDouyinParser } from './douyinParser.js';
 *
 * const parser = createDouyinParser({
 *   timeout: 20000,
 *   retries: 5,
 *   enableLogging: true
 * });
 *
 * @since 2.0.0
 */
export const createDouyinParser = (options: DouyinParserConfig = {}): DouyinParser => {
  return DouyinParser.create(options);
};
