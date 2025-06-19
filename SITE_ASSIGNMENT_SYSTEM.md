# Site Assignment System Documentation

## 🏗️ Overview
The new site assignment system provides a flexible **many-to-many relationship** between users and sites, supporting multiple managers per site and role-based permissions.

## 📊 Database Architecture

### Core Tables

#### `user_site_assignments` (New Many-to-Many Table)
```sql
CREATE TABLE user_site_assignments (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  site_id UUID REFERENCES sites(id) NOT NULL,
  role TEXT DEFAULT 'worker' NOT NULL, -- 'manager', 'supervisor', 'worker', 'admin'
  permissions JSONB, -- ['activity_logging', 'material_request', 'inventory_read', 'inventory_write']
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  assigned_by UUID REFERENCES users(id),
  assigned_date TIMESTAMP DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `users` (Updated)
```sql
-- Added details field for additional metadata
ALTER TABLE users ADD COLUMN details JSONB;
```

#### `sites` (Updated)
```sql
-- Removed manager_id - now handled by user_site_assignments
-- Multiple managers per site now supported
```

## 🔄 Migration Changes

### What Was Changed:
1. **Removed** `sites.manager_id` (single manager limitation)
2. **Added** `users.details` field (JSONB for metadata)
3. **Created** `user_site_assignments` table (many-to-many relationships)
4. **Migrated** existing manager data to new assignment structure

### Data Migration:
- Existing site managers were automatically migrated to `user_site_assignments` with role='manager'
- No data loss for active assignments

## 🎯 Site Assignment Flow

### 1. Single Site Assignment
```typescript
// User has only one site assigned
if (userSites.length === 1) {
  // Auto-select the site
  await sessionManager.setSiteContext(phone, site.id, site.name);
  // Continue with employee flow
}
```

### 2. Multiple Sites Assignment
```typescript
// User has multiple sites assigned
if (userSites.length > 1) {
  // Show site selection menu
  await whatsappService.sendListMessage(phone, "Select your site:", options);
  // Wait for user selection
}
```

### 3. No Sites Assignment
```typescript
// User has no sites assigned
if (userSites.length === 0) {
  await whatsappService.sendTextMessage(phone, 
    "❌ તમને કોઈ સાઈટ સોંપવામાં આવી નથી. કૃપા કરીને એડમિનનો સંપર્ક કરો."
  );
}
```

### 4. Admin Mode
```typescript
// Admin gets access to all active sites
if (user.role === 'admin') {
  const allSites = await this.getAllActiveSites();
  // Show all sites for selection
}
```

## 🛠️ API Usage Examples

### Assign User to Site
```typescript
import { userSiteAssignmentService } from './services/UserSiteAssignmentService';

// Single assignment
const result = await userSiteAssignmentService.assignUserToSite({
  userId: 'user-uuid',
  siteId: 'site-uuid',
  role: 'manager',
  permissions: ['activity_logging', 'material_request', 'inventory_write'],
  notes: 'Site manager for construction phase'
}, 'admin-user-id');

console.log(result); // { success: true, message: 'User assigned to site successfully' }
```

### Bulk Assignment
```typescript
// Assign multiple users to one site
const bulkResult = await userSiteAssignmentService.bulkAssignUsersToSite({
  userIds: ['user1-uuid', 'user2-uuid', 'user3-uuid'],
  siteId: 'site-uuid',
  role: 'worker',
  permissions: ['activity_logging', 'material_request'],
  notes: 'Construction workers for Phase 1'
}, 'admin-user-id');

console.log(bulkResult);
// {
//   success: true,
//   successCount: 3,
//   failureCount: 0,
//   details: [...]
// }
```

### Check User Access
```typescript
// Check if user has access to site
const hasAccess = await siteContextService.hasAccessToSite(
  'user-uuid', 
  'site-uuid', 
  'inventory_write'
);

// Get user's site assignments
const userAssignments = await userSiteAssignmentService.getUserAssignments('user-uuid');
console.log(userAssignments);
// {
//   user: { id, name, phone, role },
//   sites: [
//     {
//       site: { id, name, location, status },
//       assignment: { role, permissions, status, assigned_date }
//     }
//   ]
// }
```

### Site Management
```typescript
// Get all users assigned to a site
const siteUsers = await userSiteAssignmentService.getSiteAssignments('site-uuid');

