# 多场景 SQLite Mock 与大屏数据驱动设计

**日期：** 2026-08-09  
**状态：** 待用户书面确认  
**范围：** 无真车条件下，使用 16 个交通冲突场景驱动 MQTT、Cloud STGNN、WebSocket 与路云天瞳 3D 大屏；为 Jetson Orin Nano 和华为 Atlas 200 DK 保留同协议替换能力。

## 1. 目标

建设一个可持续扩展的 SQLite 场景库。首期收录 16 个已确认场景，由后端按场景模板和轨迹关键帧实时生成感知、自车状态、决策和事件数据，沿现有通信链路推送到大屏。大屏收到数据后动态创建、移动和销毁车辆、行人及非机动车；没有实时数据时冻结或进入现有模拟降级模式。

完成后，系统运行链路为：

```text
SQLite 场景模板与关键帧
  → ScenarioRepository
  → ScenarioCompiler
  → ScenarioPlaybackService
  → 模拟路侧节点/模拟车辆节点
  → MQTT
  → CloudAgent + Cloud STGNN
  → FastAPI WebSocket
  → 大屏场景适配器
  → Three.js 数据驱动渲染
```

未来接入真车时，替换最左侧的模拟路侧节点和模拟车辆节点；MQTT Topic、消息协议、CloudAgent、STGNN、WebSocket 和大屏不变。

## 2. 设计依据与范围边界

首期场景来自用户确认的鬼探头、非机动车横穿和路口车辆冲突三类，共 16 个，不继续无限收集互联网案例。场景分类参考：

- NHTSA Pre-Crash Scenario Typology：包含行人突然进入道路、非机动车交叉、左转穿越对向车流和直行交叉路径等事故前场景。
- Euro NCAP VRU：包含停放车辆遮挡下的儿童/骑行者横穿、车辆转弯与行人冲突、白天和夜间行人测试。
- ASAM OpenSCENARIO：用实体、轨迹、环境、事件和条件描述随时间变化的驾驶场景。
- PEGASUS Scenario Database：用功能场景、逻辑场景、参数空间和具体场景组织可复用测试数据。

资料链接：

- https://www.nhtsa.gov/document/pre-crash-scenario-typology-crash-avoidance-research
- https://cdn.euroncap.com/en/car-safety/the-ratings-explained/vulnerable-road-user-vru-protection/aeb-pedestrian/
- https://cdn.euroncap.com/en/car-safety/the-ratings-explained/vulnerable-road-user-vru-protection/aeb-cyclist/
- https://www.asam.net/fileadmin/Standards/OpenSCENARIO/QUICK_READ_ASAM_OpenSCENARIO_BS-1-2_User-Guide_V1-0-0.html
- https://www.pegasusprojekt.de/files/tmpl/Pegasus-Abschlussveranstaltung/15_Scenario-Database.pdf

本模块不负责生成照片级 3D 模型、不接入真实摄像头、不完成 Jetson/Atlas 实机部署，也不把模拟数据标记为真实车辆数据。大屏必须显示 `DEMO`、`LIVE`、`STALE` 或 `FALLBACK` 数据源状态。

## 3. 方案选择

采用“SQLite 保存模板和关键帧，运行时插值生成逐帧数据”的方案。

不采用把所有逐帧数据预先写入数据库的方式，因为帧数据重复、修改 FPS 或速度后需要整体重建；也不采用每个场景对应一个 Python 生成函数的方式，因为场景逻辑会散落在代码中，数据库无法成为统一事实来源。

代码中只保留通用插值、协议组装和播放控制。16 个场景的参与者、轨迹、遮挡等级、环境和事件时间全部由 SQLite 数据描述。

## 4. 代码边界

### 4.1 新增后端组件

- `src/scenario_library/models.py`：场景模板、参与者、关键帧、事件和运行记录的数据类型及校验规则。
- `src/scenario_library/repository.py`：SQLite 场景查询、运行记录和幂等种子写入。
- `src/scenario_library/compiler.py`：把模板和关键帧编译为指定 FPS 的确定性帧流。
- `src/scenario_library/playback_service.py`：场景开始、停止、单步、循环和 MQTT 发布编排。
- `src/scenario_library/seed_data.py`：16 个场景的完整种子数据。
- `scripts/seed_scenario_library.py`：创建或更新场景库，重复执行不产生重复记录。

