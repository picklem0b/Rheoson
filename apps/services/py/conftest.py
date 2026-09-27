"""Pytest root configuration.

Presence of this file puts the engine root on ``sys.path`` (pytest inserts the
directory of the nearest conftest), which is what lets the tests import
``app.*`` without an installed package.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Tests must never depend on a developer's shell: pin the environment the
# engine reads before any module import captures it.
#
# The data directory is a **fresh temp directory per session**, not a path in
# the repository. A repo-relative directory survives between runs, and then a
# previous run's downloads are indistinguishable from a library the developer
# actually has — which is how a test that resolves a track from the network
# starts passing for the wrong reason.
os.environ.setdefault("ENGINE_DATA_DIR", tempfile.mkdtemp(prefix="rheoson-engine-tests-"))
