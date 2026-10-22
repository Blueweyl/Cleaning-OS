#!/usr/bin/env python3
"""Build the one-file copy of CleanFlow that buyers receive.

index.html loads its stylesheets and scripts from the assets folder, which is
fine while developing but easy for a customer to break: move index.html out of
its folder and the app stops working. This writes dist/CleanFlow.html with
every stylesheet and script inlined, in the same order index.html loads them,
so the buyer gets a single file that works wherever they put it.

Run from anywhere:  python3 tools/build-single.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'index.html'
OUT = ROOT / 'dist' / 'CleanFlow.html'

STYLESHEET = re.compile(r'<link rel="stylesheet" href="(assets/[^"]+)">')
SCRIPT = re.compile(r'<script src="(assets/[^"]+)"></script>')


def read_asset(rel, closing_tag):
    text = (ROOT / rel).read_text(encoding='utf-8')
    # A closing tag inside the inlined text would end the element early and
    # spill the rest of the file onto the page as text.
    if closing_tag in text.lower():
        sys.exit('%s contains %s and cannot be inlined safely' % (rel, closing_tag))
    return text


def inline_style(match):
    rel = match.group(1)
    return '<style>/* %s */\n%s\n</style>' % (rel, read_asset(rel, '</style'))


def inline_script(match):
    rel = match.group(1)
    return '<script>/* %s */\n%s\n</script>' % (rel, read_asset(rel, '</script'))


def main():
    html = SOURCE.read_text(encoding='utf-8')
    html, styles = STYLESHEET.subn(inline_style, html)
    html, scripts = SCRIPT.subn(inline_script, html)
    html = html.replace(
        '<!-- Classic scripts, no modules: this file has to work when it is opened\n'
        '     straight from a folder (file://), where ES modules are blocked. -->',
        '<!-- Built by tools/build-single.py from index.html: every stylesheet and\n'
        '     script is inlined so this one file works on its own. -->')
    if 'src="assets/' in html or 'href="assets/' in html:
        sys.exit('index.html still references assets/ after inlining')
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    print('Wrote %s (%d stylesheets, %d scripts, %d KB)'
          % (OUT.relative_to(ROOT), styles, scripts, len(html.encode('utf-8')) // 1024))


if __name__ == '__main__':
    main()
