# 多场景 SQLite Mock 与大屏数据驱动 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: 在不接入真车的条件下，将 16 个交通冲突场景收录到 SQLite，由运行时编译器生成与真车兼容的感知、车辆状态、决策和事件数据，经 MQTT、Cloud STGNN、WebSocket 驱动路云天瞳 3D 大屏，并保留实时断流 Fallback。

Architecture: SQLite 是场景模板、参与者、关键帧和事件的运行时事实来源；通用 ScenarioCompiler 负责插值，ScenarioPlaybackService 负责模拟路侧节点和模拟车辆节点并发布 MQTT。CloudAgent 继续负责 STGNN 丰富、落库、风险事件广播；前端新增实时适配层和动态对象池，scene.ts 只负责 Three.js 渲染，原来的固定循环仅作为 Fallback。

Tech Stack: Python 3、sqlite3、dataclasses、asyncio、现有 MQTT 客户端/内存 Broker、FastAPI、React 18、TypeScript、Three.js、Vitest、unittest。

---

## 0. 执行前约束

实现者必须先阅读：

- docs/superpowers/specs/2026-08-09-multi-scenario-sqlite-realtime-screen-design.md
- src/communication/protocol.py
- src/cloud_twin/data_store.py
- src/cloud_twin/api.py
- frontend/src/pages/zhiluwujie/ZhiluWujiePage.tsx
- frontend/src/pages/zhiluwujie/scene.ts

不要接入真实摄像头或开发板，不删除旧回放页面，不把 source.simulation=true 改成真实设备来源。每个任务先写失败测试，再实现，再跑 focused test，再提交。

## 1. 文件地图

新增后端：

- src/scenario_library/__init__.py
- src/scenario_library/models.py
- src/scenario_library/repository.py
- src/scenario_library/seed_data.py
- src/scenario_library/compiler.py
- src/scenario_library/playback_service.py
- scripts/seed_scenario_library.py
- scripts/run_scenario_demo.ps1

修改后端：

- src/communication/protocol.py
- src/cloud_twin/data_store.py
- src/cloud_twin/cloud_agent.py
- src/cloud_twin/demo_engine.py
- src/cloud_twin/api.py
- src/roadside_perception/replay_engine.py

新增测试：

- tests/test_data_store_scenarios.py
- tests/test_scenario_library.py
- tests/test_scenario_compiler.py
- tests/test_scenario_playback.py
- tests/test_scenario_api.py
- tests/test_scenario_e2e.py

新增前端：

- frontend/src/pages/zhiluwujie/sceneCoordinates.ts
- frontend/src/pages/zhiluwujie/sceneObjectPool.ts
- frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.ts
- frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts
- frontend/src/services/demoApi.test.ts
- frontend/tests/zhiluwujieRealtime.ui.test.tsx

修改前端：

- frontend/src/types/realtime.ts
- frontend/src/services/demoApi.ts
- frontend/src/pages/monitor/MonitorPage.tsx
- frontend/src/pages/zhiluwujie/ZhiluWujiePage.tsx
- frontend/src/pages/zhiluwujie/scene.ts
- frontend/src/pages/zhiluwujie/ZhiluWujiePage.module.css

修改文档：

- docs/API_SPEC.md
- docs/DATA_MODEL.md
- docs/END_TO_END_DEMO.md
- 启动.md

---

## Task 1: 固定统一实时协议

Files:
- Modify: src/communication/protocol.py
- Modify: tests/test_protocol.py
- Modify: tests/test_demo_engine.py

- [ ] Step 1: 在 tests/test_protocol.py 增加失败测试。

~~~python
def test_runtime_messages_include_scenario_run_metadata(self):
    status = VehicleStatus(
        timestamp=1000, vehicle_id="vehicle_001",
        position=[10.0, 0.0], velocity=[-8.0, 0.0],
        heading=180.0, speed=8.0,
        scene_id="intersection-demo", scenario_id="GP-01",
        run_id="run-001",
        source={"device_type": "scenario_replay", "simulation": True},
    ).to_dict()
    decision = DecisionMessage(
        timestamp=1000, vehicle_id="vehicle_001",
        risk_level="DANGER", ttc=1.4,
        collision_prob=0.7, brake_decel=5.0,
        scene_id="intersection-demo", scenario_id="GP-01",
        run_id="run-001",
        source={"device_type": "scenario_replay", "simulation": True},
    ).to_dict()
    event = CloudEvent(
        event_id="evt-001", timestamp=1000,
        event_type="occluded_pedestrian_crossing",
        severity="high", scene_id="intersection-demo",
        scenario_id="GP-01", run_id="run-001",
        involved_objects=[{"type": "person", "track_id": 1}],
        min_ttc=1.4, source={"device_type": "cloud_agent"},
    ).to_dict()

    for payload, message_type in (
        (status, "vehicle_status"),
        (decision, "decision"),
        (event, "event"),
    ):
        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(payload["message_type"], message_type)
        self.assertEqual(payload["scenario_id"], "GP-01")
        self.assertEqual(payload["run_id"], "run-001")

def test_legacy_message_defaults_remain_stable(self):
    payload = VehicleStatus(
        timestamp=1000, vehicle_id="vehicle_001",
        position=[0.0, 0.0], velocity=[0.0, 0.0],
        heading=0.0, speed=0.0,
    ).to_dict()
    self.assertEqual(payload["schema_version"], 1)
    self.assertEqual(payload["message_type"], "vehicle_status")
    self.assertEqual(payload["scene_id"], "scene_001")
    self.assertIsNone(payload["scenario_id"])
    self.assertIsNone(payload["run_id"])
~~~

在 tests/test_demo_engine.py 增加 perception、vehicle_status、decision 的 scenario_id 和 run_id 一致性断言。

- [ ] Step 2: 运行失败测试。

~~~powershell
python -m unittest tests.test_protocol tests.test_demo_engine -v
~~~

Expected: 新参数尚不存在而失败，旧测试可导入。

- [ ] Step 3: 实现协议字段。

