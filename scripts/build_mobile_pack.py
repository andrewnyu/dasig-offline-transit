"""Refresh the Bacolod network bundled with the offline mobile demo."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "jeepney_network.geojson"
TARGET = ROOT / "src" / "data" / "bacolod-network.json"


def main() -> None:
    network = json.loads(SOURCE.read_text(encoding="utf-8"))
    if network.get("type") != "FeatureCollection" or not network.get("features"):
        raise SystemExit("Bacolod network is empty or invalid")
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(
        json.dumps(network, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(network['features'])} routes to {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
