import json
import os
import aioboto3


class SQSService:

    def __init__(self):

        self.session = aioboto3.Session()

        self.endpoint_url = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4566")

        self.queue_name = "remove-bg-queue"

    def get_client(self):

        return self.session.client(
            "sqs",
            endpoint_url=self.endpoint_url,
            region_name="us-east-1",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )

    async def get_queue_url(self):

        async with self.get_client() as sqs:

            response = await sqs.get_queue_url(
                QueueName=self.queue_name
            )

            return response["QueueUrl"]

    async def create_queue(self):

        async with self.get_client() as sqs:

            response = await sqs.create_queue(
                QueueName=self.queue_name
            )

            return response

    async def send_message(self, payload: dict):

        queue_url = await self.get_queue_url()

        async with self.get_client() as sqs:

            response = await sqs.send_message(
                QueueUrl=queue_url,
                MessageBody=json.dumps(payload)
            )

            return response

    async def receive_messages(self):

        queue_url = await self.get_queue_url()

        async with self.get_client() as sqs:

            response = await sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=20,
                VisibilityTimeout=300
            )

            return response.get("Messages", [])

    async def delete_message(
        self,
        receipt_handle: str
    ):

        queue_url = await self.get_queue_url()

        async with self.get_client() as sqs:

            await sqs.delete_message(
                QueueUrl=queue_url,
                ReceiptHandle=receipt_handle
            )