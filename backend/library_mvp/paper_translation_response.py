"""Turn the two text fields into locally typed runs; model output cannot choose formatting."""
from .paper_context import protected_fields
from .paper_blocks_inline import restore_rich


def restore_fields(block, row, mapping):
    _, expected_head, _ = protected_fields(block)
    if not expected_head:
        return restore_rich(row.get("text"), mapping)
    head, body = row.get("head"), row.get("text")
    if not isinstance(head, str) or not head.strip() or not isinstance(body, str) or not body.strip():
        return None
    # Every protected token belongs to one of these two local source fields.
    head_map = {key: span for key, span in mapping.items() if key in expected_head}
    body_map = {key: span for key, span in mapping.items() if key not in head_map}
    title, content = restore_rich(head, head_map), restore_rich(body, body_map)
    if title is None or content is None:
        return None
    separator = "" if title["text"][-1:].isspace() or content["text"][:1].isspace() else " "
    return {
        "text": title["text"] + separator + content["text"],
        "runs": [{**run, "bold": True} for run in title["runs"]]
        + ([{"kind": "text", "text": separator}] if separator else [])
        + content["runs"],
        **({"marker_issues": True} if title.get("marker_issues") or content.get("marker_issues") else {}),
    }
