# prina-cmd

prina-cmd 是一个命令行工具，用于拉取和管理 AI 配置文件和规则。

## 功能特性

- **ai-pull**: 从 GitHub 仓库拉取 AI 配置文件和规则
- **help**: 显示帮助信息
- **v**: 查看版本信息

## 安装

```bash
npm install
```

## 使用

### 全局安装（推荐）

```bash
npm link
```

安装后，可以在任何目录使用 `prina-cmd` 命令。

### 本地使用

```bash
node bin/command.js <command>
```

## 命令说明

### help

显示帮助信息：

```bash
prina-cmd help
```

### ai-pull

拉取 AI 配置文件和规则：

```bash
prina-cmd ai-pull
```

此命令会：
1. 从 `https://github.com/liumengjian/ai-skills.git` 的 `main` 分支拉取代码
2. 复制 `.ai` 文件夹到当前项目
3. 更新 Cursor 编辑器的 user rules（SQLite 数据库）
4. 检查并更新 `.gitignore` 文件

### v

查看版本信息：

```bash
prina-cmd v
```

## 依赖

- `better-sqlite3`: 用于操作 SQLite 数据库
- `chalk`: 用于终端颜色输出
- `commander`: 用于命令行参数解析

## 注意事项

1. 执行 `ai-pull` 命令时，请确保已安装 Git
2. 更新 Cursor user rules 时，建议先关闭 Cursor 编辑器
3. 如果数据库被锁定，请关闭 Cursor 编辑器后重试

## License

MIT
