# Office 2.5D physical scale

Status: active visual constraint (2026-08-23)

The person-office stage uses one physical scale. Furniture is not resized per
scene until it merely “looks about right.” The renderer may zoom the whole
world, but relative dimensions between desks, counters, people and amenity
zones stay fixed.

## Calibrated dimensions

| Element | Model dimension | Basis |
| --- | ---: | --- |
| Work desk | 1600 × 800 mm | Steelcase Fusion EPD lists a 1600 × 800 mm desk top. |
| Coffee base cabinet | 600 × 600 × 800 mm per bay | IKEA METOD published measurements. |
| Coffee counter run | 2400 × 635 mm | Four 600 mm cabinet bays; IKEA SÄLJAN worktop depth is 635 mm. |
| Balcony two-seat sofa | 1260 × 740 mm | IKEA NÄMMARÖ published measurements. |
| Balcony composition | 2350 mm visible width | Sofa plus side table, planter and practical separation; this is a Company OS composition inference, not a building standard. |
| Restroom composition | 2100 mm visible width | 1525 mm accessible toilet clearance plus adjacent basin/partition allowance; this is a visual-planning envelope, not a compliance claim. |

Sources:

- Steelcase Fusion desk EPD: <https://www.steelcase.com/content/uploads/sites/10/2015/01/Fusion-EPD-201011-EN-1.pdf>
- IKEA METOD base cabinet: <https://www.ikea.com/in/en/p/metod-base-cabinet-frame-white-90270889/>
- IKEA SÄLJAN worktop guide: <https://www.ikea.com/ie/en/files/pdf/00/b2/00b277ec/hfb-7-buying-guide-apr24-ie.pdf>
- IKEA NÄMMARÖ two-seat sofa: <https://www.ikea.com/de/en/p/naemmaroe-2-seat-modular-sofa-outdoor-light-brown-stained-s19579307/>
- US Access Board toilet-room clearances: <https://www.access-board.gov/ada/guides/chapter-6-toilet-rooms/>

## Canvas calibration

The 1011 px world canvas represents a 7200 mm-wide planning surface. The desk
is the visual anchor: its 1600 mm width is rendered as a 25% source-image box.
Because the PNG/WebP files contain transparent margins, each utility module is
sized using its measured non-transparent alpha width rather than its full file
width. This prevents a padded image from appearing physically smaller than a
tightly cropped image at the same CSS width.

The resulting visible-width ratios are approximately:

- work desk: 1600 mm;
- coffee run: 2400 mm (1.5 desks);
- balcony furniture group: 2350 mm (1.47 desks);
- restroom group: 2100 mm (1.31 desks).

## Motion constraint

Actor positions are interpolated on every animation frame. Each route segment
uses distance-based duration with smooth acceleration/deceleration; labels and
depth ordering update on the same frame. A click may change the destination,
but must never teleport the actor between route nodes. Reduced-motion browser
preferences may suppress pose loops, but the final position remains exact.
