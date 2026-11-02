# Samples

Synthetic invoices only. Every company, address, number, tax ID and account below is invented, and each document says "synthetic" on the page. No real or client documents belong here, redacted or not (CLAUDE.md → Hard constraints).

Sources live in `src/` as HTML. `bash scripts/render-samples.sh [name ...]` regenerates every file (or just the named ones) (Chrome for PDFs and screenshots, ffmpeg to degrade the photo, receipt and fax). `synthetic-harbor-pine-inv-2041.pdf` is a hand-built raw PDF and has no source.

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
| `synthetic-alder-forge-three-page.pdf` | PDF, **3 pages** | 42 lines, headers repeated, totals only on page 3. | AF-77120 · 11/02/2026 → 12/02/2026 · `$` (US) · 42 lines · **2,743.87** |
| `synthetic-saltmarsh-split-row.pdf` | PDF, 2 pages | One line's description **breaks across the page**; its qty and amount are on page 2. | SMS-4410 · 28/10/2026 → 27/11/2026 · GBP · 15 lines · **4,164.96** |
| `synthetic-pinecrest-credit-note.pdf` | PDF | A **credit note**: every amount negative. The original invoice number as a distractor. No due date. | CN-2026-031 · Nov 3, 2026 · `$` (US) · **-189.75** |
| `synthetic-lumbre-two-tax-rates.pdf` | PDF, Spanish | **IVA 10% and 21%** plus a printed "Total IVA". Dates in words. `654,10 €`. | LS-2026/0458 · 3 de noviembre de 2026 · EUR · tax 107,60 · **761,70** |
| `synthetic-gruenwald-rechnung.pdf` | PDF, German | `Rechnungsdatum 02.11.2026`, `Fällig am`, MwSt 19 %, `1.200,00 €`. | RE-2026-1093 · EUR · **2.829,11** |
| `synthetic-atelier-moreau-facture.pdf` | PDF, French | **Narrow no-break space** as thousands separator (`1 450,00 €`), TVA, Échéance, SIRET. | AM-2026-212 · EUR · **2 287,20** |
| `synthetic-casa-ipe-nota.pdf` | PDF, Portuguese | `R$ 4.890,00` (BRL), CNPJ as a distractor. | CI-3391 · BRL · **10.505,60** |
| `synthetic-koyo-yen.pdf` | PDF | **JPY with no decimals** (`¥17,600`), consumption tax 10%. | KS-26-0907 · 2026-10-30 · JPY · **¥55,704** |
| `synthetic-bluefin-handwritten-total.png` | Scan | Quantities, line totals and the total **handwritten** into blank boxes. "Due on receipt". | BT-2207 · 10/29/2026 · `$` (US) · **88.47** |
| `synthetic-ridgeline-rotated-scan.png` | Scan | **Rotated 90°**, low resolution. | RO-60218 · 2026-10-26 · CAD · **1,192.78** |
| `synthetic-harrow-mixed-scan.pdf` | PDF, 2 pages | Page 1 has a text layer; **page 2 (the totals) is only an image**. | HF-11820 · October 30, 2026 · `$` (US) · 8 lines · **1,227.56** |
| `synthetic-ostrander-fx-reference.pdf` | PDF | USD total next to "≈ EUR 3,904.48, for reference only". | OFB-2026-388 · USD · **4,250.00** |
| `synthetic-meadowlark-paid-stamp.pdf` | PDF | A rotated **PAID 03 NOV 2026** stamp over the totals, plus a payment date. | MGC-50931 · 10/27/2026 → 11/10/2026 · `$` (US) · **866.83** |
| `synthetic-tern-services-no-qty.pdf` | PDF | Lines with **no qty or unit price**. Due "within 14 days" (a relative date). | TA-0412 · Nov 2, 2026 · USD · **6,450.00** |
| `synthetic-copperline-decimal-qty.pdf` | PDF | **Decimal quantities** (2.5 h, 12.75 kg, 0.5 day), `A$`, 1-digit days. | CW-8817 · 4/11/2026 → 18/11/2026 · AUD · **682.28** |
| `synthetic-hollowell-shipping-discount.pdf` | PDF | **Discount and shipping in the summary**, not as line items. | HHG-73305 · USD · subtotal 566.50 · **599.20** |
| `synthetic-vantage-customer-header.pdf` | PDF | The **customer's name** large at the top; the vendor only in small print at the bottom. | VPW-20931 · 30/10/2026 · GBP · **1,045.20** |
| `synthetic-cerro-azul-mxn-photo.jpg` | Phone photo | `$` meaning **MXN** ("Moneda: MXN" printed once). Dark, angled. | CA-5402 · 29/10/2026 · MXN · **6,950.14** |
| `synthetic-fjord-columns-swapped.pdf` | PDF | Columns in an unusual order (Amount, Qty, Description, Unit price), `kr 6 490,00`, `dd.mm.yyyy`. | FK-2026-0617 · 05.11.2026 · NOK · **33 667,50** |

