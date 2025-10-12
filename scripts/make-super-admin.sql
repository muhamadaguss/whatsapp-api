-- Make a user a super admin
-- Usage: Replace 'admin' with your username

-- Update user to be super admin
UPDATE users 
SET 
  "isSuperAdmin" = true,
  "organizationId" = NULL,  -- Super admins don't need organization
  "roleInOrg" = NULL         -- Super admins don't have org role
WHERE username = 'admin';

-- Verify the change
SELECT 
  id,
  username,
  role,
  "isSuperAdmin",
  "organizationId",
  "roleInOrg",
  "isActive"
FROM users
WHERE "isSuperAdmin" = true;

-- Expected result:
-- ✅ isSuperAdmin should be: true
-- ✅ organizationId should be: NULL
-- ✅ roleInOrg should be: NULL
