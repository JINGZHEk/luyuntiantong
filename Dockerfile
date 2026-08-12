FROM node:20-alpine AS frontend-build

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    V2X_FRONTEND_DIST=/app/frontend/dist \
    V2X_DATABASE_PATH=/app/runtime/v2x_cloud.db \
    V2X_AUTO_DEMO=true \
    V2X_DEMO_FPS=10 \
    V2X_DEMO_SCENARIO=moderate \
    V2X_DEMO_SCENARIO_ID=GP-01

WORKDIR /app
COPY requirements-ci.txt ./
RUN pip install --no-cache-dir -r requirements-ci.txt

COPY src/ src/
COPY configs/ configs/
COPY scripts/ scripts/
COPY --from=frontend-build /build/frontend/dist frontend/dist/
RUN mkdir -p /app/runtime

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + __import__('os').environ.get('PORT', '8000') + '/health', timeout=3)"

CMD ["sh", "-c", "python -m uvicorn src.cloud_twin.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
