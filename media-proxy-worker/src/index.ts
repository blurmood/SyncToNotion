/**
 * 媒体代理Worker
 * 专门处理小红书和抖音视频的CDN代理
 * 
 * @fileoverview CDN代理Worker，支持大文件流式传输
 * @author Augment Agent
 * @version 1.0.0
 */

// ==================== 类型定义 ====================

/** 代理请求元数据 */
interface ProxyMetadata {
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
  /** 签名 */
  signature?: string;
}

/** 平台配置 */
interface PlatformConfig {
  /** 平台名称 */
  name: string;
  /** 请求头配置 */
  headers: Record<string, string>;
  /** 支持范围请求 */
  supportsRange: boolean;
  /** URL转换函数 */
  transformUrl?: (url: string) => string;
}

// ==================== 平台配置 ====================

/** 小红书平台配置 */
const XIAOHONGSHU_CONFIG: PlatformConfig = {
  name: '小红书',
  supportsRange: false,
  headers: {
    'Referer': 'https://www.xiaohongshu.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  }
};

/** 抖音平台配置 */
const DOUYIN_CONFIG: PlatformConfig = {
  name: '抖音',
  supportsRange: true,
  headers: {
    'Referer': 'https://www.douyin.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site'
  },
  transformUrl: (url: string) => {
    // 将抖音API URL转换为真实视频URL
    return url.replace(
      'https://www.douyin.com/aweme/v1/play/',
      'https://aweme.snssdk.com/aweme/v1/play/'
    );
  }
};

// ==================== 工具函数 ====================

/**
 * 解析代理请求
 * @param request - 请求对象
 * @returns 解析后的元数据
 */
function parseProxyRequest(request: Request): ProxyMetadata | null {
  try {
    const url = new URL(request.url);

    // 从完整路径中提取base64元数据，支持.mp4扩展名
    const pathMatch = url.pathname.match(/^\/proxy\/v1\/(.+?)(?:\.mp4)?$/);

    console.log(`🔍 解析代理请求: ${url.pathname}`);

    if (!pathMatch) {
      console.error(`❌ 路径格式错误: 期望 /proxy/v1/{metadata}[.mp4], 实际: ${url.pathname}`);
      return null;
    }

    const encodedMetadata = pathMatch[1];
    console.log(`🔐 编码元数据: ${encodedMetadata.substring(0, 50)}...`);

    const metadataJson = atob(encodedMetadata);
    console.log(`📋 解码元数据: ${metadataJson}`);

    const metadata = JSON.parse(metadataJson) as ProxyMetadata;

    // 验证必要字段
    if (!metadata.original || !metadata.source || !metadata.filename) {
      console.error(`❌ 元数据字段缺失: original=${!!metadata.original}, source=${!!metadata.source}, filename=${!!metadata.filename}`);
      return null;
    }

    console.log(`✅ 解析成功: ${metadata.source} - ${metadata.filename}`);
    return metadata;

  } catch (error) {
    console.error('解析代理请求失败:', error);
    return null;
  }
}

/**
 * 获取平台配置
 * @param source - 平台来源
 * @returns 平台配置
 */
function getPlatformConfig(source: string): PlatformConfig {
  switch (source) {
    case 'xiaohongshu':
      return XIAOHONGSHU_CONFIG;
    case 'douyin':
      return DOUYIN_CONFIG;
    default:
      return XIAOHONGSHU_CONFIG; // 默认配置
  }
}

/**
 * 检查视频URL可用性
 * @param url - 视频URL
 * @param headers - 请求头
 * @returns 可用性检查结果
 */
async function checkVideoAvailability(url: string, headers: Record<string, string>) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: headers
    });
    
    if (response.ok) {
      return {
        available: true,
        contentLength: response.headers.get('content-length'),
        contentType: response.headers.get('content-type')
      };
    } else {
      return {
        available: false,
        status: response.status,
        statusText: response.statusText
      };
    }
    
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 尝试备用URL
 * @param backupUrls - 备用URL列表
 * @param headers - 请求头
 * @returns 可用的URL
 */
async function tryBackupUrls(backupUrls: string[], headers: Record<string, string>): Promise<string | null> {
  for (const backupUrl of backupUrls) {
    console.log(`🔄 尝试备用URL: ${backupUrl.substring(0, 100)}...`);
    
    const availability = await checkVideoAvailability(backupUrl, headers);
    
    if (availability.available) {
      console.log(`✅ 备用URL可用: ${backupUrl.substring(0, 100)}...`);
      return backupUrl;
    } else {
      console.warn(`❌ 备用URL不可用: ${availability.status || availability.error}`);
    }
  }
  
  return null;
}

/**
 * 生成错误响应
 * @param reason - 错误原因
 * @param status - HTTP状态码
 * @returns 错误响应
 */