在已有必填字段之后增加可选字段：

~~~python
# PerceptionMessage
scenario_id: Optional[str] = None
run_id: Optional[str] = None

# VehicleStatus
schema_version: int = 1
message_type: str = "vehicle_status"
scene_id: str = "scene_001"
scenario_id: Optional[str] = None
run_id: Optional[str] = None
source: dict = field(default_factory=dict)

# DecisionMessage
schema_version: int = 1
message_type: str = "decision"
scene_id: str = "scene_001"
scenario_id: Optional[str] = None
run_id: Optional[str] = None
source: dict = field(default_factory=dict)
scenario_event: Optional[dict] = None

# CloudEvent
schema_version: int = 1
message_type: str = "event"
scenario_id: Optional[str] = None
run_id: Optional[str] = None
source: dict = field(default_factory=dict)
~~~

to_dict() 必须输出这些字段；PerceptionMessage 保留 scenario 兼容字段，scenario_id 不为空时 scenario 输出相同值；DetectedObject 增加可选 subtype、heading、actor_id。

- [ ] Step 4: 运行 focused test。

~~~powershell
python -m unittest tests.test_protocol tests.test_demo_engine -v
~~~

Expected: PASS，旧调用不需要新增参数。

- [ ] Step 5: 提交。

~~~powershell
git add src/communication/protocol.py tests/test_protocol.py tests/test_demo_engine.py
git commit -m "feat: unify scenario runtime message metadata"
~~~

---

## Task 2: DataStore 场景表和 run_id 迁移

Files:
- Modify: src/cloud_twin/data_store.py
- Create: tests/test_data_store_scenarios.py
- Modify: tests/test_demo_engine.py

- [ ] Step 1: 写迁移和运行隔离测试。

~~~python
def test_new_database_contains_scenario_tables(self):
    with tempfile.TemporaryDirectory() as tmp:
        store = DataStore(str(Path(tmp) / "scenario.db"))
        with sqlite3.connect(store.db_path) as conn:
            tables = {
                row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
    self.assertTrue({
        "scenario_templates", "scenario_actors",
        "scenario_keyframes", "scenario_events", "scenario_runs",
    }.issubset(tables))

def test_same_frame_id_isolated_by_run_id(self):
    with tempfile.TemporaryDirectory() as tmp:
        store = DataStore(str(Path(tmp) / "scenario.db"))
        store.store_frame(
            frame_id=0, run_id="run-a", timestamp=1000,
            scene_id="intersection-demo", node_id="mock-roadside-001",
            perception={"scenario_id": "GP-01"},
        )
        store.store_frame(
            frame_id=0, run_id="run-b", timestamp=2000,
            scene_id="intersection-demo", node_id="mock-roadside-001",
            perception={"scenario_id": "GP-08"},
        )
        rows = store.list_frames("run-a") + store.list_frames("run-b")
    self.assertEqual(len(rows), 2)

def test_legacy_frames_are_migrated_to_legacy_run(self):
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "legacy.db")
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "CREATE TABLE frames (frame_id INTEGER PRIMARY KEY, "
                "timestamp INTEGER NOT NULL, scene_id TEXT NOT NULL, "
                "node_id TEXT, perception_data TEXT, decision_data TEXT, "
                "vehicle_status TEXT)"
            )
            conn.execute(
                "INSERT INTO frames VALUES "
                "(7, 1007, 'scene_001', 'roadside_001', '{}', NULL, NULL)"
            )
            conn.commit()
        store = DataStore(db_path)
        frame = store.get_frame(7, "legacy-run")
    self.assertEqual(frame["run_id"], "legacy-run")
    self.assertEqual(frame["frame_id"], 7)
~~~

- [ ] Step 2: 运行失败测试。

~~~powershell
python -m unittest tests.test_data_store_scenarios -v
~~~

Expected: 新场景表和 run_id 接口不存在。

- [ ] Step 3: 增加 DDL 和迁移。

DataStore 初始化必须创建设计规格中的 scenario_templates、scenario_actors、scenario_keyframes、scenario_events、scenario_runs。对 frames 使用 PRAGMA table_info(frames) 检测 run_id；缺少时在事务内重命名旧表、创建主键为 run_id + frame_id 的新表、复制数据到 run_id=legacy-run、删除临时旧表。对 events 增加缺失的 run_id、scenario_id 列和 idx_events_run_ts(run_id, timestamp) 索引。迁移失败必须回滚并抛出异常。

核心复制 SQL：

~~~sql
INSERT INTO frames(
    run_id, frame_id, timestamp, scene_id, node_id,
    perception_data, decision_data, vehicle_status
)
SELECT
    'legacy-run', frame_id, timestamp, scene_id, node_id,
    perception_data, decision_data, vehicle_status
FROM frames_legacy;
~~~

- [ ] Step 4: 固定 DataStore 新接口。

~~~python
def store_frame(self, frame_id, timestamp, scene_id, node_id=None,
                perception=None, decision=None, vehicle_status=None,
                run_id="legacy-run") -> None

def get_frame(self, frame_id, run_id="legacy-run") -> Optional[dict]

def list_frames(self, run_id, limit=1000) -> list[dict]

def create_scenario_run(self, run_id, scenario_id, started_at,
                        requested_fps, loop_enabled, random_seed) -> None

def finish_scenario_run(self, run_id, status, ended_at,
                        current_frame, error_message=None) -> None
~~~

没有 run_id 的旧调用继续使用 legacy-run；新的场景链路必须显式传运行 ID。

- [ ] Step 5: 运行回归。

~~~powershell
python -m unittest tests.test_data_store_scenarios tests.test_demo_engine tests.test_mini_split_evaluation -v
~~~

Expected: PASS，旧事件回放和评估测试不被复合主键破坏。

- [ ] Step 6: 提交。

~~~powershell
git add src/cloud_twin/data_store.py tests/test_data_store_scenarios.py tests/test_demo_engine.py
git commit -m "feat: isolate replay data by scenario run"
~~~

---

