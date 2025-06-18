/**
 * 工具函数模块 - TypeScript版本
 * 提供通用的工具函数和辅助方法，具有完整的类型安全
 * 
 * @fileoverview 通用工具函数集合
 * @author Augment Agent
 * @version 2.0.0
 */

// ==================== 类型定义 ====================

/** 错误响应数据接口 */
export interface ErrorResponseData {
  error: true;
  message: string;
  details?: string;
  timestamp: string;
}

/** 成功响应数据接口 */
export interface SuccessResponseData<T = any> {
  error?: false;
  data?: T;
  message?: string;
  timestamp?: string;
}

/** 响应数据联合类型 */
export type ResponseData<T = any> = ErrorResponseData | SuccessResponseData<T>;

/** HTTP状态码类型 */
export type HttpStatusCode = 200 | 201 | 400 | 401 | 403 | 404 | 500 | 502 | 503;

/** Fetch选项接口 */
export interface FetchOptions extends RequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string | FormData | URLSearchParams;
}

// ==================== 响应处理函数 ====================

/**
 * 生成标准化的JSON响应
 * 
 * @param data - 响应数据
 * @param status - HTTP状态码
 * @returns 标准化的Response对象
 * 
 * @example
 * // 成功响应
 * const response = generateResponse({ message: 'success', data: result });
 * 
 * // 错误响应
 * const errorResponse = generateResponse({ error: 'Not found' }, 404);
 */
export function generateResponse<T = any>(
  data: ResponseData<T>, 
  status: HttpStatusCode = 200
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store'
    }
  });
}

/**
 * 处理错误并生成适当的响应
 * 
 * @param error - 错误对象
 * @returns 错误响应对象
 * 
 * @example
 * try {
 *   // 一些可能出错的操作
 * } catch (error) {
 *   return handleError(error);
 * }
 */
export function handleError(error: Error | unknown): Response {
  // 确保error是Error类型
  const err = error instanceof Error ? error : new Error(String(error));
  
  // 确定错误状态码
  let status: HttpStatusCode = 500;
  let message = '服务器内部错误';
  const details = err.message || '未知错误';
  
  if (err.message.includes('请求失败') || err.message.includes('API 请求失败') || err.message.includes('内容提取失败')) {
    status = 502;
    message = '内容解析失败';
  } else if (err.message.includes('缺少') || err.message.includes('无效')) {
    status = 400;
    message = err.message;
  } else if (err.message.includes('登录失败') || err.message.includes('未授权')) {
    status = 401;
    message = '认证失败';
  } else if (err.message.includes('上传失败')) {
    status = 502;
    message = '服务不可用';
  }
  
  // 返回错误响应
  const errorData: ErrorResponseData = {
    error: true,
    message,
    details,
    timestamp: new Date().toISOString()
  };
  
  return generateResponse(errorData, status);
}

// ==================== 工具函数 ====================

/**
 * 生成唯一标识符
 * 
 * @returns 基于时间戳和随机数的唯一ID
 * 
 * @example
 * const id = generateId(); // 'k8j2l9m3n4'
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * 安全地解析JSON字符串
 * 
 * @param str - 要解析的JSON字符串
 * @param fallback - 解析失败时的默认值
 * @returns 解析后的对象或默认值
 * 
 * @example
 * const data = safeJsonParse('{"name": "test"}'); // { name: "test" }
 * const invalid = safeJsonParse('invalid json', []); // []
 */
export function safeJsonParse<T = any>(str: string, fallback: T = {} as T): T {
  try {
    return JSON.parse(str) as T;
  } catch (error) {
    console.error('JSON 解析错误:', error, '原始字符串:', str);
    return fallback;
  }
}

// ==================== 链接提取函数 ====================

/**
 * 从文本中提取小红书链接
 * 
 * @param text - 包含小红书链接的文本
 * @returns 提取出的小红书链接，如果没有找到则返回null
 */
export function extractXiaohongshuLink(text: string | null | undefined): string | null {
  if (!text) return null;
  
  // 定义匹配模式
  const patterns: RegExp[] = [
    // 模式1: 标准的 xhslink.com 链接
    /(https?:\/\/xhslink\.com\/[^\s,，。；;!！?？\"\'\"\"\'\'\s]*)/i,
    // 模式2: 带有额外字符的 xhslink.com 链接
    /(https?:\/\/xhslink\.com\/[a-zA-Z0-9\/\._\-]+)/i,
    // 模式3: 标准的 xiaohongshu.com 链接
    /(https?:\/\/(?:www\.)?xiaohongshu\.com\/[^\s,，。；;!！?？\"\'\"\"\'\'\s]*)/i,
    // 模式4: 更宽松的匹配
    /https?:\/\/xhslink\.com\/[a-zA-Z0-9\/\._\-]+/i
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match) {
      const link = match[1] || match[0];
      return link;
    }
  }

  return null;
}

/**
 * 从文本中提取抖音链接
 * 
 * @param text - 包含抖音链接的文本
 * @returns 提取出的抖音链接，如果没有找到则返回null
 */
export function extractDouyinLink(text: string | null | undefined): string | null {
  if (!text) return null;
  
  console.log('尝试从文本中提取抖音链接:', text);
  
  // 定义匹配模式
  const patterns: RegExp[] = [
    // 模式1: 标准的 douyin.com 链接
    /(https?:\/\/(?:www\.)?douyin\.com\/[^\s,，。；;!！?？\"\'\"\"\'\'\s]*)/i,
    // 模式2: 带有额外字符的 douyin.com 链接
    /(https?:\/\/(?:www\.)?douyin\.com\/[a-zA-Z0-9\/\._\-]+)/i,
    // 模式3: 短链接 v.douyin.com
    /(https?:\/\/v\.douyin\.com\/[^\s,，。；;!！?？\"\'\"\"\'\'\s]*)/i,
    // 模式4: 更宽松的匹配
    /https?:\/\/(?:www\.|v\.)?douyin\.com\/[a-zA-Z0-9\/\._\-]+/i
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match) {
      const link = match[1] || match[0];
      console.log(`使用模式${i + 1}找到抖音链接:`, link);
      return link;
    }
  }
  
  console.log('未找到抖音链接');
  return null;
}

// ==================== 网络请求函数 ====================

/**
 * 带超时设置的fetch函数
 * 
 * 提供超时控制的fetch包装器，避免请求无限等待
 * 
 * @param url - 请求URL
 * @param options - fetch选项对象
 * @param timeout - 超时时间(毫秒)，默认30秒
 * @returns fetch响应对象
 * 
 * @throws 当请求超时时抛出"请求超时"错误
 * @throws 当网络错误或其他fetch错误时抛出相应错误
 * 
 * @example
 * // 基本GET请求
 * const response = await fetchWithTimeout('https://api.example.com/data');
 * const data = await response.json();
 * 
 * @example
 * // 带超时的POST请求
 * const response = await fetchWithTimeout('https://api.example.com/submit', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ name: 'test' })
 * }, 10000);
 */
export async function fetchWithTimeout(
  url: string, 
  options: FetchOptions = {}, 
  timeout: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`请求超时: ${url}`);
    }
    throw error;
  }
}

// ==================== 类型守卫函数 ====================

/**
 * 检查值是否为字符串
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * 检查值是否为数字
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * 检查值是否为对象
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 检查值是否为数组
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}
