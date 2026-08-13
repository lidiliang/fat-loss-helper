# 轻脂管家

面向个人减脂与脂肪肝生活方式管理的 Android 优先应用。移动端使用 Expo/React Native，离线数据存储在 SQLite；Go API 负责账号登录和按用户隔离的 PostgreSQL 云端备份。

> 本应用提供记录、估算和生活方式建议，不进行疾病诊断，也不能替代医生或营养师的诊疗意见。

## 已实现功能

### 账号、目标与数据

- 邮箱注册/登录，bcrypt 密码哈希、30 天 JWT 会话，以及服务端接口统一 JWT 鉴权
- 同一设备多账号的 SQLite 数据隔离；已登录用户断网时仍可记录，联网后可备份
- Mifflin–St Jeor BMR、活动系数、减重缺口与男女安全热量下限
- 档案支持无、轻度、中度、重度脂肪肝；保存档案后重新计算普通参考与护肝宏量目标
- 每 6 小时后台尝试备份、切换后台时备份、手动立即备份与确认后恢复；服务端保留最近 30 份快照

### 饮食与运动记录

- 内置常见中式食物、低脂常备食物，以及水果、果汁、奶茶、蛋糕等容易漏记的食品
- 固体按克、饮品按毫升计算；支持“个、杯、片、块、碗、袋”等自然份量
- 每个账号可按自己购买的包装修改“每袋/每碗/每杯”实际克数或毫升数，并纳入备份
- 自定义食物支持删除，也可让 DeepSeek 估算每 100g/100mL 营养并自动填表，保存前仍由用户确认
- 内置快捷套餐和“把当前餐次存为组合”；组合添加与删除均需确认，同一餐次防止重复添加
- 常用组合支持完整查看、改名、修改份量、增删食物；内置组合调整后另存为个人组合
- 快走、跑步、骑行、游泳、爬楼梯等 MET 消耗估算；爬楼可按楼层数和次数记录

### 首页、趋势与提醒

- 首页支持切换日期，联动展示热量、蛋白质、脂肪、碳水、供能占比和餐次/运动明细
- 根据实际启用的餐次计算下一餐预算；未设置加餐时间时不把加餐计入剩余餐次
- 根据剩余营养目标和历史饮食偏好推荐可一键记录的迷你套餐，并提供碳水不足等温和提示
- 体重/腰围趋势、近 30 天摄入达标率和减脂里程碑；有饮食记录且摄入不超过目标 105% 即视为达标
- 饮食和运动提醒时间、提前分钟数均可配置，任一提醒可留空关闭；安卓系统闹钟在 App 退出后仍可调度
- 重要通知类别支持声音、振动和锁屏公开显示；部分品牌手机仍需手动允许精确闹钟、自启动和锁屏亮屏
- 暖白＋绿色中文界面，适配常见安卓手机并自动跟随深色模式

### DeepSeek 营养助手

- 晚餐后或手动生成每日减脂总结，并用 Markdown 样式清晰展示
- 结合当日档案、目标、饮食与运动提问，给出直接结论、依据和可执行建议
- 支持筛选查看永久保存的“每日总结 / 营养问答”历史，并展开查看完整内容
- 每日首次进入首页时，根据昨天和前天的饮食、运动生成“今日控制方案”；相同数据版本直接复用缓存
- AI 调用按账号共享北京时间每日 50 次限额；状态、结果和 Token 用量永久保存在 PostgreSQL
- 所有建议保留健康安全边界，不诊断疾病、不建议停药，也不鼓励极端节食

## 应用截图

点击缩略图可查看完整尺寸截图。

<table>
  <tr>
    <td align="center"><a href="docs/screenshots/dashboard.jpg"><img src="docs/screenshots/dashboard.jpg" width="260" alt="首页仪表盘" /></a><br />首页仪表盘</td>
    <td align="center"><a href="docs/screenshots/record.jpg"><img src="docs/screenshots/record.jpg" width="260" alt="饮食记录" /></a><br />饮食记录</td>
  </tr>
  <tr>
    <td align="center"><a href="docs/screenshots/trends.jpg"><img src="docs/screenshots/trends.jpg" width="260" alt="趋势与复盘" /></a><br />趋势与复盘</td>
    <td align="center"><a href="docs/screenshots/settings.jpg"><img src="docs/screenshots/settings.jpg" width="260" alt="设置与数据" /></a><br />设置与数据</td>
  </tr>
