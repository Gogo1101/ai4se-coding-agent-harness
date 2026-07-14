# REFLECTION.md — 反思报告

> **声明**：本报告由学生本人撰写，使用 AI 辅助润色语言表达，核心观点、案例选择与批判性判断均为本人独立完成。

---

## 1. 哪些 Superpowers 技能发挥了最大作用

### 对用户最有价值的技能

**subagent-driven-development（SDD）** 是发挥最大作用的技能。作为项目开发者，我最大的收益在于：它让我从一个"写代码的人"变成了一个"派发任务、评审结果、决定修复方向"的管理者。23 个 task 各派发一个 implementer subagent + 一个 reviewer subagent，我只需要在 reviewer 报告 Critical issue 时介入修复。整个 3.5 小时的开发过程中，52 个 subagent 调用完成了 85 个测试用例和全部源码，而我的人工干预集中在 6 次修复派发上。这种"人只做判断和决策"的模式，让我能在不写一行实现代码的情况下掌控整个项目。

**test-driven-development（TDD）** 技能的强制红-绿-重构循环，让我在评审 subagent 输出时有了客观标准：不是"代码看起来对不对"，而是"测试是否先红后绿"。Task 5（Guardrail）的路径遍历漏洞就是在 TDD 框架下被发现的——reviewer 检查到 `path.startsWith('.')` 允许 `../etc/passwd` 通过，这不是测试覆盖的问题，而是 TDD 要求的"先写失败测试"让安全边界被显式定义。

**brainstorming** 技能在规约阶段的价值在于它**主动追问**。它不是被动等待指令，而是提出了 9 个关键问题（目标语言、LLM 供应商、重点维度、是否需要 WebUI、凭据方案、分发形态、HITL 需求、防循环机制、实现边界），每个问题都迫使我澄清了原本模糊的设计。特别是 Q3（重点维度选择）直接决定了反馈闭环被拆分为 5 个纯函数的架构决策。

### "形式大于实质"的技能

**using-git-worktrees** 在我的项目中形式大于实质。要求文档强调每个 worktree 对应一个 PR，但实际开发中，23 个 task 在同一个 master 分支上串行推进，没有使用 worktree 隔离。原因是：task 之间存在强依赖（Task 17 依赖 Task 1-16 的全部产出），并行 worktree 会导致合并冲突。对于这种线性依赖的项目，worktree 的隔离价值不如串行 commit。

**finishing-a-development-branch** 也偏形式化。由于没有使用 worktree 和 PR 工作流，这个技能的"merge / PR / 保留 / 丢弃"决策没有实际触发点。

---

## 2. TDD 强制在 AI 协作下是阻碍还是放大器

TDD 是**放大器**，但有代价。

**放大的一面**：TDD 让 subagent 的输出有了客观判定标准。reviewer 不需要判断"代码质量好不好"，只需要验证"测试是否先红后绿、重构是否保持绿色"。这把主观的代码评审变成了可量化的检查。Task 17（Agent Loop）的 HITL 拒绝路径漏洞——拒绝后仍然执行动作——就是在 TDD 框架下被发现的：reviewer 检查到 HITL 拒绝路径没有测试，进而发现控制流本身是错的。

**代价的一面**：TDD 的"先红"要求在跨 task 依赖场景下会产生摩擦。Task 1 创建的 `fixtures.ts` 中 `rawReport` 字段值为空字符串，但 Task 7 的 `parseTestResult` 实现输出 `JSON.stringify(report)`。这个不一致在 Task 1 的测试中不可见（因为 Task 1 不调用 parser），到 Task 7 才暴露。TDD 保证了每个 task 内部红-绿-重构，但无法保证跨 task 的隐含假设一致性。

**结论**：TDD 在单 task 粒度是放大器，在跨 task 集成层需要补充人工评审。

---

## 3. subagent-driven 工作流让智能体能自主运行多久而不偏离

在我的项目中，subagent 的自主运行时间呈递减趋势：

