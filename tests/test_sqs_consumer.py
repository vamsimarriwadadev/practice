# tests/test_sqs_consumer.py

import json
import pytest
from conftest import invoke

FUNCTION = "dev-sqs-consumer"


def _sqs_event(messages: list[dict]) -> dict:
    """Build a minimal SQS event payload."""
    return {
        "Records": [
            {
                "messageId": f"msg-{i}",
                "body": json.dumps(msg),
            }
            for i, msg in enumerate(messages)
        ]
    }


def test_processes_single_message(lambda_client):
    event = _sqs_event([{"action": "process", "item_id": "abc123"}])
    result = invoke(lambda_client, FUNCTION, event)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["processed_count"] == 1
    assert body["failed_count"] == 0


def test_processes_batch(lambda_client):
    messages = [{"action": "process", "item_id": f"item-{i}"} for i in range(5)]
    result = invoke(lambda_client, FUNCTION, _sqs_event(messages))

    body = json.loads(result["body"])
    assert body["processed_count"] == 5
    assert body["failed_count"] == 0


def test_handles_malformed_message(lambda_client):
    """A non-JSON body should be counted as failed, not crash the function."""
    event = {
        "Records": [
            {"messageId": "bad-msg-1", "body": "this is not json {{{{"},
        ]
    }
    result = invoke(lambda_client, FUNCTION, event)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200   # function itself must not crash
    assert body["failed_count"] == 1
    assert body["failed"][0]["messageId"] == "bad-msg-1"


def test_empty_batch(lambda_client):
    result = invoke(lambda_client, FUNCTION, {"Records": []})
    body = json.loads(result["body"])
    assert body["processed_count"] == 0
    assert body["failed_count"] == 0
