const logger = require("../utils/logger");

/**
 * Phone Validation Service
 * Handles Indonesian phone number validation and normalization
 */
class PhoneValidationService {
  
  /**
   * Indonesian mobile operator prefixes
   */
  static INDONESIAN_PREFIXES = {
    TELKOMSEL: ['811', '812', '813', '821', '822', '852', '853'],
    INDOSAT: ['814', '815', '816', '855', '856', '857', '858'],
    XL: ['817', '818', '819', '859', '877', '878'],
    SMARTFREN: ['881', '882', '883', '884', '885', '886', '887', '888', '889'],
    THREE: ['895', '896', '897', '898', '899'],
    AXIS: ['831', '832', '833', '838'],
  };

  /**
   * All valid Indonesian mobile prefixes
   */
  static ALL_PREFIXES = Object.values(PhoneValidationService.INDONESIAN_PREFIXES).flat();

  /**
   * Validate single Indonesian phone number
   * @param {string} phone - Phone number to validate
   * @returns {object} Validation result
   */
  static validateIndonesianPhone(phone) {
    const result = {
      original: phone,
      isValid: false,
      normalized: null,
      operator: null,
      format: null,
      errors: [],
    };

    if (!phone || typeof phone !== 'string') {
      result.errors.push('Phone number is required and must be a string');
      return result;
    }

    // Clean phone number - remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 0) {
      result.errors.push('Phone number contains no digits');
      return result;
    }

    // Check different formats
    let normalized = null;
    let format = null;

    if (cleaned.startsWith('62')) {
      // International format: 62xxx
      if (cleaned.length >= 11 && cleaned.length <= 15) {
        const prefix = cleaned.substring(2, 5);
        if (this.ALL_PREFIXES.includes(prefix)) {
          normalized = cleaned;
          format = 'international';
          result.isValid = true;
          result.operator = this.getOperator(prefix);
        } else {
          result.errors.push(`Invalid Indonesian mobile prefix: ${prefix}`);
        }
      } else {
        result.errors.push('International format must be 11-15 digits long');
      }
    } else if (cleaned.startsWith('08')) {
      // Local format: 08xxx
      if (cleaned.length >= 10 && cleaned.length <= 13) {
        const prefix = cleaned.substring(2, 5);
        if (this.ALL_PREFIXES.includes(prefix)) {
          normalized = '62' + cleaned.substring(1);
          format = 'local';
          result.isValid = true;
          result.operator = this.getOperator(prefix);
        } else {
          result.errors.push(`Invalid Indonesian mobile prefix: ${prefix}`);
        }
      } else {
        result.errors.push('Local format must be 10-13 digits long');
      }
    } else if (cleaned.startsWith('8')) {
      // Without country/local prefix: 8xxx
      if (cleaned.length >= 9 && cleaned.length <= 12) {
        const prefix = cleaned.substring(1, 4);
        if (this.ALL_PREFIXES.includes(prefix)) {
          normalized = '62' + cleaned;
          format = 'mobile';
          result.isValid = true;
          result.operator = this.getOperator(prefix);
        } else {
          result.errors.push(`Invalid Indonesian mobile prefix: ${prefix}`);
        }
      } else {
        result.errors.push('Mobile format must be 9-12 digits long');
      }
    } else {
      result.errors.push('Phone number must start with 62, 08, or 8');
    }

    result.normalized = normalized;
    result.format = format;

