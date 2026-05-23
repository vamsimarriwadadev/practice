import time
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request


logger = logging.getLogger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):

    async def dispatch(
        self,
        request: Request,
        call_next
    ):

        start_time = time.time()

        logger.info(
            f"Incoming Request | "
            f"{request.method} {request.url.path}"
        )

        response = await call_next(request)

        process_time = round(
            time.time() - start_time,
            4
        )

        logger.info(
            f"Completed Request | "
            f"{request.method} {request.url.path} | "
            f"Status: {response.status_code} | "
            f"Duration: {process_time}s"
        )

        return response