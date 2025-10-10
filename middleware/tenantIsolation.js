/**
 * Tenant Isolation Middleware
 * 
 * Automatically adds organizationId filter to ALL Sequelize queries
 * to ensure complete data isolation between tenants.
 * 
 * This uses Sequelize hooks to inject WHERE conditions at the query level.
 * 
 * Usage:
 *   const { setupTenantIsolation } = require('./middleware/tenantIsolation');
 *   setupTenantIsolation(); // Call once during app initialization
 */

const { AsyncLocalStorage } = require("async_hooks");
const logger = require("../utils/logger");

// AsyncLocalStorage for maintaining tenant context across async operations
const tenantStorage = new AsyncLocalStorage();

/**
 * Get current tenant context from async storage
 */
const getCurrentTenant = () => {
  return tenantStorage.getStore();
};

/**
 * Set tenant context for the current async context
 * Should be called in middleware after extracting organizationId
 */
const setTenantContext = (organizationId, userId, roleInOrg) => {
  return {
    organizationId,
    userId,
    roleInOrg,
  };
};

/**
 * Middleware to run request handler within tenant context
 * This should be applied AFTER tenantContext middleware
 */
const withTenantContext = (req, res, next) => {
  if (!req.tenant) {
    // No tenant context, skip isolation
    return next();
  }

  const { organizationId, userId, roleInOrg } = req.tenant;

  // Run the rest of the request within tenant context
  tenantStorage.run(
    { organizationId, userId, roleInOrg },
    () => {
      next();
    }
  );
};

/**
 * Setup Sequelize hooks for automatic tenant isolation
 * This should be called once during application startup
 */
const setupTenantIsolation = (sequelize) => {
  // Models that should have tenant isolation
  // Exclude models that don't have organizationId
  const excludedModels = [
    "Organization",
    "SubscriptionPlan",
    "BlacklistedToken",
    "MenuItem",
    "MessageStatus",
    "RetryConfiguration",
    "PhoneValidationCache",
  ];

  // Hook into beforeFind to add organizationId filter
  sequelize.addHook("beforeFind", (options) => {
    const tenant = getCurrentTenant();
    
    if (!tenant || !tenant.organizationId) {
      // No tenant context, don't apply filter
      return;
    }

    // Check if model should be isolated
    if (options.model && excludedModels.includes(options.model.name)) {
      return;
    }

    // Don't apply if explicitly disabled
    if (options.skipTenantIsolation === true) {
      return;
    }

    // Add organizationId to where clause
    const organizationIdField = getOrganizationIdField(options.model);
    
    if (organizationIdField) {
      options.where = options.where || {};
      
      // Only add if not already specified
      if (!options.where[organizationIdField]) {
        options.where[organizationIdField] = tenant.organizationId;
        
        if (process.env.NODE_ENV === "development") {
          logger.debug(
            `Tenant isolation: Added ${organizationIdField}=${tenant.organizationId} to ${options.model?.name || "query"}`
          );
        }
      }
    }
  });

  // Hook into beforeCreate to add organizationId
  sequelize.addHook("beforeCreate", (instance, options) => {
    const tenant = getCurrentTenant();
    
    if (!tenant || !tenant.organizationId) {
      return;
    }

    // Check if model should be isolated
    const modelName = instance.constructor.name;
    if (excludedModels.includes(modelName)) {
      return;
    }

    // Don't apply if explicitly disabled
    if (options.skipTenantIsolation === true) {
      return;
    }

    const organizationIdField = getOrganizationIdField(instance.constructor);
    
    if (organizationIdField && !instance[organizationIdField]) {
      instance[organizationIdField] = tenant.organizationId;
      
      if (process.env.NODE_ENV === "development") {
        logger.debug(
          `Tenant isolation: Set ${organizationIdField}=${tenant.organizationId} on new ${modelName}`
        );
      }
    }
  });

  // Hook into beforeBulkCreate to add organizationId
  sequelize.addHook("beforeBulkCreate", (instances, options) => {
    const tenant = getCurrentTenant();
    
    if (!tenant || !tenant.organizationId) {
      return;
    }

    // Don't apply if explicitly disabled
    if (options.skipTenantIsolation === true) {
      return;
    }

    instances.forEach((instance) => {
      const modelName = instance.constructor.name;
      if (excludedModels.includes(modelName)) {
        return;
      }

      const organizationIdField = getOrganizationIdField(instance.constructor);
      
      if (organizationIdField && !instance[organizationIdField]) {
        instance[organizationIdField] = tenant.organizationId;
      }
    });
  });

  // Hook into beforeUpdate to prevent cross-tenant updates
  sequelize.addHook("beforeUpdate", (instance, options) => {
    const tenant = getCurrentTenant();
    
    if (!tenant || !tenant.organizationId) {
      return;
    }

    const modelName = instance.constructor.name;
    if (excludedModels.includes(modelName)) {
      return;
    }

    if (options.skipTenantIsolation === true) {
      return;
    }

    const organizationIdField = getOrganizationIdField(instance.constructor);
    
    // Verify the instance belongs to current tenant
    if (organizationIdField && instance[organizationIdField]) {
      if (instance[organizationIdField] !== tenant.organizationId) {
        throw new Error(
          `Tenant isolation violation: Attempting to update ${modelName} from different organization`
        );
      }
    }
  });

  // Hook into beforeDestroy to prevent cross-tenant deletes
  sequelize.addHook("beforeDestroy", (instance, options) => {
    const tenant = getCurrentTenant();
    
    if (!tenant || !tenant.organizationId) {
      return;
    }

    const modelName = instance.constructor.name;
    if (excludedModels.includes(modelName)) {
      return;
    }

    if (options.skipTenantIsolation === true) {
      return;
    }

    const organizationIdField = getOrganizationIdField(instance.constructor);
    
    // Verify the instance belongs to current tenant
    if (organizationIdField && instance[organizationIdField]) {
      if (instance[organizationIdField] !== tenant.organizationId) {
        throw new Error(
          `Tenant isolation violation: Attempting to delete ${modelName} from different organization`
        );
      }
    }
  });

  logger.info("✅ Tenant isolation hooks setup completed");
};

/**
 * Helper to get the organizationId field name for a model
 * Some models use 'organizationId', others use 'organization_id' (snake_case)
 */
const getOrganizationIdField = (model) => {
  if (!model || !model.rawAttributes) {
    return null;
  }

  // Check for both camelCase and snake_case
  if (model.rawAttributes.organizationId) {
    return "organizationId";
  }
  if (model.rawAttributes.organization_id) {
    return "organization_id";
  }

  return null;
};

/**
 * Bypass tenant isolation for specific queries
 * Use with caution! Only for admin/system operations
 * 
 * Example:
 *   const users = await User.findAll(bypassTenantIsolation());
 */
const bypassTenantIsolation = () => {
  return { skipTenantIsolation: true };
};

module.exports = {
  setupTenantIsolation,
  withTenantContext,
  getCurrentTenant,
  setTenantContext,
  bypassTenantIsolation,
};
