from enum import Enum


class ErrorCode(str, Enum):
    # E1xxx - Roadside Perception
    E1001 = "E1001"  # Detection model load failure
    E1002 = "E1002"  # Frame data corrupted
    E1003 = "E1003"  # Calibration parameters missing

    # E2xxx - Vehicle Decision
    E2001 = "E2001"  # Roadside message timeout
    E2002 = "E2002"  # TTC calculation exception
    E2003 = "E2003"  # State machine illegal transition

    # E3xxx - Cloud Storage
    E3001 = "E3001"  # Database write failure
    E3002 = "E3002"  # API request timeout
    E3003 = "E3003"  # Event search empty

    # E4xxx - Communication
    E4001 = "E4001"  # MQTT disconnected
    E4002 = "E4002"  # Message deserialization failure
    E4003 = "E4003"  # Schema version incompatible

    # E5xxx - Data Layer
    E5001 = "E5001"  # Data file not found
    E5002 = "E5002"  # Frame sequence discontinuous
    E5003 = "E5003"  # Annotation format error


ERROR_MESSAGES = {
    ErrorCode.E1001: "检测模型加载失败",
    ErrorCode.E1002: "帧数据损坏",
    ErrorCode.E1003: "标定参数缺失",
    ErrorCode.E2001: "路侧消息超时",
    ErrorCode.E2002: "TTC计算异常",
    ErrorCode.E2003: "状态机非法转换",
    ErrorCode.E3001: "数据库写入失败",
    ErrorCode.E3002: "API请求超时",
    ErrorCode.E3003: "事件检索为空",
    ErrorCode.E4001: "MQTT连接断开",
    ErrorCode.E4002: "消息反序列化失败",
    ErrorCode.E4003: "Schema版本不兼容",
    ErrorCode.E5001: "数据文件不存在",
    ErrorCode.E5002: "帧序列不连续",
    ErrorCode.E5003: "标注格式错误",
}
