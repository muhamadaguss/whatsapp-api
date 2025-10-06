/**
 * Human Simulation Service - PHASE 3 TASK [P3-4]
 * 
 * Comprehensive Human Behavior Simulation Suite
 * 
 * This service wraps and enhances Phase 2 human simulation features
 * with additional advanced patterns for ultimate human-like behavior.
 * 
 * Features (Most already implemented in Phase 2):
 * - Advanced typing speed variation ✅ (Phase 2)
 * - Reading incoming messages (15%) ✅ (Phase 2)
 * - App switching (5%) ✅ (Phase 2)
 * - Coffee/bathroom breaks (10%) ✅ (Phase 2)
 * - Variable daily start time (NEW)
 * - "Forgot to send" delays (NEW)
 * - Natural hesitation patterns (NEW)
 * 
 * @module humanSimulationService
 */

const logger = require("../utils/logger");

class HumanSimulationService {
  constructor() {
    // Daily routine patterns
    this.dailyRoutines = {
      earlyBird: { startTime: 28500000, variance: 1800000 }, // 7:55 AM ± 30min
      normal: { startTime: 32400000, variance: 2700000 }, // 9:00 AM ± 45min
      lateComer: { startTime: 36000000, variance: 1800000 } // 10:00 AM ± 30min
    };
    
    // Behavior probabilities
    this.probabilities = {
      forgotToSend: 0.03, // 3% chance to delay message
      secondThoughts: 0.05, // 5% chance to pause before sending
      checkPhone: 0.10, // 10% chance to pause (checking phone)
      distracted: 0.08 // 8% chance of distraction
    };
  }

  /**
   * Get variable start time for the day
   * @param {string} routineType - earlyBird, normal, or lateComer
   * @returns {Object} Start time details
   */
  getVariableStartTime(routineType = 'normal') {
    const routine = this.dailyRoutines[routineType] || this.dailyRoutines.normal;
    
    // Calculate random start time within variance
    const variance = Math.random() * routine.variance * 2 - routine.variance;
    const startTime = routine.startTime + variance;
    
    // Convert to hours and minutes
    const hours = Math.floor(startTime / 3600000);
    const minutes = Math.floor((startTime % 3600000) / 60000);
    
    return {
      startTimeMs: startTime,
      hours,
      minutes,
      formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      routineType
    };
  }

  /**
   * Simulate "forgot to send" behavior
   * @returns {Object} Delay information
   */
  simulateForgotToSend() {
    if (Math.random() > this.probabilities.forgotToSend) {
      return { shouldDelay: false, delay: 0 };
    }
    
    // Random delay between 30-60 minutes
    const delayMs = 1800000 + Math.random() * 1800000;
    
    logger.info(`💭 [HumanSim] Simulating "forgot to send" - delaying ${Math.round(delayMs/60000)}min`);
    
    return {
      shouldDelay: true,
      delay: delayMs,
      reason: 'Forgot to send message (human behavior)'
    };
  }

  /**
   * Simulate second thoughts before sending
   * @returns {Object} Pause information
   */
  simulateSecondThoughts() {
    if (Math.random() > this.probabilities.secondThoughts) {
      return { shouldPause: false, pause: 0 };
    }
    
    // Pause 3-8 seconds (re-reading message)
    const pauseMs = 3000 + Math.random() * 5000;
    
    logger.debug(`🤔 [HumanSim] Second thoughts - pausing ${(pauseMs/1000).toFixed(1)}s`);
    
    return {
      shouldPause: true,
      pause: pauseMs,
      reason: 'Re-reading message before sending'
    };
  }

  /**
   * Simulate checking phone randomly
   * @returns {Object} Pause information
   */
  simulatePhoneCheck() {
    if (Math.random() > this.probabilities.checkPhone) {
      return { shouldPause: false, pause: 0 };
    }
    
    // Pause 5-15 seconds (checking notifications)
    const pauseMs = 5000 + Math.random() * 10000;
    
    logger.debug(`📱 [HumanSim] Checking phone - pausing ${(pauseMs/1000).toFixed(1)}s`);
    
    return {
      shouldPause: true,
      pause: pauseMs,
      reason: 'Checking phone notifications'
    };
  }

