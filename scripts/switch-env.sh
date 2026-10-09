#!/usr/bin/env bash
# Переключение окружения docker compose (обратимо — просто другой профиль).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-}"

usage() {
  echo "Использование: ./scripts/switch-env.sh <режим>"
  echo ""
  echo "  local       — Локальный режим, API только http://127.0.0.1:8000 (по умолчанию)"
  echo "  prod-api    — Локальный UI, но API на удалённом сервере (https://your-bank-domain.com)"
  echo "  prod-server — Файл .env для деплоя на продакшн-сервере (gateway + прод URL)"
  echo ""
  echo "После смены: docker compose up -d --build frontend"
}

case "$MODE" in
  local)
    cp "$ROOT/env/local.env" "$ROOT/.env"
    echo "✓ Режим local: всё локально, удалённый сервер не используется."
    ;;
  prod-api)
    cp "$ROOT/env/prod-api.env" "$ROOT/.env"
    echo "⚠ Режим prod-api: локальный UI → API на продакшн-сервере."
    ;;
  prod-server)
    cp "$ROOT/env/prod-server.env" "$ROOT/.env"
    echo "✓ Режим prod-server: для деплоя на сервере (скопируйте .env на сервер или запустите там этот скрипт)."
    ;;
  -h|--help|help|"")
    usage
    exit 0
    ;;
  *)
    echo "Неизвестный режим: $MODE"
    usage
    exit 1
    ;;
esac

echo "  Файл: $ROOT/.env"
echo "  Дальше: cd \"$ROOT\" && docker compose up -d --build"
