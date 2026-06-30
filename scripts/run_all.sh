#!/bin/bash
# V2X Ghost-Probe Platform - One-click startup script
# Usage: bash scripts/run_all.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=========================================="
echo "  V2X Ghost-Probe Cooperative Platform"
echo "=========================================="

# 1. Start MQTT Broker
echo "[1/5] Starting MQTT Broker..."
docker-compose up -d mosquitto 2>/dev/null || {
    echo "  Docker not available, trying local mosquitto..."
    if command -v mosquitto &>/dev/null; then
        mosquitto -d -c deployment/mosquitto.conf
    else
        echo "  WARNING: No MQTT broker available. Install mosquitto or docker."
    fi
}
sleep 2

# 2. Start Cloud Agent + API
echo "[2/5] Starting Cloud Agent + API Server..."
python -m src.cloud_twin.cloud_agent &
CLOUD_PID=$!
echo "  Cloud agent PID: $CLOUD_PID"
sleep 2

# 3. Start Vehicle Agent
echo "[3/5] Starting Vehicle Decision Agent..."
python -m src.vehicle_decision.vehicle_agent &
VEHICLE_PID=$!
echo "  Vehicle agent PID: $VEHICLE_PID"
sleep 1

# 4. Start Replay Engine (Roadside Agent)
echo "[4/5] Starting Replay Engine (Roadside Agent)..."
python -m src.roadside_perception.replay_engine &
ROADSIDE_PID=$!
echo "  Roadside agent PID: $ROADSIDE_PID"

# 5. Start Frontend (if in dev mode)
echo "[5/5] Starting Frontend..."
if [ -d "frontend" ]; then
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    echo "  Frontend PID: $FRONTEND_PID"
    cd "$PROJECT_DIR"
fi

echo ""
echo "=========================================="
echo "  All services started!"
echo "  Frontend: http://localhost:5173"
echo "  Cloud API: http://localhost:8000"
echo "  MQTT Broker: localhost:1883"
echo "=========================================="
echo ""
echo "Press Ctrl+C to stop all services"

# Cleanup on exit
cleanup() {
    echo ""
    echo "Stopping all services..."
    kill $CLOUD_PID 2>/dev/null
    kill $VEHICLE_PID 2>/dev/null
    kill $ROADSIDE_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    docker-compose down 2>/dev/null
    echo "All services stopped."
}
trap cleanup EXIT INT TERM

# Wait
wait
