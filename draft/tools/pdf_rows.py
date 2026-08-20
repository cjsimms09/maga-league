# TERRITORY: A
"""PDF -> ROWS, using text POSITION, for a sandbox with no poppler.

Why this exists: `pdftotext -layout` is not installed here and apt cannot reach
a mirror, so the Draft Sharks path C used is unavailable in this container. A
plain text-operator dump loses column boundaries entirely -- Mike Clay's tables
come out as `283137314866854633651`, one long digit run -- because the column
gaps in a PDF are POSITION, not whitespace. This reconstructs rows by tracking
the text matrix and grouping by y, then orders cells by x.

⚠️ IT IS A FALLBACK AND SHOULD NOT OUTLIVE ITS NEED. If poppler is available,
`pdftotext -layout` is better tested and is what C's Draft Sharks parser already
uses. This is here so the sandbox is not a blocker, not to become a second
derivation of "how do we read a PDF" (rule 11).

⚠️ AND IT IS NOT A PROJECTION PARSER. It emits rows and cells. Turning those
into players and numbers is the ingest job, and it needs the same treatment C
gave Draft Sharks: an identity join, positional plausibility checks, and a
known-positive control against the source text.

Run: python3 draft/tools/pdf_rows.py <file.pdf> <out.txt>
"""
import re
import sys
import zlib

NUM = r'-?\d*\.?\d+'


def _streams(data: bytes):
    out = []
    for m in re.finditer(rb'stream\r?\n(.*?)\r?\nendstream', data, re.S):
        try:
            out.append(zlib.decompress(m.group(1)))
        except Exception:
            pass          # not every stream is text, and not every one inflates
    return out


def _unescape(s: str) -> str:
    return (s.replace(r'\(', '(').replace(r'\)', ')')
             .replace(r'\\', '\\').replace(r'\n', ' ').replace(r'\r', ' '))


TOKEN = re.compile((
    rb'BT|ET'
    rb'|(?P<tdx>' + NUM.encode() + rb')\s+(?P<tdy>' + NUM.encode() + rb')\s+(?P<td>Td|TD)'
    rb'|(?P<a>' + NUM.encode() + rb')\s+(?P<b>' + NUM.encode() + rb')\s+'
    rb'(?P<c>' + NUM.encode() + rb')\s+(?P<d>' + NUM.encode() + rb')\s+'
    rb'(?P<e>' + NUM.encode() + rb')\s+(?P<f>' + NUM.encode() + rb')\s+Tm'
    rb'|(?P<show>\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\[\]\\]|\\.)*\]\s*TJ)'
))

STR = re.compile(rb'\((?:\\.|[^\\()])*\)')


def page_rows(content: bytes, ytol: int = 1):
    x = y = 0.0
    rows = {}
    for m in TOKEN.finditer(content):
        if m.group('td'):
            x += float(m.group('tdx'))
            y += float(m.group('tdy'))
        elif m.group('e') is not None:
            x, y = float(m.group('e')), float(m.group('f'))
        elif m.group('show'):
            parts = [_unescape(p.group(0)[1:-1].decode('latin-1'))
                     for p in STR.finditer(m.group('show'))]
            txt = ''.join(parts).strip()
            if not txt:
                continue
            rows.setdefault(round(y / ytol) * ytol, []).append((x, txt))
    out = []
    for k in sorted(rows, reverse=True):                 # PDF y grows upward
        cells = [t for _, t in sorted(rows[k])]
        line = '\t'.join(cells)
        if line.strip():
            out.append(line)
    return out


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    data = open(sys.argv[1], 'rb').read()
    streams = _streams(data)
    rows = []
    for c in streams:
        rows.extend(page_rows(c))
    open(sys.argv[2], 'w').write('\n'.join(rows))
    print('streams inflated: %d' % len(streams))
    print('rows emitted:     %d' % len(rows))
    print('wrote %s' % sys.argv[2])


if __name__ == '__main__':
    main()
