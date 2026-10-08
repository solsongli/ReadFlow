"""Build small Unicode-addressable font subsets with the already bundled Typst.

MuPDF 1.26.5's CFF subsetter fails on the full Source Han CID font. Typst emits
compact CID CFF subsets; a minimal OpenType wrapper restores their Unicode cmap.
No fontTools, downloaded font, or PDF/model text is executed as source code.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
from .paper_blocks_render import runtime_paths
from .paper_blocks_storage import write_json
from .store import StoreError

SEED = """#set page(width: 600pt, height: 800pt, margin: 20pt)
#set text(font: "Source Han Serif SC", size: 8pt, features: ("liga": 0, "clig": 0))
#let chars = json("chars.json")
#text(chars)
#pagebreak()
#text(weight: "bold", chars)
"""


def tables(data):
    count = struct.unpack_from(">H", data, 4)[0]
    return {
        tag: data[offset : offset + length]
        for tag, _, offset, length in (struct.unpack_from(">4sIII", data, 12 + i * 16) for i in range(count))
    }


def pack_font(entries):
    entries = sorted(entries.items())
    n = len(entries)
    power = 2 ** (n.bit_length() - 1)
    header = b"OTTO" + struct.pack(">HHHH", n, power * 16, n.bit_length() - 1, (n - power) * 16)
    directory, body = bytearray(), bytearray()
    for name, data in entries:
        offset = 12 + n * 16 + len(body)
        padded = data + b"\0" * (-len(data) % 4)
        checksum = sum(struct.unpack(">" + "I" * (len(padded) // 4), padded)) & 0xFFFFFFFF
        directory += struct.pack(">4sIII", name, checksum, offset, len(data))
        body += padded
    output = bytearray(header + directory + body)
    checksum = sum(struct.unpack(">" + "I" * (len(output) // 4), output)) & 0xFFFFFFFF
    head = next(
        struct.unpack_from(">I", directory, i * 16 + 8)[0]
        for i, (name, _) in enumerate(entries)
        if name == b"head"
    )
    struct.pack_into(">I", output, head + 8, (0xB1B0AFBA - checksum) & 0xFFFFFFFF)
    return bytes(output)


def unicode_map(doc, xref):
    value = doc.xref_get_key(xref, "ToUnicode")
    if value[0] != "xref":
        return {}
    stream = doc.xref_stream(int(value[1].split()[0])).decode("ascii")
    result = {}
    for section in re.findall(r"beginbfchar(.*?)endbfchar", stream, re.S):
        for cid, code in re.findall(r"<([0-9a-f]+)>\s*<([0-9a-f]+)>", section, re.I):
            text = bytes.fromhex(code).decode("utf-16-be")
            if len(text) == 1:
                result[ord(text)] = int(cid, 16)
    return result


def cid_widths(doc, xref, count):
    child = int(doc.xref_get_key(xref, "DescendantFonts")[1].strip("[] ").split()[0])
    default = doc.xref_get_key(child, "DW")
    widths = [float(default[1]) if default[0] in ("int", "real") else 1000] * count
    tokens = re.findall(r"\[|\]|[-+]?\d+(?:\.\d+)?", doc.xref_get_key(child, "W")[1])[1:-1]
    i = 0
    while i < len(tokens):
        start, i = int(tokens[i]), i + 1
        if tokens[i] == "[":
            i += 1
            while tokens[i] != "]":
                if start < count:
                    widths[start] = float(tokens[i])
                start, i = start + 1, i + 1
            i += 1
        else:
            end, value = int(tokens[i]), float(tokens[i + 1])
            i += 2
            for at in range(start, min(count, end + 1)):
                widths[at] = value
    return widths


def subset_names(data, postscript_name):
    # Keep copyright/license/family records; identify the embedded subset with
    # the same standard six-letter tag used by the generated CFF program.
    kind, count, offset = struct.unpack_from(">HHH", data)
    records, strings = bytearray(), bytearray()
    for i in range(count):
        platform, encoding, language, name_id, length, at = struct.unpack_from(">HHHHHH", data, 6 + 12 * i)
        value = data[offset + at : offset + at + length]
        if name_id in {1, 3, 4, 6}:
            value = postscript_name.encode("utf-16-be" if platform in (0, 3) else "ascii")
        records += struct.pack(">HHHHHH", platform, encoding, language, name_id, len(value), len(strings))
        strings += value
    return struct.pack(">HHH", 0, count, 6 + count * 12) + records + strings


def wrap_cff(doc, xref, buffer, original, name):
    import pymupdf as fitz

    base = tables(original)
    mapping = unicode_map(doc, xref)
    count = fitz.Font(fontbuffer=buffer).glyph_count
    if not mapping or max(mapping.values()) >= count:
        raise StoreError("font_subset", "字形子集映射无效，原文未修改。")
    groups = b"".join(struct.pack(">III", code, code, gid) for code, gid in sorted(mapping.items()))
    cmap = (
        struct.pack(">HHHHI", 0, 1, 3, 10, 12)
        + struct.pack(">HHIII", 12, 0, 16 + len(groups), 0, len(mapping))
        + groups
    )
    head, hhea = bytearray(base[b"head"]), bytearray(base[b"hhea"])
    struct.pack_into(">I", head, 8, 0)
    struct.pack_into(">H", hhea, 34, count)
    units = struct.unpack_from(">H", head, 18)[0]
    hmtx = b"".join(
        struct.pack(">Hh", min(65535, max(0, round(width * units / 1000))), 0)
        for width in cid_widths(doc, xref, count)
    )
    subset = {key: base[key] for key in (b"name", b"OS/2")}
    subset[b"name"] = subset_names(base[b"name"], name.removesuffix("-Identity-H"))
    subset.update(
        {
            b"CFF ": buffer,
            b"cmap": cmap,
            b"head": bytes(head),
            b"hhea": bytes(hhea),
            b"hmtx": hmtx,
            b"maxp": struct.pack(">IH", 0x5000, count),
            b"post": struct.pack(">I", 0x30000) + b"\0" * 28,
        }
    )
    return pack_font(subset)


def prepare_fonts(root, texts, check=lambda: None):
    import pymupdf as fitz

    binary, directories, _ = runtime_paths()
    regular = next(
        (
            Path(folder) / "SourceHanSerifSC-Regular.otf"
            for folder in directories.split(os.pathsep)
            if (Path(folder) / "SourceHanSerifSC-Regular.otf").is_file()
        ),
        None,
    )
    if regular is None:
        raise StoreError("font_missing", "内置思源宋体不可用。", 503)
    chars = " ".join(sorted(set("".join(texts) + "… ").difference("\r\n\t")))
    stamp = hashlib.sha256(("layout-font-v3" + chars).encode()).hexdigest()[:24]
    folder = Path(root) / ("layout-fonts-" + stamp)
    folder.mkdir(exist_ok=True)
    if folder.is_symlink():
        raise StoreError("UNSAFE_DATA_ROOT", "字体缓存不能是符号链接。")
    manifest = folder / "ready.json"
    if not manifest.is_file():
        (folder / "chars.json").write_text(json.dumps(chars, ensure_ascii=False), encoding="utf-8")
        (folder / "seed.typ").write_text(SEED, encoding="utf-8")
        env = {key: val for key, val in os.environ.items() if key in ("PATH", "LANG", "TMPDIR")}
        env["RAYON_NUM_THREADS"] = "2"
        process = subprocess.Popen(
            [
                binary,
                "compile",
                "--ignore-system-fonts",
                "--font-path",
                str(regular.parent),
                str(folder / "seed.typ"),
                str(folder / "seed.pdf"),
            ],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            for _ in range(150):
                check()
                try:
                    if process.wait(timeout=0.2) != 0:
                        raise StoreError("font_subset", "字体子集生成失败。")
                    break
                except subprocess.TimeoutExpired:
                    pass
            else:
                raise StoreError("font_subset", "字体子集生成超时。")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
        names = {}
        with fitz.open(folder / "seed.pdf") as seed:
            for page in seed:
                for entry in page.get_fonts():
                    name, ext, _, data = seed.extract_font(entry[0])
                    if "SourceHanSerif" not in name:
                        continue
                    weight = "bold" if "Bold" in name else "normal"
                    if weight in names:
                        continue
                    original = regular.with_name("SourceHanSerifSC-Bold.otf") if weight == "bold" else regular
                    filename = weight + ".otf"
                    (folder / filename).write_bytes(
                        wrap_cff(seed, entry[0], data, original.read_bytes(), name)
                    )
                    names[weight] = filename
        if not names:
            raise StoreError("font_subset", "未生成可用的字形子集。")
        write_json(manifest, names)
    names = json.loads(manifest.read_text(encoding="utf-8"))
    css = "".join(
        f'@font-face{{font-family:RF;src:url("{name}");font-weight:{weight}}}'
        for weight, name in names.items()
    )
    return fitz.Archive(str(folder)), css, folder
