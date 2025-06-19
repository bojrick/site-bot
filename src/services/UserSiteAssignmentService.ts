import { getDb } from '../db';
import { users, sites, user_site_assignments, type UserSiteAssignment, type NewUserSiteAssignment } from '../db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

export interface AssignmentRequest {
  userId: string;
  siteId: string;
  role: 'manager' | 'supervisor' | 'worker' | 'admin';
  permissions: string[];
  notes?: string;
}

export interface BulkAssignmentRequest {
  userIds: string[];
  siteId: string;
  role: 'manager' | 'supervisor' | 'worker' | 'admin';
  permissions: string[];
  notes?: string;
}

export interface AssignmentSummary {
  user: {
    id: string;
    name: string;
    phone: string;
    role: string;
  };
  sites: Array<{
    site: {
      id: string;
      name: string;
      location: string;
      status: string;
    };
    assignment: {
      role: string;
      permissions: string[];
      status: string;
      assigned_date: Date;
    };
  }>;
}

export class UserSiteAssignmentService {
  
  /**
   * Assign a user to a site with specific role and permissions
   */
  async assignUserToSite(request: AssignmentRequest, assignedBy: string): Promise<{ success: boolean; message: string }> {
    try {
      // Validate user exists
      const user = await getDb()
        .select()
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);

      if (user.length === 0) {
        return { success: false, message: 'User not found' };
      }

      // Validate site exists
      const site = await getDb()
        .select()
        .from(sites)
        .where(eq(sites.id, request.siteId))
        .limit(1);

      if (site.length === 0) {
        return { success: false, message: 'Site not found' };
      }

      // Check if assignment already exists
      const existingAssignment = await getDb()
        .select()
        .from(user_site_assignments)
        .where(and(
          eq(user_site_assignments.user_id, request.userId),
          eq(user_site_assignments.site_id, request.siteId)
        ))
        .limit(1);

      if (existingAssignment.length > 0) {
        // Update existing assignment
        await getDb()
          .update(user_site_assignments)
          .set({
            role: request.role,
            permissions: request.permissions,
            status: 'active',
            assigned_by: assignedBy,
            notes: request.notes,
            updated_at: new Date()
          })
          .where(eq(user_site_assignments.id, existingAssignment[0].id));

        return { success: true, message: 'User assignment updated successfully' };
      } else {
        // Create new assignment
        await getDb()
          .insert(user_site_assignments)
          .values({
            user_id: request.userId,
            site_id: request.siteId,
            role: request.role,
            permissions: request.permissions,
            status: 'active',
            assigned_by: assignedBy,
            notes: request.notes
          });

        return { success: true, message: 'User assigned to site successfully' };
      }
    } catch (error) {
      console.error('Error assigning user to site:', error);
      return { success: false, message: 'Failed to assign user to site' };
    }
  }

  /**
   * Bulk assign multiple users to a site
   */
  async bulkAssignUsersToSite(request: BulkAssignmentRequest, assignedBy: string): Promise<{
    success: boolean;
    successCount: number;
    failureCount: number;
    details: Array<{ userId: string; success: boolean; message: string }>;
  }> {
    const results = {
      success: true,
      successCount: 0,
      failureCount: 0,
      details: [] as Array<{ userId: string; success: boolean; message: string }>
    };

    for (const userId of request.userIds) {
      const result = await this.assignUserToSite({
        userId,
        siteId: request.siteId,
        role: request.role,
        permissions: request.permissions,
        notes: request.notes
      }, assignedBy);

      results.details.push({
        userId,
        success: result.success,
        message: result.message
      });

      if (result.success) {
        results.successCount++;
      } else {
        results.failureCount++;
        results.success = false;
      }
    }

    return results;
  }

  /**
   * Remove user from site (deactivate assignment)
   */
  async removeUserFromSite(userId: string, siteId: string): Promise<{ success: boolean; message: string }> {
    try {
      const result = await getDb()
        .update(user_site_assignments)
        .set({
          status: 'inactive',
          updated_at: new Date()
        })
        .where(and(
          eq(user_site_assignments.user_id, userId),
          eq(user_site_assignments.site_id, siteId)
        ));

      return { success: true, message: 'User removed from site successfully' };
    } catch (error) {
      console.error('Error removing user from site:', error);
      return { success: false, message: 'Failed to remove user from site' };
    }
  }

  /**
   * Update user permissions for a site
   */
  async updateUserPermissions(userId: string, siteId: string, permissions: string[], updatedBy: string): Promise<{ success: boolean; message: string }> {
    try {
      await getDb()
        .update(user_site_assignments)
        .set({
          permissions,
          assigned_by: updatedBy,
          updated_at: new Date()
        })
        .where(and(
          eq(user_site_assignments.user_id, userId),
          eq(user_site_assignments.site_id, siteId),
          eq(user_site_assignments.status, 'active')
        ));

      return { success: true, message: 'User permissions updated successfully' };
    } catch (error) {
      console.error('Error updating user permissions:', error);
      return { success: false, message: 'Failed to update user permissions' };
    }
  }

  /**
   * Get all assignments for a user
   */
  async getUserAssignments(userId: string): Promise<AssignmentSummary | null> {
    try {
      const user = await getDb()
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        return null;
      }

      const assignments = await getDb()
        .select({
          site: sites,
          assignment: user_site_assignments
        })
        .from(user_site_assignments)
        .innerJoin(sites, eq(user_site_assignments.site_id, sites.id))
        .where(and(
          eq(user_site_assignments.user_id, userId),
          eq(user_site_assignments.status, 'active')
        ));

      return {
        user: {
          id: user[0].id,
          name: user[0].name || '',
          phone: user[0].phone,
          role: user[0].role
        },
        sites: assignments.map(({ site, assignment }) => ({
          site: {
            id: site.id,
            name: site.name,
            location: site.location || '',
            status: site.status || 'planning'
          },
          assignment: {
            role: assignment.role,
            permissions: assignment.permissions as string[] || [],
            status: assignment.status,
            assigned_date: assignment.assigned_date || new Date()
          }
        }))
      };
    } catch (error) {
      console.error('Error getting user assignments:', error);
      return null;
    }
  }

  /**
   * Get all users assigned to a site
   */
  async getSiteAssignments(siteId: string): Promise<Array<{
    user: {
      id: string;
      name: string;
      phone: string;
      role: string;
    };
    assignment: {
      role: string;
      permissions: string[];
      status: string;
      assigned_date: Date;
    };
  }>> {
    try {
      const assignments = await getDb()
        .select({
          user: users,
          assignment: user_site_assignments
        })
        .from(user_site_assignments)
        .innerJoin(users, eq(user_site_assignments.user_id, users.id))
        .where(and(
          eq(user_site_assignments.site_id, siteId),
          eq(user_site_assignments.status, 'active')
        ));

      return assignments.map(({ user, assignment }) => ({
        user: {
          id: user.id,
          name: user.name || '',
          phone: user.phone,
          role: user.role
        },
        assignment: {
          role: assignment.role,
          permissions: assignment.permissions as string[] || [],
          status: assignment.status,
          assigned_date: assignment.assigned_date || new Date()
        }
      }));
    } catch (error) {
      console.error('Error getting site assignments:', error);
      return [];
    }
  }

  /**
   * Get assignment statistics
   */
  async getAssignmentStats(): Promise<{
    totalAssignments: number;
    activeAssignments: number;
    assignmentsByRole: Record<string, number>;
    assignmentsBySite: Array<{ siteName: string; userCount: number }>;
  }> {
    try {
      // Total assignments
      const totalResult = await getDb()
        .select({ count: sql<number>`count(*)` })
        .from(user_site_assignments);

      // Active assignments
      const activeResult = await getDb()
        .select({ count: sql<number>`count(*)` })
        .from(user_site_assignments)
        .where(eq(user_site_assignments.status, 'active'));

      // Assignments by role
      const roleResult = await getDb()
        .select({
          role: user_site_assignments.role,
          count: sql<number>`count(*)`
        })
        .from(user_site_assignments)
        .where(eq(user_site_assignments.status, 'active'))
        .groupBy(user_site_assignments.role);

      // Assignments by site
      const siteResult = await getDb()
        .select({
          siteName: sites.name,
          count: sql<number>`count(*)`
        })
        .from(user_site_assignments)
        .innerJoin(sites, eq(user_site_assignments.site_id, sites.id))
        .where(eq(user_site_assignments.status, 'active'))
        .groupBy(sites.name);

      return {
        totalAssignments: totalResult[0]?.count || 0,
        activeAssignments: activeResult[0]?.count || 0,
        assignmentsByRole: roleResult.reduce((acc, { role, count }) => {
          acc[role] = count;
          return acc;
        }, {} as Record<string, number>),
        assignmentsBySite: siteResult.map(({ siteName, count }) => ({
          siteName,
          userCount: count
        }))
      };
    } catch (error) {
      console.error('Error getting assignment stats:', error);
      return {
        totalAssignments: 0,
        activeAssignments: 0,
        assignmentsByRole: {},
        assignmentsBySite: []
      };
    }
  }

  /**
   * Check if user has specific permission on a site
   */
  async hasPermission(userId: string, siteId: string, permission: string): Promise<boolean> {
    try {
      const assignment = await getDb()
        .select()
        .from(user_site_assignments)
        .where(and(
          eq(user_site_assignments.user_id, userId),
          eq(user_site_assignments.site_id, siteId),
          eq(user_site_assignments.status, 'active')
        ))
        .limit(1);

      if (assignment.length === 0) {
        return false;
      }

      const permissions = assignment[0].permissions as string[] || [];
      return permissions.includes(permission) || permissions.includes('all');
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }
}

// Export singleton instance
export const userSiteAssignmentService = new UserSiteAssignmentService(); 