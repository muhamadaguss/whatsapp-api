const logger = require("../utils/logger");
class HumanSimulationService {
  constructor() {
    this.dailyRoutines = {
      earlyBird: { startTime: 28500000, variance: 1800000 }, 
      normal: { startTime: 32400000, variance: 2700000 }, 
      lateComer: { startTime: 36000000, variance: 1800000 } 
    };
    this.probabilities = {
      forgotToSend: 0.03, 
      secondThoughts: 0.05, 
      checkPhone: 0.10, 
      distracted: 0.08 
    };
  }
  getVariableStartTime(routineType = 'normal') {
    const routine = this.dailyRoutines[routineType] || this.dailyRoutines.normal;
    const variance = Math.random() * routine.variance * 2 - routine.variance;
    const startTime = routine.startTime + variance;
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
  simulateForgotToSend() {
    if (Math.random() > this.probabilities.forgotToSend) {
      return { shouldDelay: false, delay: 0 };
    }
    const delayMs = 1800000 + Math.random() * 1800000;
    logger.info(`💭 [HumanSim] Simulating "forgot to send" - delaying ${Math.round(delayMs/60000)}min`);
    return {
      shouldDelay: true,
      delay: delayMs,
      reason: 'Forgot to send message (human behavior)'
    };
  }
  simulateSecondThoughts() {
    if (Math.random() > this.probabilities.secondThoughts) {
      return { shouldPause: false, pause: 0 };
    }
    const pauseMs = 3000 + Math.random() * 5000;
    logger.debug(`🤔 [HumanSim] Second thoughts - pausing ${(pauseMs/1000).toFixed(1)}s`);
    return {
      shouldPause: true,
      pause: pauseMs,
      reason: 'Re-reading message before sending'
    };
  }
  simulatePhoneCheck() {
    if (Math.random() > this.probabilities.checkPhone) {
      return { shouldPause: false, pause: 0 };
    }
    const pauseMs = 5000 + Math.random() * 10000;
    logger.debug(`📱 [HumanSim] Checking phone - pausing ${(pauseMs/1000).toFixed(1)}s`);
    return {
      shouldPause: true,
      pause: pauseMs,
      reason: 'Checking phone notifications'
    };
  }
  simulateDistraction() {
    if (Math.random() > this.probabilities.distracted) {
      return { shouldPause: false, pause: 0 };
    }
    const pauseMs = 10000 + Math.random() * 20000;
    logger.debug(`😵 [HumanSim] Distracted - pausing ${(pauseMs/1000).toFixed(1)}s`);
    return {
      shouldPause: true,
      pause: pauseMs,
      reason: 'Momentary distraction'
    };
  }
  async getComprehensiveDelays() {
    const delays = [];
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
    const totalDelay = delays.reduce((sum, d) => sum + (d.pause || d.delay || 0), 0);
    return {
      hasDelays: delays.length > 0,
      delays,
      totalDelay,
      count: delays.length
    };
  }
  calculateTypingTime(message) {
    const length = message.length;
    const charsPerSecond = 3 + Math.random() * 2;
    const baseTime = (length / charsPerSecond) * 1000;
    const punctuationPauses = (message.match(/[.,!?]/g) || []).length * (200 + Math.random() * 300);
    const thinkingPauses = (message.match(/ /g) || []).length * (50 + Math.random() * 150);
    const totalTime = baseTime + punctuationPauses + thinkingPauses;
    return Math.max(2000, Math.min(30000, totalTime));
  }
  simulateTypoCorrection() {
    if (Math.random() > 0.15) {
      return { hasTypo: false, correctionTime: 0 };
    }
    const correctionTime = 1000 + Math.random() * 3000;
    return {
      hasTypo: true,
      correctionTime,
      reason: 'Typo correction'
    };
  }
  getBehaviorProfile(accountAge) {
    const profiles = {
      NEW: {
        routineType: 'normal',
        cautionLevel: 'HIGH',
        pauseProbability: 0.20, 
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
let instance = null;
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
