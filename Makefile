SHELL := /bin/bash

.PHONY: up down status setup index api

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
	. .venv/bin/activate && uvicorn serve_rag:app --host 127.0.0.1 --port 8012

