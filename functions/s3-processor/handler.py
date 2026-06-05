import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Reads AWS_ENDPOINT_URL env var — set to http://localhost:4566 for Floci,
# leave unset for real AWS.
ENDPOINT_URL = os.environ.get("AWS_ENDPOINT_URL", None)

s3_client = boto3.client(
    "s3",
    endpoint_url=ENDPOINT_URL,
    region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
)


def handler(event, context):
    """
    Triggered by S3 event notifications.
    Logs the bucket and key of every uploaded object.
    """
    logger.info("S3 event: %s", json.dumps(event))

    results = []
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]
        size = record["s3"]["object"].get("size", 0)

        logger.info(
            "Processing s3://%s/%s  (size: %d bytes)", bucket, key, size
        )
        results.append(
            {"bucket": bucket, "key": key, "size": size, "status": "processed"}
        )

    return {
        "statusCode": 200,
        "body": json.dumps({"processed": results}),
    }
