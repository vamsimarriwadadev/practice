# tests/test_s3_processor.py

import json
import pytest
from conftest import invoke

FUNCTION = "dev-s3-processor"
BUCKET   = "dev-uploads-bucket"


@pytest.fixture(scope="module", autouse=True)
def ensure_bucket(s3_client):
    """Create the test bucket once before all tests in this module."""
    existing = [b["Name"] for b in s3_client.list_buckets().get("Buckets", [])]
    if BUCKET not in existing:
        s3_client.create_bucket(Bucket=BUCKET)
    yield


def _s3_event(bucket: str, key: str, size: int = 1024) -> dict:
    """Build a minimal S3 event payload."""
    return {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": bucket},
                    "object": {"key": key, "size": size},
                }
            }
        ]
    }


def test_processes_single_record(lambda_client):
    event = _s3_event(BUCKET, "uploads/test-file.csv", size=2048)
    result = invoke(lambda_client, FUNCTION, event)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert len(body["processed"]) == 1
    assert body["processed"][0]["bucket"] == BUCKET
    assert body["processed"][0]["key"] == "uploads/test-file.csv"
    assert body["processed"][0]["status"] == "processed"


def test_processes_multiple_records(lambda_client):
    event = {
        "Records": [
            {"s3": {"bucket": {"name": BUCKET}, "object": {"key": f"file-{i}.txt", "size": i * 100}}}
            for i in range(1, 4)
        ]
    }
    result = invoke(lambda_client, FUNCTION, event)
    body = json.loads(result["body"])
    assert len(body["processed"]) == 3


def test_empty_records(lambda_client):
    result = invoke(lambda_client, FUNCTION, {"Records": []})
    body = json.loads(result["body"])
    assert body["processed"] == []