## Task 3: 场景模型、Repository 和 16 个 SQLite 种子

Files:
- Create: src/scenario_library/__init__.py
- Create: src/scenario_library/models.py
- Create: src/scenario_library/repository.py
- Create: src/scenario_library/seed_data.py
- Create: scripts/seed_scenario_library.py
- Create: tests/test_scenario_library.py

- [ ] Step 1: 写场景完整性测试。

~~~python
EXPECTED_SCENARIOS = {
    "GP-01", "GP-02", "GP-03", "GP-04", "GP-05", "GP-06", "GP-07", "GP-08",
    "NM-01", "NM-02", "NM-03", "NM-04",
    "IC-01", "IC-02", "IC-03", "IC-04",
}

def test_seed_is_idempotent_and_complete(self):
    with tempfile.TemporaryDirectory() as tmp:
        repository = ScenarioRepository(str(Path(tmp) / "scenario.db"))
        seed_scenario_library(repository)
        seed_scenario_library(repository)
        scenarios = repository.list_scenarios()
        counts = repository.validate_library()
    self.assertEqual({item.scenario_id for item in scenarios}, EXPECTED_SCENARIOS)
    self.assertEqual(counts["templates"], 16)
    self.assertEqual(counts["categories"], {
        "ghost_probe": 8,
        "non_motor": 4,
        "intersection_conflict": 4,
    })

def test_each_scenario_has_ego_target_and_four_events(self):
    with tempfile.TemporaryDirectory() as tmp:
        repository = ScenarioRepository(str(Path(tmp) / "scenario.db"))
        seed_scenario_library(repository)
        for summary in repository.list_scenarios():
            detail = repository.get_scenario(summary.scenario_id)
            roles = [actor.role for actor in detail.actors]
            self.assertEqual(roles.count("ego"), 1)
            self.assertGreaterEqual(roles.count("target"), 1)
            self.assertGreaterEqual(len(detail.events), 4)
            self.assertGreaterEqual(len(detail.keyframes), len(detail.actors) * 3)
~~~

- [ ] Step 2: 运行失败测试。

~~~powershell
python -m unittest tests.test_scenario_library -v
~~~

Expected: import failure。

- [ ] Step 3: 定义模型和 Repository。

models.py 定义 ScenarioSummary、ScenarioActor、ScenarioKeyframe、ScenarioEventRule、ScenarioDetail 五个 dataclass。关键字段固定为：

~~~python
@dataclass(frozen=True)
class ScenarioKeyframe:
    scenario_id: str
    actor_id: str
    t_ms: int
    position: tuple[float, float]
    velocity: tuple[float, float]
    heading_deg: float
    occlusion_level: int
    confidence: float
    visible: bool
    behavior_state: str

@dataclass(frozen=True)
class ScenarioEventRule:
    scenario_id: str
    event_key: str
    event_order: int
    t_ms: int
    event_type: str
    severity: str
    description: str
    involved_actor_ids: tuple[str, ...]
    expected_decision: dict
~~~

Repository 公共方法固定为 list_scenarios、get_scenario、upsert_seed、validate_library、create_run、update_run。upsert_seed 必须按 scenario_id、scenario_id + actor_id、scenario_id + actor_id + t_ms、scenario_id + event_key 幂等 upsert，不删除运行历史。

- [ ] Step 4: 写入 16 个声明式种子。

seed_data.py 只有一个 SCENARIO_SEEDS 列表作为安装输入，运行时编译器不能读取它，也不能按 scenario_id 写 16 个 Python 生成分支。矩阵中的第四列是遮挡或道路配置名称，不是 actor_class；动态参与者仍使用 car、bus、truck、person、bicycle、motorcycle 六个协议类别。固定矩阵：

~~~python
SCENARIO_MATRIX = {
    "GP-01": ("ghost_probe", 12000, 6200, "bus", "person"),
    "GP-02": ("ghost_probe", 12000, 6000, "truck", "person"),
    "GP-03": ("ghost_probe", 11000, 5400, "car", "person"),
    "GP-04": ("ghost_probe", 13000, 6800, "building", "person"),
    "GP-05": ("ghost_probe", 13000, 7000, "truck", "person"),
    "GP-06": ("ghost_probe", 12000, 6100, "car", "person"),
    "GP-07": ("ghost_probe", 15000, 7600, "car", "person"),
    "GP-08": ("ghost_probe", 15000, 8200, "car", "person"),
    "NM-01": ("non_motor", 10000, 4800, "van", "motorcycle"),
    "NM-02": ("non_motor", 11000, 5200, "car", "motorcycle"),
    "NM-03": ("non_motor", 14000, 7200, "bicycle", "bicycle"),
    "NM-04": ("non_motor", 14000, 7600, "car", "bicycle"),
    "IC-01": ("intersection_conflict", 13000, 6500, "signal", "car"),
    "IC-02": ("intersection_conflict", 14000, 7000, "car", "car"),
    "IC-03": ("intersection_conflict", 12000, 6000, "none", "car"),
    "IC-04": ("intersection_conflict", 15000, 7800, "ramp", "car"),
}
~~~

每个元素必须包含 template、actors、keyframes、events；每个场景至少一个 ego、一个 target、一个遮挡或冲突参与者、4 个事件；GP-07 有两个行人，NM-03 有三辆自行车，IC-02 有连续航向变化关键帧。

- [ ] Step 5: 运行幂等种子验证。

~~~powershell
python scripts/seed_scenario_library.py --database data/v2x_cloud.db
python scripts/seed_scenario_library.py --database data/v2x_cloud.db --check
~~~

Expected：templates=16，ghost_probe=8，non_motor=4，intersection_conflict=4，缺失项为空。

- [ ] Step 6: 提交。

~~~powershell
git add src/scenario_library scripts/seed_scenario_library.py tests/test_scenario_library.py
git commit -m "feat: add sqlite scenario library with sixteen seeds"
~~~

---

## Task 4: 关键帧编译器和确定性轨迹

Files:
- Create: src/scenario_library/compiler.py
- Create: tests/test_scenario_compiler.py

