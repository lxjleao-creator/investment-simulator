import json
import sys
import time
import urllib.request
from pathlib import Path

SYMBOLS = ["QQQ", "SPY", "510300.SS", "510500.SS", "GLD", "TLT"]
OUT = Path(__file__).resolve().parents[1] / "docs" / "quotes.json"


def fetch(symbol):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1mo&interval=1d"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))

    result = payload["chart"]["result"][0]
    close = result["indicators"]["quote"][0]["close"]
    clean_close = [round(float(value), 6) for value in close if isinstance(value, (int, float))]
    if len(clean_close) < 2:
        raise RuntimeError(f"Not enough close prices for {symbol}")
    return {
        "currency": result["meta"].get("currency"),
        "regularMarketTime": result["meta"].get("regularMarketTime"),
        "close": clean_close,
    }


def main():
    symbols = {}
    errors = {}

    for symbol in SYMBOLS:
        try:
            symbols[symbol] = fetch(symbol)
        except Exception as exc:
            errors[symbol] = str(exc)

    if not symbols:
        raise SystemExit("No quotes fetched")

    OUT.write_text(
        json.dumps(
            {
                "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "source": "Yahoo Finance chart API via GitHub Actions",
                "symbols": symbols,
                "errors": errors,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    if errors:
        print(json.dumps(errors, indent=2), file=sys.stderr)


if __name__ == "__main__":
    main()