  /**
   * Simulate distraction
   * @returns {Object} Pause information
   */
  simulateDistraction() {
    if (Math.random() > this.probabilities.distracted) {
      return { shouldPause: false, pause: 0 };
    }
    
    // Pause 10-30 seconds (got distracted)
    const pauseMs = 10000 + Math.random() * 20000;
    
    logger.debug(`😵 [HumanSim] Distracted - pausing ${(pauseMs/1000).toFixed(1)}s`);
    
    return {
      shouldPause: true,
      pause: pauseMs,
      reason: 'Momentary distraction'
    };
  }

  /**
   * Get comprehensive human simulation delays (combines all patterns)
   * @returns {Promise<Object>} Combined delays
   */
  async getComprehensiveDelays() {
    const delays = [];
    
    // Check all simulation types
    const secondThoughts = this.simulateSecondThoughts();
    if (secondThoughts.shouldPause) {
      delays.push(secondThoughts);
    }
    
    const phoneCheck = this.simulatePhoneCheck();
    if (phoneCheck.shouldPause) {
      delays.push(phoneCheck);
    }
    
    const distraction = this.simulateDistraction();
    if (distraction.shouldPause) {
      delays.push(distraction);
    }
    
    const forgotToSend = this.simulateForgotToSend();
    if (forgotToSend.shouldDelay) {
      delays.push(forgotToSend);
    }
    
    // Calculate total delay
    const totalDelay = delays.reduce((sum, d) => sum + (d.pause || d.delay || 0), 0);
    
    return {
      hasDelays: delays.length > 0,
      delays,
      totalDelay,
      count: delays.length
    };
  }

  /**
   * Calculate natural typing speed based on message
   * @param {string} message - Message text
   * @returns {number} Typing time in ms
   */
  calculateTypingTime(message) {
    const length = message.length;
    
    // Base typing speed: 3-5 characters per second
    const charsPerSecond = 3 + Math.random() * 2;
    const baseTime = (length / charsPerSecond) * 1000;
    
    // Add pauses for punctuation
    const punctuationPauses = (message.match(/[.,!?]/g) || []).length * (200 + Math.random() * 300);
    
    // Add pauses for thinking (spaces)
    const thinkingPauses = (message.match(/ /g) || []).length * (50 + Math.random() * 150);
    
    const totalTime = baseTime + punctuationPauses + thinkingPauses;
    
    // Clamp between 2-30 seconds
    return Math.max(2000, Math.min(30000, totalTime));
  }

  /**
   * Simulate typo and correction
   * @returns {Object} Typo simulation info
   */
  simulateTypoCorrection() {
    // 15% chance of typo
    if (Math.random() > 0.15) {
      return { hasTypo: false, correctionTime: 0 };
    }
    
    // Correction time: 1-4 seconds
    const correctionTime = 1000 + Math.random() * 3000;
    
    return {
      hasTypo: true,
      correctionTime,
      reason: 'Typo correction'
    };
  }

  /**
   * Get behavior profile based on account age
   * @param {string} accountAge - NEW/WARMING/ESTABLISHED
   * @returns {Object} Behavior profile
   */
  getBehaviorProfile(accountAge) {
    const profiles = {
      NEW: {
        routineType: 'normal',
        cautionLevel: 'HIGH',
        pauseProbability: 0.20, // More pauses for new accounts
        averageSpeed: 'SLOW',
        description: 'Cautious new user behavior'
      },
      WARMING: {
        routineType: 'normal',
        cautionLevel: 'MEDIUM',
        pauseProbability: 0.15,
        averageSpeed: 'MODERATE',
        description: 'Moderately confident user'
      },
      ESTABLISHED: {
        routineType: 'lateComer',
        cautionLevel: 'LOW',
        pauseProbability: 0.10,
        averageSpeed: 'NORMAL',
        description: 'Confident established user'
      }
    };
    
    return profiles[accountAge] || profiles.NEW;
  }

  /**
   * Get statistics
   * @returns {Object} Simulation stats
   */
  getStats() {
    return {
      probabilities: this.probabilities,
      dailyRoutines: Object.keys(this.dailyRoutines),
      features: [
        'Variable start time',
        'Forgot to send delays',
        'Second thoughts pauses',
        'Phone checking',
        'Distractions',
        'Natural typing speed',
        'Typo corrections',
        '+ Phase 2 features (reading, app-switching, coffee breaks)'
      ]
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance of HumanSimulationService
 * @returns {HumanSimulationService}
 */
function getHumanSimulationService() {
  if (!instance) {
    instance = new HumanSimulationService();
  }
  return instance;
}

module.exports = {
  HumanSimulationService,
  getHumanSimulationService
};
