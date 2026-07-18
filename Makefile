.PHONY: setup-local demo-local test build

setup-local:
	python3 -m venv .venv
	.venv/bin/pip install -r backend/requirements.txt
	npm --prefix dashboard install

test:
	.venv/bin/python -m pytest backend/tests -q
	npm --prefix dashboard run build

build:
	docker build -t sentinel-orchestrator:latest backend
	docker build -t sentinel-dashboard:latest dashboard

demo-local:
	@test -x .venv/bin/python || (echo "Run: make setup-local" && exit 1)
	@command -v npm >/dev/null || (echo "npm is required" && exit 1)
	@trap 'kill 0' INT TERM EXIT; \
	  WORLD_MODEL_URL="$${WORLD_MODEL_URL:-http://127.0.0.1:8010}" OPENAI_API_KEY="$${OPENAI_API_KEY:-}" .venv/bin/python -m uvicorn main:app --app-dir backend/src --host 127.0.0.1 --port 8090 & \
	  npm --prefix dashboard run dev
