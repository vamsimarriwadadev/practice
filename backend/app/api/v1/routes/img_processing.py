import json
import uuid
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.services.aws.sqs_service import SQSService
from app.services.aws.s3_service import S3Service
from app.services.redis.redis_service import RedisService

router = APIRouter(
    prefix="/img-processing",
    tags=["img-processing"]
)

sqs_service = SQSService()
s3_service = S3Service()
redis_service = RedisService()

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

INPUT_DIR = BASE_DIR / "storage" / "input"

INPUT_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/remove-bg")
async def remove_bg(
    key: str):
    job_id = str(uuid.uuid4())

    # --- Enqueue to SQS ---
    await sqs_service.send_message({
        "job_id": job_id,
        "source_key": key,
    })

    return {
        "success": True,
        "job_id": job_id
    }


@router.get("/job-status/{job_id}")
async def job_status(job_id: str):
    """
    Server-Sent Events (SSE) endpoint.
    Subscribes to the Redis channel for this job and streams progress
    updates to the UI until the job reaches a terminal state
    (completed / failed).
    """
    async def event_generator():
        pubsub = await redis_service.subscribe(f"job:{job_id}")
        try:
            async for raw in pubsub.listen():
                if raw["type"] != "message":
                    continue
                data = raw["data"]
                yield f"data: {data}\n\n"

                # Stop streaming on terminal status
                try:
                    payload = json.loads(data)
                    if payload.get("status") in ("completed", "failed"):
                        break
                except Exception:
                    pass
        finally:
            await pubsub.unsubscribe(f"job:{job_id}")
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )