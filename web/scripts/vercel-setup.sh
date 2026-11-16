#!/usr/bin/env bash
# Isi environment variable Vercel dari .env.local, lalu deploy production.
#   bash scripts/vercel-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)
[ -n "$DB" ] || { echo "DATABASE_URL kosong di .env.local — jalankan dulu: npm run db:check"; exit 1; }
USER_NAME=${DASHBOARD_USER:-greenhouse}
PASS=${DASHBOARD_PASSWORD:-$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 12)}

add() {
  npx vercel env rm "$1" production -y >/dev/null 2>&1 || true
  printf '%s' "$2" | npx vercel env add "$1" production >/dev/null
  echo "✓ $1"
}

echo "Mengisi environment variable..."
add DATABASE_URL "$DB"
add APP_TZ "Asia/Jakarta"
add DASHBOARD_USER "$USER_NAME"
add DASHBOARD_PASSWORD "$PASS"
# Notifikasi Telegram (opsional): ikut dikirim hanya jika terisi di .env.local
for k in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID CRON_SECRET NOTIFY_OFFLINE_MIN; do
  v=$(grep "^$k=" .env.local | cut -d= -f2- || true)
  if [ -n "$v" ]; then add "$k" "$v"; fi
done

echo; echo "Deploy production..."
npx vercel --prod --yes

echo
echo "=============================================="
echo " Login dashboard:  $USER_NAME  /  $PASS"
echo " Simpan password ini."
echo "=============================================="
