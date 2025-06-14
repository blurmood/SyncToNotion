/**
 * 企微同步Notion项目的TypeScript类型定义
 * 为JavaScript代码提供类型提示和检查
 */

// ==================== 通用类型 ====================

/** 基础响应接口 */
export interface BaseResponse {
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 时间戳 */
  timestamp: string;
}

/** 作者信息 */
export interface Author {
  /** 作者名称 */
  name: string;
  /** 头像链接 */
  avatar: string;
  /** 作者ID（可选） */
  id?: string;
}

/** 统计数据 */
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

// ==================== 抖音相关类型 ====================

/** 抖音解析结果 */
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
  cover: string | null;
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
  /** 原始API数据 */
  _raw: any;
}

/** 抖音解析器配置 */
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

/** 抖音解析错误 */
export interface DouyinParseError extends Error {
  /** 错误代码 */
  code: string;
  /** 原始错误 */
  originalError: Error | null;
  /** 时间戳 */
  timestamp: string;
}

// ==================== 小红书相关类型 ====================

/** 小红书解析结果 */
export interface XiaohongshuResult {
  /** 标题 */
  title: string;
  /** 作者信息 */
  author: Author;
  /** 内容描述 */
  content: string;
  /** 描述 */
  description: string;
  /** 图片数组 */
  images: string[];
  /** 视频链接（如果有） */
  video?: string;
  /** 封面图 */
  cover: string | null;
  /** 统计数据 */
  stats: Stats;
  /** 标签 */
  tags: string[];
  /** 原始链接 */
  original_url: string;
  /** 解析时间 */
  parsed_at: string;
  /** 原始数据 */
  _raw: any;
}

// ==================== 图床相关类型 ====================

/** 图床上传结果 */
export interface ImageHostResult {
  /** 是否成功 */
  success: boolean;
  /** 图片URL */
  url?: string;
  /** 错误信息 */
  error?: string;
  /** 文件名 */
  filename?: string;
  /** 文件大小 */
  size?: number;
}

/** 图床配置 */
export interface ImageHostConfig {
  /** 图床类型 */
  type: 'smms' | 's3' | 'custom';
  /** API密钥 */
  apiKey?: string;
  /** 自定义配置 */
  config?: Record<string, any>;
}

// ==================== Notion相关类型 ====================

/** Notion页面属性 */
export interface NotionPageProperties {
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
  /** 图片URLs */
  images?: string[];
  /** 视频URL */
  video?: string;
  /** 作者 */
  author?: string;
  /** 来源 */
  source: 'douyin' | 'xiaohongshu';
  /** 原始链接 */
  original_url: string;
  /** 创建时间 */
  created_at: string;
}

/** Notion同步结果 */
export interface NotionSyncResult {
  /** 是否成功 */
  success: boolean;
  /** 页面ID */
  pageId?: string;
  /** 错误信息 */
  error?: string;
  /** 同步的内容数量 */
  count?: number;
}

// ==================== 工具函数类型 ====================

/** HTTP响应配置 */
export interface ResponseConfig {
  /** 状态码 */
  status?: number;
  /** 响应头 */
  headers?: Record<string, string>;
}

/** 获取系统信息结果 */
export interface SystemInfo {
  /** 操作系统 */
  platform: string;
  /** Node.js版本 */
  nodeVersion: string;
  /** 内存使用情况 */
  memory: {
    used: number;
    total: number;
  };
  /** CPU信息 */
  cpu: {
    model: string;
    cores: number;
  };
}

// ==================== 配置类型 ====================

/** 应用配置 */
export interface AppConfig {
  /** Notion配置 */
  notion: {
    /** 集成Token */
    token: string;
    /** 数据库ID */
    databaseId: string;
  };
  /** 图床配置 */
  imageHost: ImageHostConfig;
  /** 解析器配置 */
  parsers: {
    /** 抖音解析器配置 */
    douyin: DouyinParserConfig;
    /** 小红书解析器配置 */
    xiaohongshu: any;
  };
}
