"""The publish gate (BUILD_SPEC §12.1, D4, D87). Pure.

Before every publish: copy the build couldn't write, high-risk claims, placeholder images and, for
clones, a residue score under the threshold or any mention of the source brand (B2.3) block it.
The user may publish anyway after confirming
the reasons (recorded on the publication), except placeholder images, which can be published only
while the org's testing switch is on.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Blocker:
    code: str
    message: str
    # Whether "Publish anyway" may pass it.
    overridable: bool


def blockers(
    report: dict[str, Any],
    *,
    mock_images: bool,
    origin: str,
    allow_placeholders: bool,
    residue_min: int = 85,
) -> list[Blocker]:
    found: list[Blocker] = []
    copy_error = (report.get("copy") or {}).get("error")
    if copy_error:
        found.append(Blocker("copy_error", "Some copy is still in the template's words.", True))
    high = int((report.get("compliance") or {}).get("high_risk_count") or 0)
    if high:
        claims = "1 claim is" if high == 1 else f"{high} claims are"
        found.append(Blocker("claims", f"{claims} marked Fix in the claim check.", True))
    if mock_images:
        found.append(
            Blocker(
                "placeholder_images",
                "The page still has placeholder images."
                + (" Your testing switch allows publishing it." if allow_placeholders else ""),
                allow_placeholders,
            )
        )
    if origin == "cloned":
        score = (report.get("residue") or {}).get("score")
        if score is None:
            # D4, D96: a clone isn't published until its source leaks have been scored.
            found.append(
                Blocker(
                    "residue_unscored",
                    "The source brand hasn't been checked for on this page yet.",
                    False,
                )
            )
        else:
            counts = (report.get("residue") or {}).get("counts") or {}
            mentions = int(counts.get("brand") or 0)
            if mentions:
                # §12.1: any mention of the source brand on the page blocks, whatever the score.
                said = "once" if mentions == 1 else f"{mentions} times"
                found.append(
                    Blocker(
                        "source_brand",
                        f"The source brand's name is still on the page ({said}).",
                        True,
                    )
                )
            if float(score) < residue_min:
                found.append(
                    Blocker(
                        "residue",
                        f"Too much of the source page is left (leak score {score}, "
                        f"{residue_min} needed).",
                        True,
                    )
                )
    return found


def can_publish(found: list[Blocker], *, override: bool) -> bool:
    """Nothing blocks, or every blocker may be passed and the user chose to."""
    return all(b.overridable for b in found) and (override or not found)
