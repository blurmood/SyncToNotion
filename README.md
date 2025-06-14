# 小红书内容解析 Worker

这是一个运行在 Cloudflare Worker 上的服务，用于解析小红书链接并提取结构化信息，同时处理防盗链问题。

## 功能特点

- 解析小红书链接，提取标题、作者、正文、图片和视频链接等结构化信息
- 解决小红书防盗链问题，将媒体资源缓存并上传到自建图床
- 使用 Cloudflare KV 缓存解析结果，提高响应速度
- 使用 Cloudflare R2 存储媒体文件
- 异步处理大型媒体文件，提高响应速度
- 实现请求重试机制，提高可靠性
- 从分享文本中提取小红书链接
- 支持从分享文本直接同步到Notion

## 前置条件

- Cloudflare 账号
- Wrangler CLI 工具
- 已创建的 KV 命名空间和 R2 存储桶

## 安装与部署

1. 克隆此仓库
```bash
git clone <repository-url>
cd xiaohongshu-parser-worker
```

2. 安装依赖
```bash
npm install
```

3. 配置 Cloudflare 资源

编辑 `wrangler.toml` 文件，填入您的 KV 命名空间 ID 和 R2 存储桶名称：

```toml
kv_namespaces = [
  { binding = "CACHE_KV", id = "dd58baf330fc4b75b190d16e4b8982bc" }
]

r2_buckets = [
  { binding = "MEDIA_BUCKET", bucket_name = "moodcloud" }
]
```

4. 修改图床 URL 生成逻辑

在 `src/media.js` 文件中，修改 `generatePublicUrl` 函数以适配您的自建图床：

```javascript
function generatePublicUrl(fileName) {
  return `https://pub-13891ccdad9f4aababe3cc021e21947e.r2.dev/${fileName}`;
}
```

5. 部署到 Cloudflare
```bash
npm run publish
```

## 使用方法

### 解析小红书链接

```
GET https://your-worker-url.com/parse?url=小红书链接
```

示例请求：
```
GET https://your-worker-url.com/parse?url=https://www.xiaohongshu.com/explore/你的小红书ID
```

响应示例：
```json
{
  "title": "示例标题",
  "author": {
    "name": "作者昵称",
    "id": "作者ID",
    "avatar": "https://pub-13891ccdad9f4aababe3cc021e21947e.r2.dev/avatars/作者ID.jpg"
  },
  "content": "正文内容...",
  "images": [
    "https://pub-13891ccdad9f4aababe3cc021e21947e.r2.dev/images/内容ID_0.jpg",
    "https://pub-13891ccdad9f4aababe3cc021e21947e.r2.dev/images/内容ID_1.jpg"
  ],
  "video": "https://pub-13891ccdad9f4aababe3cc021e21947e.r2.dev/videos/内容ID.mp4",
  "stats": {
    "likes": 1000,
    "comments": 50,
    "collects": 30,
    "shares": 20
  },
  "original_url": "https://www.xiaohongshu.com/explore/你的小红书ID",
  "parsed_at": "2023-05-18T12:00:00Z"
}
```

### 健康检查

```
GET https://your-worker-url.com/health
```

响应示例：
```json
{
  "status": "ok",
  "timestamp": "2023-05-18T12:00:00Z"
}
```

### 从文本中提取小红书链接

#### GET 请求方式

```
GET https://your-worker-url.com/extract-link?text=分享文本内容
```

示例请求：
```
GET https://your-worker-url.com/extract-link?text=48 机智星球X博士发布了一篇小红书笔记，快来看吧！ 😆 FrIaI2M8JntUjM9 😆 http://xhslink.com/a/cEUvjvndbsAdb，复制本条信息，打开【小红书】App查看精彩内容！
```

响应示例：
```json
{
  "found": true,
  "link": "http://xhslink.com/a/cEUvjvndbsAdb",
  "original_text": "48 机智星球X博士发布了一篇小红书笔记，快来看吧！ 😆 FrIaI2M8JntUjM9 😆 http://xhslink.com/a/cEUvjvndbsAdb，复制本条信息，打开【小红书】App查看精彩内容！"
}
```

#### POST 请求方式

```
POST https://your-worker-url.com/extract-link
Content-Type: application/json

{
  "text": "分享文本内容"
}
```

或者直接发送文本内容作为请求体：

```
POST https://your-worker-url.com/extract-link
Content-Type: text/plain

48 机智星球X博士发布了一篇小红书笔记，快来看吧！ 😆 FrIaI2M8JntUjM9 😆 http://xhslink.com/a/cEUvjvndbsAdb，复制本条信息，打开【小红书】App查看精彩内容！
```

响应示例（未找到链接时）：
```json
{
  "found": false,
  "message": "未找到小红书链接"
}
```

### 从文本直接同步到Notion

如果您想从包含小红书链接的文本直接同步到Notion，可以使用以下端点：

```
POST https://your-worker-url.com/sync-from-text
Content-Type: application/json

{
  "text": "分享文本内容（包含小红书链接）",
  "key": "您的管理员密钥"
}
```

或者使用表单数据：

```
POST https://your-worker-url.com/sync-from-text
Content-Type: multipart/form-data

text=分享文本内容（包含小红书链接）&key=您的管理员密钥
```

响应示例：
```json
{
  "message": "同步到 Notion 成功",
  "extracted_link": "http://xhslink.com/a/E9wRtcz6H4Adb",
  "original_text": "36 十分以上及格发布了一篇小红书笔记，快来看吧！ 😆 noTJuUq4GRvdySu 😆 http://xhslink.com/a/E9wRtcz6H4Adb，复制本条信息，打开【小红书】App查看精彩内容！",
  "notion_page_id": "8a9b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
  "notion_page_url": "https://www.notion.so/your-workspace/8a9b7c6d5e4f3a2b1c0d9e8f7a6b5c4d"
}
```

## 注意事项

- 请遵守小红书的使用条款和相关法律法规
- 本服务仅用于个人学习和研究
- 请勿用于商业用途或大规模爬取数据
- 请合理设置缓存时间，避免过度请求上游 API

## 许可证

MIT 

## 配置说明

### 图床配置

本项目支持两种媒体文件存储方式：

1. **Cloudflare R2 存储**（默认备用方案）
2. **自建图床**（优先使用）

自建图床配置：

```
# wrangler.toml 中添加图床账号信息
[vars]
IMAGE_HOST_USERNAME = "您的图床用户名"
IMAGE_HOST_PASSWORD = "您的图床密码"
```

图床认证机制：
- 使用 Bearer 令牌认证
- 令牌通过登录 API 获取，有效期为 7 天
- 系统会自动处理令牌获取和刷新

如需手动刷新令牌，可访问：
```
GET https://your-worker-url.com/admin/refresh-token?key=您的管理员密钥
```

### 媒体处理逻辑

1. 下载小红书原始媒体文件
2. 尝试上传到自建图床
3. 如果图床上传失败，回退到 R2 存储
4. 返回处理后的媒体文件 URL 