// Remove user from site
await userSiteAssignmentService.removeUserFromSite('user-uuid', 'site-uuid');

// Update permissions
await userSiteAssignmentService.updateUserPermissions(
  'user-uuid', 
  'site-uuid', 
  ['activity_logging', 'material_request', 'inventory_read'], 
  'admin-user-id'
);
```

## 🔐 Permission System

### Available Permissions:
- `activity_logging` - Log daily activities
- `material_request` - Request materials
- `inventory_read` - View inventory
- `inventory_write` - Manage inventory
- `invoice_tracking` - Track invoices
- `all` - Full access (admin level)

### Role Hierarchy:
1. **Admin** - Access to all sites and all permissions
2. **Manager** - Full control over assigned sites
3. **Supervisor** - Limited management capabilities
4. **Worker** - Basic operations only

## 📱 WhatsApp Flow Integration

### Updated SiteContextService
```typescript
// The service now uses user_site_assignments table
const userSites = await this.getEmployeeAssignedSites(user);

// Supports role-based access
const siteAccess = await this.getUserSiteAccess(user);

// Permission checking
const canManageInventory = await this.hasAccessToSite(
  user.id, 
  selectedSiteId, 
  'inventory_write'
);
```

## 📊 Analytics & Reporting

### Assignment Statistics
```typescript
const stats = await userSiteAssignmentService.getAssignmentStats();
console.log(stats);
// {
//   totalAssignments: 25,
//   activeAssignments: 23,
//   assignmentsByRole: {
//     'manager': 5,
//     'supervisor': 8,
//     'worker': 10
//   },
//   assignmentsBySite: [
//     { siteName: 'Construction Site A', userCount: 12 },
//     { siteName: 'Office Complex B', userCount: 11 }
//   ]
// }
```

## 🔧 Administrative Operations

### Bulk Operations
- Assign multiple users to a site
- Transfer users between sites
- Update permissions in bulk
- Deactivate assignments by role/site

### Audit Trail
- Track who assigned users
- Record assignment dates
- Maintain assignment history
- Notes for assignment context

## 🚀 Benefits of New System

### ✅ Advantages:
1. **Multiple Managers** - Sites can have multiple managers
2. **Flexible Permissions** - Fine-grained access control
3. **Scalable** - Easy to add new roles and permissions
4. **Audit Trail** - Complete assignment history
5. **Bulk Operations** - Efficient user management
6. **Role-Based Access** - Security through proper permissions

### 🔄 Migration Compatibility:
- Existing manager assignments preserved
- Backward compatible with current flows
- Gradual transition possible
- No service interruption

## 📋 Next Steps

1. **Update Admin Panel** - Add site assignment interface
2. **Employee Onboarding** - Streamline assignment process
3. **Permission Management** - Fine-tune access controls
4. **Analytics Dashboard** - Visualize assignment data
5. **Bulk Import** - CSV-based user assignments

---

## 🎯 Example Scenarios

### Scenario 1: Multiple Site Managers
```typescript
// Site A has 3 managers
await userSiteAssignmentService.assignUserToSite({
  userId: 'manager1-uuid',
  siteId: 'siteA-uuid',
  role: 'manager',
  permissions: ['all']
}, 'admin-uuid');

await userSiteAssignmentService.assignUserToSite({
  userId: 'manager2-uuid', 
  siteId: 'siteA-uuid',
  role: 'manager',
  permissions: ['all']
}, 'admin-uuid');
```

### Scenario 2: Cross-Site Workers
```typescript
// Worker assigned to multiple sites
await userSiteAssignmentService.assignUserToSite({
  userId: 'worker1-uuid',
  siteId: 'siteA-uuid', 
  role: 'worker',
  permissions: ['activity_logging', 'material_request']
}, 'admin-uuid');

await userSiteAssignmentService.assignUserToSite({
  userId: 'worker1-uuid',
  siteId: 'siteB-uuid',
  role: 'worker', 
  permissions: ['activity_logging']
}, 'admin-uuid');
```

This new system provides the flexibility and scalability needed for complex construction project management while maintaining simplicity in the user experience. 