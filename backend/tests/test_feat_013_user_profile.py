"""
FEAT-013 — User Profile (Avatar & Display Name)
Red-phase tests pinning two DESIGN.md documentation gaps.

BLOCKER-1: DESIGN.md §5 profiles table must list avatar_url.
BLOCKER-2: DESIGN.md §14.3 event catalog entry for profile.updated must
           accurately describe the implementation (frontend-only, no backend route).

These tests read the DESIGN.md file directly and assert that the authoritative
documentation matches the shipped implementation.  Both tests are expected to
FAIL before the prototyper fixes DESIGN.md, and PASS afterward.
"""

import pathlib
import re

DESIGN_MD = pathlib.Path(__file__).parents[2] / "docs" / "DESIGN.md"


def _read_design() -> str:
    return DESIGN_MD.read_text(encoding="utf-8")


# ─── BLOCKER-1 ────────────────────────────────────────────────────────────────

def test_profiles_table_lists_avatar_url():
    """
    AC-13.2.1 / §4a: The profiles table gained an avatar_url column in FEAT-013.
    DESIGN.md §5 must document it so validators have the correct schema reference.

    Failure means: DESIGN.md §5 profiles table is missing the avatar_url row.
    """
    text = _read_design()

    # Locate the profiles table block (between its header and the next #### heading)
    profiles_block_match = re.search(
        r"#### `profiles`(.+?)(?=####|\Z)",
        text,
        re.DOTALL,
    )
    assert profiles_block_match, "profiles table block not found in DESIGN.md §5"

    profiles_block = profiles_block_match.group(1)

    # The column must appear as a table row
    assert "avatar_url" in profiles_block, (
        "DESIGN.md §5 profiles table is missing the `avatar_url` column "
        "(added in FEAT-013). Add a row: "
        "| `avatar_url` | text | nullable; DiceBear preset URL (FEAT-013) |"
    )


# ─── BLOCKER-2 ────────────────────────────────────────────────────────────────

def test_profile_updated_event_catalog_entry_present():
    """
    DESIGN.md §14.3 event catalog must contain a profile.updated entry.
    This confirms the catalog was intentionally authored for FEAT-013 and
    is not accidentally missing.
    """
    text = _read_design()
    assert "profile.updated" in text, (
        "DESIGN.md §14.3 event catalog is missing the `profile.updated` entry. "
        "It must be present (even as a frontend-console-only event per GAP-8)."
    )


def test_profile_updated_event_notes_frontend_origin():
    """
    BLOCKER-2: FEAT-013 has no backend route (spec §4b explicit decision).
    The profile.updated event therefore cannot fire from 'Route · profiles'.
    DESIGN.md §14.3 must clarify that this event is emitted from the frontend
    (to console per GAP-8) rather than from a non-existent backend route,
    OR document that it is pending a future backend route.

    We check that the catalog row for profile.updated does NOT claim
    'Route · profiles' without qualification, because no such route exists.

    Acceptable resolutions (any one suffices):
      a) Row updated to 'Frontend · Profile (console, GAP-8)'
      b) Row annotated with a note that the route is future / pending
      c) A comment in the table row explaining the no-route decision

    This test asserts that the word 'Frontend' or 'GAP-8' or 'console' or
    'future' appears in the same line as 'profile.updated' in the catalog.
    """
    text = _read_design()

    # Find the line(s) containing profile.updated
    lines = [ln for ln in text.splitlines() if "profile.updated" in ln]
    assert lines, "profile.updated not found in DESIGN.md at all — fix BLOCKER-1 first"

    catalog_line = lines[0]
    qualifications = ("Frontend", "GAP-8", "console", "future", "pending")
    qualified = any(q in catalog_line for q in qualifications)
    assert qualified, (
        f"DESIGN.md §14.3 profile.updated catalog line does not clarify that "
        f"the event fires from the frontend (no backend route in FEAT-013). "
        f"Line found: {catalog_line!r}. "
        f"Update the 'Fires from' column to 'Frontend · Profile (console, GAP-8)' "
        f"or add a qualifying note."
    )
