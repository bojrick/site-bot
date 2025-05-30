# Activity Logging Error Fix - Documentation

## Problem Identified

The WhatsApp bot was encountering a PostgreSQL error (code 22P02 - "invalid input syntax for type") when employees tried to log activities. The error was occurring because:

1. **Site ID Type Mismatch**: The `employeeFlow.ts` was using hardcoded string IDs like `"site_1"`, `"site_2"`, but the database `site_id` column expected UUID values.

2. **Missing Site Records**: The sites referenced in the employee flow didn't exist in the database.

3. **Missing Foreign Key Constraints**: The schema didn't have proper foreign key relationships between activities/material_requests and sites.

## Solutions Implemented

### 1. Created Site Records

- **File**: `scripts/populateSites.ts`
- **Purpose**: Populate the sites table with actual records that correspond to the display IDs used in the employee flow
- **Fixed UUIDs**: 
  - `site_1`: `11111111-1111-1111-1111-111111111111`
  - `site_2`: `22222222-2222-2222-2222-222222222222`
  - `site_3`: `33333333-3333-3333-3333-333333333333`

```bash
npm run populate-sites
```

### 2. Updated Employee Flow

- **File**: `src/services/flows/employeeFlow.ts`
- **Changes**:
  - Added `getSiteUUID()` helper method to map display IDs to actual UUIDs
  - Updated `completeActivityLog()` to use `this.getSiteUUID(activityData.site_id)`
  - Updated `completeMaterialRequest()` to use `this.getSiteUUID(requestData.site_id)`

### 3. Enhanced Database Schema

- **File**: `src/db/schema.ts`
- **Changes**:
  - Added proper foreign key constraints for `site_id` fields in both `activities` and `material_requests` tables
  - Moved `sites` table definition before dependent tables to avoid forward reference issues
  - Added `Site` and `NewSite` TypeScript types

### 4. Added Testing Infrastructure

- **File**: `scripts/testActivity.ts`
- **Purpose**: Test activity logging functionality to ensure it works with the updated schema

```bash
npm run test-activity
```

## Database Schema Updates

The following foreign key constraints were added:

```typescript
// In activities table
site_id: uuid("site_id").references(() => sites.id)

// In material_requests table  
site_id: uuid("site_id").references(() => sites.id)
```

## Site Data Structure

Each site now includes:

```typescript
{
  id: string,           // Fixed UUID
  name: string,         // Gujarati display name
  location: string,     // Location description
  status: 'active',     // Site status
  details: {
    project_type: string,    // Type of project
    display_id: string,      // Original string ID for mapping
    description: string      // Project description
  }
}
```

## New NPM Scripts Added

```json
{
  "populate-sites": "ts-node scripts/populateSites.ts",
  "test-activity": "ts-node scripts/testActivity.ts"
}
```

## Verification Steps

1. **Sites Populated**: ✅ 3 sites created with proper UUIDs
2. **Schema Updated**: ✅ Foreign key constraints added
3. **Activity Logging**: ✅ Test passed successfully
4. **Employee Flow**: ✅ Updated to use correct UUID mapping

## Error Resolution

The original error:
```
PostgreSQL error code '22P02' - invalid input syntax for type
```

Was caused by trying to insert string values like `"site_1"` into UUID columns. This is now resolved by:

1. Creating actual site records with proper UUIDs
2. Mapping display IDs to UUIDs in the employee flow
3. Adding proper foreign key constraints for data integrity

## Testing

The system has been tested and verified:

- ✅ Activity logging works without errors
- ✅ Material requests work without errors  
- ✅ Site mapping functions correctly
- ✅ Foreign key constraints prevent invalid data

## Future Recommendations

1. Consider adding data validation middleware
2. Implement proper error handling for missing sites
3. Add logging for debugging purposes
4. Consider using enum types for activity_type and urgency fields 