- **Task 1-6**（基础模块）：subagent 完全自主，0 次人工干预。每个 task 在 5-10 分钟内完成，无偏离。
- **Task 7-16**（核心机制）：开始出现内部矛盾。Task 7 的 `rawReport` 不一致、Task 14 的 dockerode 类型不匹配、Task 16 的 maskKey 与测试不一致——这些都是 subagent 在实现时发现并修复的，但修复方向需要我确认。
- **Task 17-23**（集成与部署）：偏离频率显著上升。Task 17 的 HITL 拒绝路径漏洞、Task 21 的 4 个 Critical 问题（目录不存在、前端未复制、keytar 不可用、Docker build 未执行）——这些在 subagent 的测试中不可见，需要 reviewer 和人工介入。

**规律**：subagent 在"实现单一模块"时偏离率低（0%），在"集成多个模块"时偏离率上升（43%）。原因是：集成任务涉及跨模块的隐含假设，而这些假设在 PLAN.md 中没有显式写明。subagent 只能依据 plan 文本工作，无法发现 plan 未提及的依赖关系。

---

## 4. 什么样的 task 颗粒度最优

**最优颗粒度：一个 task = 一个模块 + 一个测试文件，2-5 个测试用例。**

Task 8（Failure Classifier）和 Task 9（History Compressor）是最顺滑的 task：各 1 个源文件 + 1 个测试文件 + 4-6 个测试用例，subagent 一次通过，0 偏离。

**过细的 task**：Task 7-11 将反馈闭环拆分为 5 个纯函数，虽然每个都独立可测，但 Task 1 的 fixture 与 Task 7 的 parser 之间的不一致说明：拆得太细会导致跨 task 的隐含假设无法在单 task 评审中发现。

**过粗的 task**：Task 17（Agent Loop）和 Task 21（Dockerfile + Entry Point）是最粗的 task，也是偏离最多的。Task 17 涉及 agent loop + HITL + 重复检测 + error 事件 + parseAction 回退，5 个关注点挤在一个 task 里，reviewer 发现了 2 个 Critical + 2 个 Important。Task 21 涉及入口文件 + Dockerfile + .dockerignore + API 路由 + --setup，4 个 Critical 问题。

**结论**：最优颗粒度是"一个模块 + 一个测试文件"，集成任务应该进一步拆分。

---

## 5. SPEC / PLAN 质量如何影响实现质量

### 具体案例：规约不清导致 subagent 偏离

**案例 1：测试文件无法找到 solution.py 中的函数（实现阶段发现）**

SPEC 和 PLAN 中没有说明测试文件如何导入用户代码。LLM 将代码写入 `solution.py`，但测试文件 `test_auto_xxx.py` 中没有 `from solution import *`，导致 `NameError: name 'binary_search' is not defined`。这个问题的根因是：SPEC 的"领域与机制设计"一节没有定义"测试文件与解决方案文件之间的导入关系"这一关键约定。subagent（和 LLM 本身）无法从 plan 中推断出这个约定，导致 5 轮重试全部失败。

修复方式：在 agent-loop.ts 中，写入测试文件时自动在文件顶部添加 `from solution import *`。这个修复是在实际运行测试时发现的，而非在 spec/plan 评审阶段。

**案例 2：pytest 发现规则不匹配 `test.py` 文件名**

PLAN 中 pytest 命令使用默认发现规则（`test_*.py`），但用户在前端提交测试文件时可以留空文件名，系统自动生成 `test_auto_<timestamp>.py`。然而，如果用户手动输入 `test.py`（不带下划线），pytest 默认不会发现它。这个问题的根因是：SPEC 没有定义"测试文件命名约定"，PLAN 中的 pytest 命令也没有覆盖默认发现规则。

修复方式：在 pytest 命令中添加 `--override-ini="python_files=test*.py"`。

**案例 3：API Key 页面按钮无响应**

