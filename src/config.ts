/**
 * 配置文件
 * TypeScript版本 - 提供类型安全的配置管理
 */

// ==================== 类型定义 ====================

/** R2存储配置接口 */
export interface R2Config {
  /** 公共访问URL，用于生成媒体文件的公共链接 */
  readonly PUBLIC_URL: string;
  /** S3 API URL，用于直接通过S3 API访问R2存储桶 */
  readonly S3_API_URL: string;
  /** 存储桶名称 */
  readonly BUCKET_NAME: string;
  /** 访问密钥ID */
  readonly ACCESS_KEY_ID: string;
  /** 访问密钥 */
  readonly SECRET_ACCESS_KEY: string;
}

/** KV存储配置接口 */
export interface KVConfig {
  /** KV命名空间ID */
  readonly NAMESPACE_ID: string;
  /** 缓存过期时间（秒） */
  readonly CACHE_TTL: number;
}

/** 通用配置接口 */
export interface GeneralConfig {
  /** 最大重试次数 */
  readonly MAX_RETRIES: number;
}

/** Notion配置接口 */
export interface NotionConfig {
  /** Notion API密钥 */
  readonly API_KEY: string;
  /** 数据库ID */
  readonly DATABASE_ID: string;
  /** 属性名称配置 */
  readonly TITLE_PROPERTY: string;
  readonly AUTHOR_PROPERTY: string;
  readonly SOURCE_PROPERTY: string;
  readonly TAGS_PROPERTY: string;
  readonly CREATED_PROPERTY: string;
}

/** 图床认证信息接口 */
export interface ImageHostAuth {
  USERNAME: string;
  PASSWORD: string;
  /** 令牌（运行时获取） */
  TOKEN: string | null;
  /** 令牌过期时间（毫秒时间戳） */
  TOKEN_EXPIRES_AT: number;
}

/** 图床配置接口 */
export interface ImageHostConfig {
  /** 上传API端点 */
  readonly UPLOAD_URL: string;
  /** 登录API端点 */
  readonly LOGIN_URL: string;
  /** 图床域名，用于构建完整URL */
  readonly DOMAIN: string;
  /** 认证信息 */
  AUTH: ImageHostAuth;
  /** 令牌有效期（毫秒） */
  readonly TOKEN_TTL: number;
}

/** CDN代理配置接口 */
export interface ProxyConfig {
  /** 代理Worker URL */
  readonly WORKER_URL: string;
  /** 代理版本 */
  readonly VERSION: string;
  /** 文件大小阈值（字节） */
  readonly SIZE_THRESHOLD: number;
}

/** 媒体处理配置接口 */
export interface MediaProcessingConfig {
  /** 延迟配置 */
  readonly DELAYS: {
    /** 批次间延迟（毫秒） */
    readonly BATCH_INTERVAL: number;
    /** 图片间延迟（毫秒） */
    readonly IMAGE_INTERVAL: number;
    /** 视频间延迟（毫秒） */
    readonly VIDEO_INTERVAL: number;
    /** Live图视频间延迟（毫秒） */
    readonly LIVE_PHOTO_INTERVAL: number;
  };
  /** 批次大小配置 */
  readonly BATCH_SIZES: {
    /** 图片批次大小 */
    readonly IMAGES: number;
    /** 视频批次大小 */
    readonly VIDEOS: number;
  };
  /** 超时配置 */
  readonly TIMEOUTS: {
    /** 单个图片处理超时（毫秒） */
    readonly PER_IMAGE: number;
    /** 总处理超时（毫秒） */
    readonly TOTAL_MAX: number;
    /** 网络请求超时（毫秒） */
    readonly NETWORK: number;
  };
  /** 文件大小限制 */
  readonly SIZE_LIMITS: {
    /** 图床文件大小阈值（字节） */
    readonly IMAGE_HOST_THRESHOLD: number;
    /** CDN代理文件大小阈值（字节） */
    readonly PROXY_THRESHOLD: number;
  };
}

// ==================== 配置实例 ====================

/** R2存储配置 */
export const R2_CONFIG: R2Config = {
  // 公共访问URL，用于生成媒体文件的公共链接
  PUBLIC_URL: 'https://pub-13891ccdad9f4aababe3cc021e21947e.r2.dev',

  // S3 API URL，用于直接通过S3 API访问R2存储桶
  S3_API_URL: 'https://592d0b510da82bd943e23e976086a643.r2.cloudflarestorage.com',

  // 存储桶名称
  BUCKET_NAME: 'moodcloud',

  // 访问密钥ID
  ACCESS_KEY_ID: 'ed21462850c667f5e2ecc1d1e9835129',

  // 访问密钥
  SECRET_ACCESS_KEY: 'e86801f03f50c4af50cfe2d9a7ae3621ba713c6942c93f687178db542a2c13e2'
} as const;

