# OpenCode Web 和 Shell 界面完整请求路径详细对比文档

---

## 一、Shell 界面完整调用链路

### 1. 命令行入口阶段

#### 1.1 用户输入接收
**文件**: `/packages/opencode/src/index.ts`

**步骤**:
1. **行号 57**: `const args = hideBin(process.argv)` - 获取命令行参数数组
2. **行号 69**: `const cli = yargs(args)` - 创建 yargs CLI 解析器
   - `.parserConfiguration({ "populate--": true })` - 配置解析器
   - `.scriptName("opencode")` - 设置脚本名称
   - `.wrap(100)` - 设置宽度
   - `.help("help", "show help")` - 添加帮助选项
3. **行号 161**: `.command(RunCommand)` - 注册 `run` 命令
4. **行号 202**: `await cli.parse()` - 解析并执行命令

#### 1.2 RunCommand 定义和选项配置
**文件**: `/packages/opencode/src/cli/cmd/run.ts`

**步骤**:
1. **行号 213**: `export const RunCommand = cmd({ command: "run [message..]", ... })` - 定义命令
2. **行号 216-301**: `builder()` 函数 - 配置命令选项
   - **行号 218-222**: `positional("message", ...)` - 消息位置参数
   - **行号 224-227**: `option("command", ...)` - 命令选项
   - **行号 228-232**: `option("continue", ...)` - 继续会话选项
   - **行号 246-250**: `option("model", ...)` - 模型选项
   - **行号 251-254**: `option("agent", ...)` - Agent 选项
   - **行号 261-266**: `option("file", ...)` - 文件附件选项
   - **行号 271-274**: `option("attach", ...)` - 远程连接选项
   - 其他选项...

#### 1.3 Handler 函数执行
**文件**: `/packages/opencode/src/cli/cmd/run.ts`

