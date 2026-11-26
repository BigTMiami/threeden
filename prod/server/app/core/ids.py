"""IDs are UUID version 7: random, but they sort by creation time (docs/architecture.md §6.2)."""

import os
import time
import uuid


def uuid7() -> uuid.UUID:
    """RFC 9562 UUIDv7: 48-bit Unix milliseconds, version, 74 random bits, variant."""
    ms = time.time_ns() // 1_000_000
    rand = int.from_bytes(os.urandom(10), "big")
    value = (ms & 0xFFFF_FFFF_FFFF) << 80
    value |= 0x7 << 76  # version 7
    value |= ((rand >> 62) & 0xFFF) << 64  # 12 random bits
    value |= 0b10 << 62  # variant
    value |= rand & 0x3FFF_FFFF_FFFF_FFFF  # 62 random bits
    return uuid.UUID(int=value)
