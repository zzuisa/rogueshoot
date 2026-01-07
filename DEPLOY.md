# 部署到 Nginx 指南

## 1. 构建项目

在项目根目录执行：

```bash
npm run build
```

构建完成后，所有文件会生成在 `dist/` 目录中。

## 2. 上传文件到服务器

将 `dist/` 目录中的所有文件上传到服务器的网站目录：

```bash
# 使用 scp 或其他方式上传文件
scp -r dist/* user@server:/usr/share/nginx/zombies/dist/
```

部署路径：`/usr/share/nginx/zombies/dist/`

## 3. 配置 Nginx

### 方法一：使用提供的配置示例

1. 复制 `nginx.conf.example` 到服务器
2. 修改配置中的路径和域名
3. 将配置添加到 Nginx 配置中：

```bash
# 复制配置到 Nginx sites-available
sudo cp nginx.conf.example /etc/nginx/sites-available/zombies

# 创建软链接到 sites-enabled
sudo ln -s /etc/nginx/sites-available/zombies /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

### 方法二：直接修改默认配置

编辑 `/etc/nginx/sites-available/default` 或 `/etc/nginx/nginx.conf`：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    root /usr/share/nginx/zombies/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 4. 设置文件权限

确保 Nginx 可以读取文件：

```bash
sudo chown -R www-data:www-data /usr/share/nginx/zombies/dist
sudo chmod -R 755 /usr/share/nginx/zombies/dist
```

## 5. 验证部署

1. 访问 `http://your-domain.com` 或 `http://your-server-ip`
2. 检查浏览器控制台是否有错误
3. 测试游戏功能是否正常

## 6. HTTPS 配置（可选）

如果需要 HTTPS，可以使用 Let's Encrypt：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 常见问题

### 问题1：404 错误
- 确保 `try_files $uri $uri/ /index.html;` 配置正确
- 检查文件路径是否正确

### 问题2：静态资源加载失败
- 检查资源路径是否为相对路径
- 确认 Nginx 配置中的 `root` 路径正确

### 问题3：CORS 错误
- 如果 API 请求需要跨域，在 Nginx 配置中添加 CORS 头

