# 轻脂管家

面向个人减脂与脂肪肝生活方式管理的 Android 优先应用。移动端使用 Expo/React Native，离线数据存储在 SQLite；Go API 负责账号登录和按用户隔离的 PostgreSQL 云端备份。

> 本应用提供记录、估算和生活方式建议，不进行疾病诊断，也不能替代医生或营养师的诊疗意见。

## 已实现功能

- 邮箱注册/登录，bcrypt 密码哈希和 30 天 JWT 会话
- 同一设备多账号本地数据隔离，断网后已登录用户仍可记录
- Mifflin–St Jeor 公式、活动系数、减重缺口与安全热量下限
- 用户档案支持无、轻度、中度、重度脂肪肝，并按程度提供普通/护肝双目标参考
- 40+ 种常见中式食物、自定义食物、自然份量换算；固体按克、饮品按毫升记录
- 每个账号可按实际包装调整“每袋/每碗/每杯”等换算，并随云端备份保存
- 首页提供方便、平价、易购买的减脂友好食物建议
- 3 个内置减脂套餐、把已记录餐次保存为常用组合
- 今日热量与三大营养素预算、净热量、下一餐动态建议
- 快走、跑步、骑行、游泳等 MET 运动消耗估算
- 体重/腰围打卡、体重折线和近 30 天摄入达标率
- 餐前 30 分钟、运动前 1 小时的本地通知
- 每 6 小时系统后台备份、切后台备份、手动备份与显式恢复
- 暖白＋绿色界面，自动跟随安卓深色模式

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
docker-compose.yml      PostgreSQL 和 API 本地编排
```

## 环境要求

- Node.js `24.3+`（或 `22.13+`）与 npm
- Expo Go，或 Android Studio/Android SDK
- Go `1.24+`
- Docker Desktop/Colima 与 Docker Compose

## 本地启动

### 1. 使用 Docker 启动服务端

#### 推荐：Docker Compose 一键启动

Compose 会构建 `fat-loss-helper-api:latest` 后端镜像，同时启动 PostgreSQL。PostgreSQL 容器端口为 `5432`，映射到宿主机 `5433`，避免与本机 PostgreSQL 冲突。

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
docker-compose up --build -d
docker-compose ps
```

查看日志和检查 API：

```bash
docker-compose logs -f api
curl http://127.0.0.1:8080/health
```

正常响应为 `{"status":"ok"}`。停止服务不会删除数据库数据：

```bash
docker-compose down
```

不要执行 `docker-compose down -v`，该命令会删除 PostgreSQL 数据卷。

#### 分别使用 `docker run` 启动

以下命令与 Compose 方式二选一，不要同时启动两套容器。如果网络已经存在，`docker network create` 无需重复执行。

先创建专用网络和 PostgreSQL 容器：

```bash
docker network create qingzhi-network
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

构建并启动后端镜像：

```bash
docker build -t fat-loss-helper-api:latest ./server
export JWT_SECRET="$(openssl rand -hex 32)"
docker run -d \
  --name qingzhi-api \
  --restart unless-stopped \
  --network qingzhi-network \
  -e DATABASE_URL='postgres://qingzhi:qingzhi@qingzhi-postgres:5432/qingzhi?sslmode=disable' \
  -e JWT_SECRET="$JWT_SECRET" \
  -e ALLOW_ORIGIN='*' \
  -p 8080:8080 \
  fat-loss-helper-api:latest
```

容器之间通过 `qingzhi-network` 通信，因此 API 使用数据库容器名 `qingzhi-postgres:5432`，不能写成 `127.0.0.1:5433`。后者只用于从宿主机直接访问数据库。

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

- Android 模拟器默认通过 `http://10.0.2.2:8080/api/v1` 访问电脑。
- Expo Go 真机调试时，应用会优先从 Expo 开发地址推断电脑的局域网 IP。
- 如果自动推断不适用，请显式设置：

```bash
EXPO_PUBLIC_API_URL='http://你的电脑局域网IP:8080/api/v1' npm start
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

也可以在构建前同时更新版本号和 Android `versionCode`：

```bash
./scripts/build-android-release-apk.sh 1.1.6 9
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

应用包名为 `com.qingzhi.fatlosshelper`。本地通知在 Expo Go 中可用；独立安装包能获得完整的后台任务和通知配置。

## 数据备份规则

- SQLite 是离线工作副本，所有表均带账号标识。
- 变更发生后标记为待备份；Android WorkManager 最早每 6 小时尝试一次。
- 系统会根据电量、网络和厂商后台策略延后任务，因此设置页保留“立即备份”。
- 服务端从 JWT 获取用户身份，不接受客户端指定其他用户 ID。
- 每个账号保留最近 30 份 JSONB 快照，单份最大 5 MB。
- “从云端恢复”会替换当前账号的本机数据，应用会在操作前再次确认。

健康数据较敏感。正式部署时应使用 HTTPS、强随机 `JWT_SECRET`、独立数据库密码、磁盘加密和定期 PostgreSQL 备份。
当前预览配置为局域网调试开启了 Android 明文 HTTP；生产打包前应在 `mobile/app.json` 的 `expo-build-properties.android.usesCleartextTraffic` 中改为 `false`。

## 验证

```bash
cd mobile && npm run typecheck
cd server && go test ./...
cd mobile && npm run export:android
./scripts/smoke-api.sh
```

最后一项要求 API 已在 `127.0.0.1:8080` 运行。

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