### 4.2 修改现有组件

- `src/cloud_twin/data_store.py`：增加场景库表和 `run_id`，迁移现有帧表以支持多次回放。
- `src/communication/protocol.py`：统一四类消息的元数据，同时保持旧调用兼容。
- `src/roadside_perception/replay_engine.py`：保留文件回放能力；合成数据改为调用场景库播放服务，不再内置单一鬼探头循环。
- `src/cloud_twin/demo_engine.py`：改为场景播放服务的 API 门面；删除 `light/moderate/heavy` 对同一鬼探头轨迹的硬编码依赖。
- `src/cloud_twin/api.py`：提供场景列表、详情、启动、停止、单步和状态接口。
- `frontend/src/services/demoApi.ts`：从后端读取场景列表并按 `scenario_id` 启动。
- `frontend/src/types/realtime.ts`：补齐 `scenario_id`、`run_id`、来源和对象可选属性。
- `frontend/src/pages/zhiluwujie/ZhiluWujiePage.tsx`：订阅现有 `wsService`，驱动大屏场景和数据源状态。
- `frontend/src/pages/zhiluwujie/scene.ts`：移除实时模式下固定 12 秒事件循环，暴露数据驱动渲染接口。

### 4.3 新增前端组件

- `frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.ts`：消息校验、乱序过滤、坐标转换和状态聚合。
- `frontend/src/pages/zhiluwujie/sceneObjectPool.ts`：以 `node_id:track_id` 管理动态 Three.js 对象生命周期。
- `frontend/src/pages/zhiluwujie/sceneCoordinates.ts`：集中管理 `road_xy` 到 Three.js 坐标的原点、比例、旋转和航向转换。

网络解析不放进 `scene.ts`。`scene.ts` 只负责渲染和动画，避免 WebSocket、协议兼容、对象池和视觉逻辑继续耦合。

## 5. SQLite 数据模型

场景库与运行历史继续使用项目当前 `DataStore` 的 SQLite 文件，默认路径保持 `data/v2x_cloud.db`。

### 5.1 `scenario_templates`

