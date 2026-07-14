# Coding Agent Harness

> AI4SE 大作业项目 · A · Coding Agent Harness
>
> *Spec-Driven, Subagent-Built, Human-Owned.*

一个"考试教练型"编码智能体控制中枢：给 LLM 布置编程任务，用确定性 pytest 测试用例评判其输出，将失败信号结构化回灌驱动自我修正，直到全绿或达到重试上限。

## 项目简介

**Agent = LLM + Harness**。LLM 负责"决定下一步做什么"，harness 负责其余一切工程：组织上下文、调用 LLM、解析动作、分发执行、治理拦截、反馈回灌、停机判断。

本项目自己实现了完整的 harness 内核（主循环、工具分发、治理护栏、反馈闭环、记忆存储），不依赖 LangChain AgentExecutor、AutoGen 等现成 agent 框架。所有核心机制可用 Mock LLM 做确定性单元测试，移除 LLM 后仍有大量可独立验证的工程。

### 六大维度

| 维度 | 模块 | 核心文件 |
|------|------|----------|
| 决策 | Agent Loop | `src/agent/agent-loop.ts` |
| 工具 | Tool Router + Docker Exec | `src/tools/tool-router.ts`, `src/tools/docker-exec.ts` |
| 记忆 | Memory Store (SQLite) | `src/memory/memory-store.ts` |
| 治理 | Guardrail + HITL | `src/guardrail/guardrail.ts`, `src/guardrail/hitl-state-machine.ts` |
| 反馈（重点维度） | Feedback Parser + Classifier + Compressor + Repetition Detector + Context Assembler | `src/feedback/*.ts` |
| 配置 | Config Loader | `src/config/config-loader.ts` |

### 反馈闭环（主要贡献）

反馈闭环是本项目的重点深入维度，包含 5 个确定性纯函数：

1. **parseTestResult** — 解析 pytest JSON report，提取通过/失败数、失败详情
2. **classifyFailure** — 分类失败类型（COMPILE_ERROR / ASSERTION_ERROR / TIMEOUT / IMPORT_ERROR / RUNTIME_ERROR）
3. **compressHistory** — 将多轮历史压缩为 token 受限的摘要
4. **detectRepetition** — 检测连续 N 轮相同失败模式，防止无限循环
5. **assembleContext** — 组装最终发给 LLM 的上下文

## 安装

### 前置条件

- Node.js 20+
- Docker（用于容器化代码执行）
- Python 3 + pytest（Docker 镜像内已包含）

### 从源码运行

```bash
git clone <repo-url>
cd harness_project
npm install
```

## 运行

### 开发模式

```bash
npm run dev
```

### 构建 + 运行

```bash
npm run build
node dist/index.js
```

浏览器访问 `http://localhost:3000`。

### 首次配置 API Key

```bash
node dist/index.js --setup
```

按提示输入 API key（隐藏输入，不回显明文）。key 存储在 OS keychain 中（macOS Keychain / Windows Credential Manager / Linux Secret Service）。

如果在 Docker 容器中运行（无 keychain），通过环境变量配置：

```bash
docker run -e OPENAI_API_KEY=sk-xxxx -p 3000:3000 harness-python:latest
```

### 运行测试

```bash
npm test        # 运行全部测试
npm run lint    # TypeScript 类型检查
```

## 分发

### Docker 镜像

```bash
docker build -t harness-python:latest .
docker run -d -p 3000:3000 -e OPENAI_API_KEY=sk-xxxx harness-python:latest
```

浏览器访问 `http://localhost:3000`。

### 已知限制

- **Docker socket 依赖**：容器内执行代码需要 Docker daemon，挂载 `/var/run/docker.sock` 等于赋予容器 root 权限。建议在 CI/专用机器上运行。
- **keytar 依赖**：Docker alpine 镜像中无 libsecret，keytar 不可用。容器中通过 `OPENAI_API_KEY` 环境变量配置。
- **单任务串行**：MVP 不支持并发任务，一次运行一个编程任务。
- **Python only**：当前仅支持 Python + pytest。架构上可扩展，但 Feedback Parser 需为每种语言实现。

## 目录结构

