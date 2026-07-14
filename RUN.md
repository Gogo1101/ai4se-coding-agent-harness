# 运行指南

## 前置条件

- Docker Desktop 已安装并运行
- Node.js 已安装

## 步骤

### 1. 启动 Docker Desktop

打开 Docker Desktop，等左下角变成绿色 "Engine running"。

### 2. 构建 Python 执行镜像（只需做一次）

打开 PowerShell：

```powershell
cd D:\Codes\harness_project
docker build -t harness-python:latest .
```

等 2-3 分钟，看到 `Successfully tagged harness-python:latest` 即可。

### 3. 构建项目

```powershell
npm run build
```

### 4. 设置 API Key 并启动

```powershell
$env:OPENAI_API_KEY = "sk-your-api-key-here"
node dist/index.js
```

看到 `Harness running on http://localhost:3000` 就成功了。

### 5. 打开浏览器

访问 http://localhost:3000

- 输入编程任务（如 "Implement a stack with push, pop, peek methods"）
- 粘贴 pytest 测试代码
- 点 Start
- 实时观察 agent 动作

## 常见问题

| 问题 | 解决 |
|------|------|
| docker build 失败 | 确保 Docker Desktop 在运行 |
| No API key found | 重新执行第 4 步设置环境变量 |
| 端口 3000 被占用 | 编辑 src/index.ts 第 61 行改端口 |
| 提交任务后卡住 | Docker 容器创建中，等几秒；报错则检查 Docker |
