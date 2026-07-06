FROM python:3.10-slim

WORKDIR /app
COPY requirements-ci.txt .
RUN pip install --no-cache-dir -r requirements-ci.txt

COPY src/ src/
COPY configs/ configs/
COPY scripts/ scripts/

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "src.cloud_twin.api:app", "--host", "0.0.0.0", "--port", "8000"]
