#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

CONFIG_PATH = Path.home() / ".config" / "felipe-ia" / "transsalomao-bridge.json"
LOCAL_CHAT_URL = "http://127.0.0.1:3210/api/chat"
VERSION = "2026.10.03.1"


def load_config():
    if not CONFIG_PATH.exists():
        raise RuntimeError(f"Configuração não encontrada: {CONFIG_PATH}")
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    base_url = str(data.get("base_url") or "https://transsalomao.vercel.app").rstrip("/")
    token = str(data.get("token") or "").strip()
    model = str(data.get("model") or "felipe-ai").strip()
    if not token:
        raise RuntimeError("Token do Trans Salomão não configurado.")
    return base_url, token, model


def request_json(url, payload, headers=None, timeout=45):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req_headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=body, headers=req_headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
        return json.loads(raw or "{}")


def bridge(base_url, token, action, model, **extra):
    payload = {
        "action": action,
        "model": model,
        "version": VERSION,
        **extra,
    }
    return request_json(
        base_url + "/api/felipe-ia-bridge",
        payload,
        headers={
            "Authorization": "Bearer " + token,
            "X-Salomao-App": "1",
        },
        timeout=45,
    )


def local_chat(messages, model):
    payload = {
        "messages": messages[-40:],
        "model": model,
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        LOCAL_CHAT_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/x-ndjson, application/json, text/plain",
        },
        method="POST",
    )

    parts = []
    with urllib.request.urlopen(req, timeout=900) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                parts.append(line)
                continue

            if item.get("error"):
                raise RuntimeError(str(item.get("error")))

            message = item.get("message")
            if isinstance(message, dict):
                text = message.get("content")
                if isinstance(text, str) and text:
                    parts.append(text)

            response_text = item.get("response")
            if isinstance(response_text, str) and response_text:
                parts.append(response_text)

            answer = item.get("answer")
            if isinstance(answer, str) and answer:
                parts.append(answer)

    result = "".join(parts).strip()
    if not result:
        raise RuntimeError("Felipe IA local respondeu sem texto.")
    return result


def main():
    base_url, token, model = load_config()
    print(f"[Felipe IA bridge] conectado a {base_url} | modelo={model}", flush=True)

    idle_sleep = 8.0
    error_sleep = 15.0

    while True:
        try:
            result = bridge(base_url, token, "worker_claim", model)
            job = result.get("job") if isinstance(result, dict) else None

            if not job:
                time.sleep(idle_sleep)
                continue

            job_id = str(job.get("id") or "")
            messages = job.get("messages")
            if not job_id or not isinstance(messages, list):
                time.sleep(1)
                continue

            print(f"[Felipe IA bridge] processando {job_id}", flush=True)
            try:
                answer = local_chat(messages, model)
                bridge(
                    base_url,
                    token,
                    "worker_complete",
                    model,
                    id=job_id,
                    answer=answer,
                )
                print(f"[Felipe IA bridge] concluído {job_id}", flush=True)
            except Exception as exc:
                error_text = f"{type(exc).__name__}: {exc}"[:12000]
                print(f"[Felipe IA bridge] falha {job_id}: {error_text}", file=sys.stderr, flush=True)
                try:
                    bridge(
                        base_url,
                        token,
                        "worker_failed",
                        model,
                        id=job_id,
                        error=error_text,
                    )
                except Exception as report_exc:
                    print(f"[Felipe IA bridge] não consegui reportar falha: {report_exc}", file=sys.stderr, flush=True)

        except urllib.error.HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            if exc.code == 401:
                print("[Felipe IA bridge] sessão expirada. Execute novamente o instalador para renovar o vínculo.", file=sys.stderr, flush=True)
                time.sleep(60)
            else:
                print(f"[Felipe IA bridge] HTTP {exc.code}: {body[:500]}", file=sys.stderr, flush=True)
                time.sleep(error_sleep)
        except Exception as exc:
            print(f"[Felipe IA bridge] erro: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
            time.sleep(error_sleep)


if __name__ == "__main__":
    main()
