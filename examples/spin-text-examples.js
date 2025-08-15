const SpinTextEngine = require("../utils/spinTextEngine");

console.log("🎲 Spin Text Examples for WhatsApp Blast\n");

// Example 1: Greeting variations
console.log("📝 Example 1: Greeting Variations");
const greeting =
  "{Halo|Hi|Selamat pagi|Selamat siang} {Pak|Bu|Mas|Mbak} {nama}!";
console.log("Template:", greeting);
console.log("Variations:");
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${SpinTextEngine.parseSpinText(greeting)}`);
}
console.log(
  `Estimated combinations: ${SpinTextEngine.estimateVariations(greeting)}\n`
);

// Example 2: Business promotion
console.log("📝 Example 2: Business Promotion");
const promotion =
  "{Promo|Penawaran|Diskon} {spesial|khusus|terbatas} untuk {Anda|kamu}! {Dapatkan|Ambil|Raih} {kesempatan|peluang} {emas|terbaik} ini. {Hubungi|Kontak|Chat} kami {sekarang|segera}!";
console.log("Template:", promotion);
console.log("Variations:");
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${SpinTextEngine.parseSpinText(promotion)}`);
}
console.log(
  `Estimated combinations: ${SpinTextEngine.estimateVariations(promotion)}\n`
);

// Example 3: Follow up message
console.log("📝 Example 3: Follow Up Message");
const followUp =
  "{Terima kasih|Thanks|Makasih} {Pak|Bu} {nama} atas {perhatian|waktu|respon}nya. {Apakah|Apa} ada {pertanyaan|hal} lain yang bisa {saya|kami} {bantu|assist}?";
console.log("Template:", followUp);
console.log("Variations:");
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${SpinTextEngine.parseSpinText(followUp)}`);
}
console.log(
  `Estimated combinations: ${SpinTextEngine.estimateVariations(followUp)}\n`
);

// Example 4: Event invitation
console.log("📝 Example 4: Event Invitation");
const invitation =
  "{Undangan|Invitation} {khusus|spesial} untuk {Anda|kamu}! {Bergabung|Join|Ikuti} {acara|event} {menarik|seru|keren} kami. {Daftar|Register} {sekarang|segera} di {link|website} kami.";
console.log("Template:", invitation);
console.log("Variations:");
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${SpinTextEngine.parseSpinText(invitation)}`);
}
console.log(
  `Estimated combinations: ${SpinTextEngine.estimateVariations(invitation)}\n`
);

// Example 5: Product launch
console.log("📝 Example 5: Product Launch");
const productLaunch =
  "{Launching|Peluncuran} {produk|product} {terbaru|baru|latest} kami! {Fitur|Feature} {canggih|modern|advanced} dengan {harga|price} {terjangkau|murah|affordable}. {Info|Detail} lengkap: {link|website}.";
console.log("Template:", productLaunch);
console.log("Variations:");
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${SpinTextEngine.parseSpinText(productLaunch)}`);
}
console.log(
  `Estimated combinations: ${SpinTextEngine.estimateVariations(
    productLaunch
  )}\n`
);

// Example 6: Reminder message
console.log("📝 Example 6: Reminder Message");
const reminder =
  "{Reminder|Pengingat} {untuk|buat} {Anda|kamu}, {jangan|don't} {lupa|forget} {meeting|pertemuan} kita {hari ini|today} jam {waktu}. {Sampai|See you} {jumpa|bertemu} {nanti|later}!";
console.log("Template:", reminder);
console.log("Variations:");
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${SpinTextEngine.parseSpinText(reminder)}`);
}
console.log(
  `Estimated combinations: ${SpinTextEngine.estimateVariations(reminder)}\n`
);

// Example 7: Thank you message
console.log("📝 Example 7: Thank You Message");
const thankYou =
  "{Terima kasih|Thank you|Thanks} {banyak|so much} {Pak|Bu} {nama}! {Kami|We} {sangat|really} {menghargai|appreciate} {kepercayaan|trust} {Anda|you}. {Semoga|Hope} {kerjasama|collaboration} ini {berjalan|goes} {lancar|smoothly}.";
console.log("Template:", thankYou);
console.log("Variations:");
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${SpinTextEngine.parseSpinText(thankYou)}`);
}
console.log(
  `Estimated combinations: ${SpinTextEngine.estimateVariations(thankYou)}\n`
);

// Example 8: Customer service
console.log("📝 Example 8: Customer Service");
const customerService =
  "{Halo|Hello} {Pak|Bu} {nama}, {ada|is there} {yang|anything} bisa {kami|we} {bantu|help}? {Tim|Team} {customer service|support} kami {siap|ready} {melayani|to serve} {24/7|24 jam}.";
console.log("Template:", customerService);
console.log("Variations:");
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${SpinTextEngine.parseSpinText(customerService)}`);
}
console.log(
  `Estimated combinations: ${SpinTextEngine.estimateVariations(
    customerService
  )}\n`
);

console.log("✅ All examples completed!");
console.log("💡 Tips:");
console.log("  - Keep 3-5 options per spin block for best results");
console.log("  - Test variations to ensure they sound natural");
console.log(
  "  - Combine with variables like {nama}, {company} for personalization"
);
console.log("  - Monitor delivery rates to optimize patterns");
