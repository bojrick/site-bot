import { getDb } from '../../../../db';
import { sites as sitesTable, users, user_site_assignments, sessions } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { whatsappService } from '../../../whatsapp';
import { SessionManager } from '../shared/SessionManager';

export interface SiteInfo {
  id: string;
  name: string;
  location?: string;
  description?: string;
  display_id: string;
  role?: string;
  permissions?: string[];
}

export interface UserSiteAccess {
  site: SiteInfo;
  role: string;
  permissions: string[];
  status: string;
}

export class SiteContextService {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * Get sites available to a user based on their role and assignments
   */
  async getUserSites(user: any): Promise<SiteInfo[]> {
    try {
      // Admins get all active sites
      if (user.role === 'admin') {
        return await this.getAllActiveSites();
      }

      // Employees get assigned sites
      return await this.getEmployeeAssignedSites(user);
    } catch (error) {
      console.error('Error getting user sites:', error);
      return [];
    }
  }

  /**
   * Get detailed user site access including roles and permissions
   */
  async getUserSiteAccess(user: any): Promise<UserSiteAccess[]> {
    try {
      if (user.role === 'admin') {
        const sites = await this.getAllActiveSites();
        return sites.map(site => ({
          site,
          role: 'admin',
          permissions: ['all'],
          status: 'active'
        }));
      }

      return await this.getEmployeeDetailedAccess(user);
    } catch (error) {
      console.error('Error getting user site access:', error);
      return [];
    }
  }

