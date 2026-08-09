"""Declarative seed data for the sixteen approved demonstration scenarios."""

from __future__ import annotations

from typing import Any


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


_SCENARIO_DETAILS: dict[str, dict[str, Any]] = {
    "GP-01": {
        "name": "公交车遮挡行人横穿",
        "description": "公交靠站时行人从车头前穿出，路侧感知提前发现目标。",
        "event_prefix": "bus_occlusion",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
    },
    "GP-02": {
        "name": "大货车遮挡行人",
        "description": "排队等灯的大货车遮挡行人，目标从车缝走出。",
        "event_prefix": "truck_occlusion",
        "environment": {"time": "day", "weather": "overcast", "light": "diffuse"},
    },
    "GP-03": {
        "name": "路边违停车辆遮挡",
        "description": "右侧违停车辆挡住视线，行人从车缝突然进入车道。",
        "event_prefix": "parked_vehicle",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
    },
    "GP-04": {
        "name": "弯道建筑盲区行人",
        "description": "车辆转弯经过建筑墙角，行人从弯道盲区窜出。",
        "event_prefix": "curve_blind_spot",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
    },
    "GP-05": {
        "name": "双车道二次遮挡",
        "description": "左侧大车造成第一次遮挡，右侧车道行人再次穿出。",
        "event_prefix": "dual_lane_occlusion",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
    },
    "GP-06": {
        "name": "夜间红外鬼探头",
        "description": "低照度路口由路侧红外感知发现突然横穿行人。",
        "event_prefix": "night_infrared",
        "environment": {"time": "night", "weather": "clear", "light": "low_light", "sensor": "infrared"},
    },
    "GP-07": {
        "name": "多行人连续穿越",
        "description": "第一名行人通过后第二名紧跟进入，第二目标短暂被遮挡。",
        "event_prefix": "consecutive_pedestrians",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
        "extra_actors": [{"actor_id": "target-2", "track_id": 2, "role": "target", "actor_class": "person", "actor_subtype": "adult"}],
    },
    "GP-08": {
        "name": "行人犹豫折返",
        "description": "行人走到路中间后犹豫折返，轨迹方向在事件窗口内反转。",
        "event_prefix": "pedestrian_return",
        "environment": {"time": "day", "weather": "light_rain", "light": "diffuse"},
    },
    "NM-01": {
        "name": "电动车从遮挡处高速穿出",
        "description": "电动车从厢式车遮挡处高速穿出，制动距离短。",
        "event_prefix": "fast_ebike",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
        "target_subtype": "ebike",
    },
    "NM-02": {
        "name": "外卖骑手逆行横穿",
        "description": "外卖骑手沿相反方向横穿机动车道，TTC 快速下降。",
        "event_prefix": "wrong_way_delivery",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
        "target_subtype": "delivery_rider",
    },
    "NM-03": {
        "name": "自行车队列突然变道",
        "description": "自行车队列中第二辆突然向机动车道变道。",
        "event_prefix": "bicycle_lane_change",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
        "extra_actors": [
            {"actor_id": "bike-2", "track_id": 2, "role": "target", "actor_class": "bicycle", "actor_subtype": "adult"},
            {"actor_id": "bike-3", "track_id": 3, "role": "background", "actor_class": "bicycle", "actor_subtype": "adult"},
        ],
    },
    "NM-04": {
        "name": "儿童骑车轨迹不稳定",
        "description": "儿童骑行速度与方向不稳定，预测轨迹需要持续修正。",
        "event_prefix": "child_cyclist",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
        "target_subtype": "child",
    },
    "IC-01": {
        "name": "黄灯变红抢行",
        "description": "信号灯由黄变红时侧向车辆提前起步进入冲突区。",
        "event_prefix": "signal_transition",
        "environment": {"time": "day", "weather": "clear", "light": "daylight", "signal": "yellow_to_red"},
    },
    "IC-02": {
        "name": "左转车与直行车冲突",
        "description": "左转车辆与对向直行车辆交汇，双方航向连续变化。",
        "event_prefix": "left_turn_conflict",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
        "extra_actors": [{"actor_id": "oncoming-1", "track_id": 2, "role": "conflict", "actor_class": "car", "actor_subtype": "oncoming"}],
    },
    "IC-03": {
        "name": "无信号灯横向来车",
        "description": "无信号灯路口横向车辆未减速直接进入主路。",
        "event_prefix": "unsignalized_crossing",
        "environment": {"time": "day", "weather": "clear", "light": "daylight", "signal": "none"},
    },
    "IC-04": {
        "name": "匝道汇入主路冲突",
        "description": "辅路车辆汇入主路时主路车辆速度较高，形成汇入冲突。",
        "event_prefix": "ramp_merge",
        "environment": {"time": "day", "weather": "clear", "light": "daylight"},
    },
}


