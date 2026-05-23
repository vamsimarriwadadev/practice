from fastapi import FastAPI
import logging     
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from starlette_exporter import PrometheusMiddleware, handle_metrics
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from app.api.v1.routes.files import router as file_router
from app.api.v1.routes.img_processing import router as img_processing_router
from app.core.logging import setup_logging
from app.middleware.logging_middleware import LoggingMiddleware
from app.services.aws.sqs_service import SQSService
from app.services.aws.s3_service import S3Service


sqs_service = SQSService()
s3_service = S3Service()

setup_logging()

logger = logging.getLogger(__name__)

OTEL_ENABLED = True
OTEL_SERVICE_NAME = "photo-bg-remover-backend"
OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4317"

if OTEL_ENABLED:
    provider = TracerProvider()
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=OTEL_EXPORTER_OTLP_ENDPOINT))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    HTTPXClientInstrumentor().instrument()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up...")
    try:
        await s3_service.create_bucket()
        await sqs_service.create_queue()
    except Exception as e:
        logger.error(f"Failed to auto-create resources: {e}")
    yield
    logger.info("Shutting down...")
    logger.info("stopping server")
    if OTEL_ENABLED:
        trace.get_tracer_provider().shutdown()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(PrometheusMiddleware, app_name="backend", group_paths=True)
app.add_middleware(LoggingMiddleware)

if OTEL_ENABLED:
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)

app.include_router(file_router)
app.include_router(img_processing_router)

app.add_route("/metrics", handle_metrics)

@app.get("/")
async def root():
    return {"message": "Hello World"}