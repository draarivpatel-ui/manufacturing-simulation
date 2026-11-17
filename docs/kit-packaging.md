# Full kit: unit box and Amazon carton

What goes on the kit's packaging for Amazon FBA, and how the line does it. This is a summary of public sources as of November 2026, not legal advice. Check the details against Seller Central before shipping.

## The unit box (7 × 4 × 3" white tuck mailer)

| Mark | What | How the line does it |
| --- | --- | --- |
| **Barcode** | One scannable barcode per sellable unit, flat, at least ¼" from edges and corners. | A 2 × 1" direct-thermal sticker with UPC-A **884400898623** (GS1 GTIN-12 for this kit), printed on a MUNBYN roll printer at pack-out. It goes on a bottom corner, about 8 mm from both edges. Artwork: [tscircuit/product-packaging, products/nema17/barcodes](https://github.com/tscircuit/product-packaging/tree/main/products/nema17/barcodes). |
| **Country of origin** | "Made in China", permanent and legible. | UV-laser engraved on the back face (about 50 × 9 mm) before the box reaches pack-out. |
| **Product label** | Not an Amazon requirement; no second barcode on it. | The tscircuit 2 × 4" AveneMark label on the lid, unchanged. |

Still to confirm for the real shipment:

- **UPC or FNSKU.** The UPC is the manufacturer barcode. Amazon only accepts it as the unit's barcode if the listing uses manufacturer barcodes. Otherwise it wants the FNSKU from Seller Central, and the UPC must then be covered.
- **UPC print quality.** The product-packaging proof is at GS1's minimum size; scan a real printed sticker on a closed box.
- **Lid seal.** Amazon wants a box that won't open on its own. The tuck lid may need a tape tab or seal sticker.
- **Prop 65.** Ask the USB cable and charger suppliers whether their parts need a warning.

## The Amazon carton (15 × 13 × 17" inside, 25 units, about 33 lb)

| Requirement | What the line does |
| --- | --- |
| FBA box ID label on a flat side, away from seams, unique per box | Printed at the label bench and applied to the front after sealing (a sample in the sim; print the real one on a laser or thermal printer). |
| Carrier label, not covering the box ID | Not modelled yet. |
| Max 50 lb; sides within Amazon's limits; 200 lb burst or 32 ECT board | 33 lb, all sides under 25". |
| Void fill: kraft paper, bubble wrap, air pillows or PE foam sheets; no peanuts or shredded paper | Not modelled yet: 25 boxes leave 5 of the 30 places empty. |

## The UV laser

[ComMarker Omni X](https://store.commarker.com/products/omni-x-uv-laser-engraver), 355 nm UV, fully enclosed (Class 1), about 515 × 320 × 655 mm. The standard field is 150 × 150 mm. With the slide extension it's 150 × 400 mm (6 W) or 250 × 400 mm (12 W).

The sim assumes the **12 W with the slide**: six mailers lie on their fronts, back face up, 3 across (79 mm each) by 2 deep (184 mm each), in 237 × 368 mm. On the 6 W slide (150 mm wide) only one box fits across, so a run would be 2 boxes. Times are estimates: 20 s for homing, autofocus and framing, then 12 s a box.