- [ ] Step 1: 写编译器失败测试。

~~~python
def test_compiler_interpolates_position_and_velocity(self):
    compiler = ScenarioCompiler(make_two_keyframe_repository())
    frame = compiler.compile_at("TEST", "run-001", 500, 1500, 42)
    target = next(item for item in frame.perception["objects"] if item["track_id"] == 1)
    self.assertAlmostEqual(target["world_pos"][0], 5.0, places=4)
    self.assertEqual(target["occlusion_level"], 2)

def test_gp07_has_two_pedestrian_tracks(self):
    frame = compile_at("GP-07", 7600)
    people = [item for item in frame.perception["objects"] if item["class"] == "person"]
    self.assertEqual({item["track_id"] for item in people}, {1, 2})

def test_gp08_reverses_velocity(self):
    before = get_object(compile_at("GP-08", 7600), class_name="person")
    after = get_object(compile_at("GP-08", 9000), class_name="person")
    self.assertLess(before["velocity"][1] * after["velocity"][1], 0.0)

def test_nm03_has_lateral_lane_change(self):
    bicycle = get_object(compile_at("NM-03", 7200), track_id=2)
    self.assertGreater(abs(bicycle["velocity"][1]), 0.1)

def test_ic02_heading_changes(self):
    first = compile_at("IC-02", 5000)
    second = compile_at("IC-02", 6500)
    self.assertNotEqual(first.vehicle_status["heading"], second.vehicle_status["heading"])

def test_same_seed_is_deterministic(self):
    self.assertEqual(
        compile_at("GP-01", 6000, random_seed=7).to_json(),
        compile_at("GP-01", 6000, random_seed=7).to_json(),
    )
~~~

- [ ] Step 2: 运行失败测试。

~~~powershell
python -m unittest tests.test_scenario_compiler -v
~~~

Expected: import failure。

- [ ] Step 3: 实现 ScenarioCompiler 和 CompiledFrame。

CompiledFrame 必须包含 frame_id、timestamp、scene_id、scenario_id、run_id、perception、vehicle_status、decision_context、active_events。compile_at(scenario_id, run_id, t_ms, timestamp, random_seed) 先校验时间范围，再对每个 actor 查找前后关键帧；位置用速度切线 Hermite 插值，航向用最短角插值，遮挡和可见性按关键帧保持，置信度线性插值。

感知对象输出 track_id、class、subtype、world_pos、velocity、heading、confidence、occlusion_level、coordinate_status=valid 和空 predicted_traj。visible=0 不加入 objects；visible=1 且 occlusion_level=3 仍加入 objects。

- [ ] Step 4: 组装自车状态和决策上下文。

vehicle_status 直接取 ego actor 的位置、速度、航向和速度模长，不允许前端推进自车。decision_context 至少包含 scenario_id、run_id、target_object 和当前 scenario_event：

~~~python
{
    "scenario_id": scenario_id,
    "run_id": run_id,
    "target_object": {"track_id": target_track_id, "class": target_class},
    "scenario_event": active_event_dict_or_none,
}
~~~

- [ ] Step 5: 运行测试。

~~~powershell
python -m unittest tests.test_scenario_compiler -v
~~~

Expected: PASS，GP-07、GP-08、NM-03、IC-02 行为断言全部通过。

- [ ] Step 6: 提交。

~~~powershell
git add src/scenario_library/compiler.py tests/test_scenario_compiler.py
git commit -m "feat: compile scenario keyframes into realtime frames"
~~~

---

## Task 5: 无硬件 MQTT 播放和风险决策

Files:
- Create: src/scenario_library/playback_service.py
- Create: tests/test_scenario_playback.py

- [ ] Step 1: 写 MQTT 输出测试。

~~~python
async def test_playback_publishes_three_topics(self):
    broker = InMemoryBroker()
    publisher = InMemoryMQTTClient("scenario-publisher", broker=broker)
    subscriber = InMemoryMQTTClient("test-subscriber", broker=broker)
    received = {"perception": [], "status": [], "decision": []}

    subscriber.subscribe(
        "v2x/intersection-demo/roadside/+/perception",
        lambda topic, payload: received["perception"].append(payload),
    )
    subscriber.subscribe(
        "v2x/intersection-demo/vehicle/+/status",
        lambda topic, payload: received["status"].append(payload),
    )
    subscriber.subscribe(
        "v2x/intersection-demo/vehicle/+/decision",
        lambda topic, payload: received["decision"].append(payload),
    )
    subscriber.connect()
    publisher.connect()

    service = make_playback_service(publisher)
    await service.step_once("GP-01")

    self.assertEqual(len(received["perception"]), 1)
    self.assertEqual(len(received["status"]), 1)
    self.assertEqual(len(received["decision"]), 1)
    self.assertTrue(received["perception"][0]["source"]["simulation"])
    self.assertEqual(received["perception"][0]["scenario_id"], "GP-01")
~~~

另测 stop 后 frame_index 不再增长，运行状态为 stopped。

- [ ] Step 2: 运行失败测试。

~~~powershell
python -m unittest tests.test_scenario_playback -v
~~~

Expected: import failure。

- [ ] Step 3: 实现播放接口。

ScenarioPlaybackService 必须提供 start(scenario_id, fps=10.0, loop=False, random_seed=42)、stop()、step_once(scenario_id=None)、status()。start 创建 scenario_runs 记录和 asyncio.Task；stop 取消任务、更新运行状态并发布一次空感知清场帧；step_once 只推进一帧；后台循环按 1/fps 睡眠。

- [ ] Step 4: 复用现有风险模块生成决策。

每帧按以下顺序：编译场景；将对象和 ego 状态传给 RiskAssessor.assess；将风险等级和速度传给 BrakeController.compute；用结果组装 VehicleStatus 和 DecisionMessage；把当前事件规则写进 decision.scenario_event；发布：

