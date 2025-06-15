# TG-Image 分片上传 API 对接文档

## 📋 概述

TG-Image 图床服务支持大文件分片上传功能，能够处理超过 19MB 的文件。本文档详细说明如何通过 TypeScript 程序集成分片上传功能。

## 🎯 核心特性

- **智能分片**: 自动检测文件大小，超过 19MB 启用分片上传
- **分片文件系统**: 大文件保存为分片文件系统，避免 Telegram API 限制
- **动态合并**: 下载时实时合并分片，保证文件完整性
- **TypeScript 支持**: 完整的类型定义和示例代码

## 📊 文件处理策略

| 文件大小 | 处理方式 | 存储方式 | 访问方式 |
|----------|----------|----------|----------|
| ≤ 19MB | 分片上传 + 合并 | Telegram文件 | getFile API |
| 19MB - 100MB | 分片文件系统 | 分片 + 元数据 | 动态合并 |
| > 100MB | 拒绝上传 | - | 错误提示 |

## 🔧 API 端点

### 基础配置

```typescript
const API_BASE_URL = 'https://your-domain.workers.dev';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB 分片大小
const LARGE_FILE_THRESHOLD = 19 * 1024 * 1024; // 19MB 阈值
```

### 1. 分片上传端点

**POST** `/upload-chunk`

上传单个文件分片。

### 2. 分片合并端点

**POST** `/merge-chunks`

合并所有分片并创建最终文件。

### 3. 文件访问端点

**GET** `/file/{fileId}`

访问上传的文件，支持分片文件动态合并。

## 💻 TypeScript 实现

### 类型定义

```typescript
interface ChunkUploadResponse {
  success: boolean;
  message: string;
  chunkIndex?: number;
  totalChunks?: number;
}

interface MergeChunksRequest {
  sessionId: string;
  fileName: string;
  totalChunks: number;
  fileSize: number;
  fileType: string;
}

interface MergeChunksResponse {
  success: boolean;
  message: string;
  fileId?: string;
  url?: string;
  isChunkFile?: boolean;
}

interface UploadProgress {
  chunkIndex: number;
  totalChunks: number;
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
}

type ProgressCallback = (progress: UploadProgress) => void;
```

### 核心上传类

```typescript
class TGImageUploader {
  private apiBaseUrl: string;
  private authToken: string;

  constructor(apiBaseUrl: string, authToken: string) {
    this.apiBaseUrl = apiBaseUrl;
    this.authToken = authToken;
  }

  /**
   * 上传文件（自动处理分片）
   */
  async uploadFile(
    file: File, 
    onProgress?: ProgressCallback
  ): Promise<MergeChunksResponse> {
    const fileSize = file.size;
    const fileName = file.name;
    const fileType = file.type;

    // 检查文件大小限制
    if (fileSize > 100 * 1024 * 1024) {
      throw new Error('文件大小超过 100MB 限制');
    }

    // 生成会话ID
    const sessionId = this.generateSessionId();
    
    // 计算分片数量
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

    // 上传所有分片
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunk = file.slice(start, end);

      await this.uploadChunk(sessionId, i, chunk, fileName);

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

    // 合并分片
    return await this.mergeChunks({
      sessionId,
      fileName,
      totalChunks,
      fileSize,
      fileType
    });
  }

  /**
   * 上传单个分片
   */
  private async uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunk: Blob,
    fileName: string
  ): Promise<ChunkUploadResponse> {
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('sessionId', sessionId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('fileName', fileName);

    const response = await fetch(`${this.apiBaseUrl}/upload-chunk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`分片上传失败: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * 合并分片
   */
  private async mergeChunks(
    request: MergeChunksRequest
  ): Promise<MergeChunksResponse> {
    const response = await fetch(`${this.apiBaseUrl}/merge-chunks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`分片合并失败: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}
```

### 使用示例

```typescript
// 初始化上传器
const uploader = new TGImageUploader(
  'https://your-domain.workers.dev',
  'your-auth-token'
);

// 上传文件
async function uploadFileExample(file: File) {
  try {
    const result = await uploader.uploadFile(file, (progress) => {
      console.log(`上传进度: ${progress.percentage}%`);
      console.log(`分片: ${progress.chunkIndex + 1}/${progress.totalChunks}`);
    });

    if (result.success) {
      console.log('上传成功!');
      console.log('文件ID:', result.fileId);
      console.log('访问链接:', result.url);
      
      if (result.isChunkFile) {
        console.log('文件保存为分片文件系统');
      }
    }
  } catch (error) {
    console.error('上传失败:', error);
  }
}

// 从文件输入元素上传
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
fileInput.addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    uploadFileExample(file);
  }
});
```

## 🔐 认证

所有 API 请求都需要在 Header 中包含认证令牌：

```typescript
headers: {
  'Authorization': `Bearer ${authToken}`
}
```

## 📝 请求格式

### 分片上传请求

