FROM python:3.13-slim

# Install system dependencies required for OpenCV and rembg
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Copy dependency files first (better caching)
COPY pyproject.toml ./

# Install dependencies
RUN uv sync --no-cache

# Copy the rest of the application
COPY . .

# Ensure temp storage directory exists
RUN mkdir -p tmp

# Set python path
ENV PYTHONPATH=/app/src

# Command to run the worker (using the virtualenv created by uv sync)
CMD ["/app/.venv/bin/python", "/app/src/main.py"]