~~~python
perception_topic = f"v2x/{scene_id}/roadside/{node_id}/perception"
status_topic = f"v2x/{scene_id}/vehicle/{vehicle_id}/status"
decision_topic = f"v2x/{scene_id}/vehicle/{vehicle_id}/decision"
~~~

实际代码使用项目既有 v2x 前缀。Mock 播放只替换数据源，不绕过 CloudAgent 和大屏。以后真车接入时，用真实 VehicleAgent 替换该模拟车辆适配器。

- [ ] Step 5: 运行回归。

~~~powershell
python -m unittest tests.test_scenario_playback tests.test_cloud_agent_stgnn tests.test_mqtt_broker_demo -v
~~~

Expected: PASS；每帧 frame_id、timestamp、scenario_id、run_id 一致。

- [ ] Step 6: 提交。

~~~powershell
git add src/scenario_library/playback_service.py tests/test_scenario_playback.py
git commit -m "feat: publish sqlite scenarios through mqtt"
~~~

---

## Task 6: CloudAgent、通用事件和场景 API

Files:
- Modify: src/cloud_twin/cloud_agent.py
- Modify: src/cloud_twin/demo_engine.py
- Modify: src/cloud_twin/api.py
- Create: tests/test_scenario_api.py
- Modify: tests/test_cloud_agent_stgnn.py
- Modify: tests/test_demo_engine.py

- [ ] Step 1: 写场景 API 和事件测试。

~~~python
def test_list_scenarios_returns_sixteen_items(self):
    client = make_api_test_client_with_seeded_store()
    response = client.get("/api/v1/scenarios")
    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.json()["total"], 16)

def test_demo_start_accepts_scenario_id(self):
    client = make_api_test_client_with_seeded_store()
    response = client.post("/api/v1/demo/start?scenario_id=GP-08&fps=10&loop=false")
    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.json()["scenario_id"], "GP-08")
    self.assertTrue(response.json()["run_id"])

def test_cloud_event_uses_scenario_event_metadata(self):
    agent = make_cloud_agent_for_test()
    agent._check_event({
        "timestamp": 1000, "scenario_id": "NM-01", "run_id": "run-001",
        "risk_level": "DANGER", "ttc": 1.2, "brake_decel": 5.0,
        "vehicle_id": "mock-vehicle-001",
        "target_object": {"track_id": 4, "class": "motorcycle"},
        "scenario_event": {
            "event_type": "high_speed_occluded_crossing",
            "severity": "high",
            "description": "电动车从遮挡处高速穿出",
            "involved_actor_ids": ["ego", "target-bike", "occluder-van"],
        },
    })
    total, events = agent.store.get_events(scene_id="scene_001")
    self.assertEqual(total, 1)
    self.assertEqual(events[0]["event_type"], "high_speed_occluded_crossing")
~~~

- [ ] Step 2: 运行失败测试。

~~~powershell
python -m unittest tests.test_scenario_api tests.test_cloud_agent_stgnn tests.test_demo_engine -v
~~~

Expected：/scenarios 不存在或事件仍硬编码为 ghost_probe。

- [ ] Step 3: 让 CloudAgent 以 run_id 落库并广播 enriched perception。

_on_perception、_on_vehicle_status、_on_decision 都读取 payload 的 run_id，缺失时使用 legacy-run；感知先调用 CloudSTGNNService.update_and_predict，再 store_frame，再 broadcast。相同 run_id + frame_id 的三类消息必须合并到一条 frames 记录。广播 payload 必须保留 scenario_id、run_id 和 prediction。

- [ ] Step 4: 把 _check_event 改为通用事件。

保留 TTC、DANGER/EMERGENCY 和 cooldown 条件；event_type、severity、description、involved_objects 优先读取 decision.scenario_event，缺少规则时回退到 ghost_probe、风险等级和 target_object。事件写入 scene_id、scenario_id、run_id。不得固定把所有目标类型写成 pedestrian。

- [ ] Step 5: 修改 DemoEngine 和 API。

兼容映射固定为：

~~~python
LEGACY_SCENARIO_ALIASES = {
    "light": "GP-03",
    "moderate": "GP-01",
    "heavy": "GP-05",
}
~~~

DemoEngine 内部委托 ScenarioPlaybackService；旧 scenario 参数映射到 scenario_id，并同时返回 scenario 和 scenario_id。api.py 增加：

~~~python
@app.get("/api/v1/scenarios")
async def list_scenarios():
    items = scenario_repository.list_scenarios()
    return {"total": len(items), "items": [asdict(item) for item in items]}