PLAN 中前端 `app.js` 的代码包含了 TypeScript 语法 `(e as Error).message`，这在浏览器中是非法语法，导致整个 JS 文件加载失败，所有按钮都无法响应。这个问题的根因是：PLAN 中的代码片段没有经过 `tsc --noEmit` 验证，brainstorming 阶段产出的代码直接被 subagent 照搬。

修复方式：将 `(e as Error).message` 改为 `e.message`。

**案例 4：反馈解析器显示 "Unknown error"**

Feedback Parser 的 `extractFailure` 函数期望 `longrepr` 是一个对象（有 `reprcrash` 和 `reprtraceback` 属性），但实际 pytest JSON report 中 `longrepr` 是一个字符串。这导致所有失败信息都显示为 "Unknown error"。根因是：SPEC 中定义的 `PytestTestEntry` 接口与实际 pytest 输出格式不匹配——SPEC 是基于假设写的，没有用真实 pytest 输出验证。

修复方式：重写 `extractFailure` 函数，支持 `longrepr` 为字符串、`crash.message` 字段、`traceback` 数组三种来源。

**总结**：以上 4 个案例都是在实现阶段（甚至运行时测试阶段）才发现的，而非在 spec/plan 评审阶段。这说明 SPEC 和 PLAN 的质量直接影响实现效率——每处规约不清都导致了一轮完整的"发现问题 → 定位根因 → 修复 → 验证"循环，平均消耗 15-30 分钟。

---

## 6. 最有效的 prompt / context 策略

**最有效的策略：系统提示中的"一步一轮"工作流约束。**

初始系统提示只列出了可用动作（write_file, run_tests），没有规定执行顺序。LLM 在第一轮写文件后，第二轮又写文件（而非运行测试），导致测试永远不被执行。

修复后的系统提示明确规定了工作流：
```
CRITICAL WORKFLOW (one action per round):
- Round 1: write_file to create solution.py
- Round 2: run_tests to check if it passes
- Round 3+: if tests failed, write_file to fix solution.py, then next round run_tests again
```

**为什么有效**：LLM 的决策质量高度依赖上下文中的约束强度。"你可以做 A 或 B"远不如"第一轮做 A，第二轮做 B"有效。显式的顺序约束消除了 LLM 的决策歧义，将 agent 从"随机选择动作"变为"按流程执行"。

**第二有效的策略：在 agent-loop.ts 中，write_file 后自动触发 run_tests。** 这不是 prompt 策略，而是代码策略——不信任 LLM 会主动选择 run_tests，直接在代码层强制执行。这比在提示词中写"写完文件后请运行测试"更可靠。

---

## 7. 凭据与分发这两条工程要求，迫使我想清楚了哪些原本会忽略的问题

### 凭据管理

1. **keytar 在 Docker 中不可用**：开发时 keytar 在本地工作正常，但 Docker alpine 镜像缺少 libsecret/gnome-keyring 依赖。这迫使我想清楚：凭据存储必须有降级方案（文件回退 + 环境变量回退），不能假设目标环境有 OS keychain。

2. **API key 泄露在 RUN.md 中**：我在运行指南中直接写了真实 API key 用于方便测试，忘记这是会被提交到 git 的文件。这迫使我想清楚：**任何包含 key 的文件都必须在 .gitignore 中，或使用占位符**。最终通过 `git filter-branch` 清除了历史中的 key。

3. **状态显示的优先级问题**：API Key 页面需要同时显示 env 变量和文件存储的 key，但运行时优先使用哪个？这迫使我想清楚：env 是部署时配置的，文件是用户通过 WebUI 配置的，两者可能同时存在，需要明确优先级和显示策略。

### 分发

1. **Docker 镜像必须包含完整运行环境**：初始 Dockerfile 只装了 Node.js，但运行时需要 Python + pytest + docker-cli。这迫使我想清楚：分发镜像不是"把我的代码打包"，而是"构建一个别人 pull 下来就能跑的完整环境"。

2. **前端静态文件必须 COPY 到镜像中**：初始 Dockerfile 没有复制 `src/server/frontend/` 到 `dist/server/frontend/`，导致 WebUI 404。这迫使我想清楚：TypeScript 编译只处理 .ts 文件，HTML/CSS/JS 需要额外的 copy 步骤。

