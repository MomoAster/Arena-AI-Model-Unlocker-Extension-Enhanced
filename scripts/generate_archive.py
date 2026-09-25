"""Build the bundled historical model list from a pinned MIT-licensed snapshot."""

from pathlib import Path
from urllib.request import Request, urlopen
import json
import re

REVISION = "a1c1610bd1b06256f8eb157318df5f339a7d6f10"
URL = f"https://raw.githubusercontent.com/taipgonesistema-cloud/arena-ai-proxy/{REVISION}/data/models-list.json"
ROOT = Path(__file__).resolve().parents[1]
UUID = re.compile(r"^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$", re.I)


def convert(item):
    if not UUID.fullmatch(str(item.get("id", ""))):
        return None
    if not item.get("org") or not item.get("provider") or not item.get("name"):
        return None
    inputs = {name: True for name in item.get("input", []) if isinstance(name, str)}
    outputs = {name: True for name in item.get("output", []) if isinstance(name, str)}
    return {
        "id": item["id"],
        "organization": item["org"],
        "provider": item["provider"],
        "publicName": item["name"],
        "name": item.get("internalName") or item["name"],
        "displayName": item.get("displayName") or item["name"],
        "capabilities": {"inputCapabilities": inputs, "outputCapabilities": outputs},
        "userSelectable": True,
        "rankByModality": {
            "chat": item.get("rankChat") or item.get("rank") or 9999,
            "webdev": item.get("rankWebdev") or item.get("rank") or 9999,
        },
    }


def main():
    request = Request(URL, headers={"User-Agent": "Arena-Model-Unlocker-Enhanced-build"})
    with urlopen(request, timeout=30) as response:
        text = response.read().decode("utf-8")
    # The upstream snapshot appends two human-readable count lines after the JSON.
    source, _ = json.JSONDecoder().raw_decode(text)
    models = [record for item in source if (record := convert(item)) is not None]
    output = ROOT / "extension" / "archive.js"
    output.write_text(
        "// Historical records from " + URL + "\n"
        "// The source dataset is MIT licensed; see THIRD_PARTY_NOTICES.md.\n"
        "globalThis.__arenaModelUnlockerArchive = "
        + json.dumps(models, separators=(",", ":"), ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(models)} records to {output}")


if __name__ == "__main__":
    main()