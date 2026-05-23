import asyncio
import json
import logging
import os
import threading
import time
import uuid
from io import BytesIO

import aioboto3
import redis.asyncio as redis
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from PIL import Image
from prometheus_client import Counter, Gauge, Histogram, start_http_server
from pythonjsonlogger import jsonlogger
from rembg import remove, new_session


# --- Logging ---
handler = logging.StreamHandler()
handler.setFormatter(jsonlogger.JsonFormatter(
    fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
))
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
root_logger.handlers.clear()
root_logger.addHandler(handler)

logger = logging.getLogger(__name__)


# --- OpenTelemetry Tracing ---
OTEL_ENABLED = True
OTEL_EXPORTER_OTLP_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://tempo:4317")
OTEL_SERVICE_NAME = "photo-bg-remover-worker"

if OTEL_ENABLED:
    provider = TracerProvider()
    processor = BatchSpanProcessor(
        OTLPSpanExporter(endpoint=OTEL_EXPORTER_OTLP_ENDPOINT)
    )
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)

tracer = trace.get_tracer(__name__)


# --- Prometheus Metrics ---
worker_jobs_total = Counter(
    "worker_jobs_total", "Total jobs processed",
    ["status"]
)
worker_jobs_in_progress = Gauge(
    "worker_jobs_in_progress", "Jobs currently being processed"
)
worker_job_duration_seconds = Histogram(
    "worker_job_duration_seconds", "Job processing duration in seconds",
    buckets=[1, 2, 5, 10, 30, 60, 120, 300]
)


# --- Configuration ---
AWS_ENDPOINT_URL = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4566")
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REGION_NAME = "us-east-1"
QUEUE_NAME = "remove-bg-queue"
BUCKET_NAME = "uploads"
METRICS_PORT = int(os.getenv("WORKER_METRICS_PORT", "8001"))


# --- Services ---
class WorkerServices:
    def __init__(self):
        self.boto_session = aioboto3.Session()
        self.redis_client = redis.Redis(
            host=REDIS_HOST,
            port=6379,
            decode_responses=True
        )

    def get_sqs_client(self):
        return self.boto_session.client(
            "sqs",
            endpoint_url=AWS_ENDPOINT_URL,
            region_name=REGION_NAME,
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )

    def get_s3_client(self):
        return self.boto_session.client(
            "s3",
            endpoint_url=AWS_ENDPOINT_URL,
            region_name=REGION_NAME,
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )

services = WorkerServices()
session = new_session("silueta")


# --- Worker Logic ---
async def publish_progress(job_id: str, progress: int, status: str, output_key: str = None):
    payload = {
        "job_id": job_id,
        "progress": progress,
        "status": status,
    }
    if output_key:
        payload["output_key"] = output_key

    await services.redis_client.publish(
        f"job:{job_id}",
        json.dumps(payload)
    )

async def process_job(message, queue_url: str):
    body = json.loads(message["Body"])
    job_id = body["job_id"]
    source_key = body["source_key"]

    worker_jobs_in_progress.inc()
    start_time = time.time()

    logger.info("processing_job", extra={"job_id": job_id, "source_key": source_key})

    try:
        with tracer.start_as_current_span("process_job") as span:
            span.set_attribute("job_id", job_id)
            span.set_attribute("source_key", source_key)

            await publish_progress(job_id, 10, "starting")

            # 1. Download image directly from S3 to memory
            async with services.get_s3_client() as s3:
                response = await s3.get_object(Bucket=BUCKET_NAME, Key=source_key)
                image_bytes = await response["Body"].read()

            img = Image.open(BytesIO(image_bytes))

            await publish_progress(job_id, 40, "removing_background")

            # 2. Process image with rembg
            output_img = remove(img, session=session)

            await publish_progress(job_id, 80, "saving")

            # 3. Save to in-memory buffer
            output_buffer = BytesIO()
            output_img.save(output_buffer, format="PNG")
            output_bytes = output_buffer.getvalue()

            # 4. Upload result back to S3
            output_s3_key = f"outputs/{job_id}.png"
            async with services.get_s3_client() as s3:
                await s3.put_object(
                    Bucket=BUCKET_NAME,
                    Key=output_s3_key,
                    Body=output_bytes,
                    ContentType="image/png"
                )

            logger.info("job_completed", extra={"job_id": job_id, "output_key": output_s3_key})

            await publish_progress(job_id, 100, "completed", output_key=output_s3_key)

            # 5. Delete message from SQS
            async with services.get_sqs_client() as sqs:
                await sqs.delete_message(
                    QueueUrl=queue_url,
                    ReceiptHandle=message["ReceiptHandle"]
                )

            worker_jobs_total.labels(status="completed").inc()

    except Exception as e:
        logger.error("job_failed", extra={"job_id": job_id, "error": str(e)})
        await publish_progress(job_id, 0, "failed")
        worker_jobs_total.labels(status="failed").inc()

    finally:
        duration = time.time() - start_time
        worker_job_duration_seconds.observe(duration)
        worker_jobs_in_progress.dec()
        logger.info("job_finished", extra={"job_id": job_id, "duration_seconds": round(duration, 3)})

async def worker_loop():
    logger.info("worker_started")

    async with services.get_sqs_client() as sqs:
        response = await sqs.get_queue_url(QueueName=QUEUE_NAME)
        queue_url = response["QueueUrl"]

        while True:
            response = await sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=20,
                VisibilityTimeout=300
            )

            messages = response.get("Messages", [])
            if not messages:
                continue

            tasks = [process_job(msg, queue_url) for msg in messages]
            await asyncio.gather(*tasks)


def start_metrics_server():
    start_http_server(METRICS_PORT)
    logger.info("metrics_server_started", extra={"port": METRICS_PORT})


if __name__ == "__main__":
    metrics_thread = threading.Thread(target=start_metrics_server, daemon=True)
    metrics_thread.start()
    try:
        asyncio.run(worker_loop())
    except KeyboardInterrupt:
        logger.info("worker_shutdown")
        if OTEL_ENABLED:
            trace.get_tracer_provider().shutdown()