3. **CI 必须包含 docker-build job**：仅跑单元测试不够，还需要验证 Dockerfile 能成功构建。这迫使我想清楚：CI 不是"跑一下测试"，而是"验证整个交付流程可重现"。

---

## 8. 如果重做我会改变什么

1. **冷启动验证要真正做**：这次冷启动验证是事后模拟的。如果真正用一个不同类型的 agent 在实现前试跑 1-2 个 task，至少能提前发现"测试文件导入约定缺失"和"pytest 发现规则不匹配"这两个问题，节省 2-3 小时的调试时间。

2. **集成任务要拆分**：Task 17（Agent Loop）和 Task 21（Dockerfile + Entry Point）应该拆成更小的 task。Task 17 应拆为"agent loop 主循环" + "HITL 集成" + "error 事件"三个 task；Task 21 应拆为"入口文件" + "Dockerfile" + "API 路由"三个 task。

3. **PLAN 中的代码要先用 tsc 验证**：PLAN.md 中包含大量 TypeScript 代码片段，但从未通过 `tsc --noEmit` 验证。dockerode 类型不匹配、`(e as Error)` 语法错误、maskKey 与测试不一致——这些问题在 plan 阶段就能发现。

4. **使用 PR 工作流**：这次全部直推 master，没有 PR。如果重做，至少集成任务（Task 17、21）应该走 PR + review 流程，让 reviewer 在合并前检查。

5. **前端应该用框架**：纯 HTML/CSS/JS 的前端在功能扩展时维护成本高（每次改 app.js 都要手动复制到 dist/）。如果重做，至少用 Vite + React，获得热重载和自动构建。

---

## 9. 对 Superpowers 方法论的批判

### 它假设了什么

1. **假设 task 之间是松耦合的**：Superpowers 的 worktree + PR 模型假设每个 task 可以独立开发、独立评审、独立合并。但我的项目中 23 个 task 存在强线性依赖（Task 17 依赖 Task 1-16），worktree 隔离的价值无法发挥。

2. **假设 plan 中的代码是可编译的**：SDD 流程让 subagent 照搬 plan 中的代码，但 plan 是在 brainstorming 阶段写的，没有经过编译验证。这导致 subagent 花大量时间修复类型不匹配和语法错误，而非实现业务逻辑。

3. **假设 LLM 会遵循提示词中的指令**：系统提示要求 LLM "写完文件后运行测试"，但 LLM 经常不遵循。Superpowers 没有提供"代码层强制执行流程"的指导——这是我自己在 agent-loop.ts 中实现的 auto-run-tests-after-write 机制。

4. **假设冷启动验证可以在实现前完成**：实际上，很多 spec 缺陷只有在运行时才暴露（如 pytest 发现规则、测试文件导入、Docker exec 流格式）。冷启动验证能发现接口契约层面的缺陷，但无法发现运行时行为缺陷。

### 这些假设在我的项目里成立吗

- 假设 1（松耦合）：**不成立**。线性依赖链使 worktree 失效。
- 假设 2（plan 可编译）：**不成立**。至少 4 处类型/语法错误在实现阶段才修复。
- 假设 3（LLM 遵循指令）：**部分成立**。LLM 遵循了"写 solution.py"的指令，但没有遵循"写完后运行测试"的指令，需要代码层强制。
- 假设 4（冷启动有效）：**部分成立**。冷启动能发现接口契约缺陷（6 处），但无法发现运行时行为缺陷（4 处）。

### 总结

Superpowers 的核心价值在于：它用流程脚手架守住了 TDD、评审、计划这些在 AI 协作中容易松懈的纪律。但它的局限在于：它假设了 task 松耦合、plan 可编译、LLM 可靠遵循指令——这些假设在真实项目中并不总是成立。一个更完善的版本应该包含"plan 编译验证"步骤、"集成任务拆分"指导和"代码层流程强制"模式。