/** KV存储配置 */
export const KV_CONFIG: KVConfig = {
  // KV命名空间ID
  NAMESPACE_ID: 'dd58baf330fc4b75b190d16e4b8982bc',

  // 缓存过期时间（秒）
  CACHE_TTL: 86400 // 24小时
} as const;

/** 通用配置 */
export const GENERAL_CONFIG: GeneralConfig = {
  // 最大重试次数
  MAX_RETRIES: 2
} as const;

/** Notion配置 */
export const NOTION_CONFIG: NotionConfig = {
  // Notion API密钥
  API_KEY: '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',

  // 数据库ID
  DATABASE_ID: '2013eb3c2d5580a390abdbba834e952a',

  // 属性名称配置
  TITLE_PROPERTY: '标题',
  AUTHOR_PROPERTY: '作者',
  SOURCE_PROPERTY: '原帖链接',
  TAGS_PROPERTY: '标签',
  CREATED_PROPERTY: '创建时间'
} as const;

/** 图床配置 */
export const IMAGE_HOST_CONFIG: ImageHostConfig = {
  // 上传API端点
  UPLOAD_URL: 'https://tg-image.oox-20b.workers.dev/upload',

  // 登录API端点
  LOGIN_URL: 'https://tg-image.oox-20b.workers.dev/api/auth/login',

  // 图床域名，用于构建完整URL
  DOMAIN: 'https://tg-image.oox-20b.workers.dev',

  // 认证信息
  AUTH: {
    USERNAME: 'liuyiran',
    PASSWORD: '000609',
    // 令牌将在运行时获取
    TOKEN: null,
    // 令牌过期时间（毫秒时间戳）
    TOKEN_EXPIRES_AT: 0
  },

  // 令牌有效期（7天，单位：毫秒）
  TOKEN_TTL: 1000 * 60 * 60 * 24 * 7
} as const;

/** CDN代理配置 */
export const PROXY_CONFIG: ProxyConfig = {
  // 代理Worker URL
  WORKER_URL: 'https://media-proxy.liuyiran.workers.dev',

  // 代理版本
  VERSION: 'v1',

  // 文件大小阈值：100MB (与图床限制保持一致，避免夹缝问题)
  SIZE_THRESHOLD: 100 * 1024 * 1024
} as const;

/** 媒体处理配置 */
export const MEDIA_PROCESSING_CONFIG: MediaProcessingConfig = {
  // 延迟配置（毫秒）
  DELAYS: {
    // 批次间延迟，让系统有时间释放资源
    BATCH_INTERVAL: 300,
    // 图片间延迟，避免请求过于密集
    IMAGE_INTERVAL: 100,
    // 视频间延迟，避免请求过于密集
    VIDEO_INTERVAL: 200,
    // Live图视频间延迟，避免请求过于密集
    LIVE_PHOTO_INTERVAL: 200
  },

  // 批次大小配置
  BATCH_SIZES: {
    // 图片批次大小，避免subrequest过多
    IMAGES: 12,
    // 视频批次大小，避免subrequest过多
    VIDEOS: 8
  },

  // 超时配置（毫秒）
  TIMEOUTS: {
    // 单个图片处理超时：30秒
    PER_IMAGE: 30000,
    // 总处理超时：5分钟
    TOTAL_MAX: 300000,
    // 网络请求超时：30秒
    NETWORK: 30000
  },

  // 文件大小限制（字节）
  SIZE_LIMITS: {
    // 图床文件大小阈值：19MB
    IMAGE_HOST_THRESHOLD: 19 * 1024 * 1024,
    // CDN代理文件大小阈值：110MB
    PROXY_THRESHOLD: 110 * 1024 * 1024
  }
} as const;

// ==================== 工具函数 ====================

/**
 * 检查配置是否有效
 * @param config - 要检查的配置对象
 * @returns 配置是否有效
 */
export function validateConfig<T extends Record<string, any>>(config: T): boolean {
  return Object.values(config).every(value => 
    value !== null && value !== undefined && value !== ''
  );
}

/**
 * 获取环境变量或使用默认值
 * @param key - 环境变量键名
 * @param defaultValue - 默认值
 * @returns 环境变量值或默认值
 */
export function getEnvVar(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * 获取数字类型的环境变量
 * @param key - 环境变量键名
 * @param defaultValue - 默认值
 * @returns 环境变量值或默认值
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

// 所有类型已通过interface关键字导出，无需重复导出
