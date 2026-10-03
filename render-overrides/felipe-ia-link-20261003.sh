#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${TRANS_SALOMAO_URL:-https://transsalomao.vercel.app}"
FELIPE_DIR="${HOME}/felipe-ia-ui"
CONFIG_DIR="${HOME}/.config/felipe-ia"
CONFIG_FILE="${CONFIG_DIR}/transsalomao-bridge.json"
SERVICE_DIR="${HOME}/.config/systemd/user"
SERVICE_FILE="${SERVICE_DIR}/felipe-ia-transsalomao.service"
WORKER_FILE="${FELIPE_DIR}/transsalomao_bridge.py"

if [[ ! -f "${FELIPE_DIR}/server.py" ]]; then
  echo "Não encontrei ${FELIPE_DIR}/server.py."
  echo "Abra primeiro o Felipe IA local e confirme que ele está instalado em ~/felipe-ia-ui."
  exit 1
fi

command -v python3 >/dev/null || { echo "python3 não encontrado."; exit 1; }
command -v curl >/dev/null || { echo "curl não encontrado."; exit 1; }
command -v systemctl >/dev/null || { echo "systemctl não encontrado."; exit 1; }

echo "Vinculando Trans Salomão IA ao Felipe IA local..."
read -r -p "Login da Gerência [Felipe]: " TS_USER
TS_USER="${TS_USER:-Felipe}"
read -r -s -p "Senha da Gerência: " TS_PASS
echo

TOKEN="$(
  TS_BASE_URL="${BASE_URL}" TS_USER="${TS_USER}" TS_PASS="${TS_PASS}" python3 - <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

url = os.environ["TS_BASE_URL"].rstrip("/") + "/api/assistant/auth"
payload = json.dumps({
    "action": "login",
    "username": os.environ["TS_USER"],
    "password": os.environ["TS_PASS"],
    "remember": True,
    "deviceLabel": "Felipe IA Ubuntu Bridge",
}).encode("utf-8")
req = urllib.request.Request(
    url,
    data=payload,
    headers={"Content-Type": "application/json", "Accept": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))
except urllib.error.HTTPError as exc:
    body = exc.read().decode("utf-8", errors="replace")
    print("Falha de autenticação: " + body[:500], file=sys.stderr)
    sys.exit(2)
token = str(data.get("token") or "").strip()
if not token:
    print("O servidor não devolveu um token de vínculo.", file=sys.stderr)
    sys.exit(3)
print(token)
PY
)"

unset TS_PASS

mkdir -p "${CONFIG_DIR}" "${SERVICE_DIR}"
chmod 700 "${CONFIG_DIR}"

echo "Baixando o worker do Felipe IA..."
curl -fsSL "${BASE_URL}/felipe-ia-bridge.py" -o "${WORKER_FILE}"
chmod 700 "${WORKER_FILE}"

TS_BASE_URL="${BASE_URL}" TS_TOKEN="${TOKEN}" TS_CONFIG_FILE="${CONFIG_FILE}" python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["TS_CONFIG_FILE"])
payload = {
    "base_url": os.environ["TS_BASE_URL"].rstrip("/"),
    "token": os.environ["TS_TOKEN"],
    "model": "felipe-ai",
}
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
path.chmod(0o600)
PY

cat > "${SERVICE_FILE}" <<'EOF'
[Unit]
Description=Felipe IA bridge para Trans Salomao
After=network-online.target felipe-ia.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/felipe-ia-ui
ExecStart=/usr/bin/python3 %h/felipe-ia-ui/transsalomao_bridge.py
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now felipe-ia-transsalomao.service

sleep 2
if systemctl --user is-active --quiet felipe-ia-transsalomao.service; then
  echo
  echo "✅ Vínculo ativo."
  echo "Trans Salomão IA agora pode encaminhar mensagens ao Felipe IA deste Ubuntu."
else
  echo
  echo "O serviço foi instalado, mas ainda não ficou ativo."
  systemctl --user status felipe-ia-transsalomao.service --no-pager || true
  exit 4
fi
