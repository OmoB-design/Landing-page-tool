"""Image generation and edits through fal (D16). Mock mode (LP_MOCK_IMAGES=1, the default; D15)
draws a "MOCK IMAGE" placeholder locally and records a $0 ledger row.

The real path is wired but not exercised until B1.3: its request arguments (prompt,
aspect_ratio, num_images, output_format) must be checked against fal's current model schema
then. Account-locked / out-of-credit errors set an org-scoped provider lock (BUILD_SPEC §6.4).
"""

import io
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from typing import Any

import fal_client
import httpx
from PIL import Image, ImageDraw, ImageFont

from app.config import get_settings
from app.providers import cost, ledger, locks

PROVIDER = "fal"
LOCK_MARKERS = (
    "locked",
    "top up",
    "top-up",
    "exhausted balance",
    "insufficient balance",
    "insufficient credit",
)
ASPECT_RATIOS = {"1:1": 1.0, "4:3": 4 / 3, "3:4": 3 / 4, "3:2": 1.5, "2:3": 2 / 3,
                 "16:9": 16 / 9, "9:16": 9 / 16}  # fmt: skip


@dataclass(frozen=True)
class ImageResult:
    data: bytes
    mime: str
    width: int
    height: int
    model: str
    cost_usd: Decimal | None
    mock: bool


class ImagesNotConfiguredError(RuntimeError):
    pass


def generate_image(
    *, prompt: str, width: int = 1024, height: int = 768, mock: bool | None = None
) -> ImageResult:
    """Text-to-image (scenes, people). Returns the image bytes; the caller stores them."""
    model = get_settings().lp_fal_t2i_model
    return _run(model, "image", prompt, width, height, {}, mock)


def edit_image(
    *,
    prompt: str,
    image_urls: list[str],
    width: int = 1024,
    height: int = 768,
    mock: bool | None = None,
) -> ImageResult:
    """Image edit (product compositing, product fidelity) with reference image URLs."""
    model = get_settings().lp_fal_edit_model
    return _run(model, "edit", prompt, width, height, {"image_urls": image_urls}, mock)


def aspect_ratio(width: int, height: int) -> str:
    target = width / height
    return min(ASPECT_RATIOS, key=lambda name: abs(ASPECT_RATIOS[name] - target))


def _run(
    model: str,
    kind: ledger.LedgerKind,
    prompt: str,
    width: int,
    height: int,
    extra: dict[str, Any],
    mock: bool | None,
) -> ImageResult:
    use_mock = get_settings().lp_mock_images if mock is None else mock
    if use_mock:
        data = mock_image(width, height)
        ledger.record(
            kind=kind, provider=PROVIDER, model=f"mock/{model}", units=1, cost_usd=Decimal(0)
        )
        return ImageResult(data, "image/jpeg", width, height, f"mock/{model}", Decimal(0), True)

    ledger.check_budget()  # the brand's monthly AI budget (D54): refused before any charge
    org_id = ledger.require_context().org_id
    locks.ensure_unlocked(org_id, PROVIDER, "Image generation")
    arguments = {
        "prompt": prompt,
        "aspect_ratio": aspect_ratio(width, height),
        "num_images": 1,
        "output_format": "jpeg",
        **extra,
    }
    try:
        result = _client().subscribe(model, arguments=arguments)
    except Exception as exc:
        if any(marker in str(exc).lower() for marker in LOCK_MARKERS):
            locks.lock(org_id, PROVIDER, str(exc)[:500], get_settings().lp_provider_lock_minutes)
            locks.ensure_unlocked(org_id, PROVIDER, "Image generation")
        raise

    url = result["images"][0]["url"]
    data = httpx.get(url, timeout=60, follow_redirects=True).raise_for_status().content
    with Image.open(io.BytesIO(data)) as image:
        actual_width, actual_height = image.size
        mime = Image.MIME.get(image.format or "", "image/jpeg")
    price = cost.image_cost(model)
    ledger.record(kind=kind, provider=PROVIDER, model=model, units=1, cost_usd=price)
    return ImageResult(data, mime, actual_width, actual_height, model, price, False)


@lru_cache
def _client() -> fal_client.SyncClient:
    key = get_settings().fal_key
    if not key:
        raise ImagesNotConfiguredError("FAL_KEY is not set in services/worker/.env.")
    return fal_client.SyncClient(key=key, default_timeout=180)


def mock_image(width: int, height: int, label: str = "MOCK IMAGE") -> bytes:
    """A grey placeholder JPEG of the requested size with a centred label (zero cost)."""
    image = Image.new("RGB", (width, height), (214, 214, 219))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width - 1, height - 1), outline=(160, 160, 168), width=2)
    font = ImageFont.load_default(size=max(14, min(width, height) // 10))
    text = f"{label}\n{width} x {height}"
    box = draw.multiline_textbbox((0, 0), text, font=font, align="center")
    position = ((width - (box[2] - box[0])) / 2, (height - (box[3] - box[1])) / 2)
    draw.multiline_text(position, text, fill=(90, 90, 98), font=font, align="center")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=82)
    return buffer.getvalue()