    return result;
  }

  /**
   * Get operator name from prefix
   * @param {string} prefix - 3-digit prefix
   * @returns {string} Operator name
   */
  static getOperator(prefix) {
    for (const [operator, prefixes] of Object.entries(this.INDONESIAN_PREFIXES)) {
      if (prefixes.includes(prefix)) {
        return operator;
      }
    }
    return 'UNKNOWN';
  }

  /**
   * Batch validate phone numbers
   * @param {array} phoneNumbers - Array of phone numbers
   * @returns {object} Batch validation result
   */
  static validatePhoneBatch(phoneNumbers) {
    const startTime = Date.now();
    
    if (!Array.isArray(phoneNumbers)) {
      throw new Error('Phone numbers must be an array');
    }

    if (phoneNumbers.length === 0) {
      throw new Error('Phone numbers array cannot be empty');
    }

    if (phoneNumbers.length > 10000) {
      throw new Error('Maximum 10,000 phone numbers allowed per batch');
    }

    const results = {
      total: phoneNumbers.length,
      valid: 0,
      invalid: 0,
      duplicates: 0,
      processed: [],
      validNumbers: [],
      invalidNumbers: [],
      duplicateNumbers: [],
      summary: {
        byOperator: {},
        byFormat: {},
        byError: {},
      },
      processingTime: 0,
    };

    const seenNumbers = new Set();
    const normalizedSeen = new Set();

    phoneNumbers.forEach((phone, index) => {
      const validation = this.validateIndonesianPhone(phone);
      
      // Check for duplicates
      const isDuplicate = seenNumbers.has(phone) || 
                         (validation.normalized && normalizedSeen.has(validation.normalized));
      
      const processedItem = {
        index: index + 1,
        ...validation,
        isDuplicate,
      };

      results.processed.push(processedItem);

      if (isDuplicate) {
        results.duplicates++;
        results.duplicateNumbers.push(processedItem);
      } else if (validation.isValid) {
        results.valid++;
        results.validNumbers.push(processedItem);
        
        // Update operator summary
        const operator = validation.operator || 'UNKNOWN';
        results.summary.byOperator[operator] = (results.summary.byOperator[operator] || 0) + 1;
        
        // Update format summary
        const format = validation.format || 'unknown';
        results.summary.byFormat[format] = (results.summary.byFormat[format] || 0) + 1;
        
        normalizedSeen.add(validation.normalized);
      } else {
        results.invalid++;
        results.invalidNumbers.push(processedItem);
        
        // Update error summary
        validation.errors.forEach(error => {
          results.summary.byError[error] = (results.summary.byError[error] || 0) + 1;
        });
      }

      seenNumbers.add(phone);
    });

    results.processingTime = Date.now() - startTime;

    // Add success rate
    results.successRate = results.total > 0 ? (results.valid / results.total) * 100 : 0;

    logger.info(`📱 Phone validation completed: ${results.valid}/${results.total} valid (${results.successRate.toFixed(1)}%) in ${results.processingTime}ms`);

    return results;
  }

  /**
   * Normalize phone numbers for WhatsApp format
   * @param {array} phoneNumbers - Array of phone numbers
   * @returns {object} Normalization result
   */
  static normalizePhoneBatch(phoneNumbers) {
    const results = this.validatePhoneBatch(phoneNumbers);
    
    return {
      total: results.total,
      normalized: results.validNumbers.length,
      normalizedNumbers: results.validNumbers.map(item => ({
        original: item.original,
        normalized: item.normalized,
        operator: item.operator,
        format: item.format,
      })),
      invalid: results.invalidNumbers.length,
      duplicates: results.duplicates,
      summary: results.summary,
      processingTime: results.processingTime,
    };
  }

  /**
   * Generate phone number suggestions for invalid numbers
   * @param {string} phone - Invalid phone number
   * @returns {array} Array of suggestions
   */
  static generateSuggestions(phone) {
    const suggestions = [];
    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.length >= 8) {
      // Try different prefix combinations
      if (!cleaned.startsWith('62') && !cleaned.startsWith('08')) {
        // Add 62 prefix
        suggestions.push('62' + cleaned);
        
        // Add 08 prefix (if doesn't start with 8)
        if (!cleaned.startsWith('8')) {
          suggestions.push('08' + cleaned);
        } else {
          suggestions.push('0' + cleaned);
        }
      }

      // If too short, suggest common prefixes
      if (cleaned.length <= 10) {
        const commonPrefixes = ['811', '812', '813', '821', '822'];
        commonPrefixes.forEach(prefix => {
          if (cleaned.length >= 6) {
            suggestions.push('62' + prefix + cleaned.substring(-6));
          }
        });
      }
    }

    // Remove duplicates and validate suggestions
    const uniqueSuggestions = [...new Set(suggestions)];
    return uniqueSuggestions
      .map(suggestion => this.validateIndonesianPhone(suggestion))
      .filter(result => result.isValid)
      .slice(0, 3); // Limit to 3 suggestions
  }

  /**
   * Check if phone number is WhatsApp compatible
   * @param {string} phone - Phone number to check
   * @returns {object} Compatibility result
   */
  static checkWhatsAppCompatibility(phone) {
    const validation = this.validateIndonesianPhone(phone);
    
    if (!validation.isValid) {
      return {
        isCompatible: false,
        reason: 'Invalid phone number format',
        validation,
      };
    }

    // WhatsApp requires specific format
    const whatsappFormat = validation.normalized;
    
    return {
      isCompatible: true,
      whatsappFormat,
      reason: 'Compatible with WhatsApp',
      validation,
    };
  }

  /**
   * Export validation results to CSV format
   * @param {object} validationResults - Results from validatePhoneBatch
   * @returns {string} CSV content
   */
  static exportToCSV(validationResults) {
    const headers = [
      'Index',
      'Original',
      'Normalized',
      'IsValid',
      'IsDuplicate',
      'Operator',
      'Format',
      'Errors'
    ];

    const rows = validationResults.processed.map(item => [
      item.index,
      `"${item.original}"`,
      `"${item.normalized || ''}"`,
      item.isValid,
      item.isDuplicate,
      `"${item.operator || ''}"`,
      `"${item.format || ''}"`,
      `"${item.errors.join('; ')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Get validation statistics
   * @param {object} validationResults - Results from validatePhoneBatch
   * @returns {object} Detailed statistics
   */
  static getValidationStatistics(validationResults) {
    const stats = {
      overview: {
        total: validationResults.total,
        valid: validationResults.valid,
        invalid: validationResults.invalid,
        duplicates: validationResults.duplicates,
        successRate: validationResults.successRate,
        processingTime: validationResults.processingTime,
      },
      operators: validationResults.summary.byOperator,
      formats: validationResults.summary.byFormat,
      errors: validationResults.summary.byError,
      recommendations: {
        estimatedDeliveryRate: this.estimateDeliveryRate(validationResults),
        suggestedBatchSize: this.suggestBatchSize(validationResults.valid),
        estimatedCost: this.estimateCost(validationResults.valid),
      }
    };

    return stats;
  }

  /**
   * Estimate delivery rate based on operator distribution
   * @param {object} validationResults - Validation results
   * @returns {number} Estimated delivery rate percentage
   */
  static estimateDeliveryRate(validationResults) {
    // Base delivery rates by operator (example rates)
    const operatorRates = {
      TELKOMSEL: 95,
      INDOSAT: 92,
      XL: 90,
      SMARTFREN: 88,
      THREE: 85,
      AXIS: 87,
      UNKNOWN: 80,
    };

    let totalWeight = 0;
    let weightedRate = 0;

    Object.entries(validationResults.summary.byOperator).forEach(([operator, count]) => {
      const rate = operatorRates[operator] || operatorRates.UNKNOWN;
      totalWeight += count;
      weightedRate += rate * count;
    });

    return totalWeight > 0 ? weightedRate / totalWeight : 85; // Default 85%
  }

  /**
   * Suggest optimal batch size for blast
   * @param {number} totalValid - Number of valid phone numbers
   * @returns {number} Suggested batch size
   */
  static suggestBatchSize(totalValid) {
    if (totalValid <= 100) return 10;
    if (totalValid <= 500) return 20;
    if (totalValid <= 1000) return 50;
    if (totalValid <= 5000) return 100;
    return 200;
  }

  /**
   * Estimate cost for blast (example pricing)
   * @param {number} totalValid - Number of valid phone numbers
   * @returns {object} Cost estimation
   */
  static estimateCost(totalValid) {
    const costPerMessage = 150; // IDR per message (example)
    
    return {
      totalMessages: totalValid,
      costPerMessage,
      totalCost: totalValid * costPerMessage,
      currency: 'IDR',
    };
  }
}

module.exports = PhoneValidationService;
