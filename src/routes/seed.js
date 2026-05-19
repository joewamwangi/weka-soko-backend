// Temporary seed endpoint — DELETE after use
const express = require("express");
const router = express.Router();
const { query } = require("../db/pool");
const bcrypt = require("bcrypt");

const SEED_SECRET = process.env.SEED_SECRET || "weka-soko-seed-2026";

router.post("/seed", async (req, res) => {
  if (req.query.secret !== SEED_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    // 1. Create a test seller
    const hash = await bcrypt.hash("TestSeller@2026!", 12);
    const { rows: sellerRows } = await query(
      `INSERT INTO users (name, email, password_hash, role, phone, anon_tag, is_verified, account_status)
       VALUES ($1, $2, $3, $4, $5, $6, true, 'active')
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      ["Test Seller", "seed-seller@wekasoko.co.ke", hash, "seller", "0700000000", "SeedSeller01"]
    );
    const sellerId = sellerRows[0].id;
    console.log("Created seller:", sellerId);

    // 2. Seed 30 listings
    const listings = [
      { title: "iPhone 14 Pro Max 256GB", desc: "Brand new sealed in box. Apple warranty intact.", price: 145000, county: "Nairobi", cat: "Electronics", subcat: "Phones" },
      { title: "Samsung Galaxy S23 Ultra", desc: "Used 3 months only. Original charger and box included.", price: 89000, county: "Mombasa", cat: "Electronics", subcat: "Phones" },
      { title: "MacBook Pro M2 2023 16-inch", desc: "8-core CPU, 16GB RAM, 512GB SSD. Under warranty.", price: 195000, county: "Nairobi", cat: "Electronics", subcat: "Computers" },
      { title: "Toyota Vitz 2015 KDA", desc: "1300cc, automatic, petrol. 60,000km. Silver.", price: 650000, county: "Nairobi", cat: "Vehicles", subcat: "Cars" },
      { title: "2-Bedroom Apartment Kilimani", desc: "Spacious 2BR on 3rd floor. Fitted kitchen, parking.", price: 45000, county: "Nairobi", cat: "Property", subcat: "Rentals" },
      { title: "German Shepherd Puppies", desc: "Pure breed GSD puppies. 8 weeks old. Vaccinated.", price: 15000, county: "Kiambu", cat: "Pets", subcat: "Dogs" },
      { title: "L-Shaped Sofa Set 7-Seater", desc: "Grey velvet. Like new condition. Free delivery Nairobi.", price: 38000, county: "Nairobi", cat: "Furniture", subcat: "Sofas" },
      { title: "LG 55-Inch 4K Smart TV", desc: "LG UHD 55UR78 4K. WebOS, Magic Remote included.", price: 52000, county: "Nakuru", cat: "Electronics", subcat: "TVs" },
      { title: "Yamaha PSR-E373 Keyboard", desc: "61-key portable. AC adapter, stand and bag included.", price: 18500, county: "Nairobi", cat: "Music", subcat: "Instruments" },
      { title: "Honda CB300R 2020 Motorcycle", desc: "Only 12,000km. Serviced regularly. Red color.", price: 280000, county: "Nairobi", cat: "Vehicles", subcat: "Motorcycles" },
      { title: "iPad Pro 12.9 M2 WiFi+Cellular", desc: "Space Grey. Apple Pencil 2nd gen included.", price: 115000, county: "Nairobi", cat: "Electronics", subcat: "Tablets" },
      { title: "3-Bedroom House Syokimau", desc: "All ensuite. DSQ, tiled. Gated estate. Title deed ready.", price: 8500000, county: "Machakos", cat: "Property", subcat: "Houses" },
      { title: "Canon EOS R50 Mirrorless Camera", desc: "24.2MP APS-C. 18-45mm lens included. Only 500 shutter count.", price: 68000, county: "Nairobi", cat: "Electronics", subcat: "Cameras" },
      { title: "Electric Treadmill Commercial", desc: "2.5HP motor, 16 speed settings, incline 0-15%.", price: 32000, county: "Nairobi", cat: "Sports", subcat: "Fitness" },
      { title: "Nunix 10kg Washing Machine", desc: "Top load, fully automatic. One year old.", price: 22000, county: "Nakuru", cat: "Appliances", subcat: "Washing Machines" },
      { title: "Samsung 65-Inch QLED 4K TV", desc: "2024 model. Quantum HDR. Never wall mounted.", price: 88000, county: "Nairobi", cat: "Electronics", subcat: "TVs" },
      { title: "Plot 50x100 Kamulu Near Bypass", desc: "Clean title deed. Accessible murram road.", price: 550000, county: "Nairobi", cat: "Property", subcat: "Land" },
      { title: "Subaru Forester 2014", desc: "2000cc, automatic, petrol. 95,000km. Clean interior.", price: 980000, county: "Nairobi", cat: "Vehicles", subcat: "Cars" },
      { title: "Baby Cot with Mattress", desc: "Convertible wooden cot. Adjustable mattress height.", price: 8500, county: "Kiambu", cat: "Baby", subcat: "Furniture" },
      { title: "Dell XPS 15 i7 12th Gen", desc: "16GB RAM, 512GB SSD, NVIDIA RTX 3050. OLED display.", price: 145000, county: "Nairobi", cat: "Electronics", subcat: "Computers" },
      { title: "Peugeot 508 2013 Diesel", desc: "2.0L diesel. Leather seats, sunroof, cruise control.", price: 720000, county: "Mombasa", cat: "Vehicles", subcat: "Cars" },
      { title: "2BR Apartment Westlands", desc: "Modern apartment, fully fitted kitchen. Pool, gym.", price: 65000, county: "Nairobi", cat: "Property", subcat: "Rentals" },
      { title: "French Bulldog Puppies", desc: "Purebred Frenchies. 9 weeks. Dewormed, vaccinated.", price: 45000, county: "Nairobi", cat: "Pets", subcat: "Dogs" },
      { title: "Executive Office Desk and Chair", desc: "L-shaped desk in dark walnut. High-back leather chair.", price: 24000, county: "Nairobi", cat: "Furniture", subcat: "Office" },
      { title: "Xiaomi 13T Pro 512GB", desc: "Leica camera, 144Hz display, 5000mAh battery.", price: 72000, county: "Kisumu", cat: "Electronics", subcat: "Phones" },
      { title: "Industrial Singer Sewing Machine", desc: "Heavy duty straight stitch. Good for denim, leather.", price: 28000, county: "Nairobi", cat: "Business", subcat: "Machinery" },
      { title: "Nissan Note 2014 KCJ Silver", desc: "1200cc, petrol, automatic. 70,000km. Clean interior.", price: 595000, county: "Nairobi", cat: "Vehicles", subcat: "Cars" },
      { title: "Full Home Gym Set", desc: "20kg adjustable dumbbells, bench, resistance bands.", price: 35000, county: "Nairobi", cat: "Sports", subcat: "Fitness" },
      { title: "Samsung Galaxy Tab S9 FE", desc: "10.9-inch, WiFi only. With S-Pen. Pink gold.", price: 38000, county: "Thika", cat: "Electronics", subcat: "Tablets" },
      { title: "Coffee Shop Business Westlands", desc: "Running coffee shop. 6 tables, full equipment.", price: 1200000, county: "Nairobi", cat: "Business", subcat: "Food & Beverage" },
    ];

    let created = 0;
    for (const l of listings) {
      const tag = "Seed" + Math.floor(100 + Math.random() * 900);
      await query(
        `INSERT INTO listings (seller_id, title, description, price, county, category, subcat, status, listing_anon_tag, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, NOW() + INTERVAL '75 days')`,
        [sellerId, l.title, l.desc, l.price, l.county, l.cat, l.subcat, tag]
      );
      created++;
    }

    res.json({ ok: true, seller_id: sellerId, listings_created: created });
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
