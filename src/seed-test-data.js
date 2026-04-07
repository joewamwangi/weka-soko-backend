/**
 * seed-test-data.js — Creates 20 test listings + 20 buyer requests for testing
 *
 * Usage (run from backend root):
 *   node src/seed-test-data.js
 *
 * Requires DATABASE_URL in env. Copy .env or set it manually:
 *   DATABASE_URL=... node src/seed-test-data.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ── Unsplash photos by category (5 photos each) ───────────────────────────────
const PHOTOS = {
  Electronics: [
    "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1461151304267-38535e780c79?w=800&h=600&fit=crop",
  ],
  Vehicles: [
    "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1542362567-b07e54358753?w=800&h=600&fit=crop",
  ],
  Property: [
    "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop",
  ],
  Fashion: [
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&h=600&fit=crop",
  ],
  Furniture: [
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1493663284031-b7e3aaa4cab7?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&h=600&fit=crop",
  ],
  "Home & Garden": [
    "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1585320806297-9794b3e4aaae?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1416339306562-f3d12fefd36f?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1501523460185-2aa5d2a0f981?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop",
  ],
  Sports: [
    "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&h=600&fit=crop",
  ],
  "Baby & Kids": [
    "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1484820540034-c2a4bca8567e?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1631377509942-0bddab5ae5d5?w=800&h=600&fit=crop",
  ],
};

// ── 20 Listings ───────────────────────────────────────────────────────────────
const LISTINGS = [
  { title:"Samsung Galaxy S23 Ultra – Excellent Condition", category:"Electronics", subcat:"Phones & Tablets", price:85000, county:"Nairobi", location:"Westlands, Nairobi", description:"Samsung Galaxy S23 Ultra with 256GB storage and 12GB RAM. Used for 8 months, no scratches on screen (always had a screen protector). Comes with original box, charger, and two cases. Battery health at 96%. Unlocked and works with all networks. Selling because I upgraded to S24. Serious buyers only — can meet at Westlands for inspection." },
  { title:"MacBook Pro M2 14-inch – 2023 Model", category:"Electronics", subcat:"Computers & Laptops", price:175000, county:"Nairobi", location:"Kilimani, Nairobi", description:"Apple MacBook Pro 14-inch with M2 Pro chip, 16GB RAM, 512GB SSD. Purchased in January 2023 from iStore. Minor wear on the bottom, screen is perfect with no dead pixels. Comes with charger and original box. Battery cycle count is 187. Great for developers, designers, and video editors. Willing to negotiate slightly for serious buyers." },
  { title:"Toyota Premio 2008 – Full Option, Clean", category:"Vehicles", subcat:"Cars", price:1250000, county:"Nairobi", location:"South B, Nairobi", description:"Toyota Premio 2008 model, 2000cc engine, automatic transmission. Full option with leather seats, sunroof, reverse camera, and factory AC. First owner in Kenya, NTSA logbook ready. Mileage 98,000km on original engine. Colour: Silver. No accidents, just regular service at Toyota Kenya. Selling due to relocation. Serious inquiries only — test drive available." },
  { title:"3-Bedroom Apartment for Sale – Kilimani", category:"Property", subcat:"Apartments", price:8500000, county:"Nairobi", location:"Kilimani, Nairobi", description:"Spacious 3-bedroom apartment on the 4th floor of a secure gated complex in Kilimani. Each bedroom is ensuite with fitted wardrobes. Open-plan living and dining area, modern kitchen with granite countertops. 24hr security, backup generator, borehole water, and 2 parking slots. Close to Valley Arcade and Yaya Centre. Title deed available. Selling for KSh 8.5M negotiable." },
  { title:"Sofa Set – L-Shaped 7-Seater, Dark Grey", category:"Furniture", subcat:"Sofas & Couches", price:45000, county:"Nairobi", location:"Ngong Road, Nairobi", description:"High-quality L-shaped 7-seater sofa in dark grey fabric with hardwood frame. Bought from Kings Furniture 18 months ago for KSh 75,000. In great condition — no tears, firm cushions. Selling because we're redecorating. Measurements: 3.2m x 2.1m. Must arrange own transport. Located near Prestige Plaza, Ngong Road. Can provide delivery within Nairobi for extra charge." },
  { title:"iPhone 14 Pro Max 256GB – Deep Purple", category:"Electronics", subcat:"Phones & Tablets", price:95000, county:"Mombasa", location:"Nyali, Mombasa", description:"iPhone 14 Pro Max, 256GB, Deep Purple. Purchased from Safaricom Shop Mombasa. Used for 10 months, always in a case with tempered glass. Face ID works perfectly, all cameras in perfect condition. Battery health 91%. iCloud account removed, ready to use. Comes with original Apple cable and documentation. No exchange, strictly cash payment. Can meet at Garden Square, Nyali." },
  { title:"Riding Lawn Mower – Honda HRX217", category:"Sports", subcat:"Outdoor & Fitness", price:38000, county:"Kiambu", location:"Ruaka, Kiambu", description:"Honda HRX217 riding lawn mower, barely used — only 3 seasons. Self-propelled with variable speed, 21-inch cutting width, and bag attachment. Engine starts first pull every time. Cuts up to 1/3 acre per tank. Selling because we landscaped to paving. Original manual included. Can demonstrate before purchase. Located in Ruaka, negotiable for quick sale." },
  { title:"Kitenge Wrap Dress – New, Size M", category:"Fashion", subcat:"Women's Clothing", price:2800, county:"Nairobi", location:"Eastleigh, Nairobi", description:"Brand new Kitenge wrap dress, vibrant orange and yellow African print, size M (fits UK 10-12). Never worn — bought for an event that was cancelled. Fully lined, V-neckline, adjustable tie waist. Machine washable. Perfect for weddings, graduations, or office wear. Can post via G4S for KSh 350 or meet in Eastleigh, Nairobi." },
  { title:"Baby Cot with Mattress – Like New", category:"Baby & Kids", subcat:"Baby Gear", price:8500, county:"Nairobi", location:"Karen, Nairobi", description:"Beautiful white wooden cot with adjustable base height and matching mattress. Used for 14 months only. No chipped paint, wheels lock securely. Cot converts to toddler bed by removing one side. Mattress is waterproof-covered and in excellent condition. Comes with fitted sheet. Child is now in big bed so selling. Located in Karen — collection only. Great condition for the price." },
  { title:"Zanzibar Dining Table Set – 6 Seater", category:"Furniture", subcat:"Tables & Dining", price:32000, county:"Mombasa", location:"Bamburi, Mombasa", description:"Solid mahogany 6-seater dining table with padded chairs in cream fabric. Made by a local carpenter to custom spec, purchased 2 years ago. Table measures 180cm x 90cm. Two chairs have minor fabric staining (easily reupholstered). Legs are solid, no wobble. Selling due to house move. Can arrange delivery within Mombasa for KSh 2,000 extra." },
  { title:"Nikon D7500 Camera + 18-140mm Lens", category:"Electronics", subcat:"Cameras & Photography", price:62000, county:"Nairobi", location:"Upperhill, Nairobi", description:"Nikon D7500 DSLR body (shutter count: 12,400) with 18-140mm VR kit lens. Includes 64GB SD card, UV filter, 2 batteries, and original charger. All autofocus points working, sensor clean (last cleaned 3 months ago). Original box and manual included. Perfect for events, wildlife, and travel photography. Selling because I switched to mirrorless. Will not separate body and lens." },
  { title:"Mitsubishi Outlander 2015 – 7-Seater, 4WD", category:"Vehicles", subcat:"Cars", price:2800000, county:"Nairobi", location:"Lavington, Nairobi", description:"Mitsubishi Outlander 2015, 2400cc 4WD, 7-seater SUV. Sunroof, leather interior, factory navigation, dual-zone AC. Driven 72,000km on Kenyan roads only. Full service history with dealer (Toyotsu), last service November 2025. Brand new tyres December 2025. No accident history, genuine interior. NTSA inspection valid. Can transfer ownership immediately. Price is firm." },
  { title:"Standing Desk – Electric Height Adjustable", category:"Furniture", subcat:"Office Furniture", price:28000, county:"Nairobi", location:"Westlands, Nairobi", description:"Flexispot E2 electric standing desk, 140cm x 70cm white surface. Memory settings for 3 heights, smooth motor, max 125kg load. Only 6 months old — bought for home office setup that I'm now moving out of. Some minor desk mat indentations on the surface, otherwise perfect. Height range 71–121cm. Comes with cable tray and assembly tools. Located in Westlands." },
  { title:"Fully Furnished Studio – Short Let Available", category:"Property", subcat:"Houses & Villas", price:25000, county:"Nairobi", location:"Parklands, Nairobi", description:"Modern studio apartment available for short or long-term letting in Parklands. Fully furnished with queen bed, wardrobe, TV, fast WiFi, and fully-equipped kitchen. Monthly rate KSh 25,000 all-inclusive (water, electricity, WiFi). Secure compound, caretaker on site. Walking distance to City Park and Aga Khan Hospital. Minimum 3-month stay. Viewing on request." },
  { title:"Mountain Bike – Trek Marlin 7, 2022", category:"Sports", subcat:"Bikes & Cycling", price:52000, county:"Nairobi", location:"Lavington, Nairobi", description:"Trek Marlin 7, 2022 edition, size M (fits riders 170–178cm). Hardtail mountain bike with SR Suntour fork, Shimano Deore drivetrain, hydraulic disc brakes. Ridden about 1,500km, well-maintained. New brake pads fitted last month. Original Trek receipt available. Comes with water bottle cage and rear rack. Ideal for Karura Forest or Ngong Hills riding. No crash history." },
  { title:"LG 55-inch OLED TV – Perfect Picture", category:"Electronics", subcat:"TVs & Home Cinema", price:78000, county:"Nairobi", location:"Kileleshwa, Nairobi", description:"LG C2 55-inch OLED TV (2022 model). Perfect blacks, incredible colour accuracy — no burn-in whatsoever. Used mainly for streaming and gaming (PS5). Comes with original remote, stand, HDMI cables, and original box. WebOS smart TV with built-in Netflix, YouTube, and Prime Video. Selling due to house upgrade to 77-inch. Remote just needs new batteries. Smoke-free home." },
  { title:"Kenyan Handmade Jewellery Set – Gold Beaded", category:"Fashion", subcat:"Accessories", price:3500, county:"Nairobi", location:"Maasai Market, Nairobi", description:"Hand-crafted Kenyan Maasai beaded jewellery set: necklace, bracelet, and earrings in gold, red, and blue. Made by an artisan from Kajiado County. Never worn — gift that doesn't suit my style. Makes a beautiful cultural statement or a perfect gift. The necklace is 45cm long and fully adjustable. Colours are vibrant and won't fade. Can ship within Kenya." },
  { title:"Gas Cooker – Nunix 4-Burner Stainless Steel", category:"Home & Garden", subcat:"Kitchen Appliances", price:9500, county:"Kisumu", location:"Milimani, Kisumu", description:"Nunix 4-burner gas cooker with auto-ignition, stainless steel surface. 18 months old, works perfectly. All 4 burners light on first press, no leaks. Includes original grill rack and pan supports. Selling because I upgraded to a built-in hob during kitchen renovation. Located in Milimani, Kisumu. Buyer to arrange transport. Original receipt available." },
  { title:"Toddler Bike with Training Wheels – Age 2–5", category:"Baby & Kids", subcat:"Toys & Games", price:3200, county:"Nairobi", location:"Runda, Nairobi", description:"Bright red children's balance and pedal bike with removable training wheels, suitable for kids aged 2–5. Used for one season. Tyres have good tread, brakes work well. Adjustable seat height. No rust. Training wheels can be removed once balance is mastered. Clean, stored in garage. Great starter bike for toddlers learning to ride. Collection only from Runda." },
  { title:"Professional Kitchen Mixer – KitchenAid 5Qt", category:"Home & Garden", subcat:"Kitchen Appliances", price:32000, county:"Nairobi", location:"Hurlingham, Nairobi", description:"KitchenAid Artisan 5Qt stand mixer in Empire Red. All 10 speeds working perfectly. Includes flat beater, dough hook, and wire whisk. Bowl has minor scratch on the base (doesn't affect use). Purchased from Carrefour for KSh 49,000. Perfect for bakers — handles bread dough with ease. Selling because of kitchen downsize. Comes with original manual and all attachments." },
];

// ── 20 Buyer Requests ────────────────────────────────────────────────────────
const REQUESTS = [
  { title:"Looking for a Good Condition Toyota Axio or Premio", category:"Vehicles", county:"Nairobi", budget:900000, description:"Looking for a Toyota Axio or Premio, 2010–2015 model. Budget is KSh 850K–900K. Must have full logbook ready for transfer. Prefer auto transmission, original paint. Mileage should be under 120,000km. I'm in South B and can meet for inspection in Nairobi CBD or South C. No accidents, no flood damage. Willing to pay cash on same day." },
  { title:"Need a Reliable Laptop for University Use", category:"Electronics", county:"Nairobi", budget:45000, description:"Looking for a laptop for university assignments, Zoom lectures, and light coding. Budget KSh 35K–45K. Must have minimum 8GB RAM and SSD storage. Brands preferred: Dell, HP, or Lenovo. Windows 10/11 is fine. Must have at least 4 hours battery life. Screen size 14–15 inches preferred. Student in Parklands so can meet nearby." },
  { title:"Wanted: L-Shaped Sofa for Living Room", category:"Furniture", county:"Mombasa", budget:35000, description:"Looking for a clean, good-condition L-shaped sofa for a 3-bedroom house in Mombasa. Budget up to KSh 35,000. Prefer grey or beige colour. Fabric or faux leather is fine. Must be in Mombasa or Kilifi as I can't transport from Nairobi. No torn cushions, no strong odors. Prefer modern design — nothing too old or bulky." },
  { title:"iPhone 13 or 14 in Good Condition", category:"Electronics", county:"Nairobi", budget:65000, description:"Looking for an iPhone 13 or 14 (not Pro), 128GB or 256GB. Budget KSh 55K–65K. Must have battery health above 85%, Face ID working, no cracks on screen or back glass. Prefer blue, green, or black colour. Must be iCloud unlocked. I'm based in Westlands. Prefer to meet in person for inspection before paying. No phones with IMEI issues." },
  { title:"Wanted: 2–3 Bedroom House to Rent in Kilimani", category:"Property", county:"Nairobi", budget:60000, description:"Looking for a 2 or 3-bedroom apartment or townhouse to rent in Kilimani, Lavington, or Kileleshwa. Budget KSh 50K–60K per month. Must have 24hr security, parking, backup water, and reliable electricity. Prefer ground floor or first floor. Family with 2 kids, no pets. Need to move in by end of month. Willing to pay 2 months deposit." },
  { title:"Looking for a Sewing Machine – Home Use", category:"Electronics", county:"Nairobi", budget:12000, description:"Looking for a good quality home sewing machine, manual or electric. Budget up to KSh 12,000. Brands like Singer, Brother, or Janome preferred. Must have basic straight stitch and zigzag functions. Don't need embroidery features. Condition should be good — all functions working. Located in Eastleigh, can collect from Nairobi CBD or Eastleigh area." },
  { title:"Need a Baby Cot or Crib – Newborn", category:"Baby & Kids", county:"Nairobi", budget:9000, description:"Expecting first baby in 3 months and looking for a cot or crib for a newborn. Budget up to KSh 9,000 including mattress. Must be in very clean condition — no broken bars, all bolts present. Prefer white or natural wood colour. Can consider without mattress if price is lower. Located in Ruaka, Kiambu. Happy to collect from Westlands, Ruaka, or Limuru area." },
  { title:"Wanted: DSLR Camera for Photography Starter", category:"Electronics", county:"Nairobi", budget:40000, description:"I'm starting out in photography and looking for a beginner DSLR camera. Nikon D3500, D5600, or Canon EOS 200D preferred. Budget KSh 30K–40K. Must come with at least 18-55mm kit lens. Memory card and bag as bonus. Shutter count should be under 30,000. Must have working autofocus and live view. Based in Upperhill. Willing to meet for inspection." },
  { title:"Looking for Office Chair – Ergonomic", category:"Furniture", county:"Nairobi", budget:15000, description:"Working from home and my back is suffering. Looking for a good ergonomic office chair. Budget up to KSh 15,000. Must have lumbar support and adjustable armrests. Mesh back preferred. Should be in good condition — no torn fabric, all adjustment mechanisms working. Brands like HM, FlexiSpot, or similar. Located in Westlands, can collect nearby." },
  { title:"Wanted: Mountain Bike for Weekend Rides", category:"Sports", county:"Nairobi", budget:35000, description:"Looking for a mountain bike for recreational weekend riding in Karura Forest and Ngong Hills. Budget KSh 25K–35K. Brands: Trek, Giant, Specialized, or Merida. Size: M or L (rider height 178cm). Must have disc brakes and 21+ speeds. Tyres should have life left. Will check condition carefully before buying. Based in Lavington." },
  { title:"Looking for a 4K TV – 50 to 55 inches", category:"Electronics", county:"Nairobi", budget:55000, description:"Looking for a 50 or 55-inch 4K smart TV. Budget up to KSh 55,000. Brands: Samsung, LG, or Sony preferred. Must have at least 2 HDMI ports, built-in WiFi, and smart TV functions. No burn-in or dead pixels. Remote must be included. Can be 1–3 years old if in good condition. Located in Kilimani — can arrange pickup from Nairobi." },
  { title:"Need Dining Table Set for 4–6 People", category:"Furniture", county:"Mombasa", budget:25000, description:"Looking for a dining table that seats 4–6 people for a house in Nyali, Mombasa. Budget up to KSh 25,000. Glass top or wooden top, both fine. Chairs must be included and in good condition. No plastic chairs. Table must not wobble. Can consider sets where some chairs need minor repairs if price is right. Seller must be in Mombasa or Kilifi." },
  { title:"Wanted: Women's Business Suits – Size 14–16", category:"Fashion", county:"Nairobi", budget:8000, description:"Looking for 2–3 women's business suits (jacket + trousers or skirt) in size UK 14–16. Budget KSh 4,000–8,000 per set. Neutral colours: black, navy, grey, or charcoal. Must be in excellent condition — no pilling, no fading, no missing buttons. Brands like Truworths, Mr Price Business, or unbranded are fine. Starting a new job and need smart work wear quickly. Based in Nairobi CBD." },
  { title:"Looking for a Gas Cooker – 2 or 4 Burner", category:"Home & Garden", county:"Kisumu", budget:8000, description:"Looking for a gas cooker (freestanding) in Kisumu. 2 or 4 burner, any brand that's reliable. Budget up to KSh 8,000. Must have auto-ignition — no match lighting. All burners must work. Stainless steel or enamel surface is fine. No major rust or bent grates. Based in Kisumu Milimani. Seller must be in Kisumu or nearby towns." },
  { title:"Wanted: PlayStation 4 or PS5 Console", category:"Electronics", county:"Nairobi", budget:30000, description:"Looking for a PS4 Pro or PS5 console for gaming. Budget KSh 20K–30K. Must come with at least one working controller. HDMI port must work, disc drive must work (no digital edition please). Any colour. No banned accounts. Can consider PS4 Slim if price is good. I'm in Nairobi South C area. Will test before buying — must pass basic functionality tests." },
  { title:"Looking for Kids' Bicycle Age 6–10", category:"Baby & Kids", county:"Nairobi", budget:6000, description:"My son is turning 8 and loves cycling. Looking for a proper children's bike, 20-inch wheels, suitable for age 6–10. Budget KSh 4,500–6,000. Must have working brakes (both front and rear). Training wheels not needed. Any colour — my son loves blue or red. Must be in Nairobi. No bent wheels, no broken pedals. Can collect from most Nairobi areas." },
  { title:"Need a Stand Mixer for Home Baking", category:"Home & Garden", county:"Nairobi", budget:20000, description:"I bake cakes and bread every weekend and my hand mixer is dying. Looking for a stand mixer, minimum 3.5Qt bowl. Budget KSh 15K–20K. Brands: KitchenAid, Kenwood, Tefal, or similar. Must have dough hook, flat beater, and whisk attachments. Must be in good working condition — all speeds functional. Located in Kileleshwa. Can collect within Nairobi." },
  { title:"Wanted: Plot in Rongai or Kiserian Area", category:"Property", county:"Kajiado", budget:600000, description:"Looking for a residential plot in Rongai, Kiserian, or Ngong area. Budget KSh 500K–600K. Minimum 50x100ft (1/8 acre). Must have title deed or be in the process of titling. Road access is a must. Prefer somewhere with at least basic infrastructure (electricity nearby). Buying for future construction. Will engage an advocate for due diligence before payment. Serious sellers only." },
  { title:"Looking for a Treadmill for Home Gym", category:"Sports", county:"Nairobi", budget:25000, description:"Setting up a home gym and looking for a treadmill. Budget KSh 18K–25K. Motorised preferred (not manual). Must handle runners up to 95kg. Speed range 1–14 km/h. Incline feature is a bonus. Must be working — no issues with belt slipping or motor cutting out. Brands: Proteus, Domyos, or generic are fine. Located in Westlands. Seller should be in Nairobi." },
  { title:"Wanted: Second-Hand Refrigerator – 200–300 Litre", category:"Home & Garden", county:"Nairobi", budget:18000, description:"Moving to a new house and need a fridge. Looking for a 200–300 litre refrigerator in good working condition. Budget KSh 12K–18K. Must cool properly — no icing issues or warm spots. Single door or double door, both fine. No strong odors inside. Compressor must be working. Any brand. Located in Embakasi. Seller can be anywhere in Nairobi — will arrange transport." },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log("Connecting to database...");

    // Create test seller
    const sellerHash = await bcrypt.hash("TestSeller@2024!", 10);
    const sellerRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role, anon_tag, is_verified, account_status)
       VALUES ('Test Seller Kenya', 'testseller@wekasoko.test', $1, 'seller', 'TestSellerKenya01', true, 'active')
       ON CONFLICT (email) DO UPDATE SET password_hash=$1, role='seller', is_verified=true
       RETURNING id`,
      [sellerHash]
    );
    const sellerId = sellerRes.rows[0].id;
    console.log(`Test seller: ${sellerId}`);

    // Create test buyer
    const buyerHash = await bcrypt.hash("TestBuyer@2024!", 10);
    const buyerRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role, anon_tag, is_verified, account_status)
       VALUES ('Test Buyer Kenya', 'testbuyer@wekasoko.test', $1, 'buyer', 'TestBuyerKenya01', true, 'active')
       ON CONFLICT (email) DO UPDATE SET password_hash=$1, role='buyer', is_verified=true
       RETURNING id`,
      [buyerHash]
    );
    const buyerId = buyerRes.rows[0].id;
    console.log(`Test buyer: ${buyerId}`);

    // Insert listings
    console.log("\nCreating 20 test listings...");
    for (let i = 0; i < LISTINGS.length; i++) {
      const l = LISTINGS[i];
      const photosArr = PHOTOS[l.category] || PHOTOS.Electronics;
      const photosJson = JSON.stringify(photosArr.map(url => ({ url, public_id: `test_${i}_${Date.now()}` })));
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const res = await client.query(
        `INSERT INTO listings
           (seller_id, title, description, price, category, subcat, location, county, photos, status, is_approved, expires_at, view_count, interest_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'active',true,$10,$11,$12)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          sellerId, l.title, l.description, l.price, l.category,
          l.subcat || null, l.location, l.county,
          photosJson, expiresAt,
          Math.floor(Math.random() * 120) + 5,
          Math.floor(Math.random() * 8),
        ]
      );
      if (res.rows.length) {
        console.log(`  [${i+1}/20] ${l.title.slice(0, 50)}`);
      }
    }

    // Insert buyer requests
    console.log("\nCreating 20 test buyer requests...");
    for (let i = 0; i < REQUESTS.length; i++) {
      const r = REQUESTS[i];
      const res = await client.query(
        `INSERT INTO buyer_requests
           (user_id, title, description, budget, category, county, status)
         VALUES ($1,$2,$3,$4,$5,$6,'active')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [buyerId, r.title, r.description, r.budget, r.category, r.county]
      );
      if (res.rows.length) {
        console.log(`  [${i+1}/20] ${r.title.slice(0, 50)}`);
      }
    }

    console.log("\nSeed complete!");
    console.log("Test seller login: testseller@wekasoko.test / TestSeller@2024!");
    console.log("Test buyer login:  testbuyer@wekasoko.test  / TestBuyer@2024!");
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
