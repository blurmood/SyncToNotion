# TG-Image API 错误码参考

## 📋 HTTP 状态码

| 状态码 | 含义 | 描述 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 认证失败或令牌无效 |
| 403 | Forbidden | 权限不足 |
| 413 | Payload Too Large | 文件大小超过限制 |
| 429 | Too Many Requests | 请求频率过高 |
| 500 | Internal Server Error | 服务器内部错误 |
| 502 | Bad Gateway | 网关错误 |
| 503 | Service Unavailable | 服务不可用 |

## 🚨 业务错误码

### 认证相关 (1000-1099)

| 错误码 | 错误信息 | 解决方案 |
|--------|----------|----------|
| 1001 | 缺少认证令牌 | 在请求头中添加 Authorization |
| 1002 | 认证令牌无效 | 重新获取有效的认证令牌 |
| 1003 | 认证令牌已过期 | 刷新或重新获取令牌 |
| 1004 | 用户权限不足 | 联系管理员获取相应权限 |

### 文件上传相关 (2000-2099)

| 错误码 | 错误信息 | 解决方案 |
|--------|----------|----------|
| 2001 | 文件大小超过限制 | 文件不能超过 100MB |
| 2002 | 不支持的文件类型 | 检查文件类型是否被允许 |
| 2003 | 文件内容为空 | 确保上传的文件不为空 |
| 2004 | 文件名包含非法字符 | 使用合法的文件名 |
| 2005 | 分片大小不正确 | 检查分片大小设置 |

### 分片上传相关 (2100-2199)

| 错误码 | 错误信息 | 解决方案 |
|--------|----------|----------|
| 2101 | 会话ID无效 | 使用有效的会话ID |
| 2102 | 分片索引超出范围 | 检查分片索引是否正确 |
| 2103 | 分片数据损坏 | 重新上传该分片 |
| 2104 | 分片上传超时 | 重试上传或检查网络连接 |
| 2105 | 分片合并失败 | 确保所有分片都已上传 |
| 2106 | 分片数量不匹配 | 检查总分片数是否正确 |
| 2107 | 会话已过期 | 重新开始上传流程 |

### 存储相关 (3000-3099)

| 错误码 | 错误信息 | 解决方案 |
|--------|----------|----------|
| 3001 | 存储空间不足 | 联系管理员扩容 |
| 3002 | 文件保存失败 | 重试上传 |
| 3003 | 文件访问失败 | 检查文件ID是否正确 |
| 3004 | 文件已被删除 | 文件不存在或已被删除 |
| 3005 | 分片数据丢失 | 重新上传文件 |

### 网络相关 (4000-4099)

| 错误码 | 错误信息 | 解决方案 |
|--------|----------|----------|
| 4001 | 网络连接超时 | 检查网络连接并重试 |
| 4002 | 请求频率过高 | 降低请求频率 |
| 4003 | 上游服务不可用 | 稍后重试 |
| 4004 | DNS解析失败 | 检查域名配置 |

## 💻 TypeScript 错误处理

### 错误响应接口

```typescript
interface ApiError {
  success: false;
  error: {
    code: number;
    message: string;
    details?: string;
    timestamp: string;
  };
}

interface ApiSuccess<T = any> {
  success: true;
  data: T;
  timestamp: string;
}

type ApiResponse<T = any> = ApiSuccess<T> | ApiError;
```

### 错误处理类

```typescript
class TGImageError extends Error {
  public readonly code: number;
  public readonly details?: string;
  public readonly timestamp: string;

  constructor(code: number, message: string, details?: string) {
    super(message);
    this.name = 'TGImageError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  static fromApiResponse(response: ApiError): TGImageError {
    return new TGImageError(
      response.error.code,
      response.error.message,
      response.error.details
    );
  }

  isAuthError(): boolean {
    return this.code >= 1000 && this.code < 1100;
  }

  isFileError(): boolean {
    return this.code >= 2000 && this.code < 2200;
  }

  isStorageError(): boolean {
    return this.code >= 3000 && this.code < 3100;
  }

  isNetworkError(): boolean {
    return this.code >= 4000 && this.code < 4100;
  }
}
```

### 错误处理示例

```typescript
async function handleApiCall<T>(apiCall: () => Promise<ApiResponse<T>>): Promise<T> {
  try {
    const response = await apiCall();
    
    if (!response.success) {
      throw TGImageError.fromApiResponse(response);
    }
    
    return response.data;
  } catch (error) {
    if (error instanceof TGImageError) {
      // 处理业务错误
      if (error.isAuthError()) {
        console.error('认证错误:', error.message);
        // 重新登录逻辑
      } else if (error.isFileError()) {
        console.error('文件错误:', error.message);
        // 文件处理逻辑
      } else if (error.isNetworkError()) {
        console.error('网络错误:', error.message);
        // 重试逻辑
      }
    } else {
      // 处理其他错误
      console.error('未知错误:', error);
    }
    
    throw error;
  }
}
```

### 重试策略

```typescript
class RetryStrategy {
  static async withExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // 不重试的错误类型
        if (error instanceof TGImageError) {
          if (error.isAuthError() || error.code === 2001) {
            throw error;
          }
        }
        
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }
}
```

## 🔧 调试技巧

### 1. 启用详细日志

```typescript
class DebugUploader extends TGImageUploader {
  private debug = true;

  private log(message: string, data?: any) {
    if (this.debug) {
      console.log(`[TGImage] ${message}`, data);
    }
  }

  protected async uploadChunk(...args: any[]) {
    this.log('开始上传分片', { chunkIndex: args[1] });
    try {
      const result = await super.uploadChunk(...args);
      this.log('分片上传成功', result);
      return result;
    } catch (error) {
      this.log('分片上传失败', error);
      throw error;
    }
  }
}
```

### 2. 网络状态监控

```typescript
class NetworkMonitor {
  static checkConnectivity(): Promise<boolean> {
    return fetch('/ping', { method: 'HEAD' })
      .then(() => true)
      .catch(() => false);
  }

  static getConnectionSpeed(): Promise<number> {
    const startTime = Date.now();
    return fetch('/speed-test')
      .then(response => response.blob())
      .then(blob => {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        return blob.size / duration; // bytes per second
      });
  }
}
```

### 3. 错误上报

```typescript
class ErrorReporter {
  static report(error: TGImageError, context?: any) {
    const report = {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        stack: error.stack
      },
      context,
      timestamp: error.timestamp,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // 发送到错误收集服务
    fetch('/api/error-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    }).catch(console.error);
  }
}
```

## 📞 故障排除

### 常见问题解决方案

1. **上传卡住不动**
   - 检查网络连接
   - 验证认证令牌
   - 查看浏览器控制台错误

2. **分片合并失败**
   - 确认所有分片都已上传
   - 检查会话ID是否正确
   - 验证文件大小计算

3. **文件访问404**
   - 确认文件ID格式正确
   - 检查文件是否已过期
   - 验证访问权限

4. **认证失败**
   - 检查令牌格式
   - 确认令牌未过期
   - 验证API域名配置

---

*错误码参考帮助您快速定位和解决API集成中的问题。*
