# 企微同步Notion系统 (SyncToNotion)

基于 Cloudflare Workers 的智能内容解析与 Notion 同步系统，支持小红书和抖音内容的自动化处理与同步。

## ✨ 核心功能

### 🔍 多平台内容解析
- **小红书解析**: 提取标题、作者、正文、图片和视频，支持图文、视频、Live图等多种内容类型
- **抖音解析**: 解析视频和图集内容，提取无水印视频链接，支持Live图识别
- **智能链接提取**: 从分享文本中自动识别并提取小红书/抖音链接

### 🎬 智能媒体处理
- **防盗链解决**: 下载原始媒体文件，解决平台防盗链问题
- **格式优化**: 优先选择JPEG格式，确保Notion兼容性，避免WebP格式问题
- **智能存储**: 根据文件大小自动选择存储方式（图床 vs R2存储）
- **并发处理**: 多媒体文件并发下载上传，提高处理效率

### 📝 Notion集成
- **自动同步**: 解析内容直接同步到Notion数据库
- **智能标签**: 自动生成平台、内容类型、Live图等标签
- **媒体展示**: 图片、视频在Notion中完美展示
- **封面设置**: 自动设置页面封面图片

## 🛠️ 技术架构

### 核心技术栈
- **运行环境**: Cloudflare Workers (Edge Computing)
- **开发语言**: TypeScript (ES6+语法)
- **路由框架**: itty-router
- **存储服务**: Cloudflare KV + R2 + TG-Image图床
- **API集成**: Notion API

### 项目结构
```
src/
├── index.ts           # 主入口，HTTP路由处理
├── xiaohongshuParser.ts # 小红书内容解析器
├── douyinParser.ts    # 抖音内容解析器
├── media.ts           # 媒体文件处理核心
├── imageHost.ts       # 图床服务接口
├── notionSync.ts      # Notion同步核心
├── config.ts          # 系统配置管理
└── utils.ts           # 通用工具函数
```

## 📋 前置条件

- Cloudflare 账号（Workers + KV + R2）
- Notion 账号和 API Token
- TG-Image 图床账号（可选）
- Wrangler CLI 工具

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/blurmood/SyncToNotion.git
cd SyncToNotion
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境

编辑 `wrangler.toml` 文件，配置您的资源：

```toml
# KV命名空间
kv_namespaces = [
  { binding = "CACHE_KV", id = "your-kv-namespace-id" }
]

# R2存储桶
[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "your-bucket-name"

# 环境变量
[vars]
ADMIN_KEY = "your-admin-key"
IMAGE_HOST_USERNAME = "your-image-host-username"
IMAGE_HOST_PASSWORD = "your-image-host-password"
```

### 4. 配置Notion集成

在 `src/config.ts` 中配置您的Notion信息：

```typescript
export const NOTION_CONFIG = {
  TOKEN: 'your-notion-integration-token',
  DATABASE_ID: 'your-database-id',
  // ... 其他配置
};
```

### 5. 构建和部署
```bash
# 构建TypeScript
npm run build

# 部署到Cloudflare Workers
npm run deploy
```

## 📖 API使用指南

### 🔍 内容解析API

#### 解析小红书/抖音链接
```http
GET /parse?url={链接地址}&refresh={是否强制刷新}
```

**参数说明:**
- `url`: 小红书或抖音链接
- `refresh`: 可选，`true`时强制刷新缓存

**示例请求:**
```bash
curl "https://your-worker.your-subdomain.workers.dev/parse?url=https://www.xiaohongshu.com/explore/xxx"
```

**响应示例:**
```json
{
  "title": "示例标题",
  "author": {
    "name": "作者昵称",
    "id": "作者ID",
    "avatar": "https://processed-avatar-url.jpg"
  },
  "content": "正文内容...",
  "images": [
    "https://processed-image-url-1.jpg",
    "https://processed-image-url-2.jpg"
  ],
  "video": "https://processed-video-url.mp4",
  "stats": {
    "likes": 1000,
    "comments": 50,
    "collects": 30,
    "shares": 20
  },
  "original_url": "https://www.xiaohongshu.com/explore/xxx",
  "parsed_at": "2024-12-18T12:00:00Z",
  "_cache": "hit"
}
```

### 🔗 链接提取API

#### 从文本提取链接
```http
POST /extract-link
Content-Type: application/json

{
  "text": "分享文本内容"
}
```

**响应示例:**
```json
{
  "found": true,
  "link": "https://xhslink.com/xxx",
  "platform": "小红书",
  "original_text": "原始分享文本"
}
```

### 📝 Notion同步API（核心功能）

#### 从文本直接同步到Notion
```http
POST /sync-from-text
Content-Type: application/json

{
  "text": "包含小红书/抖音链接的分享文本",
  "key": "your-admin-key",
  "tags": ["自定义标签1", "自定义标签2"]
}
```

