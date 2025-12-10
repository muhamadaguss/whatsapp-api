const logger = require("./logger");
class SpinTextEngine {
  static parseSpinText(template) {
    if (!template || typeof template !== "string") {
      return template || "";
    }
    const spinRegex = /\{([^{}]*\|[^{}]*)\}/g;
    return template.replace(spinRegex, (match, options) => {
      try {
        const choices = options
          .split("|")
          .filter((choice) => choice.trim().length > 0);
        if (choices.length <= 1) {
          return match;
        }
        const randomIndex = Math.floor(Math.random() * choices.length);
        return choices[randomIndex].trim();
      } catch (error) {
        logger.error(`Error parsing spin text: ${match}`, error);
        return match; 
      }
    });
  }
  static generateVariations(template, count = 5) {
    if (!template || typeof template !== "string") {
      return [template || ""];
    }
    const variations = new Set(); 
    const maxAttempts = count * 3; 
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
  static hasSpinText(template) {
    if (!template || typeof template !== "string") {
      return false;
    }
    const spinRegex = /\{[^{}]*\|[^{}]*\}/;
    return spinRegex.test(template);
  }
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
  static sanitizeTemplate(template) {
    if (!template || typeof template !== "string") {
      return "";
    }
    return template
      .replace(/[<>]/g, "") 
      .replace(/javascript:/gi, "") 
      .trim();
  }
}
module.exports = SpinTextEngine;
