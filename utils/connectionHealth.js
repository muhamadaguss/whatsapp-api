const logger = require("./logger");

/**
 * Check if WhatsApp session is healthy and ready for sending messages
 * @param {Object} sock - WhatsApp socket instance
 * @param {string} sessionId - Session identifier
 * @param {boolean} permissive - If true, be more tolerant of unknown states
 * @returns {Object} Health status with details
 */
function checkSessionHealth(sock, sessionId, permissive = false) {
  const health = {
    isHealthy: false,
    issues: [],
    details: {},
  };

  // Check if socket exists
  if (!sock) {
    health.issues.push("Socket not found");
    return health;
  }

  // Check if user is authenticated
  if (!sock.user || !sock.user.id) {
    health.issues.push("User not authenticated - QR code not scanned");
    health.details.userAuthenticated = false;
  } else {
    health.details.userAuthenticated = true;
    health.details.userId = sock.user.id;
  }

  // Check WebSocket connection state
  if (sock.ws) {
    const wsState = sock.ws.readyState;
    health.details.websocketState = wsState;

    switch (wsState) {
      case 0: // CONNECTING
        health.issues.push("WebSocket is connecting - please wait");
        break;
      case 1: // OPEN
        health.details.websocketHealthy = true;
        break;
      case 2: // CLOSING
        health.issues.push("WebSocket is closing");
        break;
      case 3: // CLOSED
        health.issues.push("WebSocket is closed");
        logger.warn(`🔌 WebSocket closed for session ${sessionId}, readyState: ${wsState}`);
        break;
      default:
        // For unknown states, check if we can still send messages
        health.details.websocketState = `unknown(${wsState})`;
        if (
          typeof sock.sendMessage === "function" &&
          sock.user &&
          sock.user.id
        ) {
          // If we have user and sendMessage function, consider it potentially healthy
          health.details.websocketHealthy = true;
          health.details.note =
            "WebSocket state unknown but session appears functional";
        } else {
          health.issues.push(`WebSocket state unknown (${wsState})`);
        }
    }
  } else {
    // No WebSocket but check if session is still functional
    if (typeof sock.sendMessage === "function" && sock.user && sock.user.id) {
      health.details.websocketHealthy = true;
      health.details.note =
        "No WebSocket reference but session appears functional";
    } else {
      health.issues.push("WebSocket not available");
      health.details.websocketHealthy = false;
    }
  }

  // Check if session has required functions
  if (typeof sock.sendMessage !== "function") {
    health.issues.push("sendMessage function not available");
  }

  // Overall health assessment
  if (permissive) {
    // In permissive mode, consider healthy if we have basic functionality
    health.isHealthy =
      health.details.userAuthenticated &&
      typeof sock.sendMessage === "function" &&
      !health.issues.some(
        (issue) =>
          issue.includes("closed") ||
          issue.includes("not available") ||
          issue.includes("not authenticated")
      );
  } else {
    // Strict mode - all checks must pass
    health.isHealthy = health.issues.length === 0;
  }

  return health;
}

/**
 * Wait for session to become healthy with timeout
 * @param {Object} sock - WhatsApp socket instance
 * @param {string} sessionId - Session identifier
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<boolean>} True if session becomes healthy
 */
async function waitForHealthySession(sock, sessionId, timeoutMs = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const health = checkSessionHealth(sock, sessionId);

    if (health.isHealthy) {
      logger.info(`✅ Session ${sessionId} is healthy`);
      return true;
    }

    logger.info(
      `⏳ Waiting for session ${sessionId} to become healthy. Issues: ${health.issues.join(
        ", "
      )}`
    );

    // Wait 2 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  logger.error(
    `❌ Session ${sessionId} did not become healthy within ${timeoutMs}ms`
  );
  return false;
}

/**
 * Log detailed session health information
 * @param {Object} sock - WhatsApp socket instance
 * @param {string} sessionId - Session identifier
 */
function logSessionHealth(sock, sessionId) {
  const health = checkSessionHealth(sock, sessionId);

  logger.info(`🔍 Session ${sessionId} health check:`, {
    isHealthy: health.isHealthy,
    issues: health.issues,
    details: health.details,
  });

  return health;
}

module.exports = {
  checkSessionHealth,
  waitForHealthySession,
  logSessionHealth,
};