@app.get("/api/v1/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str):
    return asdict(scenario_repository.get_scenario(scenario_id))
~~~

/demo/start 支持 scenario_id、scenario、fps、loop，优先 scenario_id；/demo/status 返回 run_id、scenario_id、frame_index 和运行状态。

- [ ] Step 6: 运行 API 和 STGNN 回归。

~~~powershell
python -m unittest tests.test_scenario_api tests.test_cloud_agent_stgnn tests.test_demo_engine tests.test_cloud_stgnn_service -v
~~~

Expected: PASS；旧三档和 16 场景 API 都可用。

- [ ] Step 7: 提交。

~~~powershell
git add src/cloud_twin/cloud_agent.py src/cloud_twin/demo_engine.py src/cloud_twin/api.py tests/test_scenario_api.py tests/test_cloud_agent_stgnn.py tests/test_demo_engine.py
git commit -m "feat: expose sqlite scenarios through cloud api"
~~~

---

## Task 7: 无硬件 MQTT 启动脚本和端到端测试

Files:
- Create: scripts/run_scenario_demo.ps1
- Create: tests/test_scenario_e2e.py
- Modify: scripts/start_mqtt_demo.ps1
- Modify: docs/END_TO_END_DEMO.md

- [ ] Step 1: 写内存 Broker 端到端测试。

对 GP-01、GP-07、NM-03、IC-02 各播放 30 帧，断言每个场景 perception_messages=30、stored_frames=30、broadcast_frames=30、scenario_id 正确、prediction.status 至少出现 deferred、原始图像字段数为 0。

- [ ] Step 2: 运行失败测试。

~~~powershell
python -m unittest tests.test_scenario_e2e -v
~~~

Expected: 编排函数不存在。

- [ ] Step 3: 实现内存测试夹具。

夹具将 CloudAgent.store 替换为临时 DataStore，将 _broadcast 替换为收集器，让播放服务和 CloudAgent 使用同一个 InMemoryBroker。每条消息必须沿 MQTT Topic 进入 CloudAgent，不能直接调用 API 广播绕过 MQTT。

- [ ] Step 4: 实现 scripts/run_scenario_demo.ps1。

参数固定为 ScenarioId、Fps、Loop、DatabasePath、ApiPort、InMemory、DryRun。默认启动本地 Broker、CloudAgent API、场景发布器和前端；InMemory 只用于测试；DryRun 只打印场景和 Topic。脚本只能清理自己记录的进程 ID，不删除数据库或仓库目录。

- [ ] Step 5: 运行启动验证。

~~~powershell
python -m unittest tests.test_scenario_e2e -v
python scripts/seed_scenario_library.py --database data/scenario_demo.db --check
.\scripts\run_scenario_demo.ps1 -ScenarioId GP-01 -Fps 10 -DryRun
~~~

Expected：E2E 通过，场景数量为 16，DryRun 打印 roadside perception、vehicle status、vehicle decision 三条 Topic。

- [ ] Step 6: 提交。

~~~powershell
git add scripts/run_scenario_demo.ps1 scripts/start_mqtt_demo.ps1 tests/test_scenario_e2e.py docs/END_TO_END_DEMO.md
git commit -m "feat: add no-hardware scenario mqtt e2e harness"
~~~

---

## Task 8: 前端类型、场景选择和 WebSocket 适配

Files:
- Modify: frontend/src/types/realtime.ts
- Modify: frontend/src/services/demoApi.ts
- Create: frontend/src/services/demoApi.test.ts
- Modify: frontend/src/pages/monitor/MonitorPage.tsx

- [ ] Step 1: 增加失败测试和类型。

~~~ts
export type DataMode = 'live' | 'stale' | 'fallback';

export interface ScenarioSummary {
  scenario_id: string;
  name: string;
  category: 'ghost_probe' | 'non_motor' | 'intersection_conflict';
  duration_ms: number;
  default_fps: number;
  environment: Record<string, unknown>;
}

export interface DemoRunStatus {
  running: boolean;
  status: 'idle' | 'running' | 'completed' | 'stopped' | 'failed';
  run_id?: string;
  scene_id: string;
  scenario_id?: string;
  scenario?: string;
  frame_index: number;
  duration_ms?: number;
  fps: number;
  loop: boolean;
  available_scenarios: number;
}
~~~

demoApi.test.ts 验证 list 请求 /scenarios，start 发送 scenario_id、fps、loop，旧三档仍能兼容。

- [ ] Step 2: 运行失败测试。

~~~powershell
cd frontend
npm run test:ui -- src/services/demoApi.test.ts --run
~~~

Expected：新接口测试失败。

- [ ] Step 3: 实现 API。

将现有 requestDemo 改为泛型请求函数，并使用它封装：

~~~ts
export const demoApi = {
  list: () => requestDemo<{ total: number; items: ScenarioSummary[] }>('/scenarios'),
  status: () => requestDemo<DemoRunStatus>('/demo/status'),
  start: (scenarioId = 'GP-01', fps = 10, loop = false) => {
    const params = new URLSearchParams({
      scenario_id: scenarioId,
      fps: String(fps),
      loop: String(loop),
    });
    return requestDemo<DemoRunStatus>(
      '/demo/start?' + params.toString(),
      { method: 'POST' },
    );
  },
  stop: () => requestDemo<DemoRunStatus>('/demo/stop', { method: 'POST' }),
  step: (scenarioId = 'GP-01') => requestDemo<DemoRunStatus>(
    '/demo/step?scenario_id=' + encodeURIComponent(scenarioId),
    { method: 'POST' },
  ),
};
~~~

Monitor 页面加载场景列表，选择场景后调用 start(scenarioId, fps, loop)，显示 scenario_id、run_id、frame_index，不删除原页面功能。

- [ ] Step 4: 运行全量 UI 测试。

~~~powershell
cd frontend
npm run test:ui -- --reporter=dot
~~~

Expected：新测试和已有测试全部通过。

- [ ] Step 5: 提交。

~~~powershell
git add frontend/src/types/realtime.ts frontend/src/services/demoApi.ts frontend/src/services/demoApi.test.ts frontend/src/pages/monitor/MonitorPage.tsx
git commit -m "feat: expose scenario selection in frontend"
~~~

---

## Task 9: 坐标转换、对象池和实时状态机

Files:
- Create: frontend/src/pages/zhiluwujie/sceneCoordinates.ts
- Create: frontend/src/pages/zhiluwujie/sceneObjectPool.ts
- Create: frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.ts
- Create: frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts
- Modify: frontend/src/types/realtime.ts

- [ ] Step 1: 写失败测试。

测试必须覆盖：

~~~ts
expect(mapRoadPoint([10, 4], {
  originX: 2, originZ: -3, scale: 2, rotationDeg: 0,
})).toEqual({ x: 10, y: 0, z: 17 });

const adapter = createSceneRealtimeAdapter({ now: () => 1000 });
adapter.onMessage('perception', perceptionPayload({ frame_id: 8, timestamp: 800 }));
adapter.onMessage('perception', perceptionPayload({ frame_id: 7, timestamp: 900 }));
expect(adapter.snapshot().lastFrameId).toBe(8);
~~~

另测目标 1000ms TTL 清理，以及时间从 live 到 stale 到 fallback 的转换。

- [ ] Step 2: 实现唯一坐标转换。

~~~ts
export interface SceneCoordinateConfig {
  originX: number;
  originZ: number;
  scale: number;
  rotationDeg: number;
}

export function mapRoadPoint(
  [worldX, worldY]: [number, number],
  config: SceneCoordinateConfig,
) {
  const x = config.originX + worldY * config.scale;
  const z = config.originZ + worldX * config.scale;
  const angle = (config.rotationDeg * Math.PI) / 180;
  return {
    x: x * Math.cos(angle) - z * Math.sin(angle),
    y: 0,
    z: x * Math.sin(angle) + z * Math.cos(angle),
  };
}

export function mapRoadHeading(headingDeg: number, rotationDeg: number): number {
  return ((headingDeg + rotationDeg) * Math.PI) / 180;
}
~~~

Three.js 之外的代码不得再次交换坐标轴或直接乘比例。

- [ ] Step 3: 实现对象池。

对象键为 nodeId + ':' + trackId。对象池保存 key、trackId、nodeId、class、position、heading、lastSeenAt、occlusionLevel、predictedTrajectory。首帧创建模型，后续帧更新目标状态；缺失目标保留 1000ms，超时才从 Three.js group 移除；clear() 同时清理 group 和内存状态。

- [ ] Step 4: 实现消息适配器。

适配器公共接口：

~~~ts
export interface SceneRealtimeSnapshot {
  dataMode: DataMode;
  objects: PooledObjectState[];
  ego: VehicleStatusPayload | null;
  decision: DecisionPayload | null;
  lastEvent: CloudEventPayload | null;
  lastFrameId: number | null;
  lastMessageAt: number | null;
}

export interface SceneRealtimeAdapter {
  onMessage(type: string, data: RealtimePayload): void;
  onConnectionChange(connected: boolean): void;
  tick(): void;
  snapshot(): SceneRealtimeSnapshot;
  clear(): void;
}
~~~

有效感知、车辆、决策、事件帧刷新 lastMessageAt；1～3 秒无有效数据为 stale，超过 3 秒或连接断开为 fallback；实时恢复为 live；未知类别使用通用对象模型，不抛异常；旧帧直接丢弃。

- [ ] Step 5: 运行 focused test 和提交。

~~~powershell
cd frontend
npm run test:ui -- src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts --run
cd ..
git add frontend/src/pages/zhiluwujie/sceneCoordinates.ts frontend/src/pages/zhiluwujie/sceneObjectPool.ts frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.ts frontend/src/pages/zhiluwujie/sceneRealtimeAdapter.test.ts frontend/src/types/realtime.ts
git commit -m "feat: add realtime scene adapter and object pool"
~~~

Expected：适配器测试通过。

---

## Task 10: ZhiluWujieScene 数据驱动和 Fallback

Files:
- Modify: frontend/src/pages/zhiluwujie/scene.ts
- Modify: frontend/src/pages/zhiluwujie/ZhiluWujiePage.tsx
- Modify: frontend/src/pages/zhiluwujie/ZhiluWujiePage.module.css
- Create: frontend/tests/zhiluwujieRealtime.ui.test.tsx

- [ ] Step 1: 写页面失败测试。

用 fake wsService 消息触发场景，验证页面出现 LIVE、场景 GP-01，4 秒无消息后出现 FALLBACK。测试不依赖真实 WebGL。

- [ ] Step 2: 给 ZhiluWujieScene 增加公共 API。

增加 applyPerception、applyVehicleStatus、applyDecision、applyEvent、setDataMode、clearDynamicObjects、getRealtimeMetrics。applyVehicleStatus 设置自车位置、速度、航向、加速度；applyDecision 更新 TTC、风险、制动、碰撞概率和决策模式；applyEvent 追加事件日志和时间线。

- [ ] Step 3: 隔离固定循环。

将 updateScenario(delta) 改名为 updateFallbackScenario(delta)，只在 dataMode 为 fallback 且 mode 为 ego 时调用。实时 live/stale 不推进固定循环；stale 保持最后状态；切到 fallback 前清理实时对象；实时恢复时清理 fallback 对象。

- [ ] Step 4: 订阅现有 wsService。

页面挂载时调用 wsService.connect()，用 onMessage 分发 perception、vehicle_status、decision、event，用 onConnectionChange 更新连接状态；每 200ms 调用 adapter.tick() 并把 snapshot 传给 scene。卸载时取消两个订阅并调用 scene.dispose()。

- [ ] Step 5: 保留原有大屏面板并增加来源标识。

显示 LIVE、STALE 或 FALLBACK，以及 scenario_id、场景中文名和 run_id。EGO、TRAFFIC、V2I、ALGO 面板继续存在；关键数字从实时状态聚合；无消息时不能显示真实设备在线。

- [ ] Step 6: 运行构建和 UI 测试。

~~~powershell
cd frontend
npm run test:ui -- --reporter=dot
npm run build
cd ..
~~~

Expected：PASS，TypeScript 无订阅、类型或 Three.js 错误。

- [ ] Step 7: 提交。

~~~powershell
git add frontend/src/pages/zhiluwujie/scene.ts frontend/src/pages/zhiluwujie/ZhiluWujiePage.tsx frontend/src/pages/zhiluwujie/ZhiluWujiePage.module.css frontend/tests/zhiluwujieRealtime.ui.test.tsx
git commit -m "feat: drive zhilu wujie scene from realtime data"
~~~

---

## Task 11: 启动脚本、文档和场景验证

Files:
- Create: scripts/verify_scenario_library.py
- Modify: scripts/verify_startup_docs.py
- Modify: docs/API_SPEC.md
- Modify: docs/DATA_MODEL.md
- Modify: docs/END_TO_END_DEMO.md
- Modify: 启动.md

- [ ] Step 1: 更新 API、SQLite 和迁移文档。

必须记录：

~~~text
GET  http://localhost:8000/api/v1/scenarios
POST http://localhost:8000/api/v1/demo/start?scenario_id=GP-01&fps=10&loop=false
GET  http://localhost:8000/api/v1/demo/status
POST http://localhost:8000/api/v1/demo/stop
~~~

同时说明 run_id + frame_id 是运行帧唯一键，scenario_replay 是模拟来源，Jetson Orin Nano 和 Atlas 200 DK 只需输出统一协议即可替换模拟数据源。

- [ ] Step 2: 实现场景库验证脚本。

scripts/verify_scenario_library.py 接受 --database 和 --frames-per-scenario，逐一加载 16 个详情，编译首帧、中间帧和末帧，验证时间戳单调、坐标有限、目标 track 唯一、至少有一个事件，确认 payload 不包含原始图像。输出：

~~~json
{
  "scenario_count": 16,
  "validated_count": 16,
  "failed_scenarios": [],
  "frames_checked": 240,
  "raw_image_fields": 0
}
~~~

- [ ] Step 3: 运行验证。

~~~powershell
python scripts/seed_scenario_library.py --database data/scenario_demo.db
python scripts/verify_scenario_library.py --database data/scenario_demo.db --frames-per-scenario 15
python scripts/verify_startup_docs.py
~~~

Expected：16 个场景验证通过，文档命令与脚本参数一致。

- [ ] Step 4: 提交。

~~~powershell
git add docs/API_SPEC.md docs/DATA_MODEL.md docs/END_TO_END_DEMO.md 启动.md scripts/verify_startup_docs.py scripts/verify_scenario_library.py
git commit -m "docs: document sixteen scenario demo workflow"
~~~

---

## Task 12: 全量验证和真实 TCP MQTT smoke

Files:
- Test: 后端全量测试、前端测试、构建、lint、场景验证和真实 TCP MQTT smoke
- Modify: 只修复 focused test 暴露的回归文件

- [ ] Step 1: 后端全量测试。

~~~powershell
python -m unittest discover -s tests -v
~~~

Expected：现有和新增测试通过；不新增未说明的 skip。

- [ ] Step 2: 前端测试、构建和 lint。

~~~powershell
cd frontend
npm run test:unit
npm run build
npm run lint
cd ..
~~~

Expected：三条命令退出码均为 0。

- [ ] Step 3: 场景库和代表场景验证。

~~~powershell
python scripts/seed_scenario_library.py --database data/scenario_demo.db --check
python scripts/verify_scenario_library.py --database data/scenario_demo.db --frames-per-scenario 15
python -m unittest tests.test_scenario_e2e -v
~~~

Expected：16/16 场景通过；GP-01、GP-07、NM-03、IC-02 完成 30 帧 Cloud 路径。

- [ ] Step 4: 真实 TCP MQTT smoke。

Mosquitto 可用时执行：

~~~powershell
.\scripts\run_scenario_demo.ps1 -ScenarioId GP-01 -Fps 10 -DatabasePath data/scenario_tcp_smoke.db
~~~

浏览器打开 http://localhost:5173，确认目标动态出现、自车状态来自 vehicle_status、TTC 和事件随数据变化、STGNN 状态真实显示；停止发布器后进入 STALE 再进入 FALLBACK，重新启动后清理模拟对象并恢复 LIVE。

- [ ] Step 5: 完成检查。

~~~powershell
git status --short
git log --oneline -12
~~~

完成定义：

- SQLite 启用场景正好 16 个，分类为 8/4/4。
- 每次运行使用新的 run_id，不同场景相同 frame_id 不覆盖。
- Mock 只替换数据源，协议、MQTT Topic、Cloud STGNN、WebSocket 和大屏接口与真车路径一致。
- 3D 实时模式不运行固定 12 秒循环，Fallback 仍可用。
- 动态对象按 node_id:track_id 创建、更新、TTL 删除。
- 后端、前端、构建、lint、场景验证和 TCP MQTT smoke 全部有记录。

## 13. 规格覆盖和错误处理检查表

执行者在提交 Goal 完成前逐项确认：

- 设计规格第 5 节的五张场景表由 Task 2 创建，第 3 节的 16 个种子由 Task 3 写入。
- 设计规格第 6 节的四类消息元数据由 Task 1 增加，CloudAgent 运行字段由 Task 6 贯通。
- 设计规格第 7 节的 Hermite 插值、可见性、遮挡和确定性由 Task 4 测试。
- 设计规格第 9 节的 REST API 由 Task 6 实现，Task 8 接入场景选择。
- 设计规格第 10 节的 MQTT 三条发布路径和无硬件 TCP smoke 由 Task 5 和 Task 7 覆盖。
- 设计规格第 11 节的对象池、坐标、LIVE/STALE/FALLBACK 和原有面板保留由 Task 9 和 Task 10 覆盖。

错误处理必须满足：

- 不存在的 scenario_id 由 Repository 抛出明确异常，API 返回 404 或 422，不启动半个运行。
- t_ms 超出场景时长、关键帧少于 3 个、缺少 ego 或 target 时，seed check 和 compiler test 必须失败并指出场景 ID。
- SQLite 迁移异常回滚，不创建空库覆盖旧数据；迁移测试保留 legacy-run 数据。
- MQTT 断开时播放循环暂停，不无限积累待发送帧；重连后从下一帧继续。
- Cloud STGNN 失败时沿用现有 prediction.status=fallback 和 prediction.reason，不终止 MQTT 回调线程。
- 前端遇到未知 class、无效 world_pos 或旧 schema 时使用 unknown/general-object 视觉和 legacy 数据状态，不抛出渲染异常。
- WebSocket 客户端断开不停止后端运行；数据停滞由 freshness watchdog 转入 stale/fallback。

## Goal 模式执行目标

启动 Goal 时使用：

~~~text
实现 docs/superpowers/plans/2026-08-09-multi-scenario-sqlite-realtime-screen.md 中定义的 16 场景 SQLite 驱动无硬件 MQTT→Cloud STGNN→WebSocket→Three.js 大屏闭环；严格按 Task 1 到 Task 12 执行，不接入真车，不删除现有回放和 Fallback 路径，完成所有 focused tests、后端全量测试、前端构建、场景库验证和真实 TCP MQTT smoke。
~~~

Goal 完成条件是 Task 12 的完成定义全部满足。Jetson Orin Nano 和 Atlas 200 DK 实机接入只验证协议适配，不放入本 Goal 的完成条件。
