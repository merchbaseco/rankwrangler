/**
 * Amazon Merch on Demand template bullets, grouped by the product type they describe.
 *
 * Merch appends these product-spec bullets to every listing of a product type, so a verbatim match
 * (after punctuation and case normalization) is evidence of a Merch listing, and the matching
 * bullets are stripped before seller bullets are kept. Generic marketing copy that any seller writes
 * ("Funny design.", size-chart notices) does not belong here.
 */
export const MERCH_TEMPLATE_BULLETS_BY_PRODUCT_TYPE = {
    standardShirt: [
        'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
        'Heavyweight, 6.1 oz. 100% ring spun US cotton',
        'Relaxed fit with side seams offers a roomy, comfortable silhouette',
    ],
    comfortColorsShirt: [
        'Comfort Colors offers a relaxed fit in adult sizes. Size up for an oversized fit.',
        'Solid colors: soft-washed, garment-dyed fabric for a lived in feel; tie dye: pigment-dyed to create unique variations',
        'Soft-washed, garment-dyed fabric for a lived-in feel',
        'Soft-washed, garment-dyed US cotton fabric for a lived-in feel',
        'Printed in the USA using durable Direct-to-Film printing technology for vibrant, long-lasting results.',
    ],
    premiumTriBlendShirt: [
        'Crafted from a unique 40 singles tri-blend fabric, offering a lightweight, ultra-soft feel',
        'Classic crew neck design with side-seam construction ensures both comfort and a flattering silhouette',
        'Lighter colors are semi-sheer',
    ],
    performanceShirt: [
        '100% polyester construction resists fading to maintain vibrant color',
        'High-performance moisture-wicking material with UPF 50',
        'High-performance moisture-wicking material with UPF 50 protection',
        "Standard fit offers a balanced silhouette that's not too loose or tight",
        'Snag-resistant fabric technology helps reduce pulls and surface damage',
    ],
    croppedShirt: [
        'Relaxed fit cropped design offers a looser cut for effortless comfort',
        'Boxy fit cropped t-shirt',
    ],
    tankTop: [
        "Our tank tops are designed for comfort and style. The women's sleeveless tank features a classic crew neck, wide straps, and a modern muscle-tank fit. The men's version offers a relaxed scoop neckline and traditional straps.",
        "The women's muscle tank features heather fabric, offering an ultra-soft feel with dimensional color",
    ],
    jersey: [
        'Sleeveless, v-neck jersey made from moisture-wicking, odor-fighting fabric that keeps you cool and comfortable from morning to night.',
        'Short-sleeve, crew neck jersey made from moisture-wicking, odor-fighting fabric that keeps you cool and comfortable from morning to night.',
        '2-button henley jersey made with moisture-wicking, 30+ UPF performance fabric.',
        'A versatile casual performance jersey designed for everyday wear, available in Adult and Youth sizes.',
        'A versatile casual performance jersey with contrast color blocking details, designed for everyday wear, available in Adult and Youth sizes.',
        'A versatile casual performance jersey with contrast color blocking on the neck and sleeves, designed for everyday wear, available in Adult and Youth sizes.',
    ],
    sweatshirtAndHoodie: [
        '8.5 oz, Classic fit, Twill-taped neck',
        'Classic fit with seamless body for a smooth, comfortable silhouette that moves naturally with you',
        '1x1 ribbed collar adds structure and durability while maintaining a comfortable, classic look on this crewneck sweatshirt',
        'Pouch pocket and double-lined hood for added warmth and everyday functionality',
        'Anti-static fleece technology helps prevent fabric cling',
    ],
    poloAndQuarterZip: [
        'Classic fit design provides a relaxed, roomier cut',
        'Moisture-releasing technology keeps body dry during activity',
    ],
    softshellJacket: [
        'Weather protection with wind-resistant, water-repellent, and breathable fabric provides reliable protection while maintaining comfort in wet conditions',
        'Functional design featuring zip-through cadet collar with chin guard, reverse coil zippers, and front zippered pockets for secure storage',
        'Classic styling with open cuffs and hem for easy movement and layering versatility',
    ],
    hatAndVisor: [
        'Five-panel trucker hat featuring structured foam front, mesh back, and high-profile crown',
        'Breathable polyester mesh with tricot backing for moisture control',
        'Adjustable hook-and-loop closure for custom fit',
    ],
    backpack: [
        'Durable 600D poly PVC construction with padded 18 inch laptop compartment and ventilated shoe/gear storage',
        'Ergonomic design: padded shoulder straps, adjustable sternum strap, and cushioned back',
        'Premium features: matte coated zippers, fence hook, and integrated carry handle',
    ],
    popSockets: [
        'Expandable stand to watch videos, take group photos, FaceTime, and Skype handsfree.',
        'Advanced adhesive allows you to remove and reposition on most devices and cases.',
        'Note: Will not stick to some silicone, waterproof, or highly textured cases. Works best with smooth, hard plastic cases. Will adhere to iPhone 11, but not to the iPhone 11 Pro nor the iPhone 11 ProMax without a suitable case.',
        'PopGrip with swappable top; switch out your PopTop for another design or remove it completely for wireless charging capabilities. (Not compatible with Apple MagSafe wireless charger or MagSafe wallet.)',
        'Adhesive backing attaches the PopGrip to your case or device. Will not stick to silicone, leather, waterproof, or highly textured cases. Works best with smooth, hard, plastic cases.',
        'Printed top is swappable with other compatible PopGrip models. Just press flat, turn 90 degrees until you hear a click and remove to swap.',
        'Not compatible with wireless charging',
        'MagSafe base attaches the PopGrip to your MagSafe-compatible case (not included). Printed top is swappable with other compatible PopGrip models. Just press flat, turn 90 degrees until you hear a click and remove to swap.',
        'Compatible with iPhone 12, iPhone 13, and iPhone 14 models. Works best with smooth, hard MagSafe compatible case.',
        'Wirelessly charge your iPhone by sliding off the magnetic PopGrip and setting your iPhone on a wireless charger.',
        'Magnetically snaps on and off your phone case so you can easily swap between MagSafe compatible accessories.',
        'Adaptor ring included. Make any phone case MagSafe compatible by attaching the adaptor ring. A phone case is required but not included to use the wallet.',
        'Printed top is swappable. Close and twist to swap the top with a new design with other compatible PopGrip models.',
    ],
    phoneCase: [
        'Two-part protective case made from a premium scratch-resistant polycarbonate shell and shock absorbent TPU liner protects against drops',
        'Dual-layer design with premium scratch-resistant polycarbonate shell and shock-absorbent TPU liner provides protection against drops',
        'Slim profile with raised edges safeguards camera while maintaining a sleek, pocket-friendly design',
    ],
    toteBag: [
        '16" x 16" bag with two 14" long and 1" wide black cotton webbing strap handles.',
        'Made of a lightweight, spun polyester canvas-like fabric.',
        'All seams and stress points are double-stitched for durability, and the reinforced bottom flattens to fit more items and hold larger objects.',
    ],
    laptopSleeve: [
        'Lightweight, form-fitting laptop sleeve that protects your laptop from daily wear and tear',
        'Faux fur-lined interior and padded zipper binding prevent scratches while keeping your device secure with a top-loading zippered enclosure and two sliders',
        'Designed for on-the-go use with a slim profile that easily slides into backpacks, totes, and carry-on bags',
    ],
    mousePad: [
        'Soft 100% polyester surface ensures smooth, precise mouse movement in an 7.1x8.7 inch size with rounded edges',
        'Natural rubber base keeps the pad firmly in place on any desk surface',
        'Low-profile 0.12 inch thickness offers comfortable wrist support while maintaining a sleek, compact design',
    ],
    throwPillow: [
        '100% spun-polyester fabric',
        'Double-sided print',
        'Filled with 100% polyester and sewn closed',
        'Individually cut and sewn by hand',
    ],
    poster: [
        'High-quality unframed posters printed on thick 0.26 mm matte paper, available in multiple sizes to fit any space',
        'Printed with a multicolor, water-based inkjet technique that yields brilliant, vibrant prints to brighten up any room',
    ],
    tumbler: [
        'Dual-wall insulated stainless steel construction keeps beverages hot or cold, top rack dishwasher safe and BPA free',
        'Leak-proof flip lid includes BPA free plastic drinking straw',
        'Enjoy your favorite beverage on the go with this premium-quality travel tumbler featuring a comfort-grip handle',
        'Includes a plastic lid with reusable straw',
        'Dual wall insulated: keeps beverages hot or cold',
        'Stainless Steel, BPA Free',
        'Leak proof lid with clear slider',
    ],
    mug: [
        '11-ounce ceramic mug is dishwasher and microwave-safe, lead and BPA free',
        'Features glossy finish with accent colors on interior, handle, and rim of two-tone designs',
    ],
    hardcoverJournal: [
        'Hardcover journal with 240 line-ruled pages (120 sheets)',
        'Built-in elastic closure and ribbon bookmark',
        'Includes an expandable inner storage pocket and a pen holder',
    ],
} as const satisfies Readonly<Record<string, readonly string[]>>;
