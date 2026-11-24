FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.10.9 /uv /usr/local/bin/uv
WORKDIR /srv/server
# The virtualenv lives outside /srv/server, because compose mounts the
# source folder over /srv/server and would hide a .venv inside it.
# No .pyc files: the source folder is the Mac's, mounted in.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
# Includes the dev group (pytest, ruff) for local work. A production stage
# with --no-dev and several workers comes with the EC2 setup.
RUN uv sync --frozen --no-install-project
COPY . .
RUN useradd --create-home app
USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
