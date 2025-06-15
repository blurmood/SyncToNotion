/**
 * 图床服务 - TypeScript版本
 * 提供图片上传和URL获取功能，具有完整的类型安全
 * 
 * @fileoverview 图床服务模块，支持多种文件格式上传
 * @author Augment Agent
 * @version 3.0.0 (TypeScript)
 */

import { IMAGE_HOST_CONFIG, type ImageHostConfig } from './config.js';

// ==================== 常量配置 ====================

/** 分片大小：10MB */
const CHUNK_SIZE = 10 * 1024 * 1024;

/** 大文件阈值：19MB - 超过此大小使用分片上传 */
const LARGE_FILE_THRESHOLD = 19 * 1024 * 1024;

// ==================== 类型定义 ====================

/** 环境变量接口 */
export interface ImageHostEnv {
  /** 图床用户名 */
  IMAGE_HOST_USERNAME?: string;
  /** 图床密码 */
  IMAGE_HOST_PASSWORD?: string;
}

/** 上传响应格式1: 数组格式 */
interface ArrayUploadResponse {
  src?: string;
  url?: string;
  path?: string;
}

/** 上传响应格式2: 对象格式 */
interface ObjectUploadResponse {
  src?: string;
  url?: string;
  path?: string;
  data?: {
    url?: string;
  };
  success?: boolean;
  message?: string;
  error?: string;
}

/** 分片上传响应格式 */
interface ChunkUploadResponse {
  success: boolean;
  message: string;
  chunkIndex?: number;
  totalChunks?: number;
}

/** 分片合并请求格式 */
interface MergeChunksRequest {
  sessionId: string;
  fileName: string;
  totalChunks: number;
  fileSize: number;
  fileType: string;
}

/** 分片合并响应格式 */
interface MergeChunksResponse {
  success: boolean;
  message: string;
  fileId?: string;
  url?: string;
  isChunkFile?: boolean;
  result?: {
    src?: string;
    name?: string;
    size?: number;
    type?: string;
    isChunkFile?: boolean;
  };
}

/** 上传进度信息 */
interface UploadProgress {
  chunkIndex: number;
  totalChunks: number;
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
}

/** 进度回调函数类型 */
type ProgressCallback = (progress: UploadProgress) => void;

/** 上传响应联合类型 */
type UploadResponse = ArrayUploadResponse[] | ObjectUploadResponse;

/** 登录响应接口 */
interface LoginResponse {
  token?: string;
  error?: string;
  message?: string;
}

/** 文件数据类型 */
type FileData = ArrayBuffer | Blob | string;

/** 流类型 */
type StreamType = ReadableStream | NodeJS.ReadableStream;

/** 内容类型映射 */
type ContentTypeMap = {
  readonly [key: string]: string;
};

// ==================== 图床服务类 ====================

/**
 * 图床服务类
 * 提供文件上传、认证管理等功能
 */
export class ImageHostService {
  private readonly config: ImageHostConfig;
  private env: ImageHostEnv | null;
  private token: string | null;
  private tokenExpiresAt: number;