def _track(
    scenario_id: str,
    actor_id: str,
    duration_ms: int,
    middle_t_ms: int,
    positions: tuple[tuple[float, float], ...],
    velocities: tuple[tuple[float, float], ...],
    headings: tuple[float, ...],
    occlusions: tuple[int, ...] = (0, 1, 0),
    confidences: tuple[float, ...] = (0.96, 0.85, 0.94),
    behaviors: tuple[str, ...] = ("approach", "occluded_crossing", "clear"),
) -> list[dict[str, Any]]:
    times = (0, middle_t_ms, duration_ms)
    return [
        {
            "scenario_id": scenario_id,
            "actor_id": actor_id,
            "t_ms": times[index],
            "position": positions[index],
            "velocity": velocities[index],
            "heading_deg": headings[index],
            "occlusion_level": occlusions[index],
            "confidence": confidences[index],
            "visible": True,
            "behavior_state": behaviors[index],
        }
        for index in range(3)
    ]


def _events(scenario_id: str, prefix: str, duration_ms: int) -> list[dict[str, Any]]:
    phases = (
        ("approach", "target_approach", "low", "目标进入路侧感知范围"),
        ("occlusion", "target_occluded", "medium", "遮挡体形成自车视线盲区"),
        ("conflict", "collision_risk", "critical", "目标进入潜在冲突区"),
        ("mitigation", "risk_mitigated", "high", "协同决策给出减速或避让建议"),
    )
    return [
        {
            "scenario_id": scenario_id,
            "event_key": f"{prefix}-{name}",
            "event_order": index + 1,
            "t_ms": int(duration_ms * ratio),
            "event_type": event_type,
            "severity": severity,
            "description": description,
            "involved_actor_ids": ["ego", "target-1", "occluder"],
            "expected_decision": {"mode": "cooperative", "action": action},
        }
        for index, (name, event_type, severity, description) in enumerate(phases)
        for ratio, action in ((0.18, "monitor"), (0.43, "prepare_brake"), (0.64, "brake"), (0.86, "stabilize"))
        if ratio == (0.18, 0.43, 0.64, 0.86)[index]
    ]


def _actor(
    scenario_id: str,
    actor_id: str,
    track_id: int | None,
    role: str,
    actor_class: str,
    actor_subtype: str | None = None,
) -> dict[str, Any]:
    return {
        "scenario_id": scenario_id,
        "actor_id": actor_id,
        "track_id": track_id,
        "role": role,
        "actor_class": actor_class,
        "actor_subtype": actor_subtype,
        "dimensions": {"length_m": 4.6 if actor_class == "car" else 0.6, "width_m": 1.8 if actor_class == "car" else 0.6},
        "appearance": {"color": "amber" if role == "target" else "slate"},
    }