</table>

## 目录

```text
mobile/                 Expo SDK 57 React Native 应用
server/                 Go + Gin API
server/cmd/api/migrations/  PostgreSQL 表结构
scripts/smoke-api.sh    注册、登录、备份、恢复冒烟测试
scripts/build-android-release-apk.sh  精简 ARM64 release APK 构建脚本
docker-compose.yml      PostgreSQL 和 API 本地编排
```

## 环境要求

- Node.js `24.3+`（或 `22.13+`）与 npm
- Expo Go，或 Android Studio/Android SDK
- Go `1.24+`
- Docker Desktop/Colima 与 Docker Compose

## 本地启动

### 1. 使用 Docker 启动服务端

#### 方式一：Docker Compose 一键启动

Compose 会构建 `fat-loss-helper-api:latest` 后端镜像，同时启动 PostgreSQL。PostgreSQL 容器端口映射到宿主机 `5433`，API 默认映射到宿主机 `5003`。Compose 中的服务名是 `api` 和 `postgres`，容器实际名称通常带项目名前缀；下列 `docker-compose ... api` 命令只适用于本方式。

```bash
cp .env.example .env
# 编辑 .env，固定保存 JWT_SECRET 和 AI_API_KEY，不要每次重建都生成新的 JWT_SECRET。
docker-compose up --build -d
docker-compose ps
```

查看日志和检查 API：

```bash
docker-compose logs -f api
curl http://127.0.0.1:5003/health
```

正常响应为 `{"status":"ok"}`。停止服务不会删除数据库数据：

```bash
docker-compose down
```

不要执行 `docker-compose down -v`，该命令会删除 PostgreSQL 数据卷。

#### 方式二：分别使用 `docker run` 启动

以下命令与 Compose 方式二选一，不要同时启动两套容器。此方式的容器名明确为 `qingzhi-api` 和 `qingzhi-postgres`，所以查看日志应使用 `docker logs -f qingzhi-api`，不能使用 Compose 的服务名命令。

网络只需创建一次；已存在时跳过第一条命令：

```bash
docker network create qingzhi-network
```

首次部署时才创建 PostgreSQL 容器：

```bash
docker run -d \
  --name qingzhi-postgres \
  --restart unless-stopped \
  --network qingzhi-network \
  -e POSTGRES_DB=qingzhi \
  -e POSTGRES_USER=qingzhi \
  -e POSTGRES_PASSWORD=qingzhi \
  -p 5433:5432 \
  -v qingzhi_postgres_data:/var/lib/postgresql/data \
  postgres:17-alpine
```

数据库数据保存在命名卷 `qingzhi_postgres_data` 中。以后更新 API 时，不要再次执行上述 PostgreSQL 创建命令；如果数据库容器只是停止了，执行 `docker start qingzhi-postgres` 即可。

首次启动 API 前，在根目录创建不会提交的 `.env`，并固定保存密钥：

```env
JWT_SECRET=填写至少32位且后续保持不变的随机密钥
AI_API_KEY=填写你的DeepSeek_API_Key
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash
AI_DAILY_LIMIT=50
```

构建并首次启动后端：

```bash
docker build -t fat-loss-helper-api:latest ./server
docker run -d \
  --name qingzhi-api \
  --restart unless-stopped \
  --network qingzhi-network \
  --env-file .env \
  -e DATABASE_URL='postgres://qingzhi:qingzhi@qingzhi-postgres:5432/qingzhi?sslmode=disable' \
  -e ALLOW_ORIGIN='*' \
  -p 5003:8080 \
  fat-loss-helper-api:latest
```

查看 `docker run` 方式的日志和健康状态：

```bash
docker logs -f qingzhi-api
curl http://127.0.0.1:5003/health
```

##### 安全更新已有 API 容器

`docker run --name qingzhi-api ...` 报“名称已被使用”时，冲突的是旧的同名**容器**，不是镜像。先构建新镜像，再只停止和删除 API 容器，最后用上面的 `docker run` 命令重新创建：

```bash
docker build -t fat-loss-helper-api:latest ./server
docker stop qingzhi-api
docker rm qingzhi-api

docker run -d \
  --name qingzhi-api \
  --restart unless-stopped \
  --network qingzhi-network \
  --env-file .env \
  -e DATABASE_URL='postgres://qingzhi:qingzhi@qingzhi-postgres:5432/qingzhi?sslmode=disable' \
  -e ALLOW_ORIGIN='*' \
  -p 5003:8080 \
  fat-loss-helper-api:latest
```

