/**
 * Tenant Context Middleware
 * 
 * Extracts organization context from JWT token and adds to request object.
 * This middleware should be applied AFTER authentication middleware.
 * 
 * Usage:
 *   const { tenantContext } = require('./middleware/tenantContext');
 *   router.get('/path', authenticate, tenantContext, handler);
 */

const logger = require("../utils/logger");

/**
 * Extract organizationId from authenticated user and add to request
 * Assumes req.user exists (from authentication middleware)
 * 
 * Super Admin Behavior:
 * - If user is super admin, tenant context is optional
 * - Super admin can access any organization by providing orgId in query/params
 * - If no orgId provided, super admin has unrestricted access
 */
const tenantContext = (req, res, next) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "Please login to access this resource",
      });
    }

    // Extract user details
    const { organizationId, roleInOrg, id: userId, isSuperAdmin } = req.user;

    // Super Admin: Skip tenant isolation
    if (isSuperAdmin) {
      // Super admin can optionally target specific organization
      const targetOrgId = req.params.orgId || req.query.orgId || req.body.organizationId;
      
      req.tenant = {
        organizationId: targetOrgId || null, // NULL = access all orgs
        roleInOrg: 'super_admin',
        userId,
        isSuperAdmin: true,
      };

      // Log super admin access
      logger.info(`Super Admin access: userId=${userId}, targetOrg=${targetOrgId || 'ALL'}`);
      
      return next();
    }

    // Regular User: Require organization
    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: "No organization",
        message: "User is not associated with any organization. Please contact support.",
      });
    }

    // Add tenant context to request
    req.tenant = {
      organizationId,
      roleInOrg: roleInOrg || "member",
      userId,
      isSuperAdmin: false,
    };

    // Log tenant context for debugging (only in development)
    if (process.env.NODE_ENV === "development") {
      logger.debug(`Tenant context set: organizationId=${organizationId}, role=${roleInOrg}`);
    }

    next();
  } catch (error) {
    logger.error("Error in tenantContext middleware:", error);
    return res.status(500).json({
      success: false,
      error: "Tenant context error",
      message: "Failed to establish tenant context",
    });
  }
};

/**
 * Optional tenant context - doesn't fail if no organization
 * Useful for endpoints that can work with or without organization context
 */
const optionalTenantContext = (req, res, next) => {
  try {
    if (req.user && req.user.organizationId) {
      req.tenant = {
        organizationId: req.user.organizationId,
        roleInOrg: req.user.roleInOrg || "member",
        userId: req.user.id,
      };
    }
    next();
  } catch (error) {
    logger.error("Error in optionalTenantContext middleware:", error);
    next(); // Continue anyway for optional context
  }
};

/**
 * Check if user has specific role in organization
 * Usage: requireRole('owner', 'admin')
 * 
 * Super Admin Bypass:
 * - Super admins automatically pass all role checks
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.tenant) {
      return res.status(403).json({
        success: false,
        error: "Tenant context required",
        message: "This action requires organization context",
      });
    }

    // Super admin bypass: always has permission
    if (req.tenant.isSuperAdmin) {
      logger.debug(`Super admin bypassing role check for: ${allowedRoles.join(", ")}`);
      return next();
    }

    const { roleInOrg } = req.tenant;

    if (!allowedRoles.includes(roleInOrg)) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions",
        message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
        userRole: roleInOrg,
        requiredRoles: allowedRoles,
      });
    }

    next();
  };
};

/**
 * Require super admin access
 * Usage: requireSuperAdmin
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || !req.user.isSuperAdmin) {
    return res.status(403).json({
      success: false,
      error: "Super admin required",
      message: "This action requires platform super administrator privileges",
    });
  }

  // Update last admin access timestamp
  const User = require("../models/userModel");
  User.update(
    { lastAdminAccessAt: new Date() },
    { where: { id: req.user.id } }
  ).catch(err => logger.error("Failed to update lastAdminAccessAt:", err));

  next();
};

module.exports = {
  tenantContext,
  optionalTenantContext,
  requireRole,
  requireSuperAdmin,
};