def _build_seed(scenario_id: str) -> dict[str, Any]:
    category, duration_ms, trigger_ms, layout_name, target_class = SCENARIO_MATRIX[scenario_id]
    detail = _SCENARIO_DETAILS[scenario_id]
    target_subtype = detail.get("target_subtype")
    template = {
        "scenario_id": scenario_id,
        "name": detail["name"],
        "category": category,
        "description": detail["description"],
        "duration_ms": duration_ms,
        "default_fps": 10.0,
        "coordinate_frame": "road_xy",
        "road_layout": {
            "profile": layout_name,
            "lanes": 2,
            "conflict_point": [8.0, 0.0],
            "scene_origin": [0.0, 0.0],
            "scene_scale": 1.0,
        },
        "environment": detail["environment"],
        "expected_outcome": "协同感知提前预警并完成安全减速",
        "version": 1,
        "enabled": True,
        "source_refs": ["NHTSA pre-crash typology", "ASAM OpenSCENARIO"],
    }
    actors = [
        _actor(scenario_id, "ego", None, "ego", "car", "host_vehicle"),
        _actor(scenario_id, "occluder", 90, "occluder", {"bus": "bus", "truck": "truck"}.get(layout_name, "car"), layout_name),
        _actor(scenario_id, "target-1", 1, "target", target_class if target_class in {"person", "bicycle", "motorcycle", "car"} else "car", target_subtype),
    ]
    for extra in detail.get("extra_actors", []):
        actors.append(_actor(scenario_id, extra["actor_id"], extra["track_id"], extra["role"], extra["actor_class"], extra.get("actor_subtype")))

    keyframes: list[dict[str, Any]] = []
    ego_headings = (0.0, 18.0, 35.0) if scenario_id == "IC-02" else (0.0, 0.0, 0.0)
    keyframes.extend(_track(scenario_id, "ego", duration_ms, trigger_ms, ((-24.0, 0.0), (-12.0, 0.0), (4.0, 0.0)), ((6.0, 0.0), (6.0, 0.0), (4.0, 0.0)), ego_headings, (0, 0, 0), (0.99, 0.99, 0.99), ("cruise", "approach", "mitigated")))
    keyframes.extend(_track(scenario_id, "occluder", duration_ms, trigger_ms, ((4.0, 2.5), (4.0, 2.5), (4.0, 2.5)), ((0.0, 0.0), (0.0, 0.0), (0.0, 0.0)), (0.0, 0.0, 0.0), (0, 3, 1), (0.98, 0.98, 0.98), ("parked", "blocking", "blocking")))

    target_positions = ((15.0, 5.0), (9.0, 1.0), (3.0, -4.0))
    target_velocities = ((0.0, -1.0), (0.0, -1.2), (0.0, -1.0))
    target_headings = (270.0, 270.0, 270.0)
    target_occlusions = (3, 3, 0)
    target_behaviors = ("hidden", "emerging", "crossing")
    if scenario_id == "GP-08":
        target_positions = ((15.0, 5.0), (9.0, -1.0), (11.0, 10.0))
        target_velocities = ((0.0, -1.0), (0.0, -1.0), (0.0, 1.1))
        target_behaviors = ("approach", "hesitate", "return")
    if category == "non_motor":
        target_positions = ((14.0, 4.0), (8.0, 0.5), (2.0, -4.0))
        target_velocities = ((-1.5, -0.8), (-1.4, -1.0), (-1.2, -0.8))
        target_occlusions = (2, 3, 0)
    if category == "intersection_conflict":
        target_positions = ((18.0, -5.0), (8.0, 0.0), (-2.0, 5.0))
        target_velocities = ((-1.5, 0.8), (-1.5, 0.8), (-1.5, 0.8))
        target_headings = (180.0, 165.0, 150.0)
        target_occlusions = (0, 0, 0)
    if scenario_id == "NM-03":
        target_velocities = ((-1.2, 0.0), (-1.1, 0.8), (-1.0, 0.1))
        target_behaviors = ("queue", "lane_change", "merge")
    keyframes.extend(_track(scenario_id, "target-1", duration_ms, trigger_ms, target_positions, target_velocities, target_headings, target_occlusions, (0.7, 0.78, 0.92), target_behaviors))

    for extra in detail.get("extra_actors", []):
        actor_id = extra["actor_id"]
        if actor_id == "target-2":
            positions = ((17.0, 5.5), (11.0, 2.0), (5.0, -3.5))
            velocities = ((0.0, -0.8), (0.0, -1.0), (0.0, -0.9))
            occlusions = (3, 3, 0)
        elif actor_id == "bike-2":
            positions = ((15.0, 3.0), (10.0, 1.8), (5.0, -2.0))
            velocities = ((-1.0, 0.0), (-0.9, -0.7), (-0.8, -0.2))
            occlusions = (1, 2, 0)
        elif actor_id == "bike-3":
            positions = ((17.0, 3.5), (12.0, 3.2), (7.0, 2.8))
            velocities = ((-0.9, 0.0), (-0.9, 0.0), (-0.8, 0.0))
            occlusions = (0, 1, 0)
        else:
            positions = ((18.0, 4.0), (10.0, 1.0), (2.0, -3.0))
            velocities = ((-1.0, -0.2), (-1.0, -0.6), (-0.8, -0.8))
            occlusions = (0, 0, 0)
        keyframes.extend(_track(scenario_id, actor_id, duration_ms, trigger_ms, positions, velocities, (0.0, 0.0, 0.0), occlusions, (0.9, 0.85, 0.9), ("approach", "conflict", "clear")))

    events = _events(scenario_id, detail["event_prefix"], duration_ms)
    return {"template": template, "actors": actors, "keyframes": keyframes, "events": events}


SCENARIO_SEEDS = [_build_seed(scenario_id) for scenario_id in SCENARIO_MATRIX]


def seed_scenario_library(repository: Any) -> None:
    for seed in SCENARIO_SEEDS:
        repository.upsert_seed(seed)
