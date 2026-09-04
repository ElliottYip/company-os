from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def build_pdf(image_dir: Path, output_pdf: Path) -> None:
    images = sorted(image_dir.glob("slide-*.png"))
    if len(images) != 12:
        raise RuntimeError(f"Expected 12 slide images in {image_dir}, found {len(images)}")
    width, height = A4
    pdf = canvas.Canvas(str(output_pdf), pagesize=A4, pageCompression=1)
    for image_path in images:
        pdf.drawImage(str(image_path), 0, 0, width=width, height=height, preserveAspectRatio=False, mask="auto")
        pdf.showPage()
    pdf.save()


root = Path("/Users/elliottye/Documents/ChatGPT/os")
build_pdf(
    root / "work/fde-brochure-v52-feishu-qr/final-preview",
    root / "output/pdf/fde-short-names/FDE企业AI升级.pdf",
)
build_pdf(
    root / "work/fde-brochure-v36-approved-orange-cover-en/final-preview",
    root / "output/pdf/fde-short-names/FDE AI Upgrade.pdf",
)