  /** 内容类型映射表 */
  private static readonly CONTENT_TYPE_MAP: ContentTypeMap = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm'
  } as const;

  /**
   * 创建图床服务实例
   * @param config - 图床配置
   * @param env - 环境变量
   */
  constructor(config: ImageHostConfig, env: ImageHostEnv | null = null) {
    this.config = config;
    this.env = env;
    this.token = config.AUTH.TOKEN;
    this.tokenExpiresAt = config.AUTH.TOKEN_EXPIRES_AT;
  }

  /**
   * 设置环境变量（用于运行时配置）
   * @param env - 环境变量
   */
  public setEnv(env: ImageHostEnv): void {
    this.env = env;
  }

  /**
   * 获取有效令牌（公共方法）
   * @returns 有效的认证令牌
   */
  public async getToken(): Promise<string> {
    return await this.ensureAuthenticated();
  }

  /**
   * 确保已登录并获取有效令牌
   * @returns 有效的认证令牌
   */
  private async ensureAuthenticated(): Promise<string> {
    // 检查令牌是否存在且未过期
    const now = Date.now();
    if (this.token && this.tokenExpiresAt > now) {
      return this.token;
    }

    console.log('令牌不存在或已过期，正在登录获取新令牌...');

    try {
      // 登录并获取新令牌（设置15秒超时）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(this.config.LOGIN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: this.env?.IMAGE_HOST_USERNAME || this.config.AUTH.USERNAME,
            password: this.env?.IMAGE_HOST_PASSWORD || this.config.AUTH.PASSWORD
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`登录请求失败: ${response.status} ${response.statusText}`);
          console.error(`登录错误响应: ${errorText}`);
          throw new Error(`登录请求失败: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: LoginResponse = await response.json();
        console.log('图床登录响应:', data);

        // 检查响应中是否包含token字段
        if (data.token) {
          // 保存令牌和过期时间
          this.token = data.token;
          this.tokenExpiresAt = now + this.config.TOKEN_TTL;

          console.log('登录成功，获取到新令牌');
          return this.token;
        } else {
          throw new Error(`登录失败: ${data.error || data.message || '未知错误'}`);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('图床登录超时（15秒）');
        }
        throw fetchError;
      }
    } catch (error) {
      console.error('登录失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`图床认证失败: ${errorMessage}`);
    }
  }

  /**
   * 生成会话ID
   * @returns 随机会话ID
   */
  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * 上传文件到图床（智能选择普通上传或分片上传）
   * @param fileData - 文件数据
   * @param fileName - 文件名
   * @param contentType - 内容类型
   * @param onProgress - 进度回调函数
   * @returns 上传后的文件URL
   */
  public async uploadFile(
    fileData: FileData,
    fileName: string,
    contentType?: string,
    onProgress?: ProgressCallback
  ): Promise<string> {
    console.log(`🔄 [${new Date().toISOString()}] 开始上传文件到图床: ${fileName}, 类型: ${contentType}`);

    try {
      // 如果fileData是URL，需要先下载
      let processedFileData: ArrayBuffer | Blob;
      if (typeof fileData === 'string' && fileData.startsWith('http')) {
        console.log(`下载远程文件: ${fileData}`);
        const response = await fetch(fileData);
        if (!response.ok) {
          throw new Error(`下载文件失败: ${response.status} ${response.statusText}`);
        }
        processedFileData = await response.arrayBuffer();
        console.log(`文件下载完成，大小: ${processedFileData.byteLength} 字节`);
      } else {
        processedFileData = fileData as ArrayBuffer | Blob;
      }

      // 获取文件大小
      const fileSize = processedFileData instanceof ArrayBuffer ?
        processedFileData.byteLength : processedFileData.size;

      console.log(`文件大小: ${fileSize} 字节 (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

      // 智能选择上传方式
      if (fileSize > LARGE_FILE_THRESHOLD) {
        console.log(`文件大小超过${LARGE_FILE_THRESHOLD / 1024 / 1024}MB，使用分片上传`);
        return await this.uploadFileWithChunking(processedFileData, fileName, contentType, onProgress);
      } else {
        console.log(`文件大小小于等于${LARGE_FILE_THRESHOLD / 1024 / 1024}MB，使用普通上传`);
        return await this.uploadFileNormal(processedFileData, fileName, contentType);
      }
    } catch (error) {
      console.error(`上传文件失败: ${fileName}`, error);
      throw error;
    }
  }

  /**
   * 普通上传方法（用于小文件）
   * @param fileData - 文件数据
   * @param fileName - 文件名
   * @param contentType - 内容类型
   * @returns 上传后的文件URL
   */
  private async uploadFileNormal(
    fileData: ArrayBuffer | Blob,
    fileName: string,
    contentType?: string
  ): Promise<string> {
    // 确保已登录并获取令牌
    const token = await this.ensureAuthenticated();

    // 准备表单数据
    const formData = new FormData();

    // 创建文件对象
    const file = new File([fileData], fileName, {
      type: contentType || this.getContentType(fileName)
    });

    // 根据API文档，使用 'file' 字段名
    formData.append('file', file);

    // 构建请求头
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`
    };

    // 发送上传请求（设置30秒超时）
    console.log(`发送普通上传请求到: ${this.config.UPLOAD_URL}`);
    console.log(`请求头:`, headers);
    console.log(`文件信息: ${fileName}, 大小: ${file.size} bytes`);

    let response: Response;
    const uploadController = new AbortController();
    const uploadTimeoutId = setTimeout(() => {
      console.log('上传请求超时，正在中止...');
      uploadController.abort();
    }, 30000);

    try {
      response = await fetch(this.config.UPLOAD_URL, {
        method: 'POST',
        headers: headers,
        body: formData,
        signal: uploadController.signal
      });
    } catch (fetchError) {
      clearTimeout(uploadTimeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error('上传请求超时（30秒）');
      }
      console.error('上传请求异常:', fetchError);
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      throw new Error(`上传请求失败: ${errorMessage}`);
    } finally {
      clearTimeout(uploadTimeoutId);
    }

    console.log(`上传响应状态: ${response.status} ${response.statusText}`);
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    console.log(`响应头:`, headersObj);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`上传请求失败: ${response.status} ${response.statusText}`);
      console.error(`错误响应: ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    // 先获取响应文本，然后尝试解析JSON
    const responseText = await response.text();
    console.log(`原始响应文本:`, responseText);

    let result: UploadResponse;
    try {
      result = JSON.parse(responseText) as UploadResponse;
    } catch (parseError) {
      console.error(`JSON解析失败:`, parseError);
      throw new Error(`响应不是有效的JSON: ${responseText}`);
    }

    console.log('图床上传响应详情:', {
      type: typeof result,
      isArray: Array.isArray(result),
      length: Array.isArray(result) ? result.length : 'N/A',
      content: JSON.stringify(result, null, 2)
    });

    // 检查是否有错误
    if (!Array.isArray(result) && 'error' in result && result.error) {
      throw new Error(`上传失败: ${result.error}`);
    }

    // 提取文件URL
    const fileUrl = this.extractFileUrl(result, fileName);

    console.log(`普通上传成功，文件URL: ${fileUrl}`);
    return fileUrl;
  }

  /**
   * 分片上传方法（用于大文件）
   * @param fileData - 文件数据
   * @param fileName - 文件名
   * @param contentType - 内容类型
   * @param onProgress - 进度回调函数
   * @returns 上传后的文件URL
   */
  private async uploadFileWithChunking(
    fileData: ArrayBuffer | Blob,
    fileName: string,
    contentType?: string,
    onProgress?: ProgressCallback
  ): Promise<string> {
    const fileSize = fileData instanceof ArrayBuffer ? fileData.byteLength : fileData.size;
    const finalContentType = contentType || this.getContentType(fileName);

    console.log(`开始分片上传: ${fileName}, 大小: ${fileSize} 字节, 类型: ${finalContentType}`);

    // 检查文件大小限制
    if (fileSize > 100 * 1024 * 1024) {
      throw new Error('文件大小超过 100MB 限制');
    }

    // 生成会话ID
    const sessionId = this.generateSessionId();
    console.log(`生成会话ID: ${sessionId}`);

    // 计算分片数量
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    console.log(`文件将被分为 ${totalChunks} 个分片，每个分片大小: ${CHUNK_SIZE / 1024 / 1024}MB`);

    // 将文件数据转换为ArrayBuffer以便分片
    let arrayBuffer: ArrayBuffer;
    if (fileData instanceof ArrayBuffer) {
      arrayBuffer = fileData;
    } else {
      arrayBuffer = await fileData.arrayBuffer();
    }

    // 上传所有分片
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunkData = arrayBuffer.slice(start, end);

      console.log(`上传分片 ${i + 1}/${totalChunks}, 大小: ${chunkData.byteLength} 字节`);

      await this.uploadChunk(sessionId, i, chunkData, fileName, totalChunks, fileSize, finalContentType);

      // 更新进度
      if (onProgress) {
        onProgress({
          chunkIndex: i,
          totalChunks,
          uploadedBytes: end,
          totalBytes: fileSize,
          percentage: Math.round((end / fileSize) * 100)
        });
      }
    }

    console.log(`所有分片上传完成，开始合并...`);

    // 合并分片
    const result = await this.mergeChunks({
      sessionId,
      fileName,
      totalChunks,
      fileSize,
      fileType: finalContentType
    });

    if (!result.success) {
      throw new Error(`分片合并失败: ${result.message}`);
    }

    // 处理分片合并响应的不同格式
    let fileUrl: string;

    if (result.result && result.result.src) {
      // 新格式：{success: true, result: {src: '/file/...', ...}}
      fileUrl = `${this.config.DOMAIN}${result.result.src}`;
      console.log(`✅ 使用result.src字段构建URL: ${fileUrl}`);
    } else if (result.url) {
      // 旧格式：{success: true, url: '...'}
      fileUrl = result.url.startsWith('http') ? result.url : `${this.config.DOMAIN}${result.url}`;
      console.log(`✅ 使用url字段构建URL: ${fileUrl}`);
    } else if (result.fileId) {
      // 备用格式：{success: true, fileId: '...'}
      fileUrl = `${this.config.DOMAIN}/file/${result.fileId}`;
      console.log(`✅ 使用fileId字段构建URL: ${fileUrl}`);
    } else {
      console.error(`❌ 无法从分片合并响应中提取URL`);
      console.error(`响应内容:`, JSON.stringify(result, null, 2));
      throw new Error(`分片合并成功但无法提取文件URL`);
    }

    console.log(`分片上传成功，文件URL: ${fileUrl}`);
    return fileUrl;
  }

  /**
   * 上传单个分片
   * @param sessionId - 会话ID
   * @param chunkIndex - 分片索引
   * @param chunkData - 分片数据
   * @param fileName - 文件名（可选，用于推荐参数）
   * @param totalChunks - 总分片数（可选，用于推荐参数）
   * @param fileSize - 文件总大小（可选，用于推荐参数）
   * @param fileType - 文件类型（可选，用于推荐参数）
   * @returns 分片上传响应
   */
  private async uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunkData: ArrayBuffer,
    fileName?: string,
    totalChunks?: number,
    fileSize?: number,
    fileType?: string
  ): Promise<ChunkUploadResponse> {
    // 确保已登录并获取令牌
    const token = await this.ensureAuthenticated();

    const formData = new FormData();
    const chunkBlob = new Blob([chunkData]);

    // 必需参数（根据API文档）
    formData.append('file', chunkBlob);                    // ✅ 必需：分片数据
    formData.append('chunkIndex', chunkIndex.toString());  // ✅ 必需：分片索引(字符串)
    formData.append('sessionId', sessionId);               // ✅ 必需：会话ID

    // 推荐参数（提高成功率）
    if (totalChunks !== undefined) {
      formData.append('totalChunks', totalChunks.toString());
    }
    if (fileName) {
      formData.append('originalFileName', fileName);
    }
    if (fileType) {
      formData.append('originalFileType', fileType);
    }
    if (fileSize !== undefined) {
      formData.append('originalFileSize', fileSize.toString());
    }

    const chunkUploadUrl = `${this.config.DOMAIN}/upload-chunk`;
    console.log(`上传分片到: ${chunkUploadUrl}`);

    const response = await fetch(chunkUploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`分片上传失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result: ChunkUploadResponse = await response.json();

    if (!result.success) {
      throw new Error(`分片上传失败: ${result.message}`);
    }

    console.log(`分片 ${chunkIndex} 上传成功`);
    return result;
  }

  /**
   * 合并分片
   * @param request - 合并请求参数
   * @returns 合并响应
   */
  private async mergeChunks(request: MergeChunksRequest): Promise<MergeChunksResponse> {
    // 确保已登录并获取令牌
    const token = await this.ensureAuthenticated();

    const mergeUrl = `${this.config.DOMAIN}/merge-chunks`;
    console.log(`合并分片请求到: ${mergeUrl}`);
    console.log(`合并参数:`, request);

    const response = await fetch(mergeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`分片合并失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result: MergeChunksResponse = await response.json();
    console.log(`分片合并响应:`, result);

    return result;
  }

  /**
   * 从上传响应中提取文件URL
   * @param result - 上传响应
   * @param fileName - 文件名
   * @returns 文件URL
   */
  private extractFileUrl(result: UploadResponse, fileName: string): string {
    let fileUrl: string | undefined;

    if (Array.isArray(result) && result.length > 0) {
      // 格式1: [{"src": "/file/fileId.extension"}] - 这是TG-Image的标准格式
      const firstResult = result[0];
      console.log('✅ 检测到TG-Image标准数组格式响应');
      console.log('第一个元素:', JSON.stringify(firstResult, null, 2));

      if (firstResult.src) {
        fileUrl = `${this.config.DOMAIN}${firstResult.src}`;
        console.log(`✅ 成功提取src字段: ${firstResult.src}`);
        console.log(`✅ 构建完整URL: ${fileUrl}`);
      } else if (firstResult.url) {
        fileUrl = firstResult.url.startsWith('http') ? firstResult.url : `${this.config.DOMAIN}${firstResult.url}`;
        console.log(`✅ 使用url字段: ${fileUrl}`);
      } else if (firstResult.path) {
        fileUrl = `${this.config.DOMAIN}${firstResult.path}`;
        console.log(`✅ 使用path字段: ${fileUrl}`);
      } else {
        console.error(`❌ 数组元素中没有找到src/url/path字段`);
        console.error(`可用字段: ${Object.keys(firstResult)}`);
      }
    } else if (!Array.isArray(result)) {
      // 处理对象格式响应
      if (result.src) {
        // 格式2: {"src": "/file/fileId.extension"}
        console.log('处理对象格式响应，src字段:', result.src);
        fileUrl = `${this.config.DOMAIN}${result.src}`;
      } else if (result.url) {
        // 格式3: {"url": "完整URL或相对路径"}
        console.log('处理对象格式响应，url字段:', result.url);
        fileUrl = result.url.startsWith('http') ? result.url : `${this.config.DOMAIN}${result.url}`;
      } else if (result.path) {
        // 格式5: {"path": "/file/fileId.extension"}
        console.log('处理对象格式响应，path字段:', result.path);
        fileUrl = `${this.config.DOMAIN}${result.path}`;
      } else if (result.data?.url) {
        // 格式4: {"data": {"url": "..."}}
        console.log('处理嵌套格式响应，data.url字段:', result.data.url);
        fileUrl = result.data.url.startsWith('http') ? result.data.url : `${this.config.DOMAIN}${result.data.url}`;
      } else if (result.success && result.message) {
        // 格式6: 只有成功消息，没有URL - 这种情况下我们需要生成URL
        console.log('响应只包含成功消息，尝试生成URL');
        const timestamp = Date.now();
        const ext = fileName.split('.').pop();
        fileUrl = `${this.config.DOMAIN}/file/${timestamp}.${ext}`;
        console.log('生成的URL:', fileUrl);
      }
    }

    if (!fileUrl) {
      // 如果仍然无法提取URL，但响应表明成功，我们记录详细信息但不抛出错误
      console.warn(`无法从响应中提取文件URL，但上传可能成功了`);
      console.warn(`响应内容:`, JSON.stringify(result, null, 2));

      // 尝试最后一种方法：如果有任何看起来像URL的字段
      if (!Array.isArray(result)) {
        const possibleUrlFields = Object.keys(result).filter(key => {
          const value = (result as any)[key];
          return typeof value === 'string' && (value.includes('/') || value.includes('http'));
        });

        if (possibleUrlFields.length > 0) {
          const urlField = possibleUrlFields[0];
          const value = (result as any)[urlField];
          fileUrl = value.startsWith('http') ? value : `${this.config.DOMAIN}${value}`;
          console.log(`使用字段 ${urlField} 作为URL: ${fileUrl}`);
        }
      }

      if (!fileUrl) {
        // 如果所有方法都失败，但图片确实上传成功了，尝试构造一个可能的URL
        console.warn(`所有URL提取方法都失败，尝试构造默认URL`);
        const timestamp = Date.now();
        let ext = fileName.split('.').pop();

        // 如果是封面图片且为WebP格式，强制使用JPEG格式
        if (fileName.includes('cover') && ext === 'webp') {
          ext = 'jpg';
          console.log(`🔧 封面图片强制使用JPEG格式，从 webp 改为 jpg`);
        }

        fileUrl = `${this.config.DOMAIN}/file/${timestamp}.${ext}`;
        console.log(`构造的默认URL: ${fileUrl}`);

        // 记录完整的响应信息以便调试
        console.error(`=== 图床响应详细信息 ===`);
        console.error(`响应类型: ${typeof result}`);
        console.error(`是否为数组: ${Array.isArray(result)}`);
        if (!Array.isArray(result)) {
          console.error(`响应键值: ${Object.keys(result)}`);
        }
        console.error(`完整响应内容: ${JSON.stringify(result, null, 2)}`);
        console.error(`=== 图床响应详细信息结束 ===`);
      }
    }

    if (!fileUrl) {
      throw new Error('无法从响应中提取文件URL');
    }

    return fileUrl;
  }

  /**
   * 上传流到图床
   * @param stream - 数据流
   * @param fileName - 文件名
   * @param contentType - 内容类型
   * @returns 上传后的文件URL
   */
  public async uploadStream(
    stream: StreamType,
    fileName: string,
    contentType?: string
  ): Promise<string> {
    console.log(`上传流: ${fileName}, 类型: ${contentType}`);

    // 检查是否是Node.js流
    if (this.isNodeStream(stream)) {
      console.log('检测到Node.js流');

      // 使用Promise包装流处理
      return new Promise((resolve, reject) => {
        // 收集流数据
        const chunks: Buffer[] = [];

        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        stream.on('end', async () => {
          try {
            // 合并所有块
            const buffer = Buffer.concat(chunks);
            console.log(`流数据收集完成，大小: ${buffer.length} 字节`);

            // 上传合并后的数据
            const url = await this.uploadFile(buffer, fileName, contentType);
            resolve(url);
          } catch (error) {
            reject(error);
          }
        });

        stream.on('error', (error: Error) => {
          reject(error);
        });
      });
    }
    // 处理Web API的ReadableStream
    else if (this.isWebStream(stream)) {
      console.log('检测到Web API的ReadableStream');

      // 将流转换为ArrayBuffer
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const buffer = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }

      return this.uploadFile(buffer.buffer, fileName, contentType);
    }
    else {
      throw new Error('不支持的流类型');
    }
  }

  /**
   * 根据文件名获取内容类型
   * @param fileName - 文件名
   * @returns 内容类型
   */
  private getContentType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();

    if (!ext) {
      return 'application/octet-stream';
    }

    return ImageHostService.CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
  }

  /**
   * 类型守卫：检查是否为Node.js流
   * @param stream - 流对象
   * @returns 是否为Node.js流
   */
  private isNodeStream(stream: any): stream is NodeJS.ReadableStream {
    return stream && typeof stream.pipe === 'function';
  }

  /**
   * 类型守卫：检查是否为Web API流
   * @param stream - 流对象
   * @returns 是否为Web API流
   */
  private isWebStream(stream: any): stream is ReadableStream {
    return stream && typeof stream.getReader === 'function';
  }
}

// ==================== 导出实例和类型 ====================

// 创建图床服务实例
export const imageHostService = new ImageHostService(IMAGE_HOST_CONFIG);

// 类型已通过interface导出，无需重复导出
