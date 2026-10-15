# Build the static export with Node, then run the Python viewer.
# TeX and Poppler are not installed. Formal PNG export can fail at request time.
# python/pyproject.toml requires Python >=3.14.

FROM node:22-bookworm-slim AS web

WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build \
 && test -s out/index.html \
 && test -s public/assets/render.cjs

FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1

RUN pip install --no-cache-dir "poetry==2.3.2" \
 && useradd --create-home --uid 10001 --user-group tmbuilder

WORKDIR /app

COPY python/pyproject.toml python/poetry.lock python/poetry.toml python/README.md python/
COPY python/src python/src
COPY data/examples data/examples
COPY schemas schemas

RUN poetry --project python install --no-interaction --no-ansi --no-cache \
 && /app/python/.venv/bin/python -c "import pathlib, tm_builder.designer as designer; root = pathlib.Path(designer.__file__).resolve().parents[3]; assert (root / 'data' / 'examples').is_dir(), designer.__file__" \
 && rm -rf /root/.cache

COPY --from=web /src/web/out /app/web/out
COPY --from=web /src/web/public/assets/render.cjs /app/web/public/assets/render.cjs

# Outputs are present and web sources are not, so startup must not invoke npm.
RUN /app/python/.venv/bin/python -c "from tm_builder.designer import ensure_assets; ensure_assets()" \
 && chown -R tmbuilder:tmbuilder /app

USER tmbuilder
ENV HOME=/home/tmbuilder \
    PATH="/app/python/.venv/bin:${PATH}"

CMD ["tm-builder", "view", "--no-open"]
