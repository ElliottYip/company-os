from pathlib import Path

from reportlab.lib.pagesizes import A3
from reportlab.pdfgen.canvas import Canvas


ROOT = Path("/Users/elliottye/Documents/ChatGPT/os")
WORK = ROOT / "tmp/fde-layout-fix"
OUT = ROOT / "outputs/fde-brochure-layout-fix-v61/pdf"


def build_pdf(language: str, filename: str) -> None:
    pages = sorted((WORK / language / "final").glob("slide-*.png"))
    if len(pages) != 12:
        raise RuntimeError(f"Expected 12 {language} pages, found {len(pages)}")
    output = OUT / filename
    page_width, page_height = A3
    canvas = Canvas(str(output), pagesize=A3, pageCompression=1)
    for page in pages:
        canvas.drawImage(
            str(page),
            0,
            0,
            width=page_width,
            height=page_height,
            preserveAspectRatio=False,
            mask="auto",
        )
        canvas.showPage()
    canvas.save()


OUT.mkdir(parents=True, exist_ok=True)
build_pdf("en", "FDE-AI-Upgrade-English-v61.pdf")
build_pdf("zh", "FDE企业AI升级-中文-v61.pdf")
