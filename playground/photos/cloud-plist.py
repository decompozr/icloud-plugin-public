"""Bounded known-field plist decoder; stdin only, no files/network/credentials."""
import json
import math
import plistlib
import sys

MAX_BYTES = 65536
MAX_TEXT = 512


def decode(kind, data):
    value = plistlib.loads(data)
    if kind == "keywords":
        if not isinstance(value, list) or len(value) > 100:
            raise ValueError()
        if not all(isinstance(x, str) and x.strip() and len(x) <= MAX_TEXT for x in value):
            raise ValueError()
        return {"state": "present", "value": value} if value else {"state": "empty"}
    if kind != "gps" or not isinstance(value, dict):
        raise ValueError()
    if not value:
        return {"state": "empty"}
    if "lat" not in value and "lon" not in value:
        return {"state": "absent"}
    lat, lon = value.get("lat"), value.get("lon")
    if not all(type(x) in (int, float) and math.isfinite(x) for x in (lat, lon)):
        raise ValueError()
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise ValueError()
    return {"state": "present", "value": {"latitude": lat, "longitude": lon}}


if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES or len(sys.argv) != 2:
            raise ValueError()
        result = decode(sys.argv[1], raw)
    except Exception:
        result = {"state": "invalid", "reason": "unsupported or malformed plist metadata"}
    print(json.dumps(result, allow_nan=False, ensure_ascii=True))