```
harness_project/
├── src/
│   ├── agent/
│   │   ├── action-parser.ts       # LLM JSON 输出解析
│   │   └── agent-loop.ts           # 主循环（核心）
│   ├── config/
│   │   └── config-loader.ts        # YAML 配置加载
│   ├── credentials/
│   │   └── credential-manager.ts   # OS keychain 凭据管理
│   ├── event-bus/
│   │   └── event-bus.ts            # 类型安全事件总线
│   ├── feedback/                   # 反馈闭环（重点维度）
│   │   ├── context-assembler.ts    # 上下文组装
│   │   ├── failure-classifier.ts   # 失败分类
│   │   ├── feedback-parser.ts      # pytest JSON 解析
│   │   ├── history-compressor.ts   # 历史压缩
│   │   └── repetition-detector.ts   # 重复检测
│   ├── guardrail/
│   │   ├── guardrail.ts            # 危险动作拦截
│   │   └── hitl-state-machine.ts   # 人工审批状态机
│   ├── llm/
│   │   ├── llm-adapter.ts          # LLM 抽象接口
│   │   ├── mock-llm.ts             # 确定性 Mock LLM
│   │   └── openai-adapter.ts       # OpenAI 兼容适配器
│   ├── memory/
│   │   └── memory-store.ts         # SQLite 持久化
│   ├── server/
│   │   ├── frontend/               # 前端 SPA
│   │   │   ├── index.html
│   │   │   ├── app.js
│   │   │   └── style.css
│   │   └── webui-server.ts         # WebSocket + HTTP 服务器
│   ├── tools/
│   │   ├── docker-exec.ts          # Docker 容器管理
│   │   └── tool-router.ts          # 动作分发
│   ├── index.ts                    # 入口文件
│   └── types.ts                   # 共享类型定义
├── tests/                          # 测试文件（19 个，85 个用例）
├── config.yaml                     # 默认配置
├── Dockerfile                      # 多阶段 Docker 构建
├── .gitlab-ci.yml                  # GitLab CI 配置
├── .github/workflows/ci.yml        # GitHub Actions CI 配置
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── SPEC.md                         # 设计文档
├── PLAN.md                         # 实现计划（23 个 TDD task）
├── SPEC_PROCESS.md                 # 规约过程文档
├── AGENT_LOG.md                    # 开发过程日志
└── req.md                          # 课程要求
```

## 安全边界

### 凭据安全

- API key **绝不硬编码**进源码、**绝不提交**进 Git、**绝不写入日志**。
- 首选存储：OS keychain（keytar），key 在 keychain 中加密存储。
- Docker 回退：`OPENAI_API_KEY` 环境变量（明文，进程环境可见，仅用于容器化部署）。
- 查看状态时脱敏显示（前 6 + 后 5 字符，中间用 `*` 替代）。
- `.gitignore` 排除 `auth.json`、`*.env`、`*.enc`。

### 代码执行隔离

- AI 生成的代码在 Docker 容器中执行，与宿主机隔离。
- 每个任务新建容器，不复用。
- 容器无网络访问（默认）。
- 工作目录限制在 `/workspace` 下。

### 危险动作拦截

- `rm -rf /`、`git push --force` 等命令**硬拦截**（BLOCK）。
- `sudo`、`chmod -R`、`curl | sh` 等命令**需人工审批**（REQUIRE_APPROVAL）。
- 路径遍历（`../etc/passwd`）被拦截。
- 写入系统目录（`/etc/`、`C:\Windows\`）被拦截。

## CI/CD

### GitLab CI

`.gitlab-ci.yml` 包含两个 job：

- `unit-test`：安装依赖 → `tsc --noEmit` → `vitest run`
- `docker-build`：构建 Docker 镜像（仅 main 分支）

### GitHub Actions

`.github/workflows/ci.yml` 包含等效的 workflow。

## 技术选型

| 选择 | 理由 |
|------|------|
| TypeScript | 类型安全，Node.js 生态丰富，与 Superpowers 工具链一致 |
| better-sqlite3 | 同步 API，无需 Promise 开销，适合单进程 |
| dockerode | Node.js 最成熟的 Docker 客户端 |
| ws | 轻量 WebSocket 实现 |
| keytar | 跨平台 OS keychain 访问 |
| vitest | 快速、零配置、与 TypeScript 原生集成 |
| OpenAI 兼容 API | 可接入任意兼容供应商（DeepSeek、OpenAI 等） |

## 第三方依赖

| 依赖 | 许可证 | 用途 |
|------|--------|------|
| better-sqlite3 | MIT | SQLite 数据库 |
| dockerode | Apache-2.0 | Docker 客户端 |
| js-yaml | MIT | YAML 解析 |
| keytar | MIT | OS keychain |
| openai | Apache-2.0 | LLM API 客户端 |
| ws | MIT | WebSocket |
| vitest | MIT | 测试框架 |
| typescript | Apache-2.0 | 类型系统 |
| tsx | MIT | TypeScript 执行 |
