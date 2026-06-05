import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """
    Simple hello-world Lambda.
    Accepts:  { "name": "Vamsi" }
    Returns:  { "statusCode": 200, "body": "{\"message\": \"Hello, Vamsi!\"}" }
    """
    logger.info("Event received: %s", json.dumps(event))

    name = event.get("name", "World")
    response_body = {"message": f"Hello, {name}!"}

    return {
        "statusCode": 200,
        "body": json.dumps(response_body),
    }
