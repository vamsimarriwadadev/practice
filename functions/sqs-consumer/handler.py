import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """
    Triggered by SQS messages.
    Processes each message in the batch and reports failures
    without throwing — SQS will retry only the failed message IDs.
    """
    logger.info(
        "SQS event received with %d records", len(event.get("Records", []))
    )

    processed = []
    failed = []

    for record in event.get("Records", []):
        message_id = record["messageId"]
        try:
            body = json.loads(record["body"])
            logger.info("Processing message %s: %s", message_id, body)
            processed.append(message_id)
        except Exception as exc:
            logger.error(
                "Failed to process message %s: %s", message_id, str(exc)
            )
            failed.append({"messageId": message_id, "error": str(exc)})

    return {
        "statusCode": 200,
        "body": json.dumps(
            {
                "processed_count": len(processed),
                "failed_count": len(failed),
                "failed": failed,
            }
        ),
    }
