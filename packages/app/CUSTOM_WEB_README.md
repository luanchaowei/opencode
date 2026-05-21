# OpenCode 自定义Web界面部署指南

本文档说明如何使用源码部署自定义的OpenCode Web界面，同时使用全局安装的服务端。

## 架构说明

- **服务端**：使用全局安装的 `opencode-ai` npm包（无需源码）
- **Web前端**：使用源码编译和运行（支持自定义修改）

---

## 一、前置要求

### 1. 安装 Bun（Web前端必需）

```bash
curl -fsSL https://bun.sh/install | bash
```

验证：`bun --version`（需要 1.3.13+）

### 2. 安装 OpenCode 服务端（全局安装）

```bash
npm install -g opencode-ai@latest
```

验证：`opencode --version`

---

## 二、配置参数定义

部署前请先确定以下参数（后续所有命令将使用这些变量）：

| 变量名 | 说明 | 推荐值 |
|--------|------|--------|
| `WORK_DIR` | OpenCode默认工作目录 | `$HOME` 或自定义路径 |
| `WEB_HOST` | Web前端监听地址 | `localhost`（本地）或 `0.0.0.0`（局域网） |
| `WEB_PORT` | Web前端端口 | `3000` |
| `SERVER_HOST` | 服务端监听地址 | `localhost`（本地）或实际IP（局域网） |
| `SERVER_PORT` | 服务端端口 | `4096` |

**示例配置：**

```bash
# 本地开发环境
export WORK_DIR=$HOME
export WEB_HOST=localhost
export WEB_PORT=3000
export SERVER_HOST=localhost
export SERVER_PORT=4096

# 局域网部署环境
export WORK_DIR=/home/yourname
export WEB_HOST=0.0.0.0
export WEB_PORT=3000
export SERVER_HOST=192.168.1.100  # 替换为实际IP
export SERVER_PORT=4096
```

---

## 三、Web前端部署（源码方式）

### 1. 克隆源码

```bash
cd ~/code
git clone https://github.com/anomalyco/opencode.git
cd opencode
```

### 2. 安装依赖

```bash
bun install
```

### 3. 启动Web前端

**使用restart.sh脚本（推荐）：**

```bash
cd ~/code/opencode/packages/app

# 默认配置（自动获取本机IP）
./restart.sh

# 自定义配置
./restart.sh --web-host 192.168.1.100 \
             --web-port 3000 \
             --server-host 10.29.44.204 \
             --server-port 4096 \
             --work-dir /home/yourname \
             --disable-button

# 查看帮助
./restart.sh --help
```

**手动启动：**

```bash
cd ~/code/opencode

# 开发模式
VITE_OPENCODE_DEFAULT_DIR=$WORK_DIR \
bun --cwd packages/app dev --host $WEB_HOST --port $WEB_PORT

# 生产构建
bun --cwd packages/app build

VITE_OPENCODE_DEFAULT_DIR=$WORK_DIR \
bun --cwd packages/app preview --host $WEB_HOST --port $WEB_PORT
```

---

## 四、服务端部署（全局安装）

服务端独立启动，无需源码：

**前台运行：**

```bash
opencode serve \
  --hostname $SERVER_HOST \
  --port $SERVER_PORT \
  --cors http://$WEB_HOST:$WEB_PORT
```

**后台运行：**

```bash
nohup opencode serve \
  --hostname $SERVER_HOST \
  --port $SERVER_PORT \
  --cors http://$WEB_HOST:$WEB_PORT \
  > /tmp/opencode-server.log 2>&1 &
```

查看日志：`tail -f /tmp/opencode-server.log`

---

## 五、完整部署示例

### 示例1：本地开发环境

```bash
# 设置参数
export WORK_DIR=$HOME
export WEB_HOST=localhost
export WEB_PORT=3000
export SERVER_HOST=localhost
export SERVER_PORT=4096

# 终端1: 启动Web前端
cd ~/code/opencode
VITE_OPENCODE_DEFAULT_DIR=$WORK_DIR \
bun --cwd packages/app dev --host $WEB_HOST --port $WEB_PORT

# 终端2: 启动服务端
opencode serve --hostname $SERVER_HOST --port $SERVER_PORT --cors http://$WEB_HOST:$WEB_PORT
```

访问地址：`http://localhost:3000`

### 示例2：局域网部署

```bash
# 设置参数（根据实际情况修改IP）
export WORK_DIR=/home/yourname
export WEB_HOST=0.0.0.0
export WEB_PORT=3000
export SERVER_HOST=192.168.1.100
export SERVER_PORT=4096

# 终端1: 启动Web前端
cd ~/code/opencode
VITE_OPENCODE_DEFAULT_DIR=$WORK_DIR \
bun --cwd packages/app dev --host $WEB_HOST --port $WEB_PORT

# 终端2: 启动服务端（后台）
nohup opencode serve \
  --hostname $SERVER_HOST \
  --port $SERVER_PORT \
  --cors http://$SERVER_HOST:$WEB_PORT \
  > /tmp/opencode-server.log 2>&1 &
```

访问地址：`http://192.168.1.100:3000`

---

## 六、restart.sh 脚本说明

脚本位置：`packages/app/restart.sh`

**功能：**
- 自动停止旧的Web进程
- 自动获取本机IP（智能过滤docker网桥等虚拟网卡）
- 启动新的Web前端服务

**参数说明：**

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--web-host <ip>` | Web前端监听地址 | 自动获取本机IP |
| `--web-port <port>` | Web前端端口 | 3000 |
| `--server-host <ip>` | 服务端地址 | 自动获取本机IP |
| `--server-port <port>` | 服务端端口 | 4096 |
| `--work-dir <dir>` | 工作目录 | $HOME |
| `--disable-button` | 禁用特定按钮 | false |
| `--help` | 显示帮助信息 | - |

**使用示例：**

```bash
# 本地开发
./restart.sh

# 局域网部署
./restart.sh --web-host 0.0.0.0 --server-host 192.168.1.100

# 完整自定义配置
./restart.sh \
  --web-host 192.168.1.100 \
  --web-port 3000 \
  --server-host 10.29.44.204 \
  --server-port 4098 \
  --work-dir /home/agent \
  --disable-button
```

---

## 七、其他配置

### 禁用特定按钮

使用 `--disable-button` 参数：

```bash
./restart.sh --disable-button
```

### 自定义服务端地址

如果Web和服务端不在同一主机：

```bash
./restart.sh --server-host remote-server-ip
```

---

## 八、服务端参数说明

```bash
opencode serve [选项]

选项：
  --hostname <host>  监听地址（默认：localhost）
  --port <port>      监听端口（默认：4096）
  --cors <origin>    CORS源（默认：http://localhost:3000）
```

---

## 相关链接

- [OpenCode 官网](https://opencode.ai)
- [GitHub 仓库](https://github.com/anomalyco/opencode)
- [Discord 社区](https://discord.gg/opencode)