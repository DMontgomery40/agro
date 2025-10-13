SHELL := /bin/bash

.PHONY: up down status setup index api dev

up:
	bash scripts/up.sh

down:
	bash scripts/down.sh

status:
	bash scripts/status.sh

# Usage: make setup repo=/abs/path/to/your/repo name=your-repo
setup:
	bash scripts/setup.sh $(repo) $(name)

# Usage: make index REPO=rag-service
index:
	. .venv/bin/activate && REPO=$(REPO) python index_repo.py

# Start API locally (requires venv)
api:
	. .venv/bin/activate && uvicorn server.app:app --host 127.0.0.1 --port 8012

# Start everything (infra + MCP + API + open browser)
dev:
	bash scripts/dev_up.sh