function generateErrorResponse(reason: string, status: number = 503): Response {
  const errorPage = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>视频不可用</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .error { color: #e74c3c; }
          .suggestion { color: #7f8c8d; margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>🎬 视频暂时不可用</h1>
        <p class="error">${reason}</p>
        <p class="suggestion">建议：请稍后重试或联系内容发布者</p>
      </body>
    </html>
  `;
  
  return new Response(errorPage, {
    status: status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    }
  });
}

// ==================== 主要处理函数 ====================

/**
 * 处理代理请求
 * @param request - 请求对象
 * @returns 响应
 */
async function handleProxyRequest(request: Request): Promise<Response> {
  const startTime = Date.now();
  
  try {
    // 1. 解析代理请求
    const metadata = parseProxyRequest(request);
    if (!metadata) {
      return generateErrorResponse('无效的代理请求', 400);
    }
    
    console.log(`🎬 处理${metadata.source}视频代理: ${metadata.filename}`);
    
    // 2. 获取平台配置
    const config = getPlatformConfig(metadata.source);
    
    // 3. 转换URL（如果需要）
    let videoUrl = metadata.original;
    if (config.transformUrl && metadata.source === 'douyin') {
      videoUrl = config.transformUrl(videoUrl);
      console.log(`🔄 抖音URL转换: ${videoUrl.substring(0, 100)}...`);
    } else {
      console.log(`📝 使用原始URL: ${videoUrl.substring(0, 100)}...`);
    }
    
    // 4. 检查主URL可用性
    console.log(`🔍 检查主URL可用性...`);
    const availability = await checkVideoAvailability(videoUrl, config.headers);
    
    if (!availability.available) {
      console.warn(`❌ 主URL不可用: ${availability.status || availability.error}`);
      
      // 5. 尝试备用URL
      if (metadata.backupUrls && metadata.backupUrls.length > 0) {
        console.log(`🔄 尝试${metadata.backupUrls.length}个备用URL...`);
        const workingUrl = await tryBackupUrls(metadata.backupUrls, config.headers);
        
        if (workingUrl) {
          videoUrl = workingUrl;
        } else {
          return generateErrorResponse('所有视频源都不可用', 503);
        }
      } else {
        return generateErrorResponse('视频源不可用', 503);
      }
    } else {
      console.log(`✅ 主URL可用: ${availability.contentLength ? `大小=${availability.contentLength}` : '大小未知'}`);
    }
    
    // 6. 处理范围请求
    const rangeHeader = request.headers.get('range');
    let requestHeaders = { ...config.headers };

    if (rangeHeader && config.supportsRange) {
      requestHeaders['Range'] = rangeHeader;
      console.log(`📏 范围请求: ${rangeHeader}`);
    }

    // 7. 获取视频流（处理重定向）
    console.log(`📥 开始流式代理...`);
    let response = await fetch(videoUrl, {
      headers: requestHeaders,
      redirect: 'manual' // 手动处理重定向
    });

    // 处理重定向（特别是抖音的特殊重定向格式）
    if (response.status === 302 || response.status === 301) {
      let location = response.headers.get('location');

      if (location) {
        console.log(`🔄 检测到重定向: ${location.substring(0, 100)}...`);

        // 处理抖音特殊的重定向格式（可能包含重复URL）
        if (location.includes(';;')) {
          const parts = location.split(';;');
          location = parts[parts.length - 1]; // 取最后一部分
          console.log(`🔧 修复重定向URL: ${location.substring(0, 100)}...`);
        }

        // 跟随重定向
        response = await fetch(location, {
          headers: requestHeaders
        });

        console.log(`✅ 重定向后状态: ${response.status}`);
      }
    }
    
    if (!response.ok) {
      console.error(`❌ 获取视频流失败: ${response.status} ${response.statusText}`);
      return generateErrorResponse(`视频获取失败: ${response.statusText}`, response.status);
    }
    
    // 8. 构建响应头
    const responseHeaders = new Headers();
    
    // 复制重要的响应头
    const importantHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified'
    ];
    
    for (const header of importantHeaders) {
      const value = response.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    }
    
    // Notion兼容性优化：关键修改
    responseHeaders.set('Content-Type', 'application/octet-stream');
    responseHeaders.set('Content-Disposition', 'attachment');

    // 设置CORS和缓存头
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');

    // 设置缓存策略
    const cacheTime = metadata.source === 'xiaohongshu' ? 7200 : 3600; // 小红书2小时，抖音1小时
    responseHeaders.set('Cache-Control', `public, max-age=${cacheTime}`);

    // 添加自定义头
    responseHeaders.set('X-Proxy-Source', metadata.source);
    responseHeaders.set('X-Proxy-Timestamp', metadata.timestamp.toString());
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ 代理成功，耗时: ${processingTime}ms`);
    
    // 9. 返回流式响应
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`❌ 代理处理失败: ${errorMessage}, 耗时: ${processingTime}ms`);
    
    return generateErrorResponse(`代理服务错误: ${errorMessage}`, 500);
  }
}

/**
 * 处理OPTIONS请求（CORS预检）
 * @param request - 请求对象
 * @returns CORS响应
 */
function handleCORS(request: Request): Response {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// ==================== Worker入口 ====================

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      // 处理CORS预检请求
      if (request.method === 'OPTIONS') {
        return handleCORS(request);
      }
      
      // 只处理GET和HEAD请求
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      
      const url = new URL(request.url);
      
      // 健康检查端点
      if (url.pathname === '/health') {
        return new Response('OK', {
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      // 代理请求处理
      if (url.pathname.startsWith('/proxy/v1/')) {
        return await handleProxyRequest(request);
      }
      
      // 默认响应
      return new Response('Media Proxy Worker v1.0.0', {
        headers: { 'Content-Type': 'text/plain' }
      });
      
    } catch (error) {
      console.error('Worker处理失败:', error);
      
      return new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
};
