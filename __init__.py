"""值班台 — dashboard-only plugin.

All behaviour lives in ``dashboard/`` (manifest + read-only API + UI bundle). This
module exists so ``hermes plugins enable duty-board`` can resolve the plugin; it
registers no hooks, tools or commands, so loading it in the gateway is a no-op.
"""


def register(ctx) -> None:  # noqa: ARG001 - intentional no-op
    return None
