#!/bin/bash
# 部署脚本：将构建文件复制到指定位置（部署前备份）
# 自动递增版本号：默认小版本号+1，可通过参数控制

# 部署目标路径
DEPLOY_PATH="/usr/share/nginx/zombies/dist"
# 备份目录路径
BACKUP_DIR="/usr/share/nginx/zombies/backups"
# 备份文件名（使用时间戳）
BACKUP_NAME="dist_backup_$(date +%Y%m%d_%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

# 版本号递增类型（patch=小版本, minor=中版本, major=大版本）
VERSION_BUMP="${1:-patch}"
DEPLOY_MODE="${2:-}"

# 递增版本号函数
increment_version() {
    local version_file="package.json"
    local current_version=$(grep -o '"version": "[^"]*"' "$version_file" | cut -d'"' -f4)
    
    if [ -z "$current_version" ]; then
        echo "错误: 无法读取当前版本号"
        exit 1
    fi
    
    # 解析版本号 (major.minor.patch)
    IFS='.' read -r major minor patch <<< "$current_version"
    
    # 根据参数递增版本号
    case "$VERSION_BUMP" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch|*)
            patch=$((patch + 1))
            ;;
    esac
    
    local new_version="$major.$minor.$patch"
    
    # 更新 package.json 中的版本号
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS 使用 sed -i ''
        sed -i '' "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" "$version_file"
    else
        # Linux 使用 sed -i
        sed -i "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" "$version_file"
    fi
    
    echo "版本号已更新: $current_version -> $new_version ($VERSION_BUMP)"
    echo "$new_version"
}

# 递增版本号（如果不是仅部署模式）
if [ "$DEPLOY_MODE" != "deploy-only" ]; then
    echo "=========================================="
    echo "递增版本号..."
    NEW_VERSION=$(increment_version)
    echo "=========================================="
    echo ""
    
    # 如果只是递增版本号（用于构建前），则退出
    if [ "$DEPLOY_MODE" = "bump-only" ]; then
        echo "版本号已递增，退出部署流程（仅递增模式）"
        exit 0
    fi
else
    # 仅部署模式：读取当前版本号
    NEW_VERSION=$(grep -o '"version": "[^"]*"' "package.json" | cut -d'"' -f4)
    echo "跳过版本号递增（仅部署模式）"
    echo "当前版本号: $NEW_VERSION"
    echo ""
fi

# 检查 dist 目录是否存在
if [ ! -d "dist" ]; then
    echo "错误: dist 目录不存在，请先运行构建"
    exit 1
fi

# 检查目标目录是否存在
if [ -d "$DEPLOY_PATH" ]; then
    # 创建备份目录（如果不存在）
    if [ ! -d "$BACKUP_DIR" ]; then
        echo "创建备份目录: $BACKUP_DIR"
        sudo mkdir -p "$BACKUP_DIR"
        sudo chown -R www-data:www-data "$BACKUP_DIR"
        sudo chmod -R 755 "$BACKUP_DIR"
    fi
    
    # 备份现有目录
    echo "正在备份现有部署目录到: $BACKUP_PATH"
    sudo cp -r "$DEPLOY_PATH" "$BACKUP_PATH"
    
    # 清理旧备份（保留最近10个备份）
    echo "清理旧备份（保留最近10个）..."
    sudo ls -t "$BACKUP_DIR"/dist_backup_* 2>/dev/null | tail -n +11 | sudo xargs rm -rf 2>/dev/null || true
    
    echo "备份完成！"
else
    echo "目标目录不存在，跳过备份步骤"
    # 创建目标目录
    echo "创建目标目录: $DEPLOY_PATH"
    sudo mkdir -p "$DEPLOY_PATH"
fi

# 复制文件到目标位置
echo "正在部署文件到 $DEPLOY_PATH..."
sudo cp -r dist/* "$DEPLOY_PATH/"

# 设置文件权限
echo "设置文件权限..."
sudo chown -R www-data:www-data "$DEPLOY_PATH"
sudo chmod -R 755 "$DEPLOY_PATH"

echo ""
echo "=========================================="
echo "部署完成！"
echo "=========================================="
echo "部署路径: $DEPLOY_PATH"
if [ -d "$BACKUP_PATH" ]; then
    echo "备份路径: $BACKUP_PATH"
fi
echo ""
echo "版本信息:"
if [ -f "dist/version.json" ]; then
    cat dist/version.json
else
    echo "警告: 版本信息文件不存在"
fi
echo ""
echo "版本号: $NEW_VERSION"
echo "版本递增类型: $VERSION_BUMP"
echo "=========================================="

