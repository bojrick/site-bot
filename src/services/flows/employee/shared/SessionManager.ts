interface SessionUpdateData {
  step?: string;
  data?: Partial<EmployeeSessionData>;
}

export interface EmployeeSessionData {
  // Common session data
  selected_site_id?: string;
  selected_site_name?: string;
  site_selection_shown?: boolean;
  is_admin_impersonation?: boolean;
  
  // Activity logging specific data
  activity_category?: string;
  activity_subtype?: string;
  predefined_description?: string;
  hours?: number;
  user_comments?: string;
  upload_retry_count?: number;
  image_info?: {
    url: string;
    key: string;
    caption?: string;
    whatsapp_media_id: string;
    mime_type?: string;
    sha256?: string;
  };
  
  // Inventory management specific data
  operation?: string; // 'item_in', 'item_out', 'new_item', 'stock_report'
  category?: string;
  selected_item?: any;
  available_items?: any[];
  quantity?: number;
  notes?: string;
  
  // Material request specific data
  material_type?: string;
  rmc_config?: any;
  steel_config?: any;
  aac_block_config?: any;
  other_material_config?: any;
  delivery_location?: string;
  priority?: string;
  special_instructions?: string;
  
  // General purpose data
  [key: string]: any;
}

export interface EmployeeSession {
  phone: string;
  intent: string;
  step: string;
  data: EmployeeSessionData;
  created_at: Date;
  updated_at: Date;
}

export class SessionManager {
  private sessions: Map<string, EmployeeSession> = new Map();
  private readonly SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Clean up expired sessions every hour
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  /**
   * Start a new flow session
   */
  async startFlow(phone: string, intent: string, step: string): Promise<void> {
    console.log(`[SESSION-MANAGER] Starting flow: ${intent} for ${phone}`);
    
    const existingSession = this.sessions.get(phone);
    const existingSiteContext = existingSession?.data ? {
      selected_site_id: existingSession.data.selected_site_id,
      selected_site_name: existingSession.data.selected_site_name,
      site_selection_shown: existingSession.data.site_selection_shown,
      is_admin_impersonation: existingSession.data.is_admin_impersonation
    } : {};

    const session: EmployeeSession = {
      phone,
      intent,
      step,
      data: existingSiteContext,
      created_at: new Date(),
      updated_at: new Date()
    };

    this.sessions.set(phone, session);
  }

  /**
   * Get current session for a phone number
   */
  async getSession(phone: string): Promise<EmployeeSession | null> {
    const session = this.sessions.get(phone);
    
    if (!session) {
      return null;
    }

    // Check if session is expired
    const now = new Date().getTime();
    const sessionTime = session.updated_at.getTime();
    
    if (now - sessionTime > this.SESSION_TIMEOUT_MS) {
      console.log(`[SESSION-MANAGER] Session expired for ${phone}`);
      this.sessions.delete(phone);
      return null;
    }

    return session;
  }

  /**
   * Update session data
   */
  async updateSession(phone: string, updates: SessionUpdateData): Promise<void> {
    const session = await this.getSession(phone);
    
    if (!session) {
      console.error(`[SESSION-MANAGER] No session found for ${phone} when trying to update`);
      return;
    }

    // Update step if provided
    if (updates.step) {
      session.step = updates.step;
    }

    // Merge data if provided
    if (updates.data) {
      session.data = {
        ...session.data,
        ...updates.data
      };
    }

    session.updated_at = new Date();
    this.sessions.set(phone, session);
    
    console.log(`[SESSION-MANAGER] Updated session for ${phone}: step=${session.step}`);
  }

  /**
   * Set site context in session
   */
  async setSiteContext(phone: string, siteId: string, siteName: string): Promise<void> {
    await this.updateSession(phone, {
      data: {
        selected_site_id: siteId,
        selected_site_name: siteName
      }
    });
    
    console.log(`[SESSION-MANAGER] Set site context for ${phone}: ${siteName} (${siteId})`);
  }

  /**
   * Clear flow data but optionally keep site context
   */
  async clearFlowData(phone: string, keepSiteContext: boolean = false): Promise<void> {
    const session = await this.getSession(phone);
    
    if (!session) {
      return;
    }

    if (keepSiteContext) {
      // Preserve only site context data
      const siteContext = {
        selected_site_id: session.data.selected_site_id,
        selected_site_name: session.data.selected_site_name,
        site_selection_shown: session.data.site_selection_shown,
        is_admin_impersonation: session.data.is_admin_impersonation
      };
      
      session.data = siteContext;
    } else {
      // Clear all data
      session.data = {};
    }

    session.step = '';
    session.intent = '';
    session.updated_at = new Date();
    
    this.sessions.set(phone, session);
    console.log(`[SESSION-MANAGER] Cleared flow data for ${phone}, kept site context: ${keepSiteContext}`);
  }

  /**
   * Check if user has an active session
   */
  async hasActiveSession(phone: string): Promise<boolean> {
    const session = await this.getSession(phone);
    return session !== null && session.intent !== '';
  }

  /**
   * Get session data for a specific key
   */
  async getSessionData<T>(phone: string, key: string): Promise<T | undefined> {
    const session = await this.getSession(phone);
    return session?.data[key] as T;
  }

  /**
   * Set session data for a specific key
   */
  async setSessionData(phone: string, key: string, value: any): Promise<void> {
    await this.updateSession(phone, {
      data: { [key]: value }
    });
  }

  /**
   * Destroy session completely
   */
  async destroySession(phone: string): Promise<void> {
    this.sessions.delete(phone);
    console.log(`[SESSION-MANAGER] Destroyed session for ${phone}`);
  }

  /**
   * Get all active sessions (for admin/debug purposes)
   */
  async getAllActiveSessions(): Promise<EmployeeSession[]> {
    return Array.from(this.sessions.values())
      .filter(session => {
        const now = new Date().getTime();
        const sessionTime = session.updated_at.getTime();
        return now - sessionTime <= this.SESSION_TIMEOUT_MS;
      });
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date().getTime();
    let cleanedCount = 0;

    // Use Array.from to convert Map entries to array for compatibility
    const sessionEntries = Array.from(this.sessions.entries());
    for (const [phone, session] of sessionEntries) {
      const sessionTime = session.updated_at.getTime();
      
      if (now - sessionTime > this.SESSION_TIMEOUT_MS) {
        this.sessions.delete(phone);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[SESSION-MANAGER] Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    sessionsByIntent: { [intent: string]: number };
  }> {
    const activeSessions = await this.getAllActiveSessions();
    const sessionsByIntent: { [intent: string]: number } = {};

    activeSessions.forEach(session => {
      if (session.intent) {
        sessionsByIntent[session.intent] = (sessionsByIntent[session.intent] || 0) + 1;
      }
    });

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      sessionsByIntent
    };
  }
} 