Every invoice's arithmetic reconciles: the line totals sum to the subtotal, and subtotal plus tax equals the total. The values were computed when the sources were generated, not typed by hand.

## Golden-set rules (decided 1 Nov 2026)

Ground truth is in `evals/golden/<file>.json`, copied from the sources, never from model output. `evals/golden.test.ts` checks that every amount and description is printed in the source and that the arithmetic reconciles. A field can list several `accept` values where a rule allows it.

1. **Line descriptions with a sub-line** (Cobalt Ridge): accept the main line, or the main line plus its sub-line, joined by a space, ` / `, ` - ` or `, `. Both are defensible readings. The default mode always includes the sub-line, so scoring only the main line would count a formatting choice as an error.
2. **Vendor, legal or trading name:** accept either. Examples: Cobalt Ridge Print Co. or Co. S.L.; Orchard Labs Consulting with or without LLC; Tallow Lane with or without "Bakery Supply Co."; Meridian Office Partners with or without Ltd; Ferretería Andina with or without S.A.S.
3. **Ambiguous characters** (Quarry & Ash): the **intended** values `QA-2061` and 612.14. The printed `QA-2O61` scores as wrong. When it is below the confidence threshold the scorer counts it as *caught* (a person would see it), not as a silent error.
4. **Receipt number as the invoice number** (Kestrel): accept `000482` and `#000482`. The receipt prints no unit prices and no due date, so those expect `null`. Descriptions are accepted with or without the leading quantity (`2 Latte 12oz`).

5. **A currency shown only as `$` with a US address** (decided 1 Nov, after the luna vs sol run): accept `USD` or `null`. `null` follows the prompt's "never infer"; `USD` from a `$` and a US address is a defensible reading. This applies to Kestrel, Brightwater, Quarry & Ash, Tallow Lane, Alder Forge, Pinecrest, Bluefin, Harrow and Meadowlark. A `$` with a printed code (Ostrander, Hollowell, Tern, Cerro Azul's MXN, Ridgeline's CAD) has one answer.
6. **Credit note:** amounts are negative, exactly as printed.
7. **No printed quantity or unit price** (Tern): `qty` and `unitPrice` are `null`, never inferred as 1.
8. **A relative due date** ("within 14 days", "Due on receipt"): `dueDate` is `null`, never calculated.
9. **Summary charges are not line items** (Hollowell's discount and shipping): `subtotal`, `tax` and `total` are as printed. The golden file's `otherCharges` lets the arithmetic test reconcile.
10. **Vendor:** the business that issued the invoice, never the customer (Vantage).

The new documents also have one-answer designs for the remaining traps. Two tax rates print their total tax (Lumbre). A handwritten value counts as written (Bluefin). An FX reference amount is a distractor (Ostrander).
