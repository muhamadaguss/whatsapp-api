// /controllers/auth.controller.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const UserModel = require("../models/userModel");
const BlacklistedToken = require("../models/blacklistedTokenModel");
const Organization = require("../models/organizationModel");
const organizationService = require("../services/organizationService");
const { asyncHandler, AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");

const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const user = await UserModel.findOne({
    where: { username },
    include: [
      {
        model: Organization,
        as: "organization",
        attributes: ["id", "name", "slug", "subscriptionPlan", "subscriptionStatus"],
      },
    ],
  });

  if (!user || !bcrypt.compareSync(password, user.password)) {
    throw new AppError("Invalid credentials", 401);
  }

  if (!user.isActive) {
    throw new AppError("User is inactive", 401);
  }

  // Check if user has an organization
  if (!user.organizationId) {
    throw new AppError(
      "User is not associated with any organization. Please contact support.",
      403
    );
  }

  // Check if organization is active
  if (user.organization && user.organization.subscriptionStatus === "suspended") {
    throw new AppError(
      "Your organization has been suspended. Please contact support.",
      403
    );
  }

  // Enhanced JWT generation with organization context
  const tokenPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    organizationId: user.organizationId,
    roleInOrg: user.roleInOrg || "member",
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomBytes(16).toString("hex"), // JWT ID for tracking
  };

  const tokenOptions = {
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
    algorithm: "HS256",
  };

  const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, tokenOptions);

  // Log successful login
  logger.info(
    {
      userId: user.id,
      username: user.username,
      organizationId: user.organizationId,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    },
    "User logged in successfully"
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      organizationId: user.organizationId,
      roleInOrg: user.roleInOrg || "member",
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
            slug: user.organization.slug,
            subscriptionPlan: user.organization.subscriptionPlan,
            subscriptionStatus: user.organization.subscriptionStatus,
          }
        : null,
    },
    expiresIn: tokenOptions.expiresIn,
  });
});

const register = asyncHandler(async (req, res) => {
  const {
    username,
    password,
    role,
    organizationName,
    organizationSlug,
    email,
  } = req.body;

  if (!username || !password || !role) {
    throw new AppError(
      "Username, password, and role are required fields.",
      400
    );
  }

  // Check if user already exists
  const existingUser = await UserModel.findOne({ where: { username } });
  if (existingUser) {
    throw new AppError("Username already exists", 400);
  }

  const hashed = bcrypt.hashSync(password, 10);

  // Create user first without organization
  const user = await UserModel.create({
    username,
    password: hashed,
    role,
    isActive: true,
  });

  // If organization details provided, create organization
  let organization = null;
  if (organizationName) {
    try {
      organization = await organizationService.createOrganization(
        {
          name: organizationName,
          slug: organizationSlug,
          email: email || `${username}@example.com`,
        },
        user.id
      );

      // Update user with organization
      await user.update({
        organizationId: organization.id,
        roleInOrg: "owner",
      });

      logger.info(
        {
          userId: user.id,
          organizationId: organization.id,
        },
        "User registered with new organization"
      );
    } catch (orgError) {
      // If organization creation fails, delete the user
      await user.destroy();
      throw new AppError(
        `Failed to create organization: ${orgError.message}`,
        400
      );
    }
  }

  res.status(201).json({
    success: true,
    message: "User registered successfully",
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      organizationId: user.organizationId,
      roleInOrg: user.roleInOrg,
    },
    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          subscriptionPlan: organization.subscriptionPlan,
        }
      : null,
  });
});

const verify = (req, res) => {
  res.json({ valid: true, user: req.user });
};

const hashPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    throw new AppError("Password is required", 400);
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  return res.status(200).json({ hashedPassword });
});

const logout = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    throw new AppError("No token provided", 400);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Hash token before storing in blacklist for security
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Add to blacklist
    await BlacklistedToken.create({
      token: tokenHash,
      expiresAt: new Date(decoded.exp * 1000),
    });

    // Log successful logout
    logger.info(
      {
        userId: decoded.id,
        username: decoded.username,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      },
      "User logged out successfully"
    );

    return res.status(200).json({
      status: "success",
      message: "Logout successful, token blacklisted",
    });
  } catch (err) {
    // If token expired, still add to blacklist for safety
    if (err.name === "TokenExpiredError") {
      try {
        const decoded = jwt.decode(token, { complete: true });
        if (decoded && decoded.payload) {
          const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");
          await BlacklistedToken.create({
            token: tokenHash,
            expiresAt: new Date(decoded.payload.exp * 1000),
          });

          logger.info(
            {
              userId: decoded.payload.id,
              ip: req.ip,
            },
            "Expired token blacklisted during logout"
          );
        }
        return res.status(200).json({
          status: "success",
          message: "Token expired, but blacklisted for safety",
        });
      } catch (decodeErr) {
        logger.error("Error decoding token during logout:", decodeErr);
        throw new AppError("Token expired and invalid format", 400);
      }
    }

    logger.warn(
      {
        ip: req.ip,
        error: err.message,
      },
      "Invalid token during logout"
    );
    throw new AppError("Invalid token", 401);
  }
});

module.exports = {
  login,
  register,
  verify,
  hashPassword,
  logout,
};