```typescript
// FormData 格式
const formData = new FormData();
formData.append('chunk', chunkBlob);
formData.append('sessionId', sessionId);
formData.append('chunkIndex', chunkIndex.toString());
formData.append('fileName', fileName);
```

### 分片合并请求

```typescript
// JSON 格式
{
  "sessionId": "abc123def456",
  "fileName": "example.mp4",
  "totalChunks": 3,
  "fileSize": 52428800,
  "fileType": "video/mp4"
}
```

## 📤 响应格式

### 分片上传响应

```typescript
{
  "success": true,
  "message": "分片上传成功",
  "chunkIndex": 0,
  "totalChunks": 3
}
```

### 分片合并响应

```typescript
// 小文件 (≤19MB) - 合并到 Telegram
{
  "success": true,
  "message": "文件上传成功",
  "fileId": "BQACAgUAAyEGAASMCnTH...",
  "url": "https://your-domain.workers.dev/file/BQACAgUAAyEGAASMCnTH..."
}

// 大文件 (>19MB) - 分片文件系统
{
  "success": true,
  "message": "文件保存为分片文件系统",
  "fileId": "chunks_abc123def456_1749915081613",
  "url": "https://your-domain.workers.dev/file/chunks_abc123def456_1749915081613.mp4",
  "isChunkFile": true
}
```

## ⚠️ 错误处理

### 常见错误码

| 状态码 | 错误类型 | 描述 |
|--------|----------|------|
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 认证失败 |
| 413 | Payload Too Large | 文件超过 100MB 限制 |
| 500 | Internal Server Error | 服务器内部错误 |

### 错误响应格式

```typescript
{
  "success": false,
  "message": "错误描述",
  "error": "详细错误信息"
}
```

### TypeScript 错误处理

```typescript
try {
  const result = await uploader.uploadFile(file);
} catch (error) {
  if (error instanceof Error) {
    console.error('上传错误:', error.message);
  }
}
```

## 🚀 高级功能

### 断点续传支持

```typescript
class AdvancedTGImageUploader extends TGImageUploader {
  private uploadCache = new Map<string, number>();

  /**
   * 支持断点续传的上传
   */
  async uploadFileWithResume(
    file: File,
    onProgress?: ProgressCallback
  ): Promise<MergeChunksResponse> {
    const fileHash = await this.calculateFileHash(file);
    const sessionId = this.uploadCache.get(fileHash) || this.generateSessionId();

    // 检查已上传的分片
    const uploadedChunks = await this.getUploadedChunks(sessionId);

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 只上传未完成的分片
    for (let i = 0; i < totalChunks; i++) {
      if (uploadedChunks.includes(i)) {
        continue; // 跳过已上传的分片
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      await this.uploadChunk(sessionId, i, chunk, file.name);

      // 缓存进度
      this.uploadCache.set(fileHash, i);

      if (onProgress) {
        onProgress({
          chunkIndex: i,
          totalChunks,
          uploadedBytes: end,
          totalBytes: file.size,
          percentage: Math.round((end / file.size) * 100)
        });
      }
    }

    // 清除缓存
    this.uploadCache.delete(fileHash);

    return await this.mergeChunks({
      sessionId,
      fileName: file.name,
      totalChunks,
      fileSize: file.size,
      fileType: file.type
    });
  }

  /**
   * 计算文件哈希值
   */
  private async calculateFileHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * 获取已上传的分片列表
   */
  private async getUploadedChunks(sessionId: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/chunks/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.uploadedChunks || [];
      }
    } catch (error) {
      console.warn('获取已上传分片失败:', error);
    }

    return [];
  }
}
```

### 并发上传优化

```typescript
class ConcurrentTGImageUploader extends TGImageUploader {
  private maxConcurrency = 3; // 最大并发数

  /**
   * 并发上传分片
   */
  async uploadFileWithConcurrency(
    file: File,
    onProgress?: ProgressCallback
  ): Promise<MergeChunksResponse> {
    const sessionId = this.generateSessionId();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 创建分片任务队列
    const chunkTasks: Array<() => Promise<void>> = [];
    const uploadedChunks = new Set<number>();

    for (let i = 0; i < totalChunks; i++) {
      chunkTasks.push(async () => {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        await this.uploadChunk(sessionId, i, chunk, file.name);
        uploadedChunks.add(i);

        if (onProgress) {
          onProgress({
            chunkIndex: i,
            totalChunks,
            uploadedBytes: uploadedChunks.size * CHUNK_SIZE,
            totalBytes: file.size,
            percentage: Math.round((uploadedChunks.size / totalChunks) * 100)
          });
        }
      });
    }

    // 并发执行任务
    await this.executeConcurrently(chunkTasks, this.maxConcurrency);

    return await this.mergeChunks({
      sessionId,
      fileName: file.name,
      totalChunks,
      fileSize: file.size,
      fileType: file.type
    });
  }

  /**
   * 并发执行任务
   */
  private async executeConcurrently<T>(
    tasks: Array<() => Promise<T>>,
    concurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (const task of tasks) {
      const promise = task().then(result => {
        results.push(result);
        executing.splice(executing.indexOf(promise), 1);
      });

      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }
}
```

