import os
import redis.asyncio as redis


class RedisService:

    def __init__(self):

        self.redis = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=6379,
            decode_responses=True
        )

    async def publish(
        self,
        channel: str,
        message: str
    ):

        await self.redis.publish(
            channel,
            message
        )

    async def subscribe(
        self,
        channel: str
    ):

        pubsub = self.redis.pubsub()

        await pubsub.subscribe(channel)

        return pubsub