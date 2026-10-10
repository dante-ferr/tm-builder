.DEFAULT_GOAL := help

POETRY ?= poetry
NPM ?= npm
CODE ?= code
PYTHON := $(POETRY) --project python run
TM_BUILDER := $(PYTHON) tm-builder
MACHINE ?=
INPUTS ?=
MAX_STEPS ?= 1000
PORT ?= 8765
DEV_PORT ?= 3000
FORMAT ?= image
STYLE ?= readable
LANGUAGE ?= english
LAYOUT ?= split
DPI ?= 200
OUTPUT ?= output/$(notdir $(basename $(if $(strip $(MACHINE)),$(MACHINE),copy.yaml)))$(if $(filter table,$@),-$(STYLE).$(if $(filter image,$(FORMAT)),png,$(FORMAT)),.svg)
ARGS ?=

.PHONY: help setup setup-formal python-install web-install editor-install build extension install-extension docs-build docs-serve view dev run graph table check check-all schemas test test-extension test-vscode

help:
	@printf '%s\n' \
	  'make setup             Install Python, web, and editor dependencies' \
	  'make setup-formal      Install system dependencies for formal PNG tables (Linux)' \
	  'make build             Build web assets' \
	  'make extension         Package the VS Code extension' \
	  'make install-extension Package and install the VS Code extension' \
	  'make docs-build        Build the mdBook documentation' \
	  'make docs-serve        Serve the mdBook documentation locally' \
	  'make view              Open the live diagram (MACHINE=..., PORT=...)' \
	  'make dev               Run the app with live code reload (PORT=..., DEV_PORT=...)' \
	  'make run               Execute a machine (MACHINE=..., INPUTS=..., MAX_STEPS=...)' \
	  'make graph             Export SVG or DOT (MACHINE=..., OUTPUT=...)' \
	  'make table             Export transitions (FORMAT=csv|image|tex, STYLE=readable|formal)' \
	  'LANGUAGE=english|portuguese  Set exported table labels' \
	  'LAYOUT=split|long      Split images at A4 height or export one long image (DPI=200)' \
	  'make check             Validate MACHINE' \
	  'make check-all         Validate all example machines' \
	  'make schemas           Regenerate machine and input schemas' \
	  'make test              Run Python and editor regression checks' \
	  'make test-vscode       Run the VS Code Extension Development Host checks' \
	  'ARGS="..."             Pass additional CLI options to view/run/graph/table/check'

setup: python-install web-install editor-install build
	$(TM_BUILDER) workspace

setup-formal:
	./scripts/setup-formal-deps.sh

python-install:
	$(POETRY) --project python install --no-interaction

web/node_modules/.dependencies-ready: web/package.json web/package-lock.json
	$(NPM) --prefix web ci --no-audit --no-fund
	@touch $@

web-install: web/node_modules/.dependencies-ready

editors/vscode/node_modules/.dependencies-ready: editors/vscode/package.json editors/vscode/package-lock.json
	$(NPM) --prefix editors/vscode ci --no-audit --no-fund
	@touch $@

editor-install: editors/vscode/node_modules/.dependencies-ready

build: web-install
	$(NPM) --prefix web run build

extension: editor-install
	$(NPM) --prefix editors/vscode run package

install-extension: extension
	$(CODE) --install-extension dist/tm-builder-vscode.vsix --force

docs-build:
	mdbook build docs

docs-serve:
	mdbook serve docs

view:
	$(TM_BUILDER) view $(if $(filter command line environment override,$(origin MACHINE)),"$(MACHINE)",) --port "$(PORT)" $(ARGS)

# Run the Python API and Next.js together. Next proxies /api to the API server.
dev: web-install
	@bash -c 'set -m; \
	  TM_BUILDER_DEV_ORIGIN="http://127.0.0.1:$(DEV_PORT)" $(TM_BUILDER) view $(if $(filter command line environment override,$(origin MACHINE)),"$(MACHINE)",) --port "$(PORT)" --no-open $(ARGS) & api=$$!; \
	  $(NPM) --prefix web run dev -- --port "$(DEV_PORT)" & web=$$!; \
	  trap '\''kill $$api $$web 2>/dev/null || true; wait 2>/dev/null || true'\'' EXIT INT TERM; \
	  python3 -c '\''import time, webbrowser; time.sleep(1); webbrowser.open("http://127.0.0.1:$(DEV_PORT)")'\''; \
	  wait -n $$api $$web; status=$$?; kill $$api $$web 2>/dev/null || true; wait 2>/dev/null || true; exit $$status'

run:
	$(TM_BUILDER) run $(if $(strip $(MACHINE)),"$(MACHINE)",) $(if $(strip $(INPUTS)),--inputs-file "$(INPUTS)",) --max-steps "$(MAX_STEPS)" $(ARGS)

graph:
	$(TM_BUILDER) graph $(if $(strip $(MACHINE)),"$(MACHINE)",) --output "$(OUTPUT)" $(ARGS)

table:
	$(TM_BUILDER) table $(if $(strip $(MACHINE)),"$(MACHINE)",) --output "$(OUTPUT)" --format "$(FORMAT)" --style "$(STYLE)" --language "$(LANGUAGE)" --layout "$(LAYOUT)" --dpi "$(DPI)" $(ARGS)

check:
	$(TM_BUILDER) check $(if $(strip $(MACHINE)),"$(MACHINE)",) $(ARGS)

check-all:
	@set -e; for machine in data/examples/machines/*.yaml data/examples/machines/*.yml; do \
	  [ -f "$$machine" ] || continue; $(TM_BUILDER) check "$$machine"; done

schemas:
	$(TM_BUILDER) schema
	$(TM_BUILDER) schema --kind inputs

test: build
	node --test web/tests/*.test.js
	$(PYTHON) python -m unittest discover -s python/tests -v
	$(MAKE) test-extension

test-extension:
	node editors/vscode/tests/validator.cjs

test-vscode:
	$(CODE) --user-data-dir /tmp/tm-builder-vscode-tests \
	  --extensionDevelopmentPath="$(CURDIR)/editors/vscode" \
	  --extensionTestsPath="$(CURDIR)/editors/vscode/tests/vscode-host.cjs" \
	  --disable-workspace-trust "$(CURDIR)"
