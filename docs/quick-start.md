# TG-Image API 快速开始指南

## 🚀 5分钟快速集成

### 1. 安装依赖

```bash
npm install axios # 或使用 fetch API
```

### 2. 基础配置

```typescript
const API_CONFIG = {
  baseUrl: 'https://your-domain.workers.dev',
  authToken: 'your-auth-token',
  chunkSize: 10 * 1024 * 1024, // 10MB
  largeFileThreshold: 19 * 1024 * 1024 // 19MB
};
```

### 3. 简单上传实现

```typescript
class SimpleUploader {
  private config: typeof API_CONFIG;

  constructor(config: typeof API_CONFIG) {
    this.config = config;
  }

  async upload(file: File): Promise<string> {
    const sessionId = Math.random().toString(36).substring(2, 15);
    const totalChunks = Math.ceil(file.size / this.config.chunkSize);

    // 上传分片
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.config.chunkSize;
      const end = Math.min(start + this.config.chunkSize, file.size);
      const chunk = file.slice(start, end);

      await this.uploadChunk(sessionId, i, chunk, file.name);
    }

    // 合并分片
    const result = await this.mergeChunks(sessionId, file);
    return result.url;
  }

  private async uploadChunk(sessionId: string, index: number, chunk: Blob, fileName: string) {
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('sessionId', sessionId);
    formData.append('chunkIndex', index.toString());
    formData.append('fileName', fileName);

    const response = await fetch(`${this.config.baseUrl}/upload-chunk`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.config.authToken}` },
      body: formData
    });

    if (!response.ok) throw new Error('分片上传失败');
  }

  private async mergeChunks(sessionId: string, file: File) {
    const response = await fetch(`${this.config.baseUrl}/merge-chunks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        fileName: file.name,
        totalChunks: Math.ceil(file.size / this.config.chunkSize),
        fileSize: file.size,
        fileType: file.type
      })
    });

    if (!response.ok) throw new Error('分片合并失败');
    return await response.json();
  }
}
```

### 4. 使用示例

```typescript
const uploader = new SimpleUploader(API_CONFIG);

// 上传文件
async function uploadFile(file: File) {
  try {
    const url = await uploader.upload(file);
    console.log('上传成功:', url);
    return url;
  } catch (error) {
    console.error('上传失败:', error);
    throw error;
  }
}

// HTML 文件选择
const input = document.createElement('input');
input.type = 'file';
input.onchange = (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) uploadFile(file);
};
```

## 📱 React 组件示例

```typescript
import React, { useState } from 'react';

function FileUploader() {
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState<string>('');

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const uploader = new SimpleUploader(API_CONFIG);
      const resultUrl = await uploader.upload(file);
      setUrl(resultUrl);
    } catch (error) {
      alert('上传失败: ' + error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
        disabled={uploading}
      />
      {uploading && <p>上传中...</p>}
      {url && <p>上传成功: <a href={url}>{url}</a></p>}
    </div>
  );
}
```

## 🔧 进阶功能

### 带进度的上传

```typescript
class ProgressUploader extends SimpleUploader {
  async uploadWithProgress(
    file: File, 
    onProgress: (percent: number) => void
  ): Promise<string> {
    const sessionId = Math.random().toString(36).substring(2, 15);
    const totalChunks = Math.ceil(file.size / this.config.chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.config.chunkSize;
      const end = Math.min(start + this.config.chunkSize, file.size);
      const chunk = file.slice(start, end);

      await this.uploadChunk(sessionId, i, chunk, file.name);
      
      // 更新进度
      const progress = Math.round(((i + 1) / totalChunks) * 100);
      onProgress(progress);
    }

    const result = await this.mergeChunks(sessionId, file);
    return result.url;
  }
}
```

### 错误重试

```typescript
class RetryUploader extends SimpleUploader {
  private async uploadChunkWithRetry(
    sessionId: string, 
    index: number, 
    chunk: Blob, 
    fileName: string,
    maxRetries = 3
  ) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.uploadChunk(sessionId, index, chunk, fileName);
        return;
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
}
```

## 📋 常见问题

### Q: 如何获取认证令牌？
A: 通过登录接口获取，详见完整文档。

### Q: 支持哪些文件类型？
A: 支持所有文件类型，但建议图片、视频等媒体文件。

### Q: 文件大小限制是多少？
A: 单文件最大 100MB，超过 19MB 自动使用分片文件系统。

### Q: 如何处理网络中断？
A: 实现断点续传功能，详见完整文档的高级功能部分。

## 🔗 相关链接

- [完整 API 文档](./chunk-upload-api.md)
- [错误码参考](./error-codes.md)
- [最佳实践指南](./best-practices.md)

---

*快速开始指南让您在 5 分钟内集成 TG-Image 分片上传功能。*