## 🛠️ 实用工具函数

### 文件类型检测

```typescript
class FileUtils {
  /**
   * 检查文件是否需要分片上传
   */
  static needsChunking(file: File): boolean {
    return file.size > LARGE_FILE_THRESHOLD;
  }

  /**
   * 格式化文件大小
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 验证文件类型
   */
  static isValidFileType(file: File, allowedTypes: string[]): boolean {
    return allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.type.startsWith(type.slice(0, -1));
      }
      return file.type === type;
    });
  }

  /**
   * 获取文件扩展名
   */
  static getFileExtension(fileName: string): string {
    return fileName.split('.').pop()?.toLowerCase() || '';
  }
}
```

### 上传状态管理

```typescript
interface UploadTask {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  result?: MergeChunksResponse;
  error?: string;
}

class UploadManager {
  private tasks = new Map<string, UploadTask>();
  private uploader: TGImageUploader;

  constructor(uploader: TGImageUploader) {
    this.uploader = uploader;
  }

  /**
   * 添加上传任务
   */
  addTask(file: File): string {
    const taskId = this.generateTaskId();
    const task: UploadTask = {
      id: taskId,
      file,
      status: 'pending',
      progress: 0
    };

    this.tasks.set(taskId, task);
    return taskId;
  }

  /**
   * 开始上传任务
   */
  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('任务不存在');

    task.status = 'uploading';

    try {
      const result = await this.uploader.uploadFile(task.file, (progress) => {
        task.progress = progress.percentage;
      });

      task.status = 'completed';
      task.result = result;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : '未知错误';
    }
  }

  /**
   * 获取任务状态
   */
  getTask(taskId: string): UploadTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): UploadTask[] {
    return Array.from(this.tasks.values());
  }

  private generateTaskId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}
```

## 📱 React Hook 示例

```typescript
import { useState, useCallback } from 'react';

interface UseFileUploadOptions {
  apiBaseUrl: string;
  authToken: string;
  onProgress?: ProgressCallback;
  onSuccess?: (result: MergeChunksResponse) => void;
  onError?: (error: Error) => void;
}

export function useFileUpload(options: UseFileUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploader = new TGImageUploader(options.apiBaseUrl, options.authToken);

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      const result = await uploader.uploadFile(file, (progressInfo) => {
        setProgress(progressInfo.percentage);
        options.onProgress?.(progressInfo);
      });

      options.onSuccess?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('上传失败');
      setError(error.message);
      options.onError?.(error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  }, [options]);

  return {
    uploadFile,
    isUploading,
    progress,
    error
  };
}

// 使用示例
function FileUploadComponent() {
  const { uploadFile, isUploading, progress, error } = useFileUpload({
    apiBaseUrl: 'https://your-domain.workers.dev',
    authToken: 'your-token',
    onSuccess: (result) => {
      console.log('上传成功:', result);
    },
    onError: (error) => {
      console.error('上传失败:', error);
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileSelect} disabled={isUploading} />
      {isUploading && <div>上传进度: {progress}%</div>}
      {error && <div style={{ color: 'red' }}>错误: {error}</div>}
    </div>
  );
}
```

## 🔧 最佳实践

### 1. 错误重试机制

```typescript
class RetryableUploader extends TGImageUploader {
  private maxRetries = 3;
  private retryDelay = 1000;

  protected async uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunk: Blob,
    fileName: string
  ): Promise<ChunkUploadResponse> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await super.uploadChunk(sessionId, chunkIndex, chunk, fileName);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('未知错误');

        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 2. 内存优化

```typescript
// 使用流式读取大文件，避免内存溢出
async function readFileChunk(file: File, start: number, end: number): Promise<Blob> {
  return file.slice(start, end);
}

// 及时清理 Blob URL
function createAndCleanupBlobUrl(blob: Blob, callback: (url: string) => void): void {
  const url = URL.createObjectURL(blob);
  try {
    callback(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

### 3. 网络状态检测

```typescript
class NetworkAwareUploader extends TGImageUploader {
  private isOnline = navigator.onLine;

  constructor(apiBaseUrl: string, authToken: string) {
    super(apiBaseUrl, authToken);

    window.addEventListener('online', () => {
      this.isOnline = true;
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  async uploadFile(file: File, onProgress?: ProgressCallback): Promise<MergeChunksResponse> {
    if (!this.isOnline) {
      throw new Error('网络连接不可用');
    }

    return super.uploadFile(file, onProgress);
  }
}
```

## 📞 技术支持

如有问题或需要技术支持，请联系：

- **文档版本**: v1.0.0
- **最后更新**: 2025-06-14
- **兼容性**: TypeScript 4.0+, ES2020+

---

*本文档提供了完整的 TG-Image 分片上传 API 集成指南，包含 TypeScript 类型定义、实现示例和最佳实践。*
