# TG-Image 分片上传API参数详解

## 🚨 解决"缺少必要的分片信息"错误

### 问题描述
当接入其他程序时，如果出现"缺少必要的分片信息"错误，通常是因为API参数不正确导致的。

## 📋 API端点

### 分片上传端点
```
POST /upload-chunk
```

### 分片合并端点
```
POST /merge-chunks
```

## 🔧 分片上传参数 (`/upload-chunk`)

### 必需参数 ⚠️

以下三个参数是**必需的**，缺少任何一个都会返回"缺少必要的分片信息"错误：

| 参数名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `file` | Blob/File | 分片文件数据 | `chunkBlob` |
| `chunkIndex` | string | 分片索引(从0开始) | `"0"`, `"1"`, `"2"` |
| `sessionId` | string | 会话ID(标识同一文件) | `"abc123def456"` |

### 可选参数 📝

| 参数名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `totalChunks` | string | 总分片数 | `"3"` |
| `originalFileName` | string | 原始文件名 | `"video.mp4"` |
| `originalFileType` | string | 文件MIME类型 | `"video/mp4"` |
| `originalFileSize` | string | 文件大小(字节) | `"52428800"` |

### 请求格式

```typescript
// 使用 FormData 格式，不是 JSON
const formData = new FormData();
formData.append('file', chunkBlob);                    // 必需
formData.append('chunkIndex', '0');                    // 必需
formData.append('sessionId', 'abc123def456');          // 必需
formData.append('totalChunks', '3');                   // 可选
formData.append('originalFileName', 'video.mp4');      // 可选
formData.append('originalFileType', 'video/mp4');      // 可选
formData.append('originalFileSize', '52428800');       // 可选
```

## 🔧 分片合并参数 (`/merge-chunks`)

### 必需参数

| 参数名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `sessionId` | string | 会话ID | `"abc123def456"` |
| `fileName` | string | 文件名 | `"video.mp4"` |
| `totalChunks` | number | 总分片数 | `3` |

### 可选参数

| 参数名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `fileSize` | number | 文件大小 | `52428800` |
| `fileType` | string | 文件类型 | `"video/mp4"` |

### 请求格式

```typescript
// 使用 JSON 格式
{
  "sessionId": "abc123def456",
  "fileName": "video.mp4",
  "totalChunks": 3,
  "fileSize": 52428800,
  "fileType": "video/mp4"
}
```

## ✅ 正确的实现示例

### TypeScript 完整实现

