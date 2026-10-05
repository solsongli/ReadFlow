"""Coalesce verified display groups, including their numbers and script fragments."""
from .paper_blocks_text import merge


def equation_parts(rows, words):
    groups, output = {}, []
    for row in rows:
        identity = row.get("display_group")
        if row["type"] != "formula" or identity is None:
            output.append(row)
        elif identity not in groups:
            groups[identity] = row
            output.append(row)
        else:
            merge(groups[identity], row, words)
    return sorted(output, key=lambda r: (r["bbox"][1], r["bbox"][0]))
