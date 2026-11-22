#!/usr/bin/env bash
# Pflicht vor jedem Push: dieselben Prüfungen wie die CI (validation.yml).
# Aufruf: bash scripts/precheck.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# CI läuft in UTC.
export TZ=UTC
echo ">> node --check"; node --check custom_components/smartify_energy_row_card/frontend/smartify-energy-row-card.js
echo ">> node --test";  node --test tests/*.test.cjs
echo ">> compileall";   python -m compileall -q custom_components tests/test_repository.py
echo ">> unittest";     python -m unittest discover -s tests -p 'test_*.py'
echo "OK – alle lokalen Prüfungen grün."
