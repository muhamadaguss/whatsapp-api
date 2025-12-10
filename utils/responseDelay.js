/**
 * Response Delay Utility
 * Generate random delay to make bot responses more natural
 */

/**
 * Generate random delay between min and max seconds
 * @param {number} minSeconds - Minimum delay in seconds (default: 2)
 * @param {number} maxSeconds - Maximum delay in seconds (default: 5)
 * @returns {number} - Random delay in seconds
 */
function generateRandomDelay(minSeconds = 2, maxSeconds = 5) {
  const min = Math.max(0, minSeconds);
  const max = Math.max(min, maxSeconds);

  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay;
}

/**
 * Sleep/wait for specified seconds
 * @param {number} seconds - Seconds to wait
 * @returns {Promise} - Promise that resolves after delay
 */
function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Execute function after random delay
 * @param {Function} fn - Function to execute
 * @param {number} minSeconds - Minimum delay
 * @param {number} maxSeconds - Maximum delay
 * @returns {Promise} - Promise with delay info and function result
 */
async function executeWithDelay(fn, minSeconds = 2, maxSeconds = 5) {
  const delay = generateRandomDelay(minSeconds, maxSeconds);

  await sleep(delay);

  const result = await fn();

  return {
    delay,
    result,
  };
}

module.exports = {
  generateRandomDelay,
  sleep,
  executeWithDelay,
};
