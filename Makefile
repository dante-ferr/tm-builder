.DEFAULT_GOAL := help

POETRY ?= poetry
NPM ?= npm
CODE ?= code
PYTHON := $(POETRY) --project python run
TM_BUILDER := $(PYTHON) tm-builder
MACHINE ?= machines/copy.yaml
INPUTS ?=
MAX_STEPS ?= 1000
PORT ?= 8765
FORMAT ?= image
STYLE ?= readable
LAYOUT ?= split
DPI ?= 200
OUTPUT ?= output/$(notdir $(basename $(MACHINE)))$(if $(filter table,$@),-$(STYLE).$(if $(filter image,$(FORMAT)),png,$(FORMAT)),.svg)
ARGS ?=

.PHONY: help setup python-install web-install editor-install build extension install-extension view run graph table check check-all schemas test test-extension test-vscode

help:
	@printf '%s\n' \
	  'make setup             Install Python, web, and editor dependencies' \
	  'make build             Build web assets' \
	  'make extension         Package the VS Code extension' \
	  'make install-extension Package and install the VS Code extension' \
	  'make view              Open the live diagram (MACHINE=..., PORT=...)' \
	  'make run               Execute a machine (MACHINE=..., INPUTS=..., MAX_STEPS=...)' \
	  'make graph             Export SVG or DOT (MACHINE=..., OUTPUT=...)' \
	  'make table             Export transitions (FORMAT=csv|image|tex, STYLE=readable|formal)' \
	  'LAYOUT=split|long      Split images at A4 height or export one long image (DPI=200)' \
	  'make check             Validate MACHINE' \
	  'make check-all         Validate all example machines' \
	  'make schemas           Regenerate machine and input schemas' \
	  'make test              Run Python and editor regression checks' \
	  'make test-vscode       Run the VS Code Extension Development Host checks' \
	  'ARGS="..."             Pass additional CLI options to view/run/graph/table/check'

setup: python-install web-install editor-install build

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

view:
	$(TM_BUILDER) view $(if $(filter command line environment override,$(origin MACHINE)),"$(MACHINE)",) --port "$(PORT)" $(ARGS)

run:
	$(TM_BUILDER) run "$(MACHINE)" $(if $(strip $(INPUTS)),--inputs-file "$(INPUTS)",) --max-steps "$(MAX_STEPS)" $(ARGS)

graph:
	$(TM_BUILDER) graph "$(MACHINE)" --output "$(OUTPUT)" $(ARGS)

table:
	$(TM_BUILDER) table "$(MACHINE)" --output "$(OUTPUT)" --format "$(FORMAT)" --style "$(STYLE)" --layout "$(LAYOUT)" --dpi "$(DPI)" $(ARGS)

check:
	$(TM_BUILDER) check "$(MACHINE)" $(ARGS)

check-all:
	@set -e; for machine in machines/*.yaml machines/*.yml; do \
	  [ -f "$$machine" ] || continue; $(TM_BUILDER) check "$$machine"; done

schemas:
	$(TM_BUILDER) schema
	$(TM_BUILDER) schema --kind inputs

test: build
	$(PYTHON) python -m unittest discover -s python/tests -v
	$(MAKE) test-extension

test-extension:
	node editors/vscode/tests/validator.cjs

test-vscode:
	$(CODE) --user-data-dir /tmp/tm-builder-vscode-tests \
	  --extensionDevelopmentPath="$(CURDIR)/editors/vscode" \
	  --extensionTestsPath="$(CURDIR)/editors/vscode/tests/vscode-host.cjs" \
	  --disable-workspace-trust "$(CURDIR)"
