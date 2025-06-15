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

// 类型已在上面通过interface导出，无需重复导出
