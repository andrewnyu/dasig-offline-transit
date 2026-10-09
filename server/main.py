"""Minimal authoritative route-pack publisher for DASIG."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response


ROOT = Path(__file__).resolve().parents[1]
NETWORK_FILE = ROOT / "src" / "data" / "bacolod-network.json"
SCHEMA_VERSION = 1

app = FastAPI(title="DASIG route-pack publisher", version="0.1.0")


def canonical_pack(city: str) -> tuple[bytes, str]:
    if city != "bacolod":
        raise HTTPException(status_code=404, detail="Unknown city")
    network = json.loads(NETWORK_FILE.read_text(encoding="utf-8"))
    body = json.dumps(network, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return body, hashlib.sha256(body).hexdigest()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/offline-packs/{city}/manifest")
def manifest(city: str, request: Request) -> dict[str, object]:
    body, digest = canonical_pack(city)
    return {
        "schema_version": SCHEMA_VERSION,
        "city": city,
        "version": digest[:12],
        "sha256": digest,
        "size_bytes": len(body),
        "network_url": str(request.url_for("network", city=city)),
        "source": "published DASIG route network",
    }


@app.get("/api/offline-packs/{city}/network", name="network")
def network(city: str, request: Request) -> Response:
    body, digest = canonical_pack(city)
    etag = f'"{digest}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return Response(
        content=body,
        media_type="application/geo+json",
        headers={
            "Cache-Control": "public, max-age=300, must-revalidate",
            "ETag": etag,
            "X-Content-SHA256": digest,
        },
    )
