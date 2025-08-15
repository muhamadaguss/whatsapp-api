const logger = require("./logger");

/**
 * Spin Text Engine untuk menghindari deteksi spam WhatsApp
 * Mendukung format: {option1|option2|option3}
 * Contoh: "Halo {Pak|Bapak|Mas} {nama}, {bagaimana|gimana} kabarnya?"
 */
class SpinTextEngine {
  /**
   * Parse dan generate satu variasi dari spin text
   * @param {string} template - Template dengan format spin text
   * @returns {string} - Hasil spin text yang sudah di-generate
   */
  static parseSpinText(template) {
    if (!template || typeof template !== "string") {
      return template || "";
    }

    // Regex untuk menangkap {option1|option2|option3} tapi BUKAN {variable}
    const spinRegex = /\{([^{}]*\|[^{}]*)\}/g;

    return template.replace(spinRegex, (match, options) => {
      try {
        // Split berdasarkan | dan filter empty strings
        const choices = options
          .split("|")
          .filter((choice) => choice.trim().length > 0);

        if (choices.length <= 1) {
          // Jika hanya 1 pilihan atau kosong, return original (kemungkinan variable)
          return match;
        }

        // Pilih random dari choices
        const randomIndex = Math.floor(Math.random() * choices.length);
        return choices[randomIndex].trim();
      } catch (error) {
        logger.error(`Error parsing spin text: ${match}`, error);
        return match; // Return original jika error
      }
    });
  }

  /**
   * Generate multiple variasi dari template
   * @param {string} template - Template dengan format spin text
   * @param {number} count - Jumlah variasi yang diinginkan (default: 5)
   * @returns {string[]} - Array berisi variasi unik
   */
  static generateVariations(template, count = 5) {
    if (!template || typeof template !== "string") {
      return [template || ""];
    }

    const variations = new Set(); // Gunakan Set untuk avoid duplicates
    const maxAttempts = count * 3; // Maksimal attempt untuk avoid infinite loop
    let attempts = 0;

    while (variations.size < count && attempts < maxAttempts) {
      const variation = this.parseSpinText(template);
      variations.add(variation);
      attempts++;
    }

    const result = Array.from(variations);

    logger.info(`Generated ${result.length} unique variations from template`);
    return result;
  }

  /**
   * Validasi apakah template mengandung spin text
   * @param {string} template - Template untuk divalidasi
   * @returns {boolean} - True jika mengandung spin text
   */
  static hasSpinText(template) {
    if (!template || typeof template !== "string") {
      return false;
    }

    const spinRegex = /\{[^{}]*\|[^{}]*\}/;
    return spinRegex.test(template);
  }

  /**
   * Hitung estimasi jumlah variasi yang mungkin
   * @param {string} template - Template dengan spin text
   * @returns {number} - Estimasi jumlah kombinasi
   */
  static estimateVariations(template) {
    if (!template || typeof template !== "string") {
      return 1;
    }

    const spinRegex = /\{([^{}]+)\}/g;
    let totalCombinations = 1;
    let match;

    while ((match = spinRegex.exec(template)) !== null) {
      const options = match[1]
        .split("|")
        .filter((choice) => choice.trim().length > 0);
      totalCombinations *= options.length;
    }

    return totalCombinations;
  }

  /**
   * Preview variasi untuk testing
   * @param {string} template - Template dengan spin text
   * @param {number} previewCount - Jumlah preview (default: 3)
   * @returns {object} - Object berisi info dan preview
   */
  static previewVariations(template, previewCount = 10) {
    const hasSpinText = this.hasSpinText(template);
    const estimatedVariations = this.estimateVariations(template);
    const previews = hasSpinText
      ? this.generateVariations(template, previewCount)
      : [template];

    return {
      hasSpinText,
      estimatedVariations,
      previews,
      template,
    };
  }

  /**
   * Sanitize template untuk menghindari injection
   * @param {string} template - Template untuk di-sanitize
   * @returns {string} - Template yang sudah di-sanitize
   */
  static sanitizeTemplate(template) {
    if (!template || typeof template !== "string") {
      return "";
    }

    // Remove potentially dangerous characters
    return template
      .replace(/[<>]/g, "") // Remove HTML tags
      .replace(/javascript:/gi, "") // Remove javascript protocol
      .trim();
  }
}

module.exports = SpinTextEngine;