不需要执行 `docker image rm fat-loss-helper-api:latest`：同标签重新 `docker build` 会直接更新镜像标签，正在运行的旧容器则要按上面流程重建。镜像本身不保存 PostgreSQL 业务数据，数据库持久化依赖的是命名卷。

`docker rm qingzhi-api` 只删除无状态的 API 容器，不会删除 `qingzhi-postgres`、PostgreSQL 镜像或 `qingzhi_postgres_data` 数据卷。更新前可用以下命令确认数据库及数据卷仍存在：

```bash
docker ps -a --filter name=qingzhi-postgres
docker volume inspect qingzhi_postgres_data
```

为避免误删已有数据，更新 API 时不要执行以下操作：

```text
docker rm qingzhi-postgres
docker volume rm qingzhi_postgres_data
docker-compose down -v
docker system prune --volumes
```

如果旧 `.env` 中仍是 `AI_MODEL=deepseek-chat`，请先改为 `AI_MODEL=deepseek-v4-flash` 再重建 API 容器。重建后可只查看模型名，不输出 API Key：

```bash
docker exec qingzhi-api printenv AI_MODEL
```

容器之间通过 `qingzhi-network` 通信，因此 API 使用数据库容器名 `qingzhi-postgres:5432`，不能写成 `127.0.0.1:5433`。后者只用于从宿主机直接访问数据库。

AI Key 只能配置在服务端环境变量或未提交的根目录 `.env` 中，不能写入移动端、APK、源码或 Git。未配置 `AI_API_KEY` 时，登录、记录和备份仍可正常使用，AI 接口会返回明确的未配置提示。默认使用 `https://api.deepseek.com` 的 `deepseek-v4-flash`；这是 DeepSeek 官方当前公开的 OpenAI 兼容 API 模型 ID，不应继续使用旧的 `deepseek-chat`。可在 [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/) 核对最新模型标识。四类 AI 功能共享每个账号北京时间自然日 50 次限额，失败调用也会计入，以防反复重试耗尽上游额度。同一天的“今日控制方案”会按前两日数据版本复用缓存，记录变化后才重新调用模型；每日总结和营养问答可在 App 中按类型查看历史。

如果需要在宿主机使用 `go run` 调试后端：

```bash
cd server
DATABASE_URL='postgres://qingzhi:qingzhi@127.0.0.1:5433/qingzhi?sslmode=disable' \
JWT_SECRET='development-only-change-me-please' \
go run ./cmd/api
```

### 2. 启动 Android 应用

```bash
cd mobile
npm install
npm start
```

- Docker API 按本文配置运行时，Android 模拟器应使用 `http://10.0.2.2:5003/api/v1` 访问电脑。
- Expo Go 真机调试时，应用会优先从 Expo 开发地址推断电脑的局域网 IP。
- 如果自动推断不适用，请显式设置：

```bash
EXPO_PUBLIC_API_URL='http://你的电脑局域网IP:5003/api/v1' npm start
```

手机和电脑需要位于同一局域网，电脑防火墙需允许 `8080` 端口。生产部署必须使用 HTTPS：

```bash
EXPO_PUBLIC_API_URL='https://api.example.com/api/v1' npm start
```

## APK 构建

### 不使用 Expo 账号：本地构建

本地已安装 Android Studio/SDK 时，可直接执行：

```bash
make apk
```

生成文件位于 `artifacts/qingzhi-fatlosshelper-debug.apk`。这是方便真机试用的调试包，不需要 Expo、Google 或开发者账号。

推荐日常真机安装使用精简 ARM64 release 构建。脚本默认读取 `mobile/app.json` 的版本、复用已有 Android 原生工程与 Gradle 缓存，并开启 R8 和资源裁剪：

```bash
./scripts/build-android-release-apk.sh
```

也可以在构建前同时更新版本号和 Android `versionCode`（每次向同一手机安装新版时，`versionCode` 必须递增）：

```bash
./scripts/build-android-release-apk.sh 1.1.13 16
```

产物位于 `artifacts/qingzhi-fatlosshelper-arm64-v版本号.apk`。该包只包含 `arm64-v8a`，适合当前主流安卓真机；模拟器如使用 x86_64 架构，请改用 debug 构建。

