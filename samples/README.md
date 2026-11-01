# Samples

Synthetic invoices only. Every company, address, number, tax ID and account below is invented, and each document says "synthetic" on the page. No real or client documents belong here, redacted or not (CLAUDE.md → Hard constraints).

Sources live in `src/` as HTML. `bash scripts/render-samples.sh` regenerates every file (Chrome for PDFs and screenshots, ffmpeg to degrade the photo, receipt and fax). `synthetic-harbor-pine-inv-2041.pdf` is a hand-built raw PDF and has no source.

The values below are what's printed. They are the starting point for the week 3 golden set, not the golden set itself: the normalisation rules (dates to ISO, amounts to cents, string folding) and the open rules in the last section come first.

| File | Format | What makes it hard | Key printed values |
|---|---|---|---|
| `synthetic-harbor-pine-inv-2041.pdf` | PDF, 1 page | Plain baseline. Labels inside quotes. | INV-2041 · 14/10/2026 → 13/11/2026 · USD · 3 lines · 1,148.50 + 136.00 = **1,284.50** |
| `synthetic-cobalt-ridge-inv-0587.pdf` | PDF, 1 page | PO number and a "RECEIVED 30 OCT 2026" stamp as distractors. Grey sub-lines under descriptions. | CR-2026-0587 · 28 Oct 2026 → 27 Nov 2026 · EUR · 4 lines · 1,016.50 + 213.47 = **1,229.97** |
| `synthetic-cobalt-ridge-inv-0587.png` | PNG | The same invoice as an image, with no text layer. | Same as above |
| `synthetic-tallow-lane-photo.jpg` | JPEG photo | Tilted, perspective, slight blur, shadowed edges, warm cast. | TLS-48812 · Oct 22, 2026 → Nov 21, 2026 · USD · 3 lines · 472.85 + 34.28 = **507.13** |
| `synthetic-quarry-ash-ambiguous.pdf` | PDF, 1 page, Courier | Invoice number printed with a **letter O** (`QA-2O61`); total printed with a **lower-case l** (`$6l2.14`). Expect lowered confidence on both. | QA-2O61 · 2026-10-24 → 2026-11-23 · USD · 4 lines · 566.80 + 45.34 = **612.14** |
| `synthetic-north-meadow-no-due-date.pdf` | PDF, 1 page | **No due date anywhere**: the answer is null, not a guess. `$` amounts in a CAD invoice. | NMF-3307 · 2026-10-19 → (none) · CAD · 3 lines · 295.00 + 14.75 = **309.75** |
| `synthetic-brightwater-two-page.pdf` | PDF, **2 pages** | 26 line items across the page break. Totals only on page 2. Repeated descriptions marked "(lot B)". | BW-90314 · October 27, 2026 → November 26, 2026 · USD · 26 lines · 1,269.25 + 79.33 = **1,348.58** |
| `synthetic-ferreteria-andina-factura.pdf` | PDF, 1 page, Spanish | Colombian separators (`$ 3.128.510,00` = 3128510.00). `$` meaning COP. NIT, CUFE and resolution numbers as distractors. | FE-10457 · 15/10/2026 → 14/11/2026 · COP · 3 lines · 2,629,000 + 499,510 = **3,128,510** |
| `synthetic-kestrel-receipt-scan.png` | PNG scan of a receipt | A receipt, not an invoice: **no due date** and a receipt number only. Grey, faded and skewed. `$` only on the total. | #000482 · 10/30/2026 → (none) · USD · 3 lines · 29.10 + 1.75 = **30.85** |
| `synthetic-orchard-labs-discount.pdf` | PDF, 1 page | A **negative discount line** (−354.00). Tax printed as 0.00 (value 0, not null). US `mm/dd` dates. | OL-2026-117 · 10/09/2026 (Oct 9) → 11/08/2026 · USD · 3 lines · 3,186.00 + 0.00 = **3,186.00** |
| `synthetic-meridian-fax.png` | PNG fax | Low resolution, harsh contrast, speckle, skew. The fax header carries another date and time. "Net" labels. | MOP-55120 · 21/10/2026 → 20/11/2026 · GBP · 3 lines · 1,134.00 + 226.80 = **1,360.80** |

Every invoice's arithmetic reconciles: the line totals sum to the subtotal, and subtotal plus tax equals the total. The values were computed when the sources were generated, not typed by hand.

## Open rules for the golden set

Decide these before writing ground truth, or the scorer will count formatting choices as model errors:

1. **Line descriptions with a sub-line** (Cobalt Ridge "…soft-touch / Box of 500, double-sided"). The proposal is to count the main line only. The PDF run returned both lines; the PNG run returned only the main line.
2. **Vendor legal name vs trading name** ("Cobalt Ridge Print Co." in the header, "Cobalt Ridge Print Co. S.L." in the From block). The proposal is to accept either.
3. **Ambiguous characters** (Quarry & Ash). The value as intended (`QA-2061`, 612.14) or as printed (`QA-2O61`)? The proposal is the intended value, with confidence below the threshold being the behaviour that counts.
4. **Receipt number as the invoice number** (Kestrel). The proposal is to accept `000482`, with confidence expected to be lower.
