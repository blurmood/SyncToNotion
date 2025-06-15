# TG-Image API 快速参考卡片

## 🚀 分片上传 API 参数速查

### 📡 端点地址
```
POST /upload-chunk    # 分片上传
POST /merge-chunks    # 分片合并
```

### 🔧 分片上传参数 (FormData)

#### ⚠️ 必需参数
```typescript
formData.append('file', chunkBlob);           // 分片数据
formData.append('chunkIndex', '0');           // 分片索引(字符串)
formData.append('sessionId', 'abc123');       // 会话ID
```

#### 📝 推荐参数
```typescript
formData.append('totalChunks', '3');          // 总分片数
formData.append('originalFileName', 'file.mp4'); // 文件名
formData.append('originalFileType', 'video/mp4'); // MIME类型
formData.append('originalFileSize', '52428800');  // 文件大小
```

### 🔧 分片合并参数 (JSON)

```typescript
{
  "sessionId": "abc123",      // 必需: 会话ID
  "fileName": "file.mp4",     // 必需: 文件名
  "totalChunks": 3,           // 必需: 总分片数(数字)
  "fileSize": 52428800,       // 可选: 文件大小
  "fileType": "video/mp4"     // 可选: 文件类型
}
```

## 🚨 常见错误速查

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| 缺少必要的分片信息 | 缺少必需参数 | 检查 `file`, `chunkIndex`, `sessionId` |
| 缺少必要的合并信息 | 合并参数不全 | 检查 `sessionId`, `fileName`, `totalChunks` |
| 分片不完整 | 分片上传失败 | 确保所有分片都成功上传 |
| 401 Unauthorized | 认证失败 | 检查 Authorization 头 |
| 413 Payload Too Large | 文件过大 | 文件不能超过100MB |

## ⚡ 最小可用代码

### TypeScript 实现

```typescript
// 1. 分片上传
async function uploadChunk(sessionId: string, index: number, blob: Blob) {
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('chunkIndex', index.toString());
  formData.append('sessionId', sessionId);
  
  const response = await fetch('/upload-chunk', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  
  return response.json();
}

// 2. 分片合并
async function mergeChunks(sessionId: string, fileName: string, totalChunks: number) {
  const response = await fetch('/merge-chunks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sessionId, fileName, totalChunks })
  });
  
  return response.json();
}

// 3. 完整上传流程
async function uploadFile(file: File) {
  const sessionId = Math.random().toString(36).substring(2, 15);
  const chunkSize = 10 * 1024 * 1024; // 10MB
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  // 上传分片
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    await uploadChunk(sessionId, i, chunk);
  }
  
  // 合并分片
  return await mergeChunks(sessionId, file.name, totalChunks);
}
```

### JavaScript 实现

```javascript
// 简化版本 - 无类型注解
async function uploadFile(file) {
  const sessionId = Math.random().toString(36).substring(2, 15);
  const chunkSize = 10 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  // 上传所有分片
  for (let i = 0; i < totalChunks; i++) {
    const chunk = file.slice(i * chunkSize, (i + 1) * chunkSize);
    const formData = new FormData();
    
    formData.append('file', chunk);
    formData.append('chunkIndex', i.toString());
    formData.append('sessionId', sessionId);
    
    await fetch('/upload-chunk', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
  }
  
  // 合并分片
  const result = await fetch('/merge-chunks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionId: sessionId,
      fileName: file.name,
      totalChunks: totalChunks
    })
  });
  
  return result.json();
}
```

## 🔍 调试检查点

### 1. 参数检查
```typescript
// 检查 FormData 内容
for (let [key, value] of formData.entries()) {
  console.log(key, value);
}
```

### 2. 响应检查
```typescript
if (!response.ok) {
  const error = await response.json();
  console.error('API错误:', error);
}
```

### 3. 网络检查
```typescript
// 测试连接
fetch('/ping').then(r => console.log('连接状态:', r.status));
```

## 📊 文件处理策略

| 文件大小 | 处理方式 | 存储位置 | 访问方式 |
|----------|----------|----------|----------|
| ≤ 19MB | 分片上传→合并 | Telegram | 直接链接 |
| 19-100MB | 分片文件系统 | 分片存储 | 动态合并 |
| > 100MB | 拒绝上传 | - | 错误提示 |

## 🎯 成功响应示例

### 分片上传成功
```json
{
  "success": true,
  "chunkIndex": 0,
  "sessionId": "abc123",
  "isComplete": false,
  "uploadedChunks": 1,
  "totalChunks": 3
}
```

### 合并成功 (小文件)
```json
{
  "success": true,
  "result": {
    "src": "/file/BQACAgUAAyEGAASMCnTH.mp4",
    "name": "video.mp4",
    "size": 15728640,
    "type": "video/mp4"
  },
  "message": "文件已成功合并并上传"
}
```

### 合并成功 (大文件)
```json
{
  "success": true,
  "result": {
    "src": "/file/chunks_abc123_1749915081613.mp4",
    "name": "video.mp4",
    "size": 52428800,
    "type": "video/mp4",
    "isChunkFile": true
  },
  "message": "大文件已保存为分片文件系统"
}
```

## 🛠️ 故障排除步骤

1. **检查参数名**: 确保使用正确的字段名
2. **检查数据类型**: chunkIndex 必须是字符串
3. **检查认证**: 包含正确的 Authorization 头
4. **检查网络**: 确认 API 地址可访问
5. **检查文件**: 确认文件大小在限制内

## 📞 快速联系

- 🐛 报告问题: [GitHub Issues]
- 📖 完整文档: [API Documentation]
- 💬 技术交流: [Discord/QQ群]

---

*快速参考卡片 - 5分钟上手TG-Image分片上传API*