### 使用 Expo 账号：EAS 云端构建

Expo 账号是 Expo 官方云构建服务 EAS 的账号，不是 Android 或 Google 账号。它的作用是让 Expo 云服务器代替本机生成 APK/AAB；运行 Expo Go 和本地构建都不需要它。需要云构建时可在 <https://expo.dev/signup> 免费注册。

项目已经在 [mobile/eas.json](./mobile/eas.json) 中配置 `preview` APK：

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

也可以在已安装 Android SDK 的电脑上生成本地原生工程：

```bash
cd mobile
npx expo run:android --variant release
```

应用包名为 `com.qingzhi.fatlosshelper`。通知、精确闹钟和后台任务请以独立安装包测试；Expo Go 不等同于最终 APK 的安卓原生运行环境。

## 服务端 API

除注册、登录和健康检查外，下列业务接口均要求 `Authorization: Bearer <JWT>`，用户 ID 从 JWT 读取，客户端不能指定其他账号：

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/health` | 容器健康检查，无需 JWT |
| `POST` | `/api/v1/auth/register` | 注册 |
| `POST` | `/api/v1/auth/login` | 登录 |
| `GET` | `/api/v1/me` | 当前账号 |
| `POST` | `/api/v1/sync` | 上传当前账号备份 |
| `GET` | `/api/v1/sync/latest` | 获取当前账号最新备份 |
| `GET/POST` | `/api/v1/ai/daily-summary` | 读取或生成每日总结 |
| `GET/POST` | `/api/v1/ai/daily-plan` | 读取或生成基于前两日记录的今日方案 |
| `GET` | `/api/v1/ai/history` | 查询当前账号的总结/问答历史 |
| `POST` | `/api/v1/ai/ask` | 结合当日记录提问 |
| `POST` | `/api/v1/ai/food-estimate` | 估算自定义食物营养 |

移动端与服务端必须配套更新。本次新增今日方案和 AI 历史接口；只安装新版 APK、但不重建后端镜像时，这两个功能会返回 404。

## 数据备份规则

- SQLite 是离线工作副本，所有表均带账号标识。
- 变更发生后标记为待备份；Android WorkManager 最早每 6 小时尝试一次。
- 系统会根据电量、网络和厂商后台策略延后任务，因此设置页保留“立即备份”。
- 服务端从 JWT 获取用户身份，不接受客户端指定其他用户 ID。
- 每个账号保留最近 30 份 JSONB 快照，单份最大 5 MB。
- “从云端恢复”会替换当前账号的本机数据，应用会在操作前再次确认。

健康数据较敏感。正式部署时应使用 HTTPS、强随机 `JWT_SECRET`、独立数据库密码、磁盘加密和定期 PostgreSQL 备份。
当前预览配置为局域网调试开启了 Android 明文 HTTP；生产打包前应在 `mobile/app.json` 的 `expo-build-properties.android.usesCleartextTraffic` 中改为 `false`。

## DeepSeek 数据与安全边界

- 所有 AI API 都位于现有 JWT 鉴权之后，服务端只按 JWT 中的用户 ID 读取和写入调用记录。
- 每日总结/问答会发送所选日期的年龄、性别、身高、体重、腰围、脂肪肝等级、目标、饮食及运动；今日方案会发送昨天和前天的相同范围数据。不会把邮箱、密码、JWT 或完整备份发送给 DeepSeek。
- 每日总结按当日数据版本复用，今日方案按前两日组合数据版本复用；记录变化后可重新生成。问答、总结、今日方案、食物估算结果及 Token 用量永久保存，当前不自动清理。
- 自定义食物的 AI 结果只填充表单，必须由用户确认后才写入本地食物库；营养标签优先于 AI 估算。
- AI 内容仅作饮食记录和生活方式参考，不提供疾病诊断、处方或停药建议；重度脂肪肝、异常血糖、明显不适或快速减重会提示咨询医生或注册营养师。
- DeepSeek V4 默认开启思考模式；服务端对本应用请求显式关闭思考模式，避免严格 JSON 输出只返回推理过程而缺少最终内容。空内容、瞬时上游错误及不合规 JSON 最多自动重试一次；同一用户动作仍只占一次每日限额，但数据库会累计保存两次上游请求的实际 Token。

## 验证

```bash
cd mobile && npm run typecheck
cd server && go test ./...
cd mobile && npm run export:android
./scripts/smoke-api.sh http://127.0.0.1:5003/api/v1
```

最后一项要求 Docker API 已在宿主机 `127.0.0.1:5003` 运行；若你直接使用 `go run` 的默认 `8080` 端口，则可省略脚本后的 URL 参数。

## 关键算法

### BMR（Mifflin–St Jeor）

- 男性 BMR：`10×体重(kg) + 6.25×身高(cm) - 5×年龄 + 5`
- 女性 BMR：`10×体重(kg) + 6.25×身高(cm) - 5×年龄 - 161`
- TDEE：`BMR × 活动系数`
- 减重热量缺口：`每周目标kg × 7700 ÷ 7`，同时限制在 TDEE 的 30% 内
- 热量安全下限：男性 1500 kcal、女性 1200 kcal
- 运动消耗：`MET × 体重kg × 时长小时`

### 宏量营养目标与脂肪肝提示

脂肪肝程度不会参与 BMR 计算。Mifflin–St Jeor 描述的是基础代谢，App 先用它计算 BMR、TDEE 和每日热量，再根据档案中的脂肪肝程度调整宏量营养比例。普通参考与护肝推荐使用相同总热量，减少的脂肪热量补到蛋白质，不额外提高碳水。

| 档案选择 | 蛋白质 | 脂肪 | 碳水 | 说明 |
|---|---:|---:|---:|---|
| 无 | 25% | 25% | 50% | 普通参考目标 |
| 轻度 | 27% | 23% | 50% | 小幅降低总脂肪 |
| 中度 | 28% | 22% | 50% | 进一步控制总脂肪 |
| 重度 | 30% | 20% | 50% | 仅作生活方式参考，应结合医生意见 |

选择脂肪肝程度后，初始化页和首页会同时展示普通参考与当前护肝推荐；在设置中更新程度并保存，会立即重新计算每日目标。旧版本档案升级后默认选择“无”，不会静默改变原目标。

默认普通目标按蛋白质/碳水每克 4 kcal、脂肪每克 9 kcal 换算。例如每日目标为 1500 kcal 时，结果约为：

- 蛋白质：`1500 × 25% ÷ 4 ≈ 94g`
- 碳水：`1500 × 50% ÷ 4 ≈ 188g`
- 脂肪：`1500 × 25% ÷ 9 ≈ 42g`

脂肪肝生活方式管理不仅关注脂肪总量，也关注脂肪来源。App 使用以下派生提醒：

```text
饱和脂肪建议上限 = min(15g, 每日总脂肪目标 ÷ 3)
```

因此普通目标总脂肪为 42g 时，饱和脂肪建议不超过 14g；护肝方案则根据调整后的脂肪目标继续下调这条上限。饮食来源上应少用猪油、黄油、肥肉等饱和脂肪较高的食物，优先鱼类、适量坚果和植物油等不饱和脂肪来源。当前食物记录只统计总脂肪，因此这是一条来源控制建议，不代表 App 已精确统计当日饱和脂肪；未来如补齐食物的饱和脂肪数据，可升级为独立进度指标和超标提醒。

### 后续：温和碳水 / 低碳水模式

默认的 50% 碳水比例对部分存在明显胰岛素抵抗或血糖波动的人群可能偏高。后续可增加模式切换：

- 温和碳水：沿用当前默认分配。
- 低碳水：将碳水目标下调至约 150g，并把空缺热量优先补充到蛋白质，脂肪目标不随意提高。
- 切换前提示用户结合血糖监测结果，并在存在糖尿病、用药或其他基础疾病时先咨询医生或营养师。

以上目标用于生活方式记录和估算，不构成针对脂肪肝、胰岛素抵抗或糖尿病的医疗处方。

### 食物营养换算说明

固体食物以每 100g 为营养计算基准，牛奶、豆浆等饮品以每 100mL 为基准。内置“脱脂纯牛奶”依据包装营养标签录入：每 100mL 含能量 154kJ、蛋白质 3.2g、脂肪 0g、碳水 5.0g。

```text
154kJ ÷ 4.184 ≈ 36.8kcal / 100mL
250mL：154 × 2.5 = 385kJ ≈ 92kcal
```

因此记录 1 瓶 250mL 时，App 计算约 92kcal、蛋白质 8g、脂肪 0g、碳水 12.5g。不同品牌配方可能不同，应以实际包装标签为准。
