"""Generate original synthetic research papers; uses no external text, fonts, images or model."""
from pathlib import Path
import fitz

ROOT = Path(__file__).parent


def paper(path, count=12, translated=False, bookmarks=True):
    doc = fitz.open()
    for index in range(count):
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 40), 'ReadFlow Synthetic Research', fontsize=9, color=(.4, .4, .4))
        title = ('References' if index == 11 else '1 Introduction' if index == 0 else '2 Methods' if index == 1 else '2.1 Experiments' if index == 2 else f'{index + 1} Results')
        page.insert_text((50, 83), title, fontsize=19)
        prefix = 'Translated: ' if translated else ''
        if index == 0:
            page.insert_text((50, 112), 'Abstract', fontsize=14)
            page.insert_text((50, 142), prefix + 'We follow [12], [3-5], and [7, 9].', fontsize=11)
            page.insert_text((50, 171), prefix + 'The baseline is (Zhang et al., 2025).', fontsize=11)
            page.insert_text((50, 200), prefix + 'See Figure 3, Table 2 and Eq. (4) for evidence.', fontsize=11)
            page.insert_text((50, 229), 'Open external research link', fontsize=11)
            page.insert_link({'kind': fitz.LINK_URI, 'from': fitz.Rect(50, 216, 240, 232), 'uri': 'https://example.org/research'})
        elif index == 2:
            page.draw_rect(fitz.Rect(80, 150, 515, 390), color=(.2, .35, .6), fill=(.85, .91, .98))
            for x, h in [(120, 100), (210, 160), (300, 210), (390, 135)]:
                page.draw_rect(fitz.Rect(x, 380 - h, x + 45, 380), fill=(.2, .4, .7))
            page.insert_text((65, 415), 'Figure 3: Controlled synthetic experiment.', fontsize=11)
        elif index == 3:
            page.insert_text((65, 130), 'Table 2: Comparison of synthetic models.', fontsize=11)
            for n, value in enumerate(['Model        Accuracy       Time', 'Baseline     0.72           12 ms', 'ReadFlow     0.91            8 ms']):
                page.insert_text((70, 165 + n * 28), value, fontsize=12)
                page.draw_line((65, 174 + n * 28), (500, 174 + n * 28), color=(.5, .5, .5))
        elif index == 4:
            page.insert_text((140, 190), 'E = m c^2', fontsize=24)
            page.insert_text((65, 250), 'Eq. (4): Energy in the synthetic example.', fontsize=11)
        elif index == 11:
            for n in range(1, 13):
                name = 'Zhang' if n == 12 else f'Author{n}'
                page.insert_text((50, 110 + n * 44), f'[{n}] {name}, A. et al. 2025. Synthetic research method {n}.', fontsize=10)
                page.insert_text((65, 126 + n * 44), 'Journal of Reproducible Fixtures, 1(1): 1-8.', fontsize=10)
        else:
            for line in range(20):
                page.insert_text((50, 125 + line * 24), prefix + f'Reproducible evidence on page {index + 1}, line {line + 1}.', fontsize=11)
        page.insert_text((290, 812), str(index + 1), fontsize=10)
    first = doc[0]
    first.insert_link({'kind': fitz.LINK_GOTO, 'from': fitz.Rect(102, 130, 128, 146), 'page': 11, 'to': fitz.Point(50, 638)})
    if bookmarks:
        doc.set_toc([[1, '1 Introduction', 1], [1, '2 Methods', 2], [2, '2.1 Experiments', 3], [1, 'References', 12]])
    doc.set_metadata({'title': 'A Researcher Designed Reader', 'author': 'Zhang, Alice; Li, Bob'})
    doc.save(path, garbage=4, deflate=True)
    doc.close()


if __name__ == '__main__':
    paper(ROOT / 'paper.pdf')
    paper(ROOT / 'paper-translated.pdf', count=14, translated=True)
    paper(ROOT / 'paper-no-outline.pdf', bookmarks=False)
    paper(ROOT / 'paper-100.pdf', count=100)
