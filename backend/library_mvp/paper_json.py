"""Bounded model JSON recovery. Never evaluates code or fabricates unfinished field values."""
import json
from itertools import islice
import re
import unicodedata


class ModelJSONError(ValueError):
    pass


def lower_keys(value):
    if not isinstance(value, dict):
        return {}
    return {unicodedata.normalize("NFKC", str(k)).casefold(): v for k, v in value.items()}


def syntax_ascii(raw):
    """Normalize JSON punctuation only outside strings; scientific text stays unchanged."""
    out, quote, escape = [], "", False
    punctuation = str.maketrans("｛｝［］：，", "{}[]:,")
    for char in raw:
        if quote:
            if escape:
                out.append(char)
                escape = False
            elif char == "\\":
                out.append(char)
                escape = True
            elif char == quote:
                out.append('"')
                quote = ""
            else:
                out.append(char)
        elif char in ('"', "＂", "“"):
            quote = "”" if char == "“" else char
            out.append('"')
        else:
            out.append(char.translate(punctuation))
    return "".join(out)


def partial_collection(raw, field):
    match = re.search(r'"' + re.escape(field) + r'"\s*:\s*([\[{])', raw, re.I)
    if not match:
        return None
    decoder, offset = json.JSONDecoder(), match.end()
    result = [] if match[1] == "[" else {}
    for _ in range(5000):
        offset += len(raw[offset:]) - len(raw[offset:].lstrip(" \r\n\t,"))
        try:
            value, end = decoder.raw_decode(raw, offset)
            if isinstance(result, dict):
                if not isinstance(value, str):
                    break
                colon = re.match(r"\s*:\s*", raw[end:])
                if not colon:
                    break
                row, end = decoder.raw_decode(raw, end + colon.end())
                result[value] = row
            else:
                result.append(value)
            offset = end
        except (ValueError, TypeError):
            break
    return {field: result} if result else None


def read_payload(raw, field):
    if isinstance(raw, dict):
        value = lower_keys(raw)
        if field in value:
            return value
    if not isinstance(raw, str) or len(raw) > 2_000_000:
        raise ModelJSONError("Model response has no usable JSON collection")
    decoder = json.JSONDecoder()
    for candidate in (raw, syntax_ascii(raw)):
        # Introductory prose and code fences are ignored; accept only the requested envelope.
        for match in islice(re.finditer(r"\{", candidate), 512):
            try:
                value, _ = decoder.raw_decode(candidate, match.start())
                value = lower_keys(value)
                if field in value:
                    return value
            except (ValueError, TypeError):
                continue
        partial = partial_collection(candidate, field)
        if partial:
            return partial
    raise ModelJSONError("Model response has no complete records")


def records(value, field):
    entries = lower_keys(value).get(field, [])
    if isinstance(entries, dict):
        key = "id" if field == "blocks" else "source"
        target = "text" if field == "blocks" else "target"
        return [
            {**(lower_keys(v) if isinstance(v, dict) else {target: v}), key: k} for k, v in entries.items()
        ]
    return [lower_keys(row) for row in entries if isinstance(row, dict)] if isinstance(entries, list) else []