**参数说明:**
- `text`: 包含链接的分享文本
- `key`: 管理员密钥（必需）
- `tags`: 自定义标签数组（可选）

**示例请求:**
```bash
curl -X POST "https://your-worker.your-subdomain.workers.dev/sync-from-text" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "48 机智星球X博士发布了一篇小红书笔记，快来看吧！ 😆 FrIaI2M8JntUjM9 😆 http://xhslink.com/a/cEUvjvndbsAdb，复制本条信息，打开【小红书】App查看精彩内容！",
    "key": "your-admin-key",
    "tags": ["收藏", "学习"]
  }'
```

**成功响应:**
```json
{
  "message": "同步到 Notion 成功",
  "extracted_link": "http://xhslink.com/a/cEUvjvndbsAdb",
  "platform": "小红书",
  "notion_page_id": "8a9b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
  "notion_page_url": "https://www.notion.so/your-workspace/xxx",
  "applied_tags": ["小红书", "图文", "收藏", "学习"],
  "video_processed": false,
  "video_processing": false,
  "video_url": null,
  "async_processing": false,
  "note": "同步处理完成"
}
```

### 🔧 管理API

#### 健康检查
```http
GET /health
```

**响应:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-18T12:00:00Z"
}
```

#### 刷新图床令牌
```http
GET /admin/refresh-token?key=your-admin-key
```

## 🌟 核心特性详解

### 智能内容识别
- **多平台支持**: 自动识别小红书和抖音链接
- **内容类型检测**: 图文、视频、Live图自动分类
- **格式优化**: 优先选择JPEG格式，确保Notion兼容性

### 高效媒体处理
- **防盗链解决**: 下载并重新托管所有媒体文件
- **智能存储策略**:
  - 小文件(< 19MB): TG-Image图床
  - 大文件(≥ 19MB): Cloudflare R2存储
- **并发处理**: 多媒体文件同时处理，提升效率
- **格式转换**: WebP自动转换为JPG

### Notion深度集成
- **智能标签系统**:
  - 平台标签: 小红书、抖音
  - 内容类型: 图文、视频、实况图片
  - 自定义标签: 用户可添加个性化标签
- **完美展示**: 图片、视频在Notion中原生展示
- **封面设置**: 自动设置页面封面图片

### 企业级可靠性
- **缓存机制**: KV存储避免重复处理
- **错误重试**: 网络请求和文件上传自动重试
- **降级处理**: 图床失败自动切换到R2存储
- **权限控制**: 管理员密钥保护API安全

## ⚠️ 使用须知

### 合规使用
- 仅供个人学习和研究使用
- 请遵守相关平台的使用条款
- 不得用于商业用途或大规模数据采集
- 请尊重原创作者的版权

### 技术限制
- 依赖第三方平台API，可能受到限制
- 媒体文件处理有大小限制
- 需要稳定的网络环境

## 📄 开源协议

本项目采用 MIT 协议开源，详见 [LICENSE](LICENSE) 文件。

## ⚙️ 高级配置

### 存储配置详解

#### Cloudflare R2 存储
```toml
# wrangler.toml
[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "your-bucket-name"
```

#### TG-Image 图床配置
```toml
# wrangler.toml
[vars]
IMAGE_HOST_USERNAME = "your-username"
IMAGE_HOST_PASSWORD = "your-password"
```

### Notion配置

在 `src/config.ts` 中配置Notion集成：

```typescript
export const NOTION_CONFIG = {
  TOKEN: 'secret_xxxxxxxxxx',
  DATABASE_ID: 'your-database-id',
  PROPERTIES: {
    TITLE: '标题',
    AUTHOR: '作者',
    ORIGINAL_URL: '原帖链接',
    TAGS: '标签',
    CREATED_TIME: '创建时间'
  }
};
```

### 智能存储策略

系统根据文件大小自动选择最优存储方案：

| 文件大小 | 存储方式 | 特点 |
|---------|---------|------|
| < 19MB | TG-Image图床 | 快速上传，CDN加速 |
| ≥ 19MB | Cloudflare R2 | 大文件支持，成本优化 |

### 媒体处理流程

1. **下载阶段**: 并发下载所有媒体文件
2. **格式优化**: 优先选择JPEG，避免WebP
3. **智能存储**: 根据大小选择存储方式
4. **验证机制**: 确保处理后链接有效
5. **降级处理**: 失败时自动切换备选方案

### 缓存策略

- **KV缓存**: 解析结果缓存24小时
- **强制刷新**: 添加`refresh=true`参数
- **缓存键**: 基于平台和URL生成唯一键

## 🔧 开发指南

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 类型检查
npm run type-check

# 构建项目
npm run build
```

### 测试部署

```bash
# 部署到开发环境
wrangler deploy --env dev

# 部署到生产环境
wrangler deploy
```

### 日志调试

在Cloudflare Workers控制台查看实时日志：
```bash
wrangler tail
```