```typescript
class TGImageChunkUploader {
  private apiBaseUrl: string;
  private authToken: string;

  constructor(apiBaseUrl: string, authToken: string) {
    this.apiBaseUrl = apiBaseUrl;
    this.authToken = authToken;
  }

  /**
   * 上传单个分片
   */
  async uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunkBlob: Blob,
    fileName: string,
    totalChunks: number,
    fileSize: number,
    fileType: string
  ): Promise<ChunkUploadResponse> {
    const formData = new FormData();
    
    // === 必需参数 ===
    formData.append('file', chunkBlob);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('sessionId', sessionId);
    
    // === 推荐参数 ===
    formData.append('totalChunks', totalChunks.toString());
    formData.append('originalFileName', fileName);
    formData.append('originalFileType', fileType);
    formData.append('originalFileSize', fileSize.toString());

    const response = await fetch(`${this.apiBaseUrl}/upload-chunk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`分片上传失败: ${errorData.error}`);
    }

    return await response.json();
  }

  /**
   * 合并分片
   */
  async mergeChunks(
    sessionId: string,
    fileName: string,
    totalChunks: number,
    fileSize?: number,
    fileType?: string
  ): Promise<MergeChunksResponse> {
    const requestBody = {
      sessionId,
      fileName,
      totalChunks
    };

    // 添加可选参数
    if (fileSize) requestBody.fileSize = fileSize;
    if (fileType) requestBody.fileType = fileType;

    const response = await fetch(`${this.apiBaseUrl}/merge-chunks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`分片合并失败: ${errorData.error}`);
    }

    return await response.json();
  }

  /**
   * 完整的文件上传流程
   */
  async uploadFile(file: File): Promise<MergeChunksResponse> {
    const sessionId = this.generateSessionId();
    const chunkSize = 10 * 1024 * 1024; // 10MB
    const totalChunks = Math.ceil(file.size / chunkSize);

    console.log(`开始上传文件: ${file.name}, 大小: ${file.size}, 分片数: ${totalChunks}`);

    // 上传所有分片
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunkBlob = file.slice(start, end);

      console.log(`上传分片 ${i + 1}/${totalChunks}`);

      await this.uploadChunk(
        sessionId,
        i,
        chunkBlob,
        file.name,
        totalChunks,
        file.size,
        file.type
      );
    }

    console.log('所有分片上传完成，开始合并');

    // 合并分片
    return await this.mergeChunks(
      sessionId,
      file.name,
      totalChunks,
      file.size,
      file.type
    );
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

// 类型定义
interface ChunkUploadResponse {
  success: boolean;
  chunkIndex: number;
  sessionId: string;
  isComplete: boolean;
  uploadedChunks: number;
  totalChunks: number;
}

interface MergeChunksResponse {
  success: boolean;
  result: {
    src: string;
    name: string;
    size: number;
    type: string;
    isChunkFile?: boolean;
  };
  message: string;
}
```

### 使用示例

```typescript
// 初始化上传器
const uploader = new TGImageChunkUploader(
  'https://your-domain.workers.dev',
  'your-auth-token'
);

// 上传文件
async function uploadExample() {
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  const file = fileInput.files?.[0];
  
  if (!file) {
    console.error('请选择文件');
    return;
  }

  try {
    const result = await uploader.uploadFile(file);
    console.log('上传成功:', result);
    console.log('文件链接:', result.result.src);
  } catch (error) {
    console.error('上传失败:', error);
  }
}
```

## 🚨 常见错误及解决方案

### 1. "缺少必要的分片信息"

**原因**: 缺少必需参数或参数名错误

**解决方案**:
```typescript
// ❌ 错误的参数名
formData.append('chunk', chunkBlob);        // 应该是 'file'
formData.append('index', chunkIndex);       // 应该是 'chunkIndex'
formData.append('session', sessionId);     // 应该是 'sessionId'

// ✅ 正确的参数名
formData.append('file', chunkBlob);
formData.append('chunkIndex', chunkIndex.toString());
formData.append('sessionId', sessionId);
```

### 2. "缺少必要的合并信息"

**原因**: 合并请求缺少必需参数

**解决方案**:
```typescript
// ✅ 确保包含所有必需参数
{
  "sessionId": "abc123def456",    // 必需
  "fileName": "video.mp4",        // 必需
  "totalChunks": 3                // 必需
}
```

### 3. "分片不完整"

**原因**: 部分分片上传失败或丢失

**解决方案**:
- 检查所有分片是否都成功上传
- 验证 chunkIndex 是否连续(0, 1, 2, ...)
- 确认 totalChunks 数量正确

## 📊 响应格式

### 分片上传成功响应

```json
{
  "success": true,
  "chunkIndex": 0,
  "sessionId": "abc123def456",
  "isComplete": false,
  "uploadedChunks": 1,
  "totalChunks": 3
}
```

### 分片合并成功响应

```json
{
  "success": true,
  "result": {
    "src": "/file/chunks_abc123def456_1749915081613.mp4",
    "name": "video.mp4",
    "size": 52428800,
    "type": "video/mp4",
    "isChunkFile": true
  },
  "message": "大文件已保存为分片文件系统"
}
```

### 错误响应

```json
{
  "error": "缺少必要的分片信息"
}
```

## 🔍 调试技巧

### 1. 检查请求参数

```typescript
// 调试 FormData 内容
console.log('FormData 内容:');
for (let [key, value] of formData.entries()) {
  console.log(`${key}:`, value);
}
```

### 2. 验证参数类型

```typescript
// 确保数值参数转换为字符串
formData.append('chunkIndex', chunkIndex.toString());
formData.append('totalChunks', totalChunks.toString());
formData.append('originalFileSize', fileSize.toString());
```

### 3. 检查认证

```typescript
// 确保包含认证头
headers: {
  'Authorization': `Bearer ${authToken}`
}
```

## 📞 技术支持

如果仍然遇到问题，请提供以下信息：

1. 完整的错误消息
2. 请求参数内容
3. 使用的编程语言和框架
4. 网络请求的完整代码

## 🛠️ 完整的调试工具

### 参数验证函数

```typescript
class ParameterValidator {
  /**
   * 验证分片上传参数
   */
  static validateChunkUploadParams(formData: FormData): string[] {
    const errors: string[] = [];

    // 检查必需参数
    if (!formData.get('file')) {
      errors.push('缺少参数: file (分片文件数据)');
    }

    const chunkIndex = formData.get('chunkIndex');
    if (!chunkIndex) {
      errors.push('缺少参数: chunkIndex (分片索引)');
    } else if (isNaN(Number(chunkIndex))) {
      errors.push('参数错误: chunkIndex 必须是数字');
    }

    if (!formData.get('sessionId')) {
      errors.push('缺少参数: sessionId (会话ID)');
    }

    // 检查可选参数的格式
    const totalChunks = formData.get('totalChunks');
    if (totalChunks && isNaN(Number(totalChunks))) {
      errors.push('参数错误: totalChunks 必须是数字');
    }

    const fileSize = formData.get('originalFileSize');
    if (fileSize && isNaN(Number(fileSize))) {
      errors.push('参数错误: originalFileSize 必须是数字');
    }

    return errors;
  }

  /**
   * 验证分片合并参数
   */
  static validateMergeChunksParams(data: any): string[] {
    const errors: string[] = [];

    if (!data.sessionId) {
      errors.push('缺少参数: sessionId');
    }

    if (!data.fileName) {
      errors.push('缺少参数: fileName');
    }

    if (!data.totalChunks) {
      errors.push('缺少参数: totalChunks');
    } else if (typeof data.totalChunks !== 'number') {
      errors.push('参数错误: totalChunks 必须是数字');
    }

    return errors;
  }
}
```

### 网络请求调试器

```typescript
class RequestDebugger {
  /**
   * 调试分片上传请求
   */
  static async debugChunkUpload(
    url: string,
    formData: FormData,
    headers: Record<string, string>
  ) {
    console.group('🔍 分片上传请求调试');

    // 验证参数
    const errors = ParameterValidator.validateChunkUploadParams(formData);
    if (errors.length > 0) {
      console.error('❌ 参数验证失败:');
      errors.forEach(error => console.error(`  - ${error}`));
      console.groupEnd();
      return;
    }

    // 打印请求信息
    console.log('📡 请求URL:', url);
    console.log('🔑 请求头:', headers);

    console.log('📦 FormData 内容:');
    for (let [key, value] of formData.entries()) {
      if (value instanceof File || value instanceof Blob) {
        console.log(`  ${key}: [${value.constructor.name}] ${value.size} bytes`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    }

    // 发送请求并记录响应
    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData
      });
      const endTime = Date.now();

      console.log(`⏱️ 请求耗时: ${endTime - startTime}ms`);
      console.log(`📊 响应状态: ${response.status} ${response.statusText}`);

      const responseData = await response.json();

      if (response.ok) {
        console.log('✅ 请求成功:', responseData);
      } else {
        console.error('❌ 请求失败:', responseData);
      }

      console.groupEnd();
      return responseData;

    } catch (error) {
      console.error('💥 网络错误:', error);
      console.groupEnd();
      throw error;
    }
  }
}
```

### 完整的错误处理示例

```typescript
class RobustChunkUploader extends TGImageChunkUploader {
  /**
   * 带完整错误处理的分片上传
   */
  async uploadChunkWithDebug(
    sessionId: string,
    chunkIndex: number,
    chunkBlob: Blob,
    fileName: string,
    totalChunks: number,
    fileSize: number,
    fileType: string
  ): Promise<ChunkUploadResponse> {
    const formData = new FormData();

    // 构建参数
    formData.append('file', chunkBlob);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('sessionId', sessionId);
    formData.append('totalChunks', totalChunks.toString());
    formData.append('originalFileName', fileName);
    formData.append('originalFileType', fileType);
    formData.append('originalFileSize', fileSize.toString());

    // 验证参数
    const errors = ParameterValidator.validateChunkUploadParams(formData);
    if (errors.length > 0) {
      throw new Error(`参数验证失败: ${errors.join(', ')}`);
    }

    // 发送请求
    try {
      return await RequestDebugger.debugChunkUpload(
        `${this.apiBaseUrl}/upload-chunk`,
        formData,
        { 'Authorization': `Bearer ${this.authToken}` }
      );
    } catch (error) {
      // 详细的错误处理
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('网络连接失败，请检查网络连接和API地址');
      }

      if (error.message.includes('401')) {
        throw new Error('认证失败，请检查认证令牌是否正确');
      }

      if (error.message.includes('413')) {
        throw new Error('分片大小超过限制，请减小分片大小');
      }

      throw error;
    }
  }
}
```

## 📋 快速检查清单

在集成API之前，请确认以下事项：

### ✅ 分片上传检查清单

- [ ] 使用 `FormData` 格式，不是 JSON
- [ ] 包含必需参数: `file`, `chunkIndex`, `sessionId`
- [ ] `chunkIndex` 是字符串格式的数字
- [ ] `sessionId` 对同一文件的所有分片保持一致
- [ ] 包含 `Authorization` 请求头
- [ ] 分片索引从 0 开始，连续递增

### ✅ 分片合并检查清单

- [ ] 使用 JSON 格式，不是 FormData
- [ ] 包含必需参数: `sessionId`, `fileName`, `totalChunks`
- [ ] `totalChunks` 是数字类型，不是字符串
- [ ] `sessionId` 与分片上传时使用的一致
- [ ] 所有分片都已成功上传

### ✅ 通用检查清单

- [ ] API 地址正确
- [ ] 认证令牌有效
- [ ] 网络连接正常
- [ ] 文件大小在限制范围内 (≤100MB)

## 🔧 故障排除步骤

### 步骤1: 验证基础连接

```typescript
// 测试API连接
async function testConnection(apiBaseUrl: string, authToken: string) {
  try {
    const response = await fetch(`${apiBaseUrl}/ping`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (response.ok) {
      console.log('✅ API连接正常');
    } else {
      console.error('❌ API连接失败:', response.status);
    }
  } catch (error) {
    console.error('💥 网络错误:', error);
  }
}
```

### 步骤2: 测试单个分片上传

```typescript
// 测试最小分片上传
async function testMinimalChunkUpload() {
  const testBlob = new Blob(['test data'], { type: 'text/plain' });
  const formData = new FormData();

  formData.append('file', testBlob);
  formData.append('chunkIndex', '0');
  formData.append('sessionId', 'test-session-123');

  // 使用调试器发送请求
  await RequestDebugger.debugChunkUpload(
    'https://your-domain.workers.dev/upload-chunk',
    formData,
    { 'Authorization': 'Bearer your-token' }
  );
}
```

### 步骤3: 逐步增加复杂度

1. 先测试最小参数的分片上传
2. 再添加可选参数
3. 测试多个分片的上传
4. 最后测试分片合并

## 📞 获取帮助

如果问题仍然存在，请提供以下调试信息：

1. **完整错误消息**
2. **请求参数** (使用上面的调试工具输出)
3. **响应内容** (包括状态码)
4. **网络环境** (浏览器/Node.js版本)
5. **文件信息** (大小、类型)

### 联系方式

- 📧 技术支持邮箱: support@example.com
- 📖 GitHub Issues: https://github.com/your-repo/issues
- 💬 技术交流群: [加入群聊]

---

*本文档提供了完整的TG-Image分片上传API参数说明和调试工具，帮助快速解决集成过程中的各种问题。*
