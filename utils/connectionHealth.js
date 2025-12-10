const logger = require("./logger");
function checkSessionHealth(sock, sessionId, permissive = false) {
  const health = {
    isHealthy: false,
    issues: [],
    details: {},
  };
  if (!sock) {
    health.issues.push("Socket not found");
    return health;
  }
  if (!sock.user || !sock.user.id) {
    health.issues.push("User not authenticated - QR code not scanned");
    health.details.userAuthenticated = false;
  } else {
    health.details.userAuthenticated = true;
    health.details.userId = sock.user.id;
  }
  if (sock.ws) {
    const wsState = sock.ws.readyState;
    health.details.websocketState = wsState;
    switch (wsState) {
      case 0: 
        health.issues.push("WebSocket is connecting - please wait");
        break;
      case 1: 
        health.details.websocketHealthy = true;
        break;
      case 2: 
        health.issues.push("WebSocket is closing");
        break;
      case 3: 
        health.issues.push("WebSocket is closed");
        logger.warn(`🔌 WebSocket closed for session ${sessionId}, readyState: ${wsState}`);
        break;
      default:
        health.details.websocketState = `unknown(${wsState})`;
        if (
          typeof sock.sendMessage === "function" &&
          sock.user &&
          sock.user.id
        ) {
          health.details.websocketHealthy = true;
          health.details.note =
            "WebSocket state unknown but session appears functional";
        } else {
          health.issues.push(`WebSocket state unknown (${wsState})`);
        }
    }
  } else {
    if (typeof sock.sendMessage === "function" && sock.user && sock.user.id) {
      health.details.websocketHealthy = true;
      health.details.note =
        "No WebSocket reference but session appears functional";
    } else {
      health.issues.push("WebSocket not available");
      health.details.websocketHealthy = false;
    }
  }
  if (typeof sock.sendMessage !== "function") {
    health.issues.push("sendMessage function not available");
  }
  if (permissive) {
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
    health.isHealthy = health.issues.length === 0;
  }
  return health;
}
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
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  logger.error(
    `❌ Session ${sessionId} did not become healthy within ${timeoutMs}ms`
  );
  return false;
}
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