```sql
CREATE TABLE IF NOT EXISTS scenario_templates (
    scenario_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('ghost_probe', 'non_motor', 'intersection_conflict')),
    description TEXT NOT NULL,
    duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
    default_fps REAL NOT NULL CHECK (default_fps BETWEEN 1 AND 30),
    coordinate_frame TEXT NOT NULL DEFAULT 'road_xy',
    road_layout TEXT NOT NULL,
    environment TEXT NOT NULL,
    expected_outcome TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    source_refs TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

`road_layout` 和 `environment` 保存 JSON。道路布局至少包含道路类型、车道数、冲突点和 Three.js 场景映射参数；环境至少包含时间、光照、天气和路面状态。

### 5.2 `scenario_actors`

```sql
CREATE TABLE IF NOT EXISTS scenario_actors (
    scenario_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    track_id INTEGER,
    role TEXT NOT NULL CHECK (role IN ('ego', 'target', 'occluder', 'conflict', 'background')),
    actor_class TEXT NOT NULL,
    actor_subtype TEXT,
    dimensions TEXT NOT NULL,
    appearance TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (scenario_id, actor_id),
    UNIQUE (scenario_id, track_id),
    FOREIGN KEY (scenario_id) REFERENCES scenario_templates(scenario_id) ON DELETE CASCADE
);
```

`actor_class` 使用现有前后端可识别的基础类别：`car`、`bus`、`truck`、`person`、`bicycle`、`motorcycle`。电动车和外卖骑手使用 `motorcycle`，并通过 `actor_subtype` 区分 `ebike` 和 `delivery_rider`。自车允许 `track_id` 为空，其状态通过 `vehicle_status` 发布。

### 5.3 `scenario_keyframes`

```sql
CREATE TABLE IF NOT EXISTS scenario_keyframes (
    scenario_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    t_ms INTEGER NOT NULL CHECK (t_ms >= 0),
    position_x REAL NOT NULL,
    position_y REAL NOT NULL,
    velocity_x REAL NOT NULL,
    velocity_y REAL NOT NULL,
    heading_deg REAL NOT NULL,
    occlusion_level INTEGER NOT NULL DEFAULT 0 CHECK (occlusion_level BETWEEN 0 AND 3),
    confidence REAL NOT NULL DEFAULT 0.95 CHECK (confidence BETWEEN 0 AND 1),
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    behavior_state TEXT NOT NULL DEFAULT 'moving',
    PRIMARY KEY (scenario_id, actor_id, t_ms),
    FOREIGN KEY (scenario_id, actor_id)
        REFERENCES scenario_actors(scenario_id, actor_id) ON DELETE CASCADE
);
```

`visible=1` 表示路侧感知能够输出该目标，不代表自车摄像头一定可见。鬼探头目标可在自车视线被遮挡时保持 `visible=1` 且 `occlusion_level=3`，体现路侧协同感知价值。

### 5.4 `scenario_events`

```sql
CREATE TABLE IF NOT EXISTS scenario_events (
    scenario_id TEXT NOT NULL,
    event_key TEXT NOT NULL,
    event_order INTEGER NOT NULL,
    t_ms INTEGER NOT NULL CHECK (t_ms >= 0),
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    involved_actor_ids TEXT NOT NULL DEFAULT '[]',
    expected_decision TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (scenario_id, event_key),
    UNIQUE (scenario_id, event_order),
    FOREIGN KEY (scenario_id) REFERENCES scenario_templates(scenario_id) ON DELETE CASCADE
);
```

场景事件负责大屏时间线和演示叙事。实际 `decision` 的 TTC、碰撞概率和制动值仍由参与者状态及现有风险计算生成，不能只读取固定展示数字。

### 5.5 `scenario_runs`

```sql
CREATE TABLE IF NOT EXISTS scenario_runs (
    run_id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    requested_fps REAL NOT NULL,
    loop_enabled INTEGER NOT NULL DEFAULT 0 CHECK (loop_enabled IN (0, 1)),
    random_seed INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'stopped', 'failed')),
    current_frame INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    FOREIGN KEY (scenario_id) REFERENCES scenario_templates(scenario_id)
);
```

### 5.6 现有 `frames` 表迁移

当前 `frame_id INTEGER PRIMARY KEY` 会使不同场景和不同运行从第 0 帧开始时相互覆盖。迁移后的唯一键为：

```sql
PRIMARY KEY (run_id, frame_id)
```

新增 `run_id TEXT NOT NULL`。旧数据迁移到固定运行 `legacy-run`，不删除用户已有帧和事件。`events` 表增加可空的 `run_id` 和 `scenario_id` 索引，事件回放优先按 `run_id` 查询。

不新增逐帧场景缓存表。场景编译是确定性的，已经播放的逐帧结果由现有 `frames` 表保存，避免重复存储。

## 6. 协议适配

以 `src/communication/protocol.py` 为唯一协议定义源。四类实时消息统一支持：

```json
{
  "schema_version": 1,
  "message_type": "perception",
  "scene_id": "intersection-demo",
  "scenario_id": "GP-01",
  "run_id": "run-20260809-001",
  "timestamp": 1786252800000,
  "frame_id": 42,
  "coordinate_frame": "road_xy",
  "source": {
    "device_type": "scenario_replay",
    "input_type": "sqlite",
    "simulation": true,
    "node_id": "mock-roadside-001"
  }
}
```

### 6.1 感知对象

保留当前必需字段，并增加可选渲染属性：

```json
{
  "track_id": 1,
  "class": "person",
  "subtype": "adult",
  "bbox": [350, 150, 40, 100],
  "world_pos": [15.0, 4.2],
  "velocity": [0.0, -1.2],
  "heading": 270.0,
  "confidence": 0.68,
  "occlusion_level": 3,
  "predicted_traj": [],
  "coordinate_status": "valid",
  "prediction_status": "deferred"
}
```

Mock 不伪造摄像头像素检测框质量。没有实际图像时，`bbox` 使用稳定的演示占位值，`source.simulation=true` 明确表明来源；STGNN 使用 `world_pos`、速度、类别和遮挡等级。

### 6.2 兼容规则

- 现有 `scenario` 字段在一个迁移周期内继续输出，值等于 `scenario_id`。
- 旧消息缺少 `scenario_id`、`run_id`、`source` 时，前端按 `legacy` 处理。
- `person` 保持为标准行人类别，不在新数据中混用 `pedestrian`。
- 新字段全部放在 dataclass 已有必填字段之后并提供默认值，避免破坏位置参数调用。
- WebSocket 外层 `{type, data}` 信封保持不变。
- MQTT Topic 保持：
  - `v2x/{scene_id}/roadside/{node_id}/perception`
  - `v2x/{scene_id}/vehicle/{vehicle_id}/status`
  - `v2x/{scene_id}/vehicle/{vehicle_id}/decision`
  - `v2x/{scene_id}/roadside/{node_id}/heartbeat`

## 7. 场景编译规则

### 7.1 时间与插值

- 场景内部时间从 `t_ms=0` 开始。
- 实际消息时间戳为 `run.started_at + t_ms`。
- 帧号从 0 递增，`frame_id = round(t_ms × fps / 1000)`。
- 位置采用分段三次 Hermite 插值；关键帧显式速度作为切线，使转弯、犹豫和折返轨迹连续。
- 航向角采用最短角插值，避免从 359° 到 1° 绕行。
- 遮挡等级、可见性和行为状态使用前一关键帧保持，直到下一关键帧生效。
- 置信度在关键帧间线性插值。
- 同一 `scenario_id + random_seed + fps` 必须生成相同帧流。

### 7.2 目标生命周期

- `visible=0` 时不写入 `perception.objects`。
- `visible=1` 时输出目标，即使 `occlusion_level=3`。
- `track_id` 在单次运行中固定，不因暂时不可见而改变。
- 目标重新出现时沿用原 `track_id`，模拟 DeepSORT 短时遮挡恢复。
- 场景结束后发送一次空 `objects` 感知帧，允许大屏清理动态目标。

### 7.3 风险与决策

- 自车状态由 `ego` 参与者关键帧生成，不由大屏自行计算。
- 感知对象轨迹先经 Cloud STGNN 丰富，再由现有风险逻辑计算 TTC 和风险等级。
- 预期事件用于验证风险变化窗口，但不覆盖算法真实输出。
- 若 STGNN 模型不可用，保留当前 `prediction.status=fallback`，同时继续发布匀速或关键帧预测轨迹，不能中断演示。

## 8. 首期 16 个场景

所有场景默认 10 FPS、`road_xy` 米制坐标，并使用确定性随机种子。每个场景至少包含 `approach`、`occluded`、`conflict`、`response`、`resolved` 五个叙事阶段。

### 8.1 鬼探头

| ID | 场景 | 默认时长 | 主要参与者 | 关键变化 |
|---|---|---:|---|---|
| GP-01 | 公交车遮挡行人横穿 | 12 s | 自车、靠站公交、行人 | 行人在公交车头处由遮挡 3 降至 0，横穿自车路径 |
| GP-02 | 大货车遮挡行人 | 12 s | 自车、排队货车、行人 | 行人从货车间隙进入冲突区，初始置信度较低 |
| GP-03 | 路边违停车辆遮挡 | 11 s | 自车、两辆违停车、行人 | 行人从两车间突然进入机动车道 |
| GP-04 | 弯道建筑盲区 | 13 s | 转弯自车、建筑遮挡物、行人 | 自车航向连续变化，行人从墙角进入转弯路径 |
| GP-05 | 双车道二次遮挡 | 13 s | 自车、相邻车道货车、制动车辆、行人 | 货车与第二辆车形成连续遮挡，行人从右侧进入 |
| GP-06 | 夜间鬼探头 | 12 s | 自车、违停车、行人 | 环境光照为夜间，行人在重遮挡阶段仍由路侧节点输出 |
| GP-07 | 多行人连续穿越 | 15 s | 自车、遮挡车、两名行人 | 第二名行人在第一名风险解除前后进入，track 独立 |
| GP-08 | 行人犹豫折返 | 15 s | 自车、遮挡车、行人 | 行人进入路中后减速、停顿并反向折返，预测轨迹改变 |

### 8.2 非机动车横穿

| ID | 场景 | 默认时长 | 主要参与者 | 关键变化 |
|---|---|---:|---|---|
| NM-01 | 电动车从遮挡处高速穿出 | 10 s | 自车、厢式车、电动车 | 电动车横向速度高，出现后 TTC 快速下降 |
| NM-02 | 外卖骑手逆行横穿 | 11 s | 自车、外卖电动车、背景车辆 | 目标逆向接近后横穿，闭合速度高于普通横穿 |
| NM-03 | 自行车队列中突然变道 | 14 s | 自车、三辆自行车 | 中间骑行者从非机动车道切入机动车道，其余保持原轨迹 |
| NM-04 | 儿童骑车轨迹不稳定 | 14 s | 自车、儿童自行车、路边车辆 | 横向速度多次变化，轨迹轻微摆动并进入冲突区 |

### 8.3 路口车辆冲突

| ID | 场景 | 默认时长 | 主要参与者 | 关键变化 |
|---|---|---:|---|---|
| IC-01 | 信号切换抢行 | 13 s | 自车、侧向车辆、信号灯 | 黄灯转红前后侧向车辆提前起步并进入冲突区 |
| IC-02 | 左转车与对向直行车 | 14 s | 左转自车、对向直行车 | 自车转弯轨迹与对向车辆直线路径发生时间重叠 |
| IC-03 | 无信号路口横向来车 | 12 s | 自车、横向车辆 | 横向车辆未减速穿过无信号交叉口 |
| IC-04 | 匝道汇入主路 | 15 s | 主路自车、汇入车辆、背景车 | 汇入车辆加速变道，主路车辆高速接近形成侧向冲突 |

场景种子必须给每个动态参与者至少 3 个关键帧；折返、转弯和变道目标至少 5 个关键帧。每个场景至少定义 4 个事件节点：目标预发现、进入风险区、系统响应、风险解除。

## 9. 后端 API

保留现有 Demo API 路径，并扩展参数和响应：

```text
GET  /api/v1/scenarios
GET  /api/v1/scenarios/{scenario_id}
POST /api/v1/demo/start?scenario_id=GP-01&fps=10&loop=false
POST /api/v1/demo/stop
POST /api/v1/demo/step?scenario_id=GP-01
GET  /api/v1/demo/status
```

`GET /api/v1/scenarios` 返回启用场景的 ID、名称、分类、时长和环境摘要。详情接口返回参与者和事件摘要，但不把全部关键帧发送到前端。

启动响应至少包含：

```json
{
  "running": true,
  "run_id": "run-20260809-001",
  "scene_id": "intersection-demo",
  "scenario_id": "GP-01",
  "frame_index": 0,
  "duration_ms": 12000,
  "fps": 10.0,
  "loop": false,
  "available_scenarios": 16
}
```

同一时间只允许一个 Demo run。开始新场景前应正常停止旧 run、写入结束状态、发送清场帧，然后启动新 run。

## 10. MQTT 与模拟节点

场景播放服务同时模拟两个合法数据源：

- `mock-roadside-001`：发布 `perception` 和 `heartbeat`。
- `mock-vehicle-001`：发布 `vehicle_status`；现有 VehicleAgent 或兼容决策发布器产生 `decision`。

默认 Goal 验收使用真实 MQTT Broker 路径。为了保留自动化测试能力，组件允许注入现有 `InMemoryMQTTClient`，但 in-memory 测试不能替代真实 TCP MQTT smoke test。

CloudAgent 收到感知后继续执行 Cloud STGNN，再存入 SQLite 并广播。WebSocket 中的感知数据必须与落库的 enriched perception 相同。

## 11. 大屏数据驱动模式

### 11.1 Scene API

`ZhiluWujieScene` 暴露：

```ts
applyPerception(payload: PerceptionPayload): void
applyVehicleStatus(payload: VehicleStatusPayload): void
applyDecision(payload: DecisionPayload): void
applyEvent(payload: CloudEventPayload): void
setDataMode(mode: 'live' | 'stale' | 'fallback'): void
clearDynamicObjects(): void
```

实时模式下不运行当前固定 12 秒 `updateScenario()`。原循环仅作为 Fallback 保留。

### 11.2 动态对象池

- 对象键为 `${nodeId}:${trackId}`。
- 首次出现创建模型，后续帧只更新目标位置、航向、遮挡外观和预测轨迹。
- 渲染位置使用插值追赶目标状态，避免 10 FPS 数据产生跳变。
- 一个目标缺失后先保留 1 秒；超过 TTL 再销毁，避免单帧漏检闪烁。
- 新帧的 `timestamp/frame_id` 小于已应用帧时直接丢弃。
- 进入 Fallback 前清理实时对象；实时恢复时先清理模拟对象，不能混合两套对象。

### 11.3 坐标转换

默认映射沿用当前场景方向：

```text
sceneX = originX + worldY × scale
sceneZ = originZ + worldX × scale
```

`originX`、`originZ`、`scale` 和 `rotationDeg` 由道路布局配置提供。航向角统一从道路坐标角度转换为 Three.js Y 轴旋转弧度。转换只存在于 `sceneCoordinates.ts`，其他文件不得自行交换 X/Y 或取反。

### 11.4 数据源状态机

```text
LIVE：最近 1 秒内收到有效实时帧
STALE：1～3 秒没有新帧，保持最后状态并显示数据停滞
FALLBACK：WebSocket 断开或超过 3 秒没有有效帧，启动现有模拟循环
```

新的有效帧到达后，停止 Fallback、清理模拟对象并恢复 LIVE。数据源标识必须持续可见。

## 12. 错误处理

- 场景数据库为空时，应用启动阶段幂等写入 16 个种子场景。
- 场景缺少自车、风险目标、关键帧或关键帧超出场景时长时，启动接口返回 422，不运行部分场景。
- SQLite 迁移失败时保留原数据库并停止服务，不静默创建一个空库替代用户数据。
- JSON 配置字段读取失败时记录 `scenario_id`、字段名和错误，不吞掉异常。
- MQTT 暂时断开时播放时钟暂停，不继续生成大量待发送帧；重连后从下一帧继续。
- WebSocket 客户端断开不影响后端场景运行和 SQLite 记录。
- STGNN 失败进入显式 fallback，原因进入 `prediction.reason`。
- 前端遇到未知类别时使用通用障碍物模型，不导致场景崩溃。

## 13. 测试与验收

### 13.1 数据库与种子

- 新数据库初始化后恰好有 16 个启用场景：鬼探头 8、非机动车 4、路口冲突 4。
- 每个场景有且仅有一个 `ego`，至少一个 `target`，每个动态参与者至少 3 个关键帧。
- 重复执行种子脚本后记录数不增加，用户运行历史不被删除。
- 旧 `frames/events` 数据迁移后仍可查询。

### 13.2 生成器

- 16 个场景分别生成完整帧流，时间戳单调、帧号连续、坐标和速度为有限数。
- 相同 seed 输出逐字节等价的规范化 JSON。
- GP-08 出现速度方向反转；GP-07 同时存在两个独立行人 track；NM-03 出现横向变道；IC-02 自车航向连续变化。
- 场景结束产生空感知清场帧。

### 13.3 协议与链路

- 四类消息通过协议一致性测试，旧消息仍可被 CloudAgent 和前端解析。
- 真实 TCP MQTT smoke test 能完成 SQLite → MQTT → Cloud STGNN → WebSocket。
- WebSocket 感知 payload 与 SQLite 保存的 enriched perception 一致。
- 16 个场景各执行一次 30 帧快速 smoke，不出现异常或对象 ID 冲突。

### 13.4 大屏

- LIVE 状态下固定 12 秒循环停止。
- 后端出现几个目标，大屏创建几个目标；目标超过 TTL 后销毁。
- 自车位置、速度和航向完全来自 `vehicle_status`。
- `decision` 更新 TTC、碰撞概率、风险等级和制动状态。
- 断流进入 STALE，超过阈值进入 FALLBACK；恢复后回到 LIVE。
- 现有大屏面板、模式切换和视觉风格不被删除。

### 13.5 最终命令目标

```powershell
python -m unittest discover -s tests -v
cd frontend
npm run test:ui -- --reporter=dot
npm run build
```

再执行一次真实 MQTT 场景启动 smoke，并在浏览器中确认 GP-01、GP-08、NM-03 和 IC-02 四个代表场景的对象数量、轨迹、遮挡变化、自车运动和 Fallback 切换正确。

## 14. 完成定义

满足以下条件才可宣告模块完成：

1. 16 个场景全部存在 SQLite，且不是散落在 16 个 Python 专用生成函数中。
2. Mock 和未来真车使用同一协议及 MQTT Topic。
3. Cloud STGNN 位于 MQTT 入站与 WebSocket 出站之间，并在界面显示真实预测状态或明确 fallback。
4. 大屏完全由消息驱动目标、自车、决策和事件，实时模式不再自行播放固定事件。
5. SQLite 运行记录支持多个场景和多次运行，不发生 frame ID 覆盖。
6. WebSocket 断流时大屏不会黑屏，并准确显示数据源状态。
7. 后端测试、前端测试、构建和真实 MQTT smoke 全部通过。

