FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy source code, documentation, agent skills, and persistent data
COPY src/ /app/src/
COPY docs/ /app/docs/
COPY .agents/ /app/.agents/
COPY data/ /app/data/

# Cloud Run injects the $PORT environment variable (default: 8080)
ENV PORT=8080
EXPOSE 8080

# Run the lightweight web server and API handler
CMD ["python3", "src/web/server.py"]
