const AutoReplyRule = require("../models/autoReplyRuleModel");
const logger = require("../utils/logger");

/**
 * Seed default auto-reply rules
 * Run this once after first deployment or when you need to reset rules
 */
async function seedDefaultRules() {
  try {
    // Check if rules already exist
    const existingRules = await AutoReplyRule.count();
    if (existingRules > 0) {
      logger.info(
        `⏭️  Auto-reply rules already exist (${existingRules} rules). Skipping seed.`
      );
      return;
    }

    const defaultRules = [
      {
        category: "PAID",
        keywords: [
          "sudah bayar",
          "sudah transfer",
          "done",
          "lunas",
          "sudah",
          "paid",
          "transfer done",
          "selesai",
          "oke",
          "ok",
          "sukses",
          "berhasil",
        ],
        responseTemplate: `Terima kasih konfirmasinya! 🙏

Mohon kirim bukti transfer untuk verifikasi pembayaran.

Tim kami akan melakukan verifikasi dalam 1x24 jam.

Terima kasih atas kerjasamanya! 😊`,
        notifyCollector: false,
        isActive: true,
      },
      {
        category: "CANT_PAY",
        keywords: [
          "belum bisa",
          "belum ada",
          "tunggu gajian",
          "belum",
          "tidak bisa",
          "gak bisa",
          "susah",
          "sulit",
          "belum ada uang",
          "belum gajian",
        ],
        responseTemplate: `Terima kasih infonya.

Kami mengerti situasi Anda. Apakah Bapak/Ibu membutuhkan:
- Perpanjangan waktu pembayaran?
- Opsi cicilan?

Tim collection kami akan menghubungi untuk diskusi solusi terbaik.

Terima kasih atas kerjasamanya 🙏`,
        notifyCollector: true,
        isActive: true,
      },
      {
        category: "NEGOTIATE",
        keywords: [
          "perpanjangan",
          "cicil",
          "nego",
          "minta waktu",
          "bisa cicil",
          "cicilan",
          "extend",
          "reschedule",
          "tunda",
          "mundur",
        ],
        responseTemplate: `Baik, kami mengerti situasi Anda.

Tim collection kami akan segera menghubungi dalam 2 jam untuk membahas opsi pembayaran yang sesuai.

Terima kasih atas kerjasamanya 🙏`,
        notifyCollector: true,
        isActive: true,
      },
      {
        category: "COMPLAINT",
        keywords: [
          "salah",
          "error",
          "sudah bayar kok",
          "ganggu",
          "spam",
          "stop",
          "berhenti",
          "jangan ganggu",
          "tagihan salah",
          "keliru",
        ],
        responseTemplate: `Mohon maaf atas ketidaknyamanannya.

Tim kami akan segera melakukan pengecekan dan menghubungi Anda untuk klarifikasi.

Terima kasih atas kesabarannya 🙏`,
        notifyCollector: true,
        isActive: true,
      },
      {
        category: "DEFAULT",
        keywords: [],
        responseTemplate: `Terima kasih pesannya.

Tim kami akan segera merespon pesan Anda.

Atau hubungi langsung:
📞 0812-3456-7890 (Customer Service)

Terima kasih 🙏`,
        notifyCollector: false,
        isActive: true,
      },
    ];

    // Bulk create rules
    const createdRules = await AutoReplyRule.bulkCreate(defaultRules);
    logger.info(
      `✅ Successfully seeded ${createdRules.length} default auto-reply rules`
    );

    return createdRules;
  } catch (error) {
    logger.error("❌ Error seeding auto-reply rules:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const sequelize = require("../models/db");

  sequelize
    .authenticate()
    .then(() => {
      logger.info("✅ Database connected");
      return seedDefaultRules();
    })
    .then(() => {
      logger.info("✅ Seeding completed");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("❌ Seeding failed:", error);
      process.exit(1);
    });
}

module.exports = { seedDefaultRules };
