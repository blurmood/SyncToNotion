/**
 * CDN代理URL生成模块
 * 为大文件生成代理URL，支持小红书和抖音视频
 * 
 * @fileoverview CDN代理URL生成和管理
 * @author Augment Agent
 * @version 1.0.0
 */

import { PROXY_CONFIG } from './config.js';

// ==================== 类型定义 ====================

/** 代理元数据 */
export interface ProxyMetadata {
  /** 原始视频URL */
  original: string;
  /** 文件名 */
  filename: string;
  /** 时间戳 */
  timestamp: number;
  /** 来源平台 */
  source: 'xiaohongshu' | 'douyin';
  /** 备用URL列表 */
  backupUrls?: string[];
  /** 签名（可选） */
  signature?: string;
}

/** 平台检测结果 */
export interface PlatformInfo {
  /** 平台名称 */
  platform: 'xiaohongshu' | 'douyin' | 'unknown';
  /** 是否支持代理 */
  supportsProxy: boolean;
}

// ==================== 工具函数 ====================

/**
 * 检测URL所属平台
 * @param url - 视频URL
 * @returns 平台信息
 */
export function detectPlatform(url: string): PlatformInfo {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // 小红书域名检测
    if (hostname.includes('xhscdn.com') || 
        hostname.includes('xiaohongshu.com')) {
      return {
        platform: 'xiaohongshu',
        supportsProxy: true
      };
    }
    
    // 抖音域名检测
    if (hostname.includes('douyin.com') || 
        hostname.includes('aweme.snssdk.com') ||
        hostname.includes('zjcdn.com') ||
        hostname.includes('bytecdn.com')) {
      return {
        platform: 'douyin',
        supportsProxy: true
      };
    }
    
    return {
      platform: 'unknown',
      supportsProxy: false
    };
    
  } catch (error) {
    console.warn('URL平台检测失败:', error);
    return {
      platform: 'unknown',
      supportsProxy: false
    };
  }
}

/**
 * 生成文件名
 * @param originalUrl - 原始URL
 * @param platform - 平台名称
 * @returns 生成的文件名
 */
export function generateFileName(originalUrl: string, platform: string): string {
  try {
    const urlObj = new URL(originalUrl);
    const pathname = urlObj.pathname;
    
    // 尝试从URL中提取文件名
    const pathParts = pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    
    if (lastPart && lastPart.includes('.')) {
      // 如果最后一部分包含扩展名，使用它
      return lastPart;
    }
    
    // 否则生成一个基于时间戳的文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    
    return `${platform}_video_${timestamp}_${random}.mp4`;
    
  } catch (error) {
    // 如果URL解析失败，生成一个默认文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    
    return `${platform}_video_${timestamp}_${random}.mp4`;
  }
}

/**
 * 提取备用URL
 * @param parseData - 解析数据
 * @returns 备用URL列表
 */
export function extractBackupUrls(parseData: any): string[] {
  const backupUrls: string[] = [];
  
  try {
    // 小红书备用URL提取
    if (parseData.mediaAnalysis?.liveGroups) {
      for (const group of parseData.mediaAnalysis.liveGroups) {
        if (group.video?.backupUrls) {
          backupUrls.push(...group.video.backupUrls);
        }
      }
    }
    
    // 抖音备用URL提取（如果有的话）
    if (parseData.backupVideos && Array.isArray(parseData.backupVideos)) {
      backupUrls.push(...parseData.backupVideos);
    }
    
    // 去重
    return [...new Set(backupUrls)];
    
  } catch (error) {
    console.warn('提取备用URL失败:', error);
    return [];
  }
}

/**
 * 生成简单签名
 * @param data - 要签名的数据
 * @returns 签名字符串
 */
function generateSignature(data: string): string {
  // 简单的哈希签名（生产环境建议使用更安全的方法）
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash).toString(36);
}



// ==================== 核心功能 ====================

/**
 * 创建代理URL
 * @param originalUrl - 原始视频URL
 * @param parseData - 解析数据（可选，用于提取备用URL）
 * @returns 代理URL
 */
