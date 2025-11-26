# Web3 Toolkit - Cloudflare Pages 部署指南

## 前置要求

1. Cloudflare 账号
2. 已安装 Node.js 和 npm
3. 已安装 Wrangler CLI（项目中已包含）

## 部署步骤

### 方法一：使用 Wrangler CLI 部署

#### 1. 登录 Cloudflare
```bash
npx wrangler login
```

#### 2. 构建项目
```bash
npm run build
```

#### 3. 部署到 Cloudflare Pages
```bash
npm run deploy
```

第一次部署时，会提示你创建一个新的项目。按照提示操作即可。

### 方法二：通过 Cloudflare Dashboard 部署

#### 1. 推送代码到 Git 仓库（GitHub/GitLab）

#### 2. 登录 Cloudflare Dashboard
- 访问 https://dash.cloudflare.com
- 进入 "Pages" 部分

#### 3. 创建新项目
- 点击 "Create a project"
- 连接你的 Git 仓库
- 选择 `web3-toolkit` 仓库

#### 4. 配置构建设置
- **Framework preset**: Vite
- **Build command**: `npm run build`
- **Build output directory**: `dist`

#### 5. 部署
点击 "Save and Deploy"，Cloudflare 会自动构建并部署你的项目。

## 本地预览（使用 Cloudflare Workers 环境）

```bash
# 先构建项目
npm run build

# 使用 Cloudflare Pages 本地开发服务器预览
npm run cf:dev
```

## 环境变量配置

如果需要环境变量，在 Cloudflare Dashboard 中配置：

1. 进入你的 Pages 项目
2. 点击 "Settings" > "Environment variables"
3. 添加你的环境变量

或者在 `wrangler.toml` 中配置：

```toml
[vars]
VITE_API_URL = "https://api.example.com"
```

## 自动部署

连接 Git 仓库后，每次推送到主分支都会自动触发部署。

## 有用的命令

```bash
# 本地开发
npm run dev

# 构建
npm run build

# 预览构建结果
npm run preview

# 使用 Cloudflare Pages 本地环境预览
npm run cf:dev

# 部署到 Cloudflare Pages
npm run deploy
```

## 注意事项

1. **钱包私钥安全**：本地钱包功能的私钥仅存储在浏览器内存中，刷新即清空
2. **RPC 端点**：确保使用的 RPC 端点在 Cloudflare 环境中可访问
3. **Web3 功能**：所有 Web3 功能都在客户端执行，Cloudflare Pages 只负责托管静态文件

## 故障排查

### 构建失败
- 检查 Node.js 版本（建议 18+）
- 清除 `node_modules` 并重新安装：`npm install`

### 部署后功能异常
- 检查浏览器控制台错误
- 确保 RPC 端点配置正确
- 验证钱包插件已安装并连接

## 更多资源

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [Vite 部署文档](https://vitejs.dev/guide/static-deploy.html)
