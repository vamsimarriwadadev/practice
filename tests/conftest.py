# tests/conftest.py
#
# Shared fixtures for all Lambda integration tests.
# All clients point at Floci (localhost:4566).

import json
import pytest
import boto3


ENDPOINT = "http://localhost:4566"
REGION   = "us-east-1"
CREDS    = {"aws_access_key_id": "test", "aws_secret_access_key": "test"}


def _client(service: str):
    return boto3.client(
        service,
        endpoint_url=ENDPOINT,
        region_name=REGION,
        **CREDS,
    )


@pytest.fixture(scope="session")
def lambda_client():
    return _client("lambda")


@pytest.fixture(scope="session")
def s3_client():
    return _client("s3")


@pytest.fixture(scope="session")
def sqs_client():
    return _client("sqs")


def invoke(lambda_client, function_name: str, payload: dict) -> dict:
    """Helper: invoke a Lambda and return the parsed response body."""
    response = lambda_client.invoke(
        FunctionName=function_name,
        Payload=json.dumps(payload),
    )
    raw = response["Payload"].read()
    return json.loads(raw)