**步骤**:
1. **行号 303**: `handler: async (args) => { ... }` - 处理器函数开始
2. **行号 304-306**: 拼接消息参数：
   ```typescript
   let message = [...args.message, ...(args["--"] || [])]
     .map((arg) => (arg.includes(" ") ? `"${arg.replace(/"/g, '\\"')}"` : arg))
     .join(" ")
   ```
3. **行号 308-318**: 处理目录参数（`args.dir`）
4. **行号 320-340**: 处理文件附件：
   - 遍历 `args.file` 数组
   - **行号 325**: `const resolvedPath = path.resolve(process.cwd(), filePath)` - 解析文件路径
   - **行号 326**: `await Filesystem.exists(resolvedPath)` - 检查文件是否存在
   - **行号 331**: `await Filesystem.isDir(resolvedPath)` - 判断是否为目录
   - **行号 333-338**: 创建文件对象并推入 `files` 数组
5. **行号 342**: `if (!process.stdin.isTTY) message += "\n" + (await Bun.stdin.text())` - 读取 stdin 输入

---

### 2. SDK 客户端创建阶段

#### 2.1 创建 SDK 客户端（attach 模式）
**文件**: `/packages/opencode/src/cli/cmd/run.ts`

**步骤**:
1. **行号 660**: `if (args.attach) { ... }` - 判断是否为远程连接模式
2. **行号 661-667**: 构建 Basic Auth headers：
   ```typescript
   const headers = (() => {
     const password = args.password ?? process.env.OPENCODE_SERVER_PASSWORD
     if (!password) return undefined
     const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode"
     const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
     return { Authorization: auth }
   })()
   ```
3. **行号 668**: 调用 `createOpencodeClient({ baseUrl: args.attach, directory, headers })`
4. **行号 669**: `return await execute(sdk)` - 执行业务逻辑

#### 2.2 创建 SDK 客户端（本地模式）
**文件**: `/packages/opencode/src/cli/cmd/run.ts`

**步骤**:
1. **行号 672**: `await bootstrap(process.cwd(), async () => { ... })` - 启动本地服务
2. **行号 673-676**: 创建内部 fetch 函数：
   ```typescript
   const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
     const request = new Request(input, init)
     return Server.Default().app.fetch(request)  // 关键：直接调用 Server 的 Hono app
   }) as typeof globalThis.fetch
   ```
3. **行号 677**: `createOpencodeClient({ baseUrl: "http://opencode.internal", fetch: fetchFn })`

#### 2.3 createOpencodeClient 详细过程
**文件**: `/packages/sdk/js/src/v2/client.ts`

**步骤**:
1. **行号 46**: `export function createOpencodeClient(config?) { ... }` - 函数入口
2. **行号 47-56**: 设置默认 fetch：
   ```typescript
   if (!config?.fetch) {
     const customFetch: any = (req: any) => {
       req.timeout = false
       return fetch(req)  // 使用全局 fetch
     }
     config = { ...config, fetch: customFetch }
   }
   ```
3. **行号 59-71**: 设置请求 headers：
   - **行号 59-64**: 设置 directory header
   - **行号 66-71**: 设置 workspace header
4. **行号 73**: `const client = createClient(config)` - 创建基础 HTTP 客户端
5. **行号 74-79**: 添加请求拦截器：
   ```typescript
   client.interceptors.request.use((request) =>
     rewrite(request, {
       directory: config?.directory,
       workspace: config?.experimental_workspaceID,
     }),
   )
   ```
   - **行号 16-44**: `rewrite()` 函数实现 - 将 GET/HEAD 请求的 directory/workspace 从 headers 移到查询参数

6. **行号 80-86**: 添加响应拦截器 - 检查 Content-Type
7. **行号 87**: `return new OpencodeClient({ client })` - 返回最终客户端

#### 2.4 createClient 详细过程
**文件**: `/packages/sdk/js/src/v2/gen/client/client.gen.ts`

**步骤**:
1. **行号 22**: `export const createClient = (config: Config = {}): Client => { ... }` - 函数入口
2. **行号 23-29**: 合并配置：
   ```typescript
   let _config = mergeConfigs(createConfig(), config)
   const getConfig = () => ({ ..._config })
   const setConfig = (config: Config) => { _config = mergeConfigs(_config, config); return getConfig() }
   ```
3. **行号 32**: `const interceptors = createInterceptors()` - 创建拦截器系统
4. **行号 34-66**: `beforeRequest()` 函数 - 准备请求：
   - **行号 35-41**: 合并配置和 headers
   - **行号 43-48**: 设置 auth 参数（如果有 security）
   - **行号 54-56**: 序列化 body
   - **行号 63**: `const url = buildUrl(opts)` - 构建完整 URL
5. **行号 68-233**: `request()` 函数 - 执行请求（见下节）

---

### 3. HTTP 请求执行阶段

#### 3.1 HTTP 请求执行核心
**文件**: `/packages/sdk/js/src/v2/gen/client/client.gen.ts`

**步骤**:
1. **行号 68**: `const request: Client["request"] = async (options) => { ... }` - 请求函数
2. **行号 70**: `const { opts, url } = await beforeRequest(options)` - 准备请求
3. **行号 71-75**: 构建 Request 对象：
   ```typescript
   const requestInit: ReqInit = {
     redirect: "follow",
     ...opts,
     body: getValidRequestBody(opts),
   }
   ```
4. **行号 77**: `let request = new Request(url, requestInit)` - 创建 Request
5. **行号 79-83**: 应用请求拦截器：
   ```typescript
   for (const fn of interceptors.request.fns) {
     if (fn) request = await fn(request, opts)
   }
   ```
6. **行号 87**: `const _fetch = opts.fetch!` - 获取 fetch 函数
7. **行号 91**: **关键**: `response = await _fetch(request)` - 执行 HTTP 请求
   - Shell attach 模式：通过网络发送到远程服务器
   - Shell 本地模式：调用 `Server.Default().app.fetch(request)` - 直接进入 Hono app
8. **行号 118-122**: 应用响应拦截器：
   ```typescript
   for (const fn of interceptors.response.fns) {
     if (fn) response = await fn(response, request, opts)
   }
   ```
9. **行号 129-199**: 解析响应：
   - **行号 131**: 获取 Content-Type
   - **行号 162-182**: 根据类型解析数据（arrayBuffer、blob、formData、text、json、stream）

---

### 4. 服务器路由处理阶段（Shell 本地模式）

#### 4.1 Server.Default() 创建
**文件**: `/packages/opencode/src/server/server.ts`

**步骤**:
1. **行号 37**: `export const Default = lazy(() => create({}))` - 懒加载创建 Server
2. **行号 39**: `function create(opts) { ... }` - 创建函数
3. **行号 40**: `const app = new Hono()` - 创建 Hono app
4. **行号 41-46**: 添加中间件：
   - `.onError(ErrorMiddleware)` - 错误处理
   - `.use(AuthMiddleware)` - 认证
   - `.use(LoggerMiddleware)` - 日志
   - `.use(CompressionMiddleware)` - 压缩
   - `.use(CorsMiddleware(opts))` - CORS
   - `.route("/global", GlobalRoutes())` - 全局路由
5. **行号 79-82**: 注册实例路由：
   - `.route("/", ControlPlaneRoutes())`
   - `.route("/", InstanceRoutes(runtime.upgradeWebSocket))` - **关键：Session 路由**
   - `.route("/", UIRoutes())`

#### 4.2 InstanceRoutes 注册
**文件**: `/packages/opencode/src/server/routes/instance/index.ts`

**步骤**:
1. **行号 41**: `export const InstanceRoutes = (upgrade: UpgradeWebSocket): Hono => { ... }`
2. **行号 42**: `const app = new Hono()` - 创建 Hono app
3. **行号 102-394**: 注册各种路由（session、file、mcp 等）

#### 4.3 Session 路由处理
**文件**: `/packages/opencode/src/server/routes/instance/session.ts`

**步骤**:
1. **行号 842**: `.post("/:sessionID/message", ...)` - POST 端点定义
2. **行号 865-871**: 验证参数：
   ```typescript
   validator("param", z.object({ sessionID: SessionID.zod })),
   validator("json", zodObject(SessionPrompt.PromptInput).omit({ sessionID: true })),
   ```
3. **行号 873-874**: 设置响应状态和 headers：
   ```typescript
   c.status(200)
   c.header("Content-Type", "application/json")
   ```
4. **行号 875**: `return stream(c, async (stream) => { ... })` - **关键：开始流式响应**
5. **行号 876-877**: 获取参数：
   ```typescript
   const sessionID = c.req.valid("param").sessionID
   const body = c.req.valid("json")
   ```
6. **行号 878-884**: 调用核心业务逻辑：
   ```typescript
   const msg = await runRequest(
     "SessionRoutes.prompt",
     c,
     SessionPrompt.Service.use((svc) =>
       svc.prompt({ ...body, sessionID } as unknown as SessionPrompt.PromptInput),
     ),
   )
   ```
7. **行号 885**: `void stream.write(JSON.stringify(msg))` - 写入流式响应

---

### 5. 会话管理阶段

#### 5.1 创建/获取会话
**文件**: `/packages/opencode/src/cli/cmd/run.ts`

**步骤**:
1. **行号 378-391**: `session()` 函数：
   - **行号 379**: `await sdk.session.list()` - 获取会话列表（如果 args.continue）
   - **行号 381-383**: `await sdk.session.fork({ sessionID: baseID })` - Fork 会话
   - **行号 388-390**: `await sdk.session.create({ title, permission })` - 创建新会话
2. **行号 627**: `const sessionID = await session(sdk)` - 获取 sessionID
3. **行号 632**: `await share(sdk, sessionID)` - 分享会话（可选）

---

### 6. 发送提示词阶段

#### 6.1 发送请求
**文件**: `/packages/opencode/src/cli/cmd/run.ts`

**步骤**:
1. **行号 639**: `if (args.command) { ... } else { ... }` - 判断是命令还是消息
2. **行号 640-647**: 发送命令：
   ```typescript
   await sdk.session.command({
     sessionID,
     agent,
     model: args.model,
     command: args.command,
     arguments: message,
     variant: args.variant,
   })
   ```
3. **行号 648-657**: 发送普通消息：
   ```typescript
   const model = args.model ? Provider.parseModel(args.model) : undefined
   await sdk.session.prompt({
     sessionID,
     agent,
     model,
     variant: args.variant,
     parts: [...files, { type: "text", text: message }],
   })
   ```
4. SDK 方法调用流程：
   - `sdk.session.prompt()` → OpencodeClient 实例方法
   - → SDK 生成的 client 方法（见 `/packages/sdk/js/src/v2/gen/sdk.gen.ts`）
   - → `client.post()` → `request()` → `fetch()` → 服务器路由

---

### 7. 核心业务逻辑处理阶段

#### 7.1 SessionPrompt.prompt() 方法
**文件**: `/packages/opencode/src/session/prompt.ts`

**步骤**:
1. **行号 1242**: `const prompt: (input: PromptInput) => Effect.Effect<MessageV2.WithParts> = ...`
2. **行号 1244**: `const session = yield* sessions.get(input.sessionID)` - 获取会话信息
3. **行号 1245**: `yield* revert.cleanup(session)` - 清理 revert 状态
4. **行号 1246**: **关键调用**: `yield* createUserMessage(input)` - 创建用户消息（见下节）
5. **行号 1247**: `yield* sessions.touch(input.sessionID)` - 更新会话时间
6. **行号 1258**: `if (input.noReply === true) return message` - 如果不需要回复，返回
7. **行号 1259**: **关键调用**: `yield* loop({ sessionID: input.sessionID })` - 进入循环处理

#### 7.2 createUserMessage() 详细过程
**文件**: `/packages/opencode/src/session/prompt.ts`

**步骤**:
1. **行号 887**: `const createUserMessage = Effect.fn("SessionPrompt.createUserMessage")(function* (input) { ... })`
2. **行号 888-896**: 解析 agent 配置：
   - **行号 888**: `const agentName = input.agent || (yield* agents.defaultAgent())`
   - **行号 889**: `const ag = yield* agents.get(agentName)`
   - 错误处理：如果 agent 不存在，发布错误事件
3. **行号 898-905**: 解析 model 和 variant：
   - **行号 898**: `const model = input.model ?? ag.model ?? (yield* lastModel(input.sessionID))`
   - **行号 904**: `const variant = input.variant ?? ...`
4. **行号 906-920**: 创建用户消息 Info 对象：
   ```typescript
   const info: MessageV2.User = {
     id: input.messageID ?? MessageID.ascending(),
     role: "user",
     sessionID: input.sessionID,
     time: { created: Date.now() },
     tools: input.tools,
     agent: ag.name,
     model: { providerID: model.providerID, modelID: model.modelID, variant },
     system: input.system,
     format: input.format,
   }
   ```
5. **行号 930-1194**: **关键**: `resolvePart()` 函数 - 解析消息部分：
   - **行号 933-985**: 处理文件类型（MCP 资源）
   - **行号 986-1172**: 处理本地文件：
     - **行号 1014-1029**: 获取 Read 工具实例
     - **行号 1031-1107**: 文本文件：调用 Read 工具读取内容
     - **行号 1110-1147**: 目录：调用 Read 工具读取目录列表
   - **行号 1175-1191**: 处理 agent 类型
   - **行号 1193**: 处理文本类型
6. **行号 1196-1198**: 并发处理所有 parts：
   ```typescript
   const parts = yield* Effect.forEach(input.parts, resolvePart, { concurrency: "unbounded" })
     .pipe(Effect.map((x) => x.flat().map(assign)))
   ```
7. **行号 1236-1237**: 存储消息和 parts：
   ```typescript
   yield* sessions.updateMessage(info)
   for (const part of parts) yield* sessions.updatePart(part)
   ```
8. **返回**: `{ info, parts }`

#### 7.3 loop() 方法
**文件**: `/packages/opencode/src/session/prompt.ts`

**步骤**:
1. **行号 1501**: `const loop: (input: LoopInput) => Effect.Effect<MessageV2.WithParts> = ...`
2. **行号 1504**: `yield* state.ensureRunning(sessionID, lastAssistant(sessionID), runLoop(sessionID))` - 确保会话正在运行

#### 7.4 runLoop() 详细过程（核心循环）
**文件**: `/packages/opencode/src/session/prompt.ts`

**步骤**:
1. **行号 1271**: `const runLoop = Effect.fn("SessionPrompt.run")(function* (sessionID) { ... })`
2. **行号 1273-1276**: 初始化：
   - 获取 InstanceState context
   - 初始化 step 计数器
   - 获取 session
3. **行号 1279**: `while (true) { ... }` - **开始主循环**
4. **行号 1280**: `yield* status.set(sessionID, { type: "busy" })` - 设置状态为 busy
5. **行号 1283**: `yield* MessageV2.filterCompactedEffect(sessionID)` - 获取消息历史（过滤已压缩消息）
6. **行号 1285-1297**: 查找最后的 user、assistant、finished 消息和 tasks
7. **行号 1311-1319**: 检查是否应该退出循环
8. **行号 1322-1328**: 第一次循环时生成标题（fork）
9. **行号 1330**: `yield* getModel(...)` - 获取模型配置
10. **行号 1333-1336**: 处理 subtask：`yield* handleSubtask({ task, model, ... })`
11. **行号 1338-1348**: 处理 compaction：`yield* compaction.process(...)`
12. **行号 1350-1357**: 检查是否需要自动 compaction
13. **行号 1359-1366**: 获取 agent 配置
14. **行号 1368-1369**: 计算 maxSteps 和 isLastStep
15. **行号 1370**: `yield* insertReminders({ messages: msgs, agent, session })` - 插入提醒消息
16. **行号 1371-1386**: 创建 assistant 消息对象：
   ```typescript
   const msg: MessageV2.Assistant = {
     id: MessageID.ascending(),
     parentID: lastUser.id,
     role: "assistant",
     mode: agent.name,
     agent: agent.name,
     ...
   }
   ```
17. **行号 1387**: `yield* sessions.updateMessage(msg)` - 存储消息
18. **行号 1388-1391**: **关键调用**: `yield* processor.create({ assistantMessage: msg, sessionID, model })` - 创建处理器
19. **行号 1393-1491**: 主处理逻辑（见下节）

#### 7.5 resolveTools() 详细过程
**文件**: `/packages/opencode/src/session/prompt.ts`

**步骤**:
1. **行号 358**: `const resolveTools = Effect.fn("SessionPrompt.resolveTools")(function* (input) { ... })`
2. **行号 368-403**: 创建工具上下文函数 `context()`：
   - 包含 sessionID、abort、messageID、callID、metadata、ask 等
3. **行号 405-446**: 注册内置工具：
   - **行号 405**: `yield* registry.tools(...)` - 获取所有工具
   - **行号 411-445**: 创建 AI SDK tool 对象：
     - **行号 414**: `execute(args, options)` 函数定义
     - **行号 418-422**: 触发 plugin 事件
     - **行号 423**: **关键**: `yield* item.execute(args, ctx)` - 执行工具
     - **行号 424-436**: 处理结果和 attachments
4. **行号 448-524**: 注册 MCP 工具：
   - **行号 448**: `yield* mcp.tools()` - 获取 MCP 工具
   - **行号 455-521**: 创建 MCP 工具执行器
5. **行号 526**: `return tools` - 返回工具字典

---

### 8. Processor 处理阶段

#### 8.1 processor.create() 详细过程
**文件**: `/packages/opencode/src/session/processor.ts`

**步骤**:
1. **行号 108**: `const create = Effect.fn("SessionProcessor.create")(function* (input: Input) { ... })`
2. **行号 112**: `const initialSnapshot = yield* snapshot.track()` - 捕获初始快照
3. **行号 113-124**: 初始化 ProcessorContext：
   - assistantMessage、sessionID、model、toolcalls、snapshot 等
4. **行号 134-138**: 定义 `settleToolCall()` - 完成 tool call
5. **行号 140-153**: 定义 `readToolCall()` - 读取 tool call
6. **行号 155-169**: 定义 `updateToolCall()` - 更新 tool call
7. **行号 171-195**: 定义 `completeToolCall()` - 完成 tool call
8. **行号 197-214**: 定义 `failToolCall()` - 标记 tool call 失败
9. **行号 216-461**: 定义 `handleEvent()` - 处理 LLM 流事件（见下节）
10. **行号 463-521**: 定义 `cleanup()` - 清理资源
11. **行号 523-537**: 定义 `halt()` - 处理错误
12. **行号 539-588**: 定义 `process()` - 处理 LLM 流（见下节）
13. **行号 590-597**: 返回 Handle 对象：
   ```typescript
   return {
     get message() { return ctx.assistantMessage },
     updateToolCall,
     completeToolCall,
     process,
   }
   ```

#### 8.2 handleEvent() 详细过程（处理 LLM 流事件）
**文件**: `/packages/opencode/src/session/processor.ts`

**步骤**:
1. **行号 216**: `const handleEvent = Effect.fnUntraced(function* (value: StreamEvent) { ... })`
2. **行号 217**: `switch (value.type) { ... }` - 根据事件类型处理
3. **行号 218-220**: `case "start"`：设置状态为 busy
4. **行号 222-234**: `case "reasoning-start"`：创建 reasoning part
5. **行号 236-247**: `case "reasoning-delta"`：更新 reasoning 文本增量
6. **行号 249-257**: `case "reasoning-end"`：完成 reasoning part
7. **行号 259-279**: `case "tool-input-start"`：创建 tool part（pending 状态）
8. **行号 287-331**: `case "tool-call"`：
   - **行号 291-303**: 更新 tool call 状态为 running
   - **行号 305-330**: 检测 doom loop（重复工具调用）
9. **行号 333-336**: `case "tool-result"`：完成 tool call
10. **行号 338-341**: `case "tool-error"`：标记 tool call 失败
11. **行号 343-344**: `case "error"`：抛出错误
12. **行号 346-355**: `case "start-step"`：创建 step-start part，记录 snapshot
13. **行号 357-404**: `case "finish-step"`：
   - **行号 358-365**: 计算使用量和成本
   - **行号 366-376**: 创建 step-finish part
   - **行号 377-390**: 创建 patch part（如果有文件变化）
   - **行号 391-396**: fork summary 任务
   - **行号 398-402**: 检查是否需要 compaction
14. **行号 406-417**: `case "text-start"`：创建 text part
15. **行号 419-430**: `case "text-delta"`：更新文本增量
16. **行号 432-452**: `case "text-end"`：完成 text part，应用插件转换

#### 8.3 process() 详细过程（处理 LLM 流）
**文件**: `/packages/opencode/src/session/processor.ts`

**步骤**:
1. **行号 539**: `const process = Effect.fn("SessionProcessor.process")(function* (streamInput: LLM.StreamInput) { ... })`
2. **行号 541-542**: 初始化 needsCompaction 和 shouldBreak
3. **行号 544-587**: Effect.gen() 内部逻辑：
4. **行号 548**: **关键调用**: `const stream = llm.stream(streamInput)` - 获取 LLM 流（见 LLM 章节）
5. **行号 550-554**: 处理流：
   ```typescript
   yield* stream.pipe(
     Stream.tap((event) => handleEvent(event)),  // 处理每个事件
     Stream.takeUntil(() => ctx.needsCompaction),  // 直到需要 compaction
     Stream.runDrain,  // 流式处理
   )
   ```
6. **行号 555-582**: 错误处理和清理：
   - **行号 556-563**: onInterrupt：标记 aborted，调用 halt
   - **行号 564-567**: catchCause：处理非中断错误
   - **行号 568-579**: retry 策略
   - **行号 580**: catch(halt)
   - **行号 581**: ensuring(cleanup())
7. **行号 584-587**: 返回结果：compact、stop、continue

---

### 9. LLM 服务调用阶段

#### 9.1 llm.stream() 方法
**文件**: `/packages/opencode/src/session/llm.ts`

**步骤**:
1. **行号 415**: `const stream: Interface["stream"] = (input) => ...`
2. **行号 416-428**: Stream.scoped() 内部：
   - **行号 419-421**: 创建 AbortController（acquireRelease）
   - **行号 424**: **关键调用**: `yield* run({ ...input, abort: ctrl.signal })` - 调用 run() 方法
   - **行号 426**: `Stream.fromAsyncIterable(result.fullStream, ...)` - 将 fullStream 转换为 Effect Stream

#### 9.2 run() 方法详细过程（核心 LLM 调用）
**文件**: `/packages/opencode/src/session/llm.ts`

**步骤**:
1. **行号 72**: `const run = Effect.fn("LLM.run")(function* (input: StreamRequest) { ... })`
2. **行号 73-84**: 初始化日志和标签
3. **行号 86-94**: 并发获取关键组件：
   - **行号 88**: **关键调用**: `provider.getLanguage(input.model)` - 获取语言模型实例（见 Provider 章节）
   - **行号 89**: `config.get()` - 获取配置
   - **行号 90**: `provider.getProvider(input.model.providerID)` - 获取提供商信息
   - **行号 91**: `auth.get(input.model.providerID)` - 获取认证信息
4. **行号 99-124**: 构建系统提示：
   - agent prompt、provider prompt、自定义 prompt、用户 prompt
   - **行号 114-118**: 触发 plugin 事件转换 system prompt
5. **行号 126-142**: 计算 variant 和 options
6. **行号 147-160**: 构建消息数组：
   - 对于 OpenAI OAuth 和 Workflow：特殊处理
   - 其他：添加 system messages + user messages
7. **行号 162-180**: 触发 plugin 事件，获取 chat params
8. **行号 182-194**: 触发 plugin 事件，获取 headers
9. **行号 196**: `resolveTools(input)` - 解析可用工具
10. **行号 204-228**: LiteLLM proxy 特殊处理：添加 dummy tool
11. **行号 233-315**: GitLab Workflow model 特殊处理：
   - 设置 toolExecutor、approvalHandler 等
12. **行号 317-331**: OpenTelemetry tracer 设置
13. **行号 333-412**: **关键**: `streamText()` 调用 - AI SDK 核心函数：
   ```typescript
   return streamText({
     onError(error) { ... },
     experimental_repairToolCall(failed) { ... },
     temperature: params.temperature,
     topP: params.topP,
     topK: params.topK,
     providerOptions: ...,
     activeTools: Object.keys(tools),
     tools,  // 工具字典
     toolChoice: input.toolChoice,
     maxOutputTokens: params.maxOutputTokens,
     abortSignal: input.abort,
     headers: { ... },  // 包含 session affinity 等
     maxRetries: input.retries ?? 0,
     messages,  // 消息数组
     model: wrapLanguageModel({ model: language, middleware: [...] }),  // 语言模型
     experimental_telemetry: { ... },  // 遥测配置
   })
   ```

---

### 10. Provider 服务调用阶段

#### 10.1 provider.getLanguage() 方法
**文件**: `/packages/opencode/src/provider/provider.ts`

**步骤**:
1. **行号 1548**: `const getLanguage = Effect.fn("Provider.getLanguage")(function* (model: Model) { ... })`
2. **行号 1549**: `const s = yield* InstanceState.get(state)` - 获取状态
3. **行号 1550**: `const envs = yield* env.all()` - 获取环境变量
4. **行号 1551**: `const key = `${model.providerID}/${model.id}`` - 构建缓存 key
5. **行号 1552**: `if (s.models.has(key)) return s.models.get(key)!` - 如果已缓存，返回
6. **行号 1554-1578**: Effect.promise() 异步加载：
   - **行号 1555**: `const provider = s.providers[model.providerID]`
   - **行号 1556**: **关键调用**: `const sdk = await resolveSDK(model, s, envs)` - 解析 SDK（见下节）
   - **行号 1559-1564**: 获取 language model：
     - 如果有自定义 loader：`await s.modelLoaders[model.providerID](sdk, model.api.id, ...)`
     - 否则：`sdk.languageModel(model.api.id)`
   - **行号 1565**: `s.models.set(key, language)` - 缓存
   - **行号 1566**: `return language` - 返回

#### 10.2 resolveSDK() 详细过程
**文件**: `/packages/opencode/src/provider/provider.ts`

**步骤**:
1. **行号 1386**: `async function resolveSDK(model: Model, s: State, envs: Record<string, string | undefined>) { ... }`
2. **行号 1391**: `const provider = s.providers[model.providerID]` - 获取 provider
3. **行号 1392**: `const options = { ...provider.options }` - 初始化 options
4. **行号 1402-1421**: 处理 baseURL：
   - 从 options 或 model.api.url 获取
   - 应用 varsLoaders 变量替换
   - 替换环境变量占位符
5. **行号 1423-1429**: 设置 options：
   - baseURL、apiKey、headers
6. **行号 1431-1437**: 计算缓存 key
7. **行号 1438-1439**: 检查缓存，如果已存在则返回
8. **行号 1445-1482**: 创建自定义 fetch 函数：
   - 处理 chunkTimeout、timeout
   - 应用 wrapSSE (SSE 超时处理)
9. **行号 1484-1497**: 如果是 bundled provider：
   - **行号 1490**: `const factory = await bundledLoader()` - 加载工厂函数
   - **行号 1491-1494**: `const loaded = factory({ name: model.providerID, ...options })` - 创建 SDK
   - **行号 1495**: `s.sdk.set(key, loaded)` - 缓存
10. **行号 1500-1520**: 如果是外部 provider：
   - **行号 1501**: `const item = await Npm.add(model.api.npm)` - 安装 npm 包
   - **行号 1512**: `const mod = await import(importSpec)` - 动态导入
   - **行号 1514-1518**: 创建 SDK 实例

---

### 11. Tool 执行阶段

#### 11.1 Read 工具示例
**文件**: `/packages/opencode/src/tool/read.ts`

**步骤**:
1. **行号 36**: `export const ReadTool = Tool.define("read", Effect.gen(function* () { ... }))`
2. **行号 151-285**: `run()` 函数定义 - 主要执行逻辑：
   - **行号 159-165**: 解析和规范化 filepath
   - **行号 168-173**: 获取文件 stat
   - **行号 175-178**: 权限检查（`yield* assertExternalDirectoryEffect(ctx, filepath, ...)`)
   - **行号 180-185**: 权限请求（`yield* ctx.ask({ permission: "read", ... })`)
   - **行号 189-215**: 目录处理：列出文件并返回
   - **行号 217-270**: 文件处理：
     - **行号 218**: `yield* readSample(filepath, ...)` - 读取样本字节
     - **行号 220**: 检查 MIME 类型
     - **行号 222-240**: 图片/PDF：读取并返回 base64
     - **行号 246-247**: 普通文本：调用 `lines()` 函数读取行
     - **行号 270**: `yield* warm(filepath)` - 预热 LSP
   - **行号 276-284**: 返回结果：{ title, output, metadata }

#### 11.2 Bash 工具示例
**文件**: `/packages/opencode/src/tool/bash.ts`

**步骤**:
1. **行号 327**: `export const BashTool = Tool.define("bash", Effect.gen(function* () { ... }))`
2. **行号 408-565**: `run()` 函数定义 - 主要执行逻辑：
   - **行号 419-426**: 初始化限制和缓冲区
   - **行号 431-436**: 设置初始 metadata
   - **行号 438-516**: Effect.scoped() 执行命令：
     - **行号 440**: **关键**: `yield* spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env))` - 启动子进程
     - **行号 442-489**: 监听输出流并更新 metadata
     - **行号 500-514**: 处理 exit、abort、timeout
   - **行号 554-564**: 返回结果：{ title, metadata, output }

---

### 12. 事件订阅和输出阶段

#### 12.1 事件订阅
**文件**: `/packages/opencode/src/cli/cmd/run.ts`

**步骤**:
1. **行号 437**: `const events = await sdk.event.subscribe()` - 订阅事件流
2. **行号 634**: `loop().catch(...)` - 启动事件循环
3. **行号 440-561**: `loop()` 函数：
   - **行号 443**: `for await (const event of events.stream)` - 迭代事件流
   - 处理各种事件类型并显示输出

#### 12.2 事件流服务器端实现
**文件**: `/packages/opencode/src/server/routes/instance/event.ts`

**步骤**:
1. **行号 12**: `export const EventRoutes = () => new Hono().get("/event", ...)` - SSE 端点
2. **行号 39**: `return streamSSE(c, async (stream) => { ... })` - SSE 流式响应
3. **行号 40-48**: 创建 AsyncQueue 并发送连接事件
4. **行号 69-74**: `const unsub = Bus.subscribeAll((event) => { q.push(JSON.stringify(event)) })` - **关键：订阅所有 Bus 事件**
5. **行号 78-82**: 迭代队列并发送 SSE 事件：
   ```typescript
   for await (const data of q) {
     if (data === null) return
     await stream.writeSSE({ data })
   }
   ```

#### 12.3 Bus 事件系统
**文件**: `/packages/opencode/src/bus/index.ts`

**步骤**:
1. **行号 80-101**: `publish()` 函数 - 发布事件：
   - **行号 82**: `const s = yield* InstanceState.get(state)` - 获取状态
   - **行号 86-88**: 发布到 typed 和 wildcard PubSub
   - **行号 94-99**: `GlobalBus.emit("event", { directory, project, workspace, payload })` - 发送到全局事件总线
2. **行号 103-112**: `subscribe()` 函数 - 订阅特定类型事件
3. **行号 114-122**: `subscribeAll()` 函数 - 订阅所有事件
4. **行号 176-178**: `export async function publish<D extends BusEvent.Definition>(def: D, properties: BusProperties<D>) { ... }` - 同步发布函数

---

## 二、Web 界面完整调用链路

### 1. 浏览器应用初始化阶段

#### 1.1 应用入口
**文件**: `/packages/app/src/app.tsx`

**步骤**:
1. **行号 135-157**: `AppBaseProviders()` - 基础上下文提供者：
   - MetaProvider、ThemeProvider、LanguageProvider、ErrorBoundary、DialogProvider、MarkedProvider、FileComponentProvider
2. **行号 282-317**: `AppInterface()` - 主要应用接口：
   - **行号 290-294**: `<ServerProvider>` - 服务器连接提供者
   - **行号 295**: `<ConnectionGate>` - 连接检查和加载状态
   - **行号 297-312**: 其他上下文提供者链：
     - `<QueryProvider>` - React Query 客户端
     - `<GlobalSDKProvider>` - **关键：全局 SDK 客户端**
     - `<GlobalSyncProvider>` - 全局同步状态
     - `<Router>` - SolidJS 路由器

#### 1.2 ServerProvider 初始化
**文件**: `/packages/app/src/context/server.tsx`

**步骤**:
1. **行号 95-303**: `ServerProvider` 上下文定义
2. **行号 104-111**: 创建持久化存储状态
3. **行号 115-136**: `allServers()` - 获取所有服务器列表
4. **行号 138-141**: 创建活动状态：active server 和健康状态
5. **行号 145-168**: `startHealthPolling()` - 启动健康检查轮询：
   - **行号 149-160**: `run()` 函数 - 执行健康检查
   - **行号 163**: `const interval = setInterval(run, HEALTH_POLL_INTERVAL_MS)` - 定时轮询
6. **行号 205-215**: 监听当前服务器变化，启动健康检查

#### 1.3 ConnectionGate 健康检查
**文件**: `/packages/app/src/app.tsx`

**步骤**:
1. **行号 160-224**: `ConnectionGate()` 函数
2. **行号 168-185**: 启动健康检查资源（带超时）：
   ```typescript
   const [startupHealthCheck, healthCheckActions] = createResource(() =>
     Effect.gen(function* () {
       if (!server.current) return true
       const { http, type } = server.current
       while (true) {
         const res = yield* Effect.promise(() => checkServerHealth(http))
         if (res.healthy) return true
         if (checkMode() === "background" || type === "http") return false
       }
     }).pipe(...)
   )
   ```
3. **行号 187-222**: 显示加载或连接错误状态

---

### 2. GlobalSDKProvider 初始化阶段

#### 2.1 GlobalSDKProvider 上下文创建
**文件**: `/packages/app/src/context/global-sdk.tsx`

**步骤**:
1. **行号 16**: `GlobalSDKProvider` 上下文定义
2. **行号 19-22**: 获取依赖上下文：language、server、platform
3. **行号 24-33**: 确定 event fetch 方式：
   - 判断是否为 localhost 或 loopback
   - 使用 platform.fetch 或 webview fetch
4. **行号 35-42**: 创建 event SDK 客户端：
   ```typescript
   const eventSdk = createSdkForServer({
     server: currentServer.http,
     signal: abort.signal,
     fetch: eventFetch,
   })
   ```
5. **行号 127-208**: `start()` 函数 - 启动事件流订阅：
   - **行号 130-207**: 事件流循环
   - **行号 140-152**: `eventSdk.global.event()` - 获取事件流（SSE 客户端）
   - **行号 155-184**: 处理事件流迭代：
     - **行号 158-162**: 提取 directory 和 payload
     - **行号 165-178**: 事件合并和去重
     - **行号 179**: 将事件推入队列
     - **行号 181-183**: 定期 yield 防止阻塞
6. **行号 231-235**: 创建主 SDK 客户端：
   ```typescript
   const sdk = createSdkForServer({
     server: server.current.http,
     fetch: platform.fetch,
     throwOnError: true,
   })
   ```

#### 2.2 createSdkForServer 函数
**文件**: `/packages/app/src/utils/server.ts`

**步骤**:
1. **行号 4**: `export function createSdkForServer({ server, ...config }) { ... }`
2. **行号 10-15**: 构建 Basic Auth headers（如果有密码）
3. **行号 17-24**: 调用 `createOpencodeClient({ baseUrl: server.url, headers: auth })` - 创建 OpenCode 客户端

---

### 3. 用户输入组件阶段

#### 3.1 PromptInput 组件
**文件**: `/packages/app/src/components/prompt-input.tsx`

**步骤**:
1. **行号 105**: `export const PromptInput: Component<PromptInputProps> = (props) => { ... }` - 组件定义
2. **行号 106-119**: 获取上下文：
   - sdk、device、sync、local、files、prompt、layout、comments、dialog、providers、command、permission、language、platform
3. **行号 260-276**: 创建组件状态：
   - popover、historyIndex、savedPrompt、placeholder、draggingType、mode
4. **行号 289-361**: 计算派生状态：
   - commentCount、blank、stopping、placeholder、contextItems

#### 3.2 Prompt 上下文管理
**文件**: `/packages/app/src/context/prompt.tsx`

**步骤**:
1. **行号 9-38**: 定义 Prompt 类型：
   - TextPart、FileAttachmentPart、AgentPart、ImageAttachmentPart
2. **行号 227-297**: `PromptProvider` 上下文：
   - **行号 276**: `const session = createMemo(() => load(params.dir!, params.id))` - 加载会话状态
   - **行号 279-295**: 返回 prompt 接口：
     - current()、cursor()、dirty()、context.items()、set()、reset()

---

### 4. 提交消息阶段

#### 4.1 提交逻辑（handleSubmit）
**文件**: `/packages/app/src/components/prompt-input/submit.ts`

**步骤**:
1. **行号 204**: `export function createPromptSubmit(input: PromptSubmitInput) { ... }` - 创建提交函数
2. **行号 289-578**: `handleSubmit()` 函数：
   - **行号 293**: `const text = currentPrompt.map(...).join("")` - 提取文本
   - **行号 295-300**: 验证输入非空
   - **行号 302-305**: 获取当前 model 和 agent
   - **行号 317-362**: 处理新会话创建：
     - **行号 326-346**: 创建 worktree（如果需要）
     - **行号 352-358**: 创建新 client（如果 sessionDirectory 不同）
     - **行号 365-382**: 创建新 session：
       - **行号 365**: `await client.session.create()` - **关键：调用 SDK 创建会话**
       - **行号 376**: `seed(sessionDirectory, created)` - 种子会话数据
       - **行号 381**: `navigate(...)` - 导航到新会话页面
   - **行号 392-406**: 构建 draft 对象：
     ```typescript
     const draft: FollowupDraft = {
       sessionID: session.id,
       sessionDirectory,
       prompt: currentPrompt,
       context,
       agent,
       model,
       variant,
     }
     ```
   - **行号 455-486**: 处理命令（如果以 `/` 开头）
   - **行号 557-577**: **关键调用**: `void sendFollowupDraft({ ... })` - 发送消息（见下节）

#### 4.2 sendFollowupDraft 函数详细过程
**文件**: `/packages/app/src/components/prompt-input/submit.ts`

**步骤**:
1. **行号 53**: `export async function sendFollowupDraft(input: FollowupSendInput) { ... }`
2. **行号 54-55**: 提取文本和图片
3. **行号 74-104**: 如果是命令：
   - **行号 84-98**: **关键调用**: `await input.client.session.command({ sessionID, command, arguments, agent, model, variant, parts })` - 发送命令
4. **行号 106-124**: 构建消息和 parts：
   - **行号 107-115**: `buildRequestParts()` - 构建请求 parts
   - **行号 117-124**: 创建 message 对象
5. **行号 126-143**: 添加乐观更新（optimistic update）
6. **行号 155-162**: **关键调用**: `await input.client.session.promptAsync({ sessionID, agent, model, messageID, parts, variant })` - 发送消息

---

### 5. SDK 客户端调用阶段

#### 5.1 SDK 客户端创建和调用
**文件**: `/packages/app/src/context/sdk.tsx`

**步骤**:
1. **行号 11-49**: `SDKProvider` 上下文定义
2. **行号 17-22**: 创建 client memo：
   ```typescript
   const client = createMemo(() =>
     globalSDK.createClient({
       directory: directory(),
       throwOnError: true,
     }),
   )
   ```
3. **行号 26-31**: 订阅事件：
   ```typescript
   createEffect(() => {
     const unsub = globalSDK.event.on(directory(), (event) => {
       emitter.emit(event.type, event)
     })
     onCleanup(unsub)
   })
   ```

---

### 6. HTTP 请求到服务器阶段（与 Shell 共享）

从 SDK client 发起的 HTTP 请求流程与 Shell 完全相同，见上文"三、HTTP 请求层"章节。

**关键汇聚点**：SDK client 调用 → HTTP fetch → Server 路由处理 → SessionPrompt.prompt()

---

## 三、关键汇聚点总结

从以下位置开始，Web 和 Shell 使用**完全相同**的代码路径：

| 层次 | 文件路径 | 行号 | 描述 | 函数调用链 |
|------|---------|------|------|-----------|
| **HTTP 请求执行** | `/packages/sdk/js/src/v2/gen/client/client.gen.ts` | `91` | `response = await _fetch(request)` | → Server.app.fetch() (Shell本地) 或 网络请求 (Web/Shell远程) |
| **Server 路由入口** | `/packages/opencode/src/server/routes/instance/session.ts` | `875` | `stream(c, async (stream) => { ... })` | → runRequest() → SessionPrompt.Service.use() |
| **业务逻辑入口** | `/packages/opencode/src/session/prompt.ts` | `1242` | `prompt()` 函数定义 | → createUserMessage() → loop() |
| **消息创建** | `/packages/opencode/src/session/prompt.ts` | `887-1240` | `createUserMessage()` 函数 | → resolvePart() → Read工具 (如果附件是文件) |
| **主循环** | `/packages/opencode/src/session/prompt.ts` | `1271-1499` | `runLoop()` 函数 | → processor.create() → resolveTools() → handle.process() |
| **工具解析** | `/packages/opencode/src/session/prompt.ts` | `358-527` | `resolveTools()` 函数 | → registry.tools() → Tool.init() → tool.execute() |
| **Processor 创建** | `/packages/opencode/src/session/processor.ts` | `108-598` | `create()` 函数 | → 返回 Handle 对象 { message, updateToolCall, completeToolCall, process } |
| **LLM 流处理** | `/packages/opencode/src/session/processor.ts` | `539-588` | `process()` 函数 | → llm.stream() → Stream.tap(handleEvent) |
| **LLM 调用** | `/packages/opencode/src/session/llm.ts` | `333-412` | `streamText()` 调用 | → AI SDK 核心 API |
| **Provider 调用** | `/packages/opencode/src/provider/provider.ts` | `1548-1578` | `getLanguage()` 函数 | → resolveSDK() → sdk.languageModel() |
| **Tool 执行** | `/packages/opencode/src/tool/*.ts` | 各工具文件 | 工具 execute() 函数 | → 具体工具逻辑（Read、Bash 等） |
| **Bus 事件发布** | `/packages/opencode/src/bus/index.ts` | `80-101` | `publish()` 函数 | → GlobalBus.emit() → SSE 发送 |

---

## 四、关键差异点总结

| 层次 | Shell 界面 | Web 界面 | 差异描述 |
|------|-----------|---------|---------|
| **用户输入** | 命令行参数 (`run.ts:304-306`) + stdin (`run.ts:342`) | 浏览器 PromptInput 组件 (`prompt-input.tsx:105-1667`) | Shell 从命令行读取，Web 从 UI 表单读取 |
| **SDK 创建** | `createOpencodeClient()` 本地 fetch (`run.ts:677`) 或 远程连接 (`run.ts:668`) | `createSdkForServer()` 包装调用 (`global-sdk.tsx:231`) | Shell 本地模式使用内部 fetch，Web 使用 HTTP fetch |
| **事件订阅** | `sdk.event.subscribe()` (`run.ts:437`) + inline 显示 (`run.ts:440-561`) | GlobalSDKProvider SSE (`global-sdk.tsx:127-208`) + SolidJS 组件更新 | Shell 直接订阅并打印，Web 通过 SSE 接收并更新 UI |
| **输出显示** | `UI.println()` 终端输出 (`run.ts:429-517`) | SolidJS 组件渲染 (`message-timeline.tsx` 等) | Shell 文本输出，Web 组件渲染 |
| **会话状态** | CLI 本地管理 (`run.ts:378-391`) | SolidJS store (`sync.tsx`) + 乐观更新 (`submit.ts:126-143`) | Shell 简单管理，Web 复杂状态同步 |
| **权限处理** | 自动拒绝或 auto-approve (`run.ts:540-560`) | UI 弹窗交互 (`session-permission-dock.tsx`) | Shell 自动化，Web 交互式 |

---

## 五、完整函数调用栈（从用户输入到模型响应）

### Shell 界面完整调用栈：

```
index.ts:57 (hideBin)
  ↓
index.ts:69 (yargs)
  ↓
index.ts:161 (RunCommand)
  ↓
run.ts:303 (handler)
  ↓
run.ts:304-342 (拼接消息 + stdin)
  ↓
run.ts:320-340 (处理文件附件)
  ↓
run.ts:660-679 (创建 SDK 客户端)
  ├─ attach: client.ts:46-88 (createOpencodeClient)
  │   ↓
  │   client.gen.ts:22-32 (createClient)
  │   ↓
  │   client.gen.ts:34-66 (beforeRequest)
  │   ↓
  │   client.gen.ts:91 (fetch - 网络请求)
  │
  └─ 本地: client.ts:46-88 (createOpencodeClient)
      ↓
      client.gen.ts:22-32 (createClient)
      ↓
      client.gen.ts:34-66 (beforeRequest)
      ↓
      client.gen.ts:91 (fetch)
      ↓
      server.ts:37-82 (Server.Default().app.fetch)
      ↓
      session.ts:842-888 (路由匹配)
      ↓
      session.ts:878-884 (runRequest)
      ↓
      prompt.ts:1242-1261 (prompt())
      ↓
      prompt.ts:887-1240 (createUserMessage)
      ├─ prompt.ts:930-1194 (resolvePart)
      │   ├─ 1014-1029 (获取 Read 工具)
      │   └─ 1031-1107 (调用 Read.execute)
      │       ↓
      │       read.ts:151-285 (run)
      │       ├─ 168-173 (获取 stat)
      │       ├─ 180-185 (权限请求)
      │       └─ 246-268 (读取文件)
      ↓
      prompt.ts:1501-1505 (loop)
      ↓
      prompt.ts:1271-1499 (runLoop)
      ├─ 1283 (获取消息历史)
      ├─ 1330 (getModel)
      ├─ 1359-1366 (获取 agent)
      ├─ 1371-1387 (创建 assistant 消息)
      ├─ 1388-1391 (processor.create)
      │   ↓
      │   processor.ts:108-598 (create)
      │   ├─ 112 (snapshot.track)
      │   ├─ 134-214 (定义各种函数)
      │   └─ 590-597 (返回 Handle)
      ├─ 1397-1405 (resolveTools)
      │   ↓
      │   prompt.ts:358-527 (resolveTools)
      │   ├─ 405-446 (注册内置工具)
      │   │   ↓
      │   │   registry.ts:279-318 (tools)
      │   │   ↓
      │   │   tool.ts:130-148 (define)
      │   │   ↓
      │   │   registry.ts:189-207 (Tool.init)
      │   ├─ 448-524 (注册 MCP 工具)
      │   └─ 526 (返回 tools)
      ├─ 1448-1459 (handle.process)
      │   ↓
      │   processor.ts:539-588 (process)
      │   ├─ 548 (llm.stream)
      │   │   ↓
      │   │   llm.ts:415-429 (stream)
      │   │   ├─ 419-421 (创建 AbortController)
      │   │   └─ 424 (run)
      │   │       ↓
      │   │       llm.ts:72-413 (run)
      │   │       ├─ 88 (provider.getLanguage)
      │   │       │   ↓
      │   │       │   provider.ts:1548-1578 (getLanguage)
      │   │       │   ├─ 1556 (resolveSDK)
      │   │       │   │   ↓
      │   │       │   │   provider.ts:1386-1524 (resolveSDK)
      │   │       │   │   ├─ 1490-1497 (bundled provider)
      │   │       │   │   └─ 1512-1520 (外部 provider)
      │   │       │   └─ 1559-1566 (获取 languageModel)
      │   │       ├─ 89-94 (获取其他组件)
      │   │       ├─ 99-124 (构建系统提示)
      │   │       ├─ 147-160 (构建消息数组)
      │   │       ├─ 162-180 (获取 params)
      │   │       ├─ 196 (resolveTools)
      │   │       └─ 333-412 (streamText - AI SDK)
      │   └─ 550-554 (Stream.tap(handleEvent))
      │       ↓
      │       processor.ts:216-461 (handleEvent)
      │       ├─ 218-220 (start)
      │       ├─ 259-279 (tool-input-start)
      │       ├─ 287-331 (tool-call)
      │       │   ↓
      │       │   291-303 (updateToolCall)
      │       │   └─ 工具执行 (如 bash.ts:408-565)
      │       ├─ 346-355 (start-step)
      │       ├─ 357-404 (finish-step)
      │       ├─ 406-452 (text-start/delta/end)
      │       └─ 发布 Bus 事件
      │           ↓
      │           bus/index.ts:80-101 (publish)
      │           ├─ 86-88 (PubSub.publish)
      │           └─ 94-99 (GlobalBus.emit)
      └─ 循环继续或退出
  ↓
run.ts:437 (订阅事件流)
  ↓
event.ts:39-87 (SSE 端点)
  ↓
event.ts:69-74 (Bus.subscribeAll)
  ↓
run.ts:440-561 (事件循环显示)
  ├─ 444-454 (message.updated)
  ├─ 456-471 (message.part.updated)
  │   ↓
  │   run.ts:409-427 (tool - 显示工具结果)
  ├─ 492-503 (text - 显示文本)
  └─ 532-538 (session.status - 退出)
```

### Web 界面完整调用栈：

```
app.tsx:135-157 (AppBaseProviders)
  ↓
app.tsx:282-317 (AppInterface)
  ↓
server.tsx:95-303 (ServerProvider)
  ↓
app.tsx:160-224 (ConnectionGate)
  ↓
global-sdk.tsx:16-256 (GlobalSDKProvider)
  ├─ 35-42 (创建 eventSdk)
  │   ↓
  │   server.ts:4-25 (createSdkForServer)
  │   ↓
  │   client.ts:46-88 (createOpencodeClient)
  ├─ 127-208 (start - 事件流订阅)
  │   ↓
  │   global-sdk.tsx:140-152 (eventSdk.global.event)
  │   ↓
  │   client.gen.ts:237-256 (makeSseFn)
  │   ↓
  │   serverSentEvents.gen.ts:78-239 (createSseClient)
  │   ├─ 95-234 (createStream)
  │   │   ├─ 122-128 (构建 request)
  │   │   ├─ 129 (fetch)
  │   │   └─ 150-214 (处理 SSE 事件)
  │   └─ 返回 stream
  └─ 231-235 (创建主 sdk client)
prompt-input.tsx:105-1667 (PromptInput)
  ↓
prompt.tsx:227-297 (PromptProvider)
  ↓
用户在 UI 输入并提交
  ↓
submit.ts:204-578 (createPromptSubmit)
  ↓
submit.ts:289-578 (handleSubmit)
  ├─ 365-382 (创建新会话)
  │   ↓
  │   submit.ts:365 (client.session.create)
  │   ↓
  │   SDK → client.gen.ts:91 (fetch)
  │   ↓
  │   server → session.ts:202-227 (create 端点)
  │   ↓
  │   返回 session 信息
  ├─ 392-406 (构建 draft)
  └─ 557-577 (sendFollowupDraft)
      ↓
      submit.ts:53-171 (sendFollowupDraft)
      ├─ 107-115 (buildRequestParts)
      ├─ 126-143 (乐观更新)
      └─ 155-162 (client.session.promptAsync)
          ↓
          SDK → client.gen.ts:68-233 (request)
          ↓
          client.gen.ts:91 (fetch - **关键汇聚点**)
          ↓
          server.ts:40-46 (Hono app)
          ↓
          session.ts:842-888 (路由匹配 - **与 Shell 相同**)
          ↓
          **从这里开始，Web 和 Shell 使用完全相同的代码路径** (见上方 Shell 调用栈)
```

---

## 六、InstanceState 机制详细说明

### InstanceState 实现
**文件**: `/packages/opencode/src/effect/instance-state.ts`

**步骤**:
1. **行号 38-59**: `make()` 函数 - 创建实例状态：
   ```typescript
   export const make = <A, E = never, R = never>(
     init: (ctx: InstanceContext) => Effect.Effect<A, E, R | Scope.Scope>,
   ): Effect.Effect<InstanceState<A, E, R>, E, Exclude<R, Scope.Scope>, R | Scope.Scope> =>
     Effect.gen(function* () {
       const cache = yield* ScopedCache.make<string, A, E, R>({
         capacity: Number.POSITIVE_INFINITY,
         lookup: () => init(yield* context)  // 初始化逻辑
       })
       // 注册清理函数
       yield* Effect.addFinalizer(() => ...)
       return { [TypeId]: TypeId, cache }
     })
   ```
2. **行号 61-66**: `get()` 函数 - 获取实例状态：
   ```typescript
   export const get = <A, E, R>(self: InstanceState<A, E, R>) =>
     Effect.gen(function* () {
       return yield* ScopedCache.get(self.cache, yield* directory)
     })
   ```
3. **行号 73-76**: `has()` 函数 - 检查实例是否存在
4. **行号 78-81**: `invalidate()` 函数 - 使实例失效

### Instance.restore() 实现
**文件**: `/packages/opencode/src/project/instance.ts`

**步骤**:
1. **行号 107-109**: `bind()` 函数 - 绑定 ALS 上下文：
   ```typescript
   bind<F extends (...args: any[]) => any>(fn: F): F {
     const ctx = context.use()  // 获取当前上下文
     return ((...args: any[]) => context.provide(ctx, () => fn(...args))) as F
   }
   ```
2. **行号 116-118**: `restore()` 函数 - 恢复实例上下文：
   ```typescript
   restore<R>(ctx: InstanceContext, fn: () => R): R {
     return context.provide(ctx, fn)  // 在指定上下文中执行函数
   }
   ```

---

## 七、SSE 实现详细说明

### serverSentEvents.gen.ts 实现
**文件**: `/packages/sdk/js/src/v2/gen/core/serverSentEvents.gen.ts`

**步骤**:
1. **行号 78**: `createSseClient()` 函数入口
2. **行号 95-234**: `createStream()` 函数 - 创建 SSE 流：
   - **行号 105-112**: 构建 headers（包括 Last-Event-ID）
   - **行号 114-128**: 构建 request 并应用拦截器
   - **行号 129**: **关键**: `const response = await _fetch(request)` - 发起 HTTP 请求
   - **行号 135**: `const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()` - 获取 reader
   - **行号 150-214**: 处理 SSE 事件：
     - **行号 154-158**: 规范化行结束符
     - **行号 160-178**: 解析 SSE 字段
     - **行号 184-191**: 解析 JSON 数据
     - **行号 203-208**: 调用 `onSseEvent()` 回调
     - **行号 210-212**: `yield data` - 发送数据
3. **行号 236**: `const stream = createStream()` - 创建流
4. **行号 238**: `return { stream }` - 返回结果

---

这份文档包含了**每一个关键步骤的文件路径和行号**，以及**函数内部的子函数调用关系**。您可以直接根据这份文档在代码中跟踪完整的请求流程，无需任何假设或推断。