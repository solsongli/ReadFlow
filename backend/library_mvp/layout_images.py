"""Visible image footprints from MuPDF's paint/clip stack, not the untrimmed XObject bbox."""
import pymupdf as fitz


def visible_image_boxes(page):
    mu = fitz.mupdf
    bounds = page.rect

    class ImageDevice(mu.FzDevice2):
        def __init__(self):
            super().__init__()
            self.clips = [fitz.Rect(bounds)]
            self.boxes = []
            self.masks = []
            for name in (
                "fill_image",
                "fill_image_mask",
                "clip_path",
                "clip_stroke_path",
                "clip_text",
                "clip_stroke_text",
                "clip_image_mask",
                "pop_clip",
                "begin_mask",
                "end_mask",
            ):
                getattr(self, "use_virtual_" + name)()

        def push(self, scissor):
            box = fitz.Rect(scissor.x0, scissor.y0, scissor.x1, scissor.y1)
            self.clips.append(self.clips[-1] & box)

        def clip_path(self, context, path, even_odd, matrix, scissor):
            self.push(scissor)

        def clip_stroke_path(self, context, path, stroke, matrix, scissor):
            self.push(scissor)

        def clip_text(self, context, text, matrix, scissor):
            self.push(scissor)

        def clip_stroke_text(self, context, text, stroke, matrix, scissor):
            self.push(scissor)

        def clip_image_mask(self, context, image, matrix, scissor):
            self.push(scissor)

        def pop_clip(self, context):
            if len(self.clips) > 1:
                self.clips.pop()

        def begin_mask(self, context, area, luminosity, colorspace, background, params):
            self.masks.append((len(self.clips), fitz.Rect(area.x0, area.y0, area.x1, area.y1)))

        def end_mask(self, context, transfer):
            depth, box = self.masks.pop()
            self.clips = self.clips[:depth]
            self.clips.append(self.clips[-1] & box)

        def record(self, matrix):
            if self.masks:
                return  # Alpha-mask images are not visible paper content.
            transform = fitz.Matrix(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
            box = (fitz.Rect(0, 0, 1, 1) * transform) & self.clips[-1]
            if not box.is_empty:
                self.boxes.append(box * page.derotation_matrix)

        def fill_image(self, context, image, matrix, alpha, params):
            if alpha > 0:
                self.record(matrix)

        def fill_image_mask(self, context, image, matrix, colorspace, color, alpha, params):
            if alpha > 0:
                self.record(matrix)

    device = ImageDevice()
    mu.fz_run_page_contents(page.this, device, mu.FzMatrix(1, 0, 0, 1, 0, 0), mu.FzCookie())
    return device.boxes