  /**
   * Check if user has access to a specific site
   */
  async hasAccessToSite(userId: string, siteId: string, permission?: string): Promise<boolean> {
    try {
      // Check if user is admin
      const user = await getDb()
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length > 0 && user[0].role === 'admin') {
        return true;
      }

      // Check user site assignments
      const assignments = await getDb()
        .select()
        .from(user_site_assignments)
        .where(and(
          eq(user_site_assignments.user_id, userId),
          eq(user_site_assignments.site_id, siteId),
          eq(user_site_assignments.status, 'active')
        ));

      if (assignments.length === 0) {
        return false;
      }

      // Check specific permission if provided
      if (permission) {
        const assignment = assignments[0];
        const permissions = assignment.permissions as string[] || [];
        return permissions.includes(permission) || permissions.includes('all');
      }

      return true;
    } catch (error) {
      console.error('Error checking site access:', error);
      return false;
    }
  }

  /**
   * Handle site selection flow for an employee
   */
  async handleSiteSelection(user: any, phone: string, messageText: string): Promise<boolean> {
    try {
      const session = await this.sessionManager.getSession(phone);
      const isFirstTime = !session?.data.site_selection_shown;

      // Show sites if first time
      if (isFirstTime) {
        await this.showSiteSelection(user, phone);
        await this.sessionManager.updateSession(phone, {
          data: { site_selection_shown: true }
        });
        return true;
      }

      // Handle site selection response
      if (messageText.startsWith('site_') || this.isValidUUID(messageText)) {
        const selectedSite = await this.validateAndSelectSite(user, phone, messageText);
        if (selectedSite) {
          await this.sessionManager.setSiteContext(phone, selectedSite.id, selectedSite.name);
          await this.sendSiteSelectedConfirmation(phone, selectedSite);
          return false; // Site selection complete
        }
      }

      // Invalid selection
      await whatsappService.sendTextMessage(phone, "કૃપા કરીને યાદીમાંથી યોગ્ય સાઈટ પસંદ કરો:");
      await this.showSiteSelection(user, phone);
      return true;
    } catch (error) {
      console.error('Error handling site selection:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ સાઈટ પસંદ કરવામાં ભૂલ. કૃપા કરીને ફરીથી પ્રયાસ કરો."
      );
      return true;
    }
  }

  /**
   * Show available sites to user
   */
  private async showSiteSelection(user: any, phone: string): Promise<void> {
    const userSites = await this.getUserSites(user);

    if (userSites.length === 0) {
      await whatsappService.sendTextMessage(phone, 
        "❌ તમને કોઈ સાઈટ સોંપવામાં આવી નથી. કૃપા કરીને એડમિનનો સંપર્ક કરો."
      );
      return;
    }

    // Auto-select if only one site
    if (userSites.length === 1) {
      const site = userSites[0];
      await this.sessionManager.setSiteContext(phone, site.id, site.name);
      await whatsappService.sendTextMessage(phone, 
        `✅ તમને ${site.name} માટે સ્વચાલિત રીતે સોંપવામાં આવ્યા છો.`
      );
      return;
    }

    // Show multiple sites for selection
    const siteOptions = userSites.map(site => ({
      id: site.id,
      title: `🏗️ ${site.name}`,
      description: site.location || site.description || 'સાઈટ વિગત'
    }));

    const message = user.role === 'admin' 
      ? "કયા સાઈટ પર કામ કરવા માંગો છો?"
      : "તમને સોંપેલી સાઈટ્સમાંથી પસંદ કરો:";

    await whatsappService.sendListMessage(
      phone,
      message,
      "સાઈટ પસંદ કરો",
      [{
        title: "ઉપલબ્ધ સાઈટ્સ",
        rows: siteOptions
      }]
    );
  }

  /**
   * Validate and select a site
   */
  private async validateAndSelectSite(user: any, phone: string, selection: string): Promise<SiteInfo | null> {
    try {
      const userSites = await this.getUserSites(user);
      
      // Find selected site
      let selectedSite: SiteInfo | undefined;
      
      // Handle legacy site_ format
      if (selection.startsWith('site_')) {
        const displayId = selection.replace('site_', '');
        selectedSite = userSites.find(site => 
          site.display_id === displayId || 
          site.id.startsWith(displayId)
        );
      } else {
        // Handle UUID format
        selectedSite = userSites.find(site => site.id === selection);
      }

      if (!selectedSite) {
        console.log('Site not found in user sites:', selection, 'Available:', userSites.map(s => s.id));
        return null;
      }

      return selectedSite;
    } catch (error) {
      console.error('Error validating site selection:', error);
      return null;
    }
  }

  /**
   * Send confirmation message when site is selected
   */
  private async sendSiteSelectedConfirmation(phone: string, site: SiteInfo): Promise<void> {
    const message = `✅ *સાઈટ પસંદ કરાઈ*

🏗️ **${site.name}**
📍 સ્થાન: ${site.location || 'માહિતી ઉપલબ્ધ નથી'}

તમે હવે આ સાઈટ માટે કામ કરી શકો છો. મુખ્ય મેનુ લોડ કરી રહ્યા છીએ...`;

    await whatsappService.sendTextMessage(phone, message);
  }

  /**
   * Get employee's assigned sites (Updated to use user_site_assignments table)
   */
  private async getEmployeeAssignedSites(user: any): Promise<SiteInfo[]> {
    try {
      const assignments = await getDb()
        .select({
          site: sitesTable,
          assignment: user_site_assignments
        })
        .from(user_site_assignments)
        .innerJoin(sitesTable, eq(user_site_assignments.site_id, sitesTable.id))
        .where(and(
          eq(user_site_assignments.user_id, user.id),
          eq(user_site_assignments.status, 'active'),
          eq(sitesTable.status, 'active')
        ));

      return assignments.map(({ site, assignment }) => ({
        ...this.mapToSiteInfo(site),
        role: assignment.role,
        permissions: assignment.permissions as string[] || []
      }));
    } catch (error) {
      console.error('Error getting employee assigned sites:', error);
      return [];
    }
  }

  /**
   * Get detailed employee site access with roles and permissions
   */
  private async getEmployeeDetailedAccess(user: any): Promise<UserSiteAccess[]> {
    try {
      const assignments = await getDb()
        .select({
          site: sitesTable,
          assignment: user_site_assignments
        })
        .from(user_site_assignments)
        .innerJoin(sitesTable, eq(user_site_assignments.site_id, sitesTable.id))
        .where(and(
          eq(user_site_assignments.user_id, user.id),
          eq(user_site_assignments.status, 'active'),
          eq(sitesTable.status, 'active')
        ));

      return assignments.map(({ site, assignment }) => ({
        site: {
          ...this.mapToSiteInfo(site),
          role: assignment.role,
          permissions: assignment.permissions as string[] || []
        },
        role: assignment.role,
        permissions: assignment.permissions as string[] || [],
        status: assignment.status
      }));
    } catch (error) {
      console.error('Error getting employee detailed access:', error);
      return [];
    }
  }

  /**
   * Assign user to site with specific role and permissions
   */
  async assignUserToSite(
    userId: string, 
    siteId: string, 
    role: 'manager' | 'supervisor' | 'worker' | 'admin' = 'worker', 
    permissions: string[] = ['activity_logging', 'material_request'], 
    assignedBy: string,
    notes?: string
  ): Promise<boolean> {
    try {
      // Check if assignment already exists
      const existingAssignment = await getDb()
        .select()
        .from(user_site_assignments)
        .where(and(
          eq(user_site_assignments.user_id, userId),
          eq(user_site_assignments.site_id, siteId)
        ))
        .limit(1);

      if (existingAssignment.length > 0) {
        // Update existing assignment
        await getDb()
          .update(user_site_assignments)
          .set({
            role: role as 'manager' | 'supervisor' | 'worker' | 'admin',
            permissions,
            status: 'active' as 'active' | 'inactive' | 'suspended',
            assigned_by: assignedBy,
            notes,
            updated_at: new Date()
          })
          .where(eq(user_site_assignments.id, existingAssignment[0].id));
      } else {
        // Create new assignment
        await getDb()
          .insert(user_site_assignments)
          .values({
            user_id: userId,
            site_id: siteId,
            role: role as 'manager' | 'supervisor' | 'worker' | 'admin',
            permissions,
            status: 'active' as 'active' | 'inactive' | 'suspended',
            assigned_by: assignedBy,
            notes
          });
      }

      return true;
    } catch (error) {
      console.error('Error assigning user to site:', error);
      return false;
    }
  }

  /**
   * Remove user from site or deactivate assignment
   */
  async removeUserFromSite(userId: string, siteId: string): Promise<boolean> {
    try {
      await getDb()
        .update(user_site_assignments)
        .set({
          status: 'inactive' as 'active' | 'inactive' | 'suspended',
          updated_at: new Date()
        })
        .where(and(
          eq(user_site_assignments.user_id, userId),
          eq(user_site_assignments.site_id, siteId)
        ));

      return true;
    } catch (error) {
      console.error('Error removing user from site:', error);
      return false;
    }
  }

  /**
   * Get all users assigned to a site
   */
  async getSiteUsers(siteId: string): Promise<Array<{user: any, assignment: any}>> {
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

      return assignments;
    } catch (error) {
      console.error('Error getting site users:', error);
      return [];
    }
  }

  /**
   * Get all active sites (for admins)
   */
  private async getAllActiveSites(): Promise<SiteInfo[]> {
    try {
      const activeSites = await getDb()
        .select()
        .from(sitesTable)
        .where(eq(sitesTable.status, 'active'));

      return activeSites.map(site => this.mapToSiteInfo(site));
    } catch (error) {
      console.error('Error getting all active sites:', error);
      return [];
    }
  }

  /**
   * Map database site to SiteInfo
   */
  private mapToSiteInfo(site: any): SiteInfo {
    const siteDetails = site.details as any;
    return {
      id: site.id,
      name: site.name,
      location: site.location,
      description: siteDetails?.description,
      display_id: siteDetails?.display_id || site.id.slice(0, 8)
    };
  }

  /**
   * Check if string is a valid UUID
   */
  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Get current site context for a user
   */
  async getCurrentSiteContext(phone: string): Promise<{ siteId: string; siteName: string } | null> {
    try {
      // First check if this is admin impersonation by looking at database session
      const dbSession = await getDb()
        .select()
        .from(sessions)
        .where(eq(sessions.phone, phone))
        .limit(1);

      const dbSessionData = dbSession[0];
      
      if (dbSessionData?.data && typeof dbSessionData.data === 'object') {
        const sessionData: any = dbSessionData.data;
        
        // Check for admin impersonation
        if (sessionData.is_admin_impersonation && sessionData.selected_site) {
          console.log('👷‍♂️ [SITE-CONTEXT] Getting site context for admin impersonation:', sessionData.selected_site);
          
          // Get site name from database
          const siteName = await this.getSiteName(sessionData.selected_site);
          return {
            siteId: sessionData.selected_site,
            siteName: siteName
          };
        }
      }

      // Fall back to regular employee session in SessionManager
      const session = await this.sessionManager.getSession(phone);
      if (session?.data.selected_site_id && session?.data.selected_site_name) {
        console.log('👷‍♂️ [SITE-CONTEXT] Getting site context from SessionManager:', session.data.selected_site_id);
        return {
          siteId: session.data.selected_site_id,
          siteName: session.data.selected_site_name
        };
      }
      
      console.log('👷‍♂️ [SITE-CONTEXT] No site context found for phone:', phone);
      return null;
    } catch (error) {
      console.error('Error getting current site context:', error);
      return null;
    }
  }

  /**
   * Set site context directly (for admin impersonation)
   */
  async setSiteContext(phone: string, siteId: string, siteName?: string): Promise<void> {
    try {
      // For regular employee flows, use SessionManager
      const actualSiteName = siteName || await this.getSiteName(siteId);
      await this.sessionManager.setSiteContext(phone, siteId, actualSiteName);
      
      console.log(`[SITE-CONTEXT] Set site context for ${phone}: ${actualSiteName} (${siteId})`);
    } catch (error) {
      console.error('Error setting site context:', error);
    }
  }

  /**
   * Get site name by ID
   */
  private async getSiteName(siteId: string): Promise<string> {
    try {
      const site = await getDb()
        .select()
        .from(sitesTable)
        .where(eq(sitesTable.id, siteId))
        .limit(1);
      
      return site[0]?.name || 'Unknown Site';
    } catch (error) {
      console.error('Error getting site name:', error);
      return 'Unknown Site';
    }
  }

  /**
   * Check if user needs site selection
   */
  async needsSiteSelection(user: any, phone: string, session?: any): Promise<boolean> {
    try {
      // If session is passed directly (admin impersonation), use it
      if (session?.data?.is_admin_impersonation) {
        console.log('👷‍♂️ [SITE-CONTEXT] Admin impersonation - site already selected:', !!session.data.selected_site);
        return !session.data.selected_site;
      }

      // Regular employee flow - use SessionManager
      const employeeSession = await this.sessionManager.getSession(phone);
      
      // Check if site is already selected
      return !employeeSession?.data.selected_site_id;
    } catch (error) {
      console.error('Error checking site selection need:', error);
      return true;
    }
  }
} 