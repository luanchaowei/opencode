#!/bin/bash

set -e

# 默认值
WEB_PORT=3000
SERVER_PORT=4096
WORK_DIR=$HOME
WEB_HOST=""
SERVER_HOST=""
DISABLE_BUTTON=false

# 帮助信息
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "重启OpenCode Web前端服务"
    echo ""
    echo "Options:"
    echo "  --web-host <ip>       Web前端监听地址（默认：自动获取本机IP）"
    echo "  --web-port <port>     Web前端端口（默认：3000）"
    echo "  --server-host <ip>    OpenCode服务端地址（默认：自动获取本机IP）"
    echo "  --server-port <port>  OpenCode服务端端口（默认：4096）"
    echo "  --work-dir <dir>      OpenCode工作目录（默认：$HOME）"
    echo "  --disable-button      禁用特定按钮"
    echo "  --help                显示帮助信息"
    echo ""
    echo "Examples:"
    echo "  $0                              # 使用默认配置"
    echo "  $0 --web-host 192.168.1.100     # 指定Web前端地址"
    echo "  $0 --server-host 10.29.44.204 --server-port 4098"
    echo "  $0 --disable-button --work-dir /home/agent"
}

# 获取本机主要网卡IP（排除docker网桥、虚拟网卡等）
get_local_ip() {
    local ip_list=$(hostname -I | tr ' ' '\n')
    
    # 优先选择常见局域网IP段（192.168.x.x）
    local ip=$(echo "$ip_list" | grep '^192\.168\.' | head -1)
    
    # 如果没有，尝试10.x.x.x（排除docker网桥10.0.x.x）
    if [ -z "$ip" ]; then
        ip=$(echo "$ip_list" | grep '^10\.' | grep -v '^10\.0\.' | head -1)
    fi
    
    # 如果没有，选择其他非127和docker网桥的IP
    if [ -z "$ip" ]; then
        ip=$(echo "$ip_list" | grep -v '^127\.' | grep -v '^172\.17\.' | grep -v '^10\.0\.' | head -1)
    fi
    
    # 最后兜底：127.0.0.1
    if [ -z "$ip" ]; then
        ip="127.0.0.1"
    fi
    
    echo "$ip"
}

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --web-host)
            WEB_HOST="$2"
            shift 2
            ;;
        --web-port)
            WEB_PORT="$2"
            shift 2
            ;;
        --server-host)
            SERVER_HOST="$2"
            shift 2
            ;;
        --server-port)
            SERVER_PORT="$2"
            shift 2
            ;;
        --work-dir)
            WORK_DIR="$2"
            shift 2
            ;;
        --disable-button)
            DISABLE_BUTTON=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "未知参数: $1"
            show_help
            exit 1
            ;;
    esac
done

# 设置默认值（如果未传入参数）
if [ -z "$WEB_HOST" ]; then
    WEB_HOST=$(get_local_ip)
fi

if [ -z "$SERVER_HOST" ]; then
    SERVER_HOST=$(get_local_ip)
fi

echo "配置信息："
echo "  Web前端地址: $WEB_HOST:$WEB_PORT"
echo "  服务端地址: $SERVER_HOST:$SERVER_PORT"
echo "  工作目录: $WORK_DIR"
echo "  禁用按钮: $DISABLE_BUTTON"

# 停止旧进程（通过端口号匹配）
pids=$(ps aux | grep "bun.*packages/app" | grep "$WEB_PORT" | grep -v grep | awk '{print $2}')

if [ -z "$pids" ]; then
    echo "未找到运行中的Web进程"
else
    echo "找到进程PID: $pids"
    kill -9 $pids
    echo "进程已终止"
fi

# 进入源码目录
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR/../.."

# 启动Web前端
export VITE_OPENCODE_SERVER_HOST=$SERVER_HOST
export VITE_OPENCODE_SERVER_PORT=$SERVER_PORT
export VITE_OPENCODE_DEFAULT_DIR=$WORK_DIR

if [ "$DISABLE_BUTTON" = true ]; then
    export VITE_DISABLE_BUTTON=true
fi

echo "启动Web前端..."
nohup bun --cwd packages/app dev --host $WEB_HOST --port $WEB_PORT > /tmp/opencode-web.log 2>&1 &

sleep 2
echo "Web前端已启动，日志: /tmp/opencode-web.log"
echo "访问地址: http://$WEB_HOST:$WEB_PORT"