export function createProxyUrl(originalUrl: string, parseData?: any): string {
  try {
    // 检测平台
    const platformInfo = detectPlatform(originalUrl);
    
    if (!platformInfo.supportsProxy) {
      console.warn(`平台 ${platformInfo.platform} 不支持代理，返回原始URL`);
      return originalUrl;
    }
    
    // 生成文件名
    const filename = generateFileName(originalUrl, platformInfo.platform);
    
    // 提取备用URL
    const backupUrls = parseData ? extractBackupUrls(parseData) : [];
    
    // 创建代理元数据
    const metadata: ProxyMetadata = {
      original: originalUrl,
      filename: filename,
      timestamp: Date.now(),
      source: platformInfo.platform === 'unknown' ? 'douyin' : platformInfo.platform,
      backupUrls: backupUrls.length > 0 ? backupUrls : undefined
    };
    
    // 添加签名
    const dataToSign = `${originalUrl}|${filename}|${metadata.timestamp}`;
    metadata.signature = generateSignature(dataToSign);
    
    // 编码元数据
    const encodedMetadata = btoa(JSON.stringify(metadata));

    // 构建代理URL
    const proxyUrl = `${PROXY_CONFIG.WORKER_URL}/proxy/${PROXY_CONFIG.VERSION}/${encodedMetadata}`;

    console.log(`✅ 生成代理URL: ${platformInfo.platform} -> ${proxyUrl.substring(0, 100)}...`);
    
    return proxyUrl;
    
  } catch (error) {
    console.error('创建代理URL失败:', error);
    return originalUrl; // 失败时返回原始URL
  }
}

/**
 * 解析代理URL
 * @param proxyUrl - 代理URL
 * @returns 解析后的元数据
 */
export function parseProxyUrl(proxyUrl: string): ProxyMetadata | null {
  try {
    const url = new URL(proxyUrl);
    const pathParts = url.pathname.split('/');
    
    // URL格式: /proxy/v1/{base64_metadata}
    if (pathParts.length < 4 || pathParts[1] !== 'proxy') {
      return null;
    }
    
    const encodedMetadata = pathParts[3];
    const metadataJson = atob(encodedMetadata);
    const metadata = JSON.parse(metadataJson) as ProxyMetadata;
    
    // 验证必要字段
    if (!metadata.original || !metadata.source || !metadata.filename) {
      return null;
    }
    
    return metadata;
    
  } catch (error) {
    console.error('解析代理URL失败:', error);
    return null;
  }
}

/**
 * 验证代理URL是否有效
 * @param proxyUrl - 代理URL
 * @param maxAge - 最大有效期（毫秒），默认24小时
 * @returns 是否有效
 */
export function validateProxyUrl(proxyUrl: string, maxAge: number = 24 * 60 * 60 * 1000): boolean {
  try {
    const metadata = parseProxyUrl(proxyUrl);
    
    if (!metadata) {
      return false;
    }
    
    // 检查时间戳是否在有效期内
    const now = Date.now();
    const age = now - metadata.timestamp;
    
    if (age > maxAge) {
      console.warn(`代理URL已过期: ${age}ms > ${maxAge}ms`);
      return false;
    }
    
    // 验证签名（如果有）
    if (metadata.signature) {
      const dataToSign = `${metadata.original}|${metadata.filename}|${metadata.timestamp}`;
      const expectedSignature = generateSignature(dataToSign);
      
      if (metadata.signature !== expectedSignature) {
        console.warn('代理URL签名验证失败');
        return false;
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('验证代理URL失败:', error);
    return false;
  }
}

/**
 * 判断是否应该使用代理
 * @param fileSize - 文件大小（字节）
 * @param platform - 平台名称
 * @returns 是否使用代理
 */
export function shouldUseProxy(fileSize: number, platform?: string): boolean {
  // 文件大小检查
  if (fileSize <= PROXY_CONFIG.SIZE_THRESHOLD) {
    return false;
  }
  
  // 平台支持检查
  if (platform) {
    const platformInfo = detectPlatform(`https://${platform}.com/test`);
    if (!platformInfo.supportsProxy) {
      return false;
    }
  }
  
  return true;
}

/**
 * 格式化文件大小
 * @param bytes - 字节数
 * @returns 格式化后的文件大小
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
