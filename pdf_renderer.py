#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import urlparse


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render a ProtoDock share as an A4 landscape PDF.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--timeout-seconds", type=int, default=600)
    return parser.parse_args()


def validate_render_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("PDF renderer only accepts local ProtoDock HTTP URLs")
    if not parsed.path.startswith("/s/"):
        raise ValueError("PDF renderer URL must point to a ProtoDock share")
    return value


async def render(url: str, output: Path, timeout_seconds: int) -> dict:
    from playwright.async_api import async_playwright

    timeout_ms = max(30, timeout_seconds) * 1000
    output.parent.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            page = await browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            await page.wait_for_function(
                "() => window.ProtoDockPrint?.isDocumentReady?.() === true",
                timeout=timeout_ms,
            )
            result = await page.evaluate("() => window.ProtoDockPrint.prepare()")
            await page.wait_for_function(
                "() => document.body.classList.contains('is-server-print-ready')",
                timeout=timeout_ms,
            )
            await page.emulate_media(media="print")
            await page.pdf(
                path=str(output),
                format="A4",
                landscape=True,
                print_background=True,
                prefer_css_page_size=True,
                display_header_footer=False,
            )
            return result or {}
        finally:
            await browser.close()


def main() -> None:
    args = parse_args()
    url = validate_render_url(args.url)
    result = asyncio.run(render(url, args.output, args.timeout_seconds))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
