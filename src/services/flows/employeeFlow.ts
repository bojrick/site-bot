import { getDb } from '../../db';
import { activities, material_requests, sessions, invoices, sites } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { whatsappService, ImageMessage } from '../whatsapp';
import { UserService } from '../userService';
import { r2Service } from '../cloudflareR2';
import process from 'process';

// Define session data interface
interface EmployeeSessionData {
  selected_site?: string;
  site_selection_shown?: boolean;
  site_id?: string;
  activity_type?: string;
  hours?: number;
  description?: string;
  image_info?: any;
  material_name?: string;
  quantity?: number;
  unit?: string;
  urgency?: string;
  company_name?: string;
  invoice_description?: string;
  invoice_date?: Date;
  amount?: number;
  upload_retry_count?: number; // Track retry attempts
  is_admin_impersonation?: boolean; // Track if this is admin impersonation
}

export class EmployeeFlow {
  private userService: UserService;
  private readonly MAX_UPLOAD_RETRIES = 2;
  private readonly UPLOAD_TIMEOUT_MS = 30000; // 30 seconds

  constructor() {
    this.userService = new UserService();
  }

  async handleMessage(
    user: any,
    session: any,
    messageText: string,
    interactiveData?: any,
    imageData?: ImageMessage
  ) {
    const phone = user.phone;
    const currentData = session.data as EmployeeSessionData;

    console.log('👷‍♂️ [EMPLOYEE] Employee flow called with:', {
      phone,
      messageText,
      sessionIntent: session.intent,
      sessionStep: session.step,
      selectedSite: currentData?.selected_site,
      isAdminImpersonation: currentData?.is_admin_impersonation
    });

    // Check if employee needs to be verified (only for real employees, not admin impersonation)
    if (!user.is_verified && user.role === 'employee' && !currentData?.is_admin_impersonation) {
      await this.handleEmployeeVerification(user, messageText);
      return;
    }

    // Check if site selection is needed for real employees
    if (!currentData?.selected_site && !currentData?.is_admin_impersonation) {
      await this.handleSiteSelectionForEmployee(user, session, messageText);
      return;
    }

    // For admin impersonation or real employees with site selected, proceed to flows
    if (session.intent) {
      await this.handleFlowStep(user, session, messageText, interactiveData, imageData);
    } else {
      // Show main menu if no active intent
      await this.handleMainMenu(user, messageText, currentData);
    }
  }

  /**
   * Handle site selection logic specifically for real employees (not admin impersonation)
   */
  private async handleSiteSelectionForEmployee(user: any, session: any, messageText: string) {
    const phone = user.phone;
    const currentData = session.data as EmployeeSessionData;

    console.log('👷‍♂️ [EMPLOYEE] Handling site selection for real employee');

    // If this is the first time, show available sites
    if (!currentData.site_selection_shown) {
      await this.updateSession(phone, {
        step: 'select_site',
        data: { ...currentData, site_selection_shown: true }
      });
      await this.showEmployeeSiteSelection(phone, user);
      return;
    }

    // Handle site selection response
    if (messageText.startsWith('site_')) {
      console.log('👷‍♂️ [EMPLOYEE] Real employee selected site:', messageText);
      
      await this.updateSession(phone, {
        step: null,
        data: { ...currentData, selected_site: messageText }
      });
      
      await this.showWelcomeMessage(phone, messageText);
      return;
    }

    // Invalid selection, show sites again
    await whatsappService.sendTextMessage(phone, "કૃપા કરીને યાદીમાંથી યોગ્ય સાઈટ પસંદ કરો:");
    await this.showEmployeeSiteSelection(phone, user);
  }

  /**
   * Show site selection for real employees based on their assignments
   */
  private async showEmployeeSiteSelection(phone: string, user: any) {
    try {
      console.log('👷‍♂️ [EMPLOYEE] Showing site selection for employee:', user.id);
      
      // Get employee's assigned sites
      const assignedSites = await this.getEmployeeAssignedSites(user);
      
      if (assignedSites.length === 1) {
        // Auto-select if only one site assigned
        console.log('👷‍♂️ [EMPLOYEE] Auto-selecting single assigned site:', assignedSites[0].id);
        
        // Ensure display_id doesn't already have site_ prefix to avoid duplication
        const cleanDisplayId = assignedSites[0].display_id?.startsWith('site_') 
          ? assignedSites[0].display_id 
          : `site_${assignedSites[0].display_id}`;
        
        await this.updateSession(phone, {
          step: null,
          data: { selected_site: cleanDisplayId, site_selection_shown: true }
        });
        
        await whatsappService.sendTextMessage(phone, 
          `✅ તમને ${assignedSites[0].name} માટે સ્વચાલિત રીતે સોંપવામાં આવ્યા છો.`
        );
        
        setTimeout(async () => {
          await this.showWelcomeMessage(phone, cleanDisplayId);
        }, 1000);
        
        return;
      }

      // Show selection if multiple sites or no assignments
      const siteOptions = assignedSites.map(site => {
        // Ensure display_id doesn't already have site_ prefix to avoid duplication
        const cleanDisplayId = site.display_id?.startsWith('site_') 
          ? site.display_id 
          : `site_${site.display_id}`;
        
        return {
          id: cleanDisplayId,
          title: `🏗️ ${site.name}`,
          description: site.location || site.description || 'સાઈટ વિગત'
        };
      });

      // If no assigned sites, show all active sites as fallback
      if (siteOptions.length === 0) {
        console.log('👷‍♂️ [EMPLOYEE] No assigned sites, showing all active sites');
        const allSites = await this.getAllActiveSites();
        siteOptions.push(...allSites.map(site => {
          // Ensure display_id doesn't already have site_ prefix to avoid duplication
          const cleanDisplayId = site.display_id?.startsWith('site_') 
            ? site.display_id 
            : `site_${site.display_id}`;
          
          return {
            id: cleanDisplayId,
            title: `🏗️ ${site.name}`,
            description: site.location || site.description || 'સાઈટ વિગત'
          };
        }));
      }

      const message = assignedSites.length > 0 
        ? "તમને સોંપેલી સાઈટ્સમાંથી પસંદ કરો:"
        : "કયા સાઈટ પર કામ કરવા માંગો છો?";

      await whatsappService.sendListMessage(
        phone,
        message,
        "સાઈટ પસંદ કરો",
        [{
          title: "ઉપલબ્ધ સાઈટ્સ",
          rows: siteOptions
        }]
      );

    } catch (error) {
      console.error('Error showing employee site selection:', error);
      
      // Try to show all active sites as fallback
      try {
        const allSites = await this.getAllActiveSites();
        if (allSites.length > 0) {
          const siteOptions = allSites.map(site => ({
            id: site.id, // Use UUID as ID
            title: `🏗️ ${site.name}`,
            description: site.location || site.description || 'સાઈટ વિગત'
          }));

          await whatsappService.sendListMessage(
            phone,
            "કયા સાઈટ પર કામ કરવા માંગો છો?",
            "સાઈટ પસંદ કરો",
            [{
              title: "ઉપલબ્ધ સાઈટ્સ",
              rows: siteOptions
            }]
          );
        } else {
          await whatsappService.sendTextMessage(phone, 
            "❌ કોઈ સાઈટ્સ ઉપલબ્ધ નથી. કૃપા કરીને એડમિનનો સંપર્ક કરો."
          );
        }
      } catch (fallbackError) {
        console.error('Error in fallback site selection:', fallbackError);
        await whatsappService.sendTextMessage(phone, 
          "❌ સાઈટ્સ લોડ કરવામાં ભૂલ. કૃપા કરીને એડમિનનો સંપર્ક કરો."
        );
      }
    }
  }

  /**
   * Get sites assigned to an employee from their user details or managed sites
   */
  private async getEmployeeAssignedSites(user: any): Promise<any[]> {
    try {
      // Method 1: Check if employee is assigned specific sites in user details
      if (user.details?.assigned_sites) {
        const assignedSiteIds = user.details.assigned_sites;
        if (Array.isArray(assignedSiteIds) && assignedSiteIds.length > 0) {
          const assignedSites = await getDb()
            .select()
            .from(sites)
            .where(eq(sites.status, 'active'));
          
          return assignedSites
            .filter(site => assignedSiteIds.includes(site.id))
            .map(site => ({
              ...site,
              display_id: (site.details as any)?.display_id || site.id.slice(0, 8)
            }));
        }
      }

      // Method 2: Check if employee is a site manager
      const managedSites = await getDb()
        .select()
        .from(sites)
        .where(eq(sites.manager_id, user.id));

      if (managedSites.length > 0) {
        return managedSites.map(site => ({
          ...site,
          display_id: (site.details as any)?.display_id || site.id.slice(0, 8)
        }));
      }

      // Method 3: No specific assignments found
      return [];
      
    } catch (error) {
      console.error('Error getting employee assigned sites:', error);
      return [];
    }
  }

  /**
   * Get all active sites as fallback
   */
  private async getAllActiveSites(): Promise<any[]> {
    try {
      const activeSites = await getDb()
        .select()
        .from(sites)
        .where(eq(sites.status, 'active'));

      return activeSites.map(site => {
        const siteDetails = site.details as any;
        return {
          ...site,
          display_id: siteDetails?.display_id || site.id.slice(0, 8),
          description: site.location || siteDetails?.description || 'Active site'
        };
      });
      
    } catch (error) {
      console.error('Error getting all active sites:', error);
      return [];
    }
  }

  // Add session management methods to this class
  async updateSession(phone: string, updates: Partial<typeof sessions.$inferInsert>) {
    try {
      await getDb()
        .update(sessions)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(sessions.phone, phone));
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  }

  async clearSession(phone: string) {
    try {
      await getDb()
        .update(sessions)
        .set({ 
          intent: null, 
          step: null, 
          data: {}, 
          updated_at: new Date() 
        })
        .where(eq(sessions.phone, phone));
    } catch (error) {
      console.error('Error clearing session:', error);
      throw error;
    }
  }

  private async handleEmployeeVerification(user: any, messageText: string) {
    const phone = user.phone;
    const text = messageText.trim();

    // Check if user is trying to send OTP
    if (/^\d{6}$/.test(text)) {
      const result = await this.userService.verifyOTPCode(phone, text);
      await whatsappService.sendTextMessage(phone, result.message);
      
      if (result.success) {
        // Show welcome message and main menu
        setTimeout(async () => {
          await this.showWelcomeMessage(phone, null); // No site pre-selected for real employees
        }, 1000);
      }
      return;
    }

    // Handle OTP requests with better retry logic
    if (text.toLowerCase().includes('otp') || text.toLowerCase().includes('resend') || text.toLowerCase().includes('code')) {
      const hasActiveOTP = await this.userService.hasActiveOTP(phone);
      
      if (hasActiveOTP) {
        // Check rate limiting - only allow one resend per minute
        await whatsappService.sendTextMessage(phone, "⏰ કૃપા કરીને 1 મિનિટ રાહ જુઓ, પછી નવો OTP મંગાવો.");
        return;
      }
      
      const sent = await this.userService.generateAndSendOTP(phone);
      if (sent) {
        await whatsappService.sendTextMessage(phone, "📲 નવો OTP મોકલ્યો છે! કૃપા કરીને 6-અંકનો કોડ દાખલ કરો:");
      } else {
        await whatsappService.sendTextMessage(phone, "❌ OTP મોકલવામાં નિષ્ફળ. કૃપા કરીને પછીથી પ્રયાસ કરો.");
      }
      return;
    }

    // First time employee - send OTP
    const hasActiveOTP = await this.userService.hasActiveOTP(phone);
    if (!hasActiveOTP) {
      const sent = await this.userService.generateAndSendOTP(phone);
      if (sent) {
        const message = `👋 કર્મચારી પોર્ટલમાં આપનું સ્વાગત છે!

🔐 સુરક્ષા માટે, કૃપા કરીને તમારું એકાઉન્ટ વેરિફાઈ કરો. મેં તમને 6-અંકનો વેરિફિકેશન કોડ મોકલ્યો છે.

આગળ વધવા માટે કૃપા કરીને કોડ દાખલ કરો:`;
        await whatsappService.sendTextMessage(phone, message);
      }
    } else {
      await whatsappService.sendTextMessage(phone, "🔐 કૃપા કરીને તમારો 6-અંકનો વેરિફિકેશન કોડ દાખલ કરો:\n\nનવો કોડ જોઈએ તો 'resend' ટાઈપ કરો.");
    }
  }

  private async showWelcomeMessage(phone: string, selectedSite?: string | null) {
    let welcomeMessage = `🎉 *કર્મચારી પોર્ટલમાં આપનું સ્વાગત છે!*`;
    
    if (selectedSite) {
      const siteName = await this.getSiteName(selectedSite);
      welcomeMessage += `\n\nતમે હવે ${siteName} માટે વેરિફાઈ થઈ ગયા છો.`;
    }
    
    welcomeMessage += `\n\nઆજે તમે શું કરવા માંગો છો?`;

    await whatsappService.sendTextMessage(phone, welcomeMessage);
    await this.showMainMenu(phone, selectedSite);
  }

  private async handleMainMenu(user: any, messageText: string, currentData?: EmployeeSessionData) {
    const phone = user.phone;
    const text = messageText.toLowerCase().trim();

    // Handle common commands
    if (text === 'menu' || text === 'main' || text === 'start' || text === 'મેનુ') {
      await this.showMainMenu(phone, currentData?.selected_site);
      return;
    }

    if (text === 'help' || text === 'મદદ') {
      await this.showHelp(phone);
      return;
    }

    // Handle main menu selections
    switch (text) {
      case 'log_activity':
      case '1':
        await this.startActivityLogging(phone, currentData?.selected_site);
        break;
      
      case 'request_materials':
      case '2':
        await this.startMaterialRequest(phone, currentData?.selected_site);
        break;
      
      case 'track_invoices':
      case '3':
        await this.startInvoiceTracking(phone);
        break;
      
      case 'view_dashboard':
      case '4':
        await this.showDashboard(phone);
        break;
      
      case 'help':
      case '5':
        await this.showHelp(phone);
        break;

      default:
        await this.showMainMenu(phone, currentData?.selected_site);
        break;
    }
  }

  private async showMainMenu(phone: string, selectedSite?: string | null) {
    const siteName = selectedSite ? await this.getSiteName(selectedSite) : 'No Site Selected';

    const message = `👷‍♂️ *કર્મચારી પોર્ટલ*
🏗️ *સાઈટ:* ${siteName}

આજે હું તમારી કેવી મદદ કરી શકું?`;

    // Limit to 3 buttons as per WhatsApp's requirements
    const buttons = [
      { id: 'log_activity', title: '📝 કામની નોંધ કરો' },
      { id: 'request_materials', title: '📦 સામગ્રીની માંગ' },
      { id: 'track_invoices', title: '🧾 ઇન્વૉઇસ ટ્રેકિંગ' }
    ];

    await whatsappService.sendButtonMessage(phone, message, buttons);
    
    // Send additional options in list format
    setTimeout(async () => {
      await whatsappService.sendListMessage(
        phone,
        "વધારાના વિકલ્પો:",
        "વધુ વિકલ્પો",
        [{
          title: "વધુ વિકલ્પો",
          rows: [
            { id: 'view_dashboard', title: '📊 ડેશબોર્ડ જુઓ', description: 'તમારી પ્રવૃત્તિઓનું ડેશબોર્ડ' },
            { id: 'help', title: '❓ મદદ', description: 'મદદ અને સહાય મેળવો' },
            { id: 'contact_admin', title: '📞 એડમિનનો સંપર્ક', description: 'વહીવટીતંત્રનો સંપર્ક કરો' }
          ]
        }]
      );
    }, 1000);
  }

  private async showHelp(phone: string) {
    const helpText = `🤝 *કર્મચારી મદદ અને સહાય*

*ઉપલબ્ધ કમાન્ડ્સ:*
• *મેનુ* ટાઈપ કરો - મુખ્ય મેનુ પર જાઓ
• *લોગ* ટાઈપ કરો - ઝડપથી પ્રવૃત્તિ નોંધવો
• *સામગ્રી* ટાઈપ કરો - સામગ્રીની માંગ
• *ડેશબોર્ડ* ટાઈપ કરો - તમારું ડેશબોર્ડ જુઓ

*મદદ જોઈએ?*
• *એડમિન* ટાઈપ કરો વહીવટીતંત્રનો સંપર્ક કરવા
• ફોન: +91-9999999999 (એડમિન)

*કામના કલાકો:*
સોમવાર - શનિવાર: સવારે 8:00 - સાંજે 6:00`;

    await whatsappService.sendTextMessage(phone, helpText);
  }

  private async startActivityLogging(phone: string, selectedSite?: string | null) {
    const session = (await getDb().select().from(sessions).where(eq(sessions.phone, phone)))[0];
    const currentData = session?.data as EmployeeSessionData;

    console.log('👷‍♂️ [EMPLOYEE] Starting activity logging with site:', selectedSite);

    // Site should already be selected from main flow
    if (!selectedSite) {
      await whatsappService.sendTextMessage(phone, "કૃપા કરીને પહેલા સાઈટ પસંદ કરો. મુખ્ય મેનુ માટે 'મેનુ' ટાઈપ કરો.");
      return;
    }

    await this.updateSession(phone, {
      intent: 'log_activity',
      step: 'select_activity_type',
      data: { 
        ...currentData, 
        selected_site: selectedSite, 
        site_id: selectedSite,
        // Ensure admin impersonation flag is preserved
        is_admin_impersonation: currentData?.is_admin_impersonation || false
      }
    });

    await this.showActivityTypes(phone);
  }

  private async startMaterialRequest(phone: string, selectedSite?: string | null) {
    const session = (await getDb().select().from(sessions).where(eq(sessions.phone, phone)))[0];
    const currentData = session?.data as EmployeeSessionData;

    console.log('👷‍♂️ [EMPLOYEE] Starting material request with site:', selectedSite);

    // Site should already be selected from main flow
    if (!selectedSite) {
      await whatsappService.sendTextMessage(phone, "કૃપા કરીને પહેલા સાઈટ પસંદ કરો. મુખ્ય મેનુ માટે 'મેનુ' ટાઈપ કરો.");
      return;
    }

    await this.updateSession(phone, {
      intent: 'request_materials',
      step: 'enter_material',
      data: { 
        ...currentData, 
        selected_site: selectedSite, 
        site_id: selectedSite,
        // Ensure admin impersonation flag is preserved
        is_admin_impersonation: currentData?.is_admin_impersonation || false
      }
    });

    await whatsappService.sendTextMessage(phone, "તમને કઈ સામગ્રીની જરૂર છે? (જેમ કે, સિમેન્ટ, સ્ટીલ, રેતી વગેરે):");
  }

  private async handleFlowStep(
    user: any,
    session: any,
    messageText: string,
    interactiveData?: any,
    imageData?: ImageMessage
  ) {
    const phone = user.phone;

    if (session.intent === 'log_activity') {
      await this.handleActivityLogging(phone, session, messageText, imageData);
    } else if (session.intent === 'request_materials') {
      await this.handleMaterialRequest(phone, session, messageText, imageData);
    } else if (session.intent === 'track_invoices') {
      await this.handleInvoiceTracking(phone, session, messageText, imageData);
    }
  }

  private async handleActivityLogging(phone: string, session: any, messageText: string, imageData?: ImageMessage) {
    const currentData = session.data || {};

    switch (session.step) {
      case 'select_activity_type':
        const validTypes = ['construction', 'inspection', 'maintenance', 'planning', 'other'];
        if (!validTypes.includes(messageText)) {
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય પ્રવૃત્તિનો પ્રકાર પસંદ કરો:");
          await this.showActivityTypes(phone);
          return;
        }

        await this.updateSession(phone, {
          step: 'enter_hours',
          data: { ...currentData, activity_type: messageText }
        });

        await whatsappService.sendTextMessage(phone, "તમે કેટલા કલાક કામ કર્યું? (નંબર દાખલ કરો):");
        break;

      case 'enter_hours':
        const hours = parseInt(messageText);
        if (isNaN(hours) || hours <= 0 || hours > 24) {
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય કલાકોની સંખ્યા દાખલ કરો (1-24):");
          return;
        }

        await this.updateSession(phone, {
          step: 'enter_description',
          data: { ...currentData, hours }
        });

        await whatsappService.sendTextMessage(phone, "તમે શું કામ કર્યું તેનું વર્ણન કરો (વૈકલ્પિક - 'skip' ટાઈપ કરો છોડવા માટે):");
        break;

      case 'enter_description':
        const description = messageText.toLowerCase() === 'skip' ? '' : messageText;
        
        await this.updateSession(phone, {
          step: 'upload_image',
          data: { ...currentData, description, upload_retry_count: 0 }
        });

        await whatsappService.sendTextMessage(phone, "📸 કૃપા કરીને કામનો ફોટો અપલોડ કરો:\n\n• કામની સાઈટનો ફોટો\n• પૂર્ણ થયેલા કામનો ફોટો\n• કોઈ ફોટો ન હોય તો 'skip' ટાઈપ કરો");
        break;

      case 'upload_image':
        await this.handleImageUpload(phone, currentData, messageText, imageData, 'activities', 'કામનો ફોટો', this.completeActivityLog.bind(this));
        break;

      default:
        // Handle null step - start the activity logging flow
        console.log('🎯 [EMPLOYEE] Starting activity logging flow - no step found');
        await this.updateSession(phone, {
          step: 'select_activity_type',
          data: { ...currentData }
        });

        await whatsappService.sendTextMessage(phone, "📝 *પ્રવૃત્તિ લોગ કરો*\n\nતમે કયા પ્રકારની પ્રવૃત્તિ કરી છે?");
        await this.showActivityTypes(phone);
        break;
    }
  }

  private async showActivityTypes(phone: string) {
    const activityTypes = [
      { id: 'construction', title: '🔨 બાંધકામ કાર્ય', description: 'બિલ્ડિંગ અને બાંધકામના કાર્યો' },
      { id: 'inspection', title: '🔍 તપાસ', description: 'ગુણવત્તા તપાસ અને નિરીક્ષણ' },
      { id: 'maintenance', title: '🔧 જાળવણી', description: 'સાધનો અને સાઈટની જાળવણી' },
      { id: 'planning', title: '📋 આયોજન', description: 'પ્રોજેક્ટ આયોજન અને સંકલન' },
      { id: 'other', title: '📝 અન્ય', description: 'અન્ય કામની પ્રવૃત્તિઓ' }
    ];

    await whatsappService.sendListMessage(
      phone,
      "તમે કયા પ્રકારની પ્રવૃત્તિ કરી?",
      "પ્રવૃત્તિ પસંદ કરો",
      [{
        title: "પ્રવૃત્તિના પ્રકારો",
        rows: activityTypes
      }]
    );
  }

  private async completeActivityLog(phone: string, activityData: any) {
    try {
      // Get user to link activity
      const user = await this.userService.getUserByPhone(phone);
      
      console.log('🔧 [EMPLOYEE] Completing activity log with data:', {
        site_id: activityData.site_id,
        selected_site: activityData.selected_site,
        activity_type: activityData.activity_type,
        hours: activityData.hours,
        is_admin_impersonation: activityData.is_admin_impersonation
      });
      
      // Validate site ID before proceeding
      const siteId = activityData.site_id || activityData.selected_site;
      if (!siteId) {
        console.error('⚠️ [EMPLOYEE] No site ID found in activity data');
        throw new Error('Site ID is missing from activity data');
      }
      
      console.log('🔧 [EMPLOYEE] Converting site ID:', siteId);
      const siteUUID = this.getSiteUUID(siteId);
      console.log('🔧 [EMPLOYEE] Site UUID after conversion:', siteUUID);
      
      // Prepare activity details
      const activityDetails: any = { 
        logged_via: 'whatsapp',
        language: 'gujarati'
      };

      // Add image information if available
      if (activityData.image_info) {
        activityDetails.work_photo = activityData.image_info;
      }

      // Create activity in database
      const activity = await getDb().insert(activities).values({
        user_id: user!.id,
        site_id: siteUUID,
        activity_type: activityData.activity_type,
        hours: activityData.hours,
        description: activityData.description,
        image_url: activityData.image_info?.url || null,
        image_key: activityData.image_info?.key || null,
        details: activityDetails
      }).returning();

      // Handle session clearing based on admin impersonation
      if (activityData.is_admin_impersonation) {
        console.log('🔧 [EMPLOYEE] Admin impersonation detected, preserving admin context');
        // Don't clear session completely for admin impersonation, just reset the employee flow part
        await this.updateSession(phone, {
          intent: 'impersonate_employee',
          step: 'active',
          data: {
            original_role: 'admin',
            is_admin_impersonation: true,
            selected_site: activityData.selected_site,
            site_selection_shown: true,
            // Clear activity-specific data
            activity_type: undefined,
            hours: undefined,
            description: undefined,
            image_info: undefined
          }
        });
      } else {
        // Clear session for regular employees
        await this.clearSession(phone);
      }

      // Send confirmation
      const imageStatus = activityData.image_info ? '📸 ફોટો સહિત' : '📝 ફોટો વગર';
      const confirmationMessage = `✅ *પ્રવૃત્તિ સફળતાપૂર્વક નોંધાઈ!*

📋 *વિગતો:*
• સાઈટ: ${await this.getSiteName(siteUUID)}
• પ્રવૃત્તિ: ${this.formatActivityType(activityData.activity_type || '')}
• કલાકો: ${activityData.hours}
• વર્ણન: ${activityData.description || 'કોઈ વર્ણન નથી'}
• ${imageStatus}

*પ્રવૃત્તિ ID:* ${activity[0].id.slice(0, 8)}

${activityData.is_admin_impersonation ? 
  'Test completed! Type *exit* to return to admin panel or continue testing employee features.' :
  'મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.'
}`;

      await whatsappService.sendTextMessage(phone, confirmationMessage);

    } catch (error) {
      console.error('Error logging activity:', error);
      
      // Provide more specific error messages
      let errorMessage = "માફ કરશો, તમારી પ્રવૃત્તિ નોંધવામાં ભૂલ થઈ.";
      
      if (error instanceof Error) {
        if (error.message.includes('Site ID')) {
          errorMessage += " સાઈટ ID સાથે સમસ્યા છે.";
        } else if (error.message.includes('foreign key constraint')) {
          errorMessage += " અમાન્ય સાઈટ પસંદ કરેલ છે.";
        }
      }
      
      errorMessage += " કૃપા કરીને ફરીથી પ્રયાસ કરો.";
      
      await whatsappService.sendTextMessage(phone, errorMessage);
      
      // Handle session clearing on error
      if (activityData.is_admin_impersonation) {
        await this.updateSession(phone, {
          intent: 'impersonate_employee',
          step: 'active',
          data: {
            original_role: 'admin',
            is_admin_impersonation: true,
            selected_site: activityData.selected_site,
            site_selection_shown: true
          }
        });
      } else {
        await this.clearSession(phone);
      }
    }
  }

  private async startInvoiceTracking(phone: string) {
    const session = (await getDb().select().from(sessions).where(eq(sessions.phone, phone)))[0];
    const currentData = session?.data as EmployeeSessionData;

    await this.updateSession(phone, {
      intent: 'track_invoices',
      step: 'enter_company_name',
      data: {
        ...currentData,
        // Ensure admin impersonation flag is preserved
        is_admin_impersonation: currentData?.is_admin_impersonation || false
      }
    });

    await whatsappService.sendTextMessage(phone, "🧾 *ઇન્વૉઇસ ટ્રેકિંગ*\n\nકયા કંપનીનું ઇન્વૉઇસ છે? કંપનીનું નામ લખો:");
  }

  private async handleInvoiceTracking(phone: string, session: any, messageText: string, imageData?: ImageMessage) {
    const currentData = session.data || {};

    switch (session.step) {
      case 'enter_company_name':
        if (!messageText.trim()) {
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને કંપનીનું નામ લખો:");
          return;
        }

        await this.updateSession(phone, {
          step: 'enter_invoice_description',
          data: { ...currentData, company_name: messageText.trim() }
        });

        await whatsappService.sendTextMessage(phone, "📝 આ ઇન્વૉઇસ શેના માટે છે? (જેમ કે: સામગ્રી ખરીદી, સેવા, વિદ્યુત બિલ, વગેરે):");
        break;

      case 'enter_invoice_description':
        if (!messageText.trim()) {
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને ઇન્વૉઇસનું વર્ણન લખો:");
          return;
        }

        await this.updateSession(phone, {
          step: 'enter_invoice_date',
          data: { ...currentData, invoice_description: messageText.trim() }
        });

        await whatsappService.sendTextMessage(phone, "📅 ઇન્વૉઇસની તારીખ કઈ છે? (DD/MM/YYYY ફોર્મેટમાં લખો, જેમ કે: 15/12/2024):");
        break;

      case 'enter_invoice_date':
        const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        const dateMatch = messageText.trim().match(datePattern);
        
        if (!dateMatch) {
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય તારીખ લખો (DD/MM/YYYY ફોર્મેટમાં), જેમ કે: 15/12/2024:");
          return;
        }

        const [, day, month, year] = dateMatch;
        const invoiceDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        if (isNaN(invoiceDate.getTime()) || invoiceDate > new Date()) {
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય તારીખ લખો (ભવિષ્યની તારીખ ન હોવી જોઈએ):");
          return;
        }

        await this.updateSession(phone, {
          step: 'enter_amount',
          data: { ...currentData, invoice_date: invoiceDate }
        });

        await whatsappService.sendTextMessage(phone, "💰 ઇન્વૉઇસની રકમ કેટલી છે? (માત્ર નંબર લખો, જેમ કે: 5000):");
        break;

      case 'enter_amount':
        const amount = parseFloat(messageText.trim());
        
        if (isNaN(amount) || amount <= 0) {
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય રકમ લખો (માત્ર નંબર, જેમ કે: 5000):");
          return;
        }

        await this.updateSession(phone, {
          step: 'select_site',
          data: { ...currentData, amount: Math.round(amount * 100) } // Store in paise
        });

        await this.showSiteSelection(phone);
        break;

      case 'select_site':
        // Validate that the selected site exists in database
        try {
          const selectedSite = await getDb()
            .select()
            .from(sites)
            .where(eq(sites.id, messageText))
            .limit(1);
            
          if (selectedSite.length === 0) {
            await whatsappService.sendTextMessage(phone, "કૃપા કરીને યાદીમાંથી યોગ્ય સાઈટ પસંદ કરો:");
            await this.showSiteSelection(phone);
            return;
          }
        } catch (error) {
          console.error('Error validating site selection:', error);
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને યાદીમાંથી યોગ્ય સાઈટ પસંદ કરો:");
          await this.showSiteSelection(phone);
          return;
        }

        await this.updateSession(phone, {
          step: 'upload_invoice_image',
          data: { ...currentData, site_id: messageText, upload_retry_count: 0 }
        });

        await whatsappService.sendTextMessage(phone, "📸 *હવે ઇન્વૉઇસનો ફોટો અપલોડ કરો:*\n\n• સ્પષ્ટ અને વાંચી શકાય તેવો ફોટો\n• ઇન્વૉઇસના બધા ભાગો દેખાતા હોવા જોઈએ\n• ફોટો અપલોડ કરો અથવા 'skip' ટાઈપ કરો");
        break;

      case 'upload_invoice_image':
        await this.handleImageUpload(phone, currentData, messageText, imageData, 'invoices', 'ઇન્વૉઇસનો ફોટો', this.completeInvoiceTracking.bind(this));
        break;

      default:
        // Handle null step - start the invoice tracking flow
        console.log('🎯 [EMPLOYEE] Starting invoice tracking flow - no step found');
        await this.updateSession(phone, {
          step: 'enter_company_name',
          data: { ...currentData }
        });

        await whatsappService.sendTextMessage(phone, "🧾 *ઇન્વૉઇસ ટ્રેકિંગ*\n\nકયા કંપનીનું ઇન્વૉઇસ છે? કંપનીનું નામ લખો:");
        break;
    }
  }

  private async completeInvoiceTracking(phone: string, invoiceData: any) {
    try {
      const user = await this.userService.getUserByPhone(phone);
      
      const invoice = await getDb().insert(invoices).values({
        user_id: user!.id,
        company_name: invoiceData.company_name,
        invoice_description: invoiceData.invoice_description,
        invoice_date: invoiceData.invoice_date,
        amount: invoiceData.amount,
        site_id: this.getSiteUUID(invoiceData.site_id),
        image_url: invoiceData.image_info?.url || null,
        image_key: invoiceData.image_info?.key || null,
        notes: 'WhatsApp દ્વારા નોંધાયેલ'
      }).returning();

      // Handle session clearing based on admin impersonation
      if (invoiceData.is_admin_impersonation) {
        console.log('🔧 [EMPLOYEE] Admin impersonation detected, preserving admin context');
        // Don't clear session completely for admin impersonation, just reset the employee flow part
        await this.updateSession(phone, {
          intent: 'impersonate_employee',
          step: 'active',
          data: {
            original_role: 'admin',
            is_admin_impersonation: true,
            selected_site: invoiceData.selected_site,
            site_selection_shown: true,
            // Clear invoice-specific data
            company_name: undefined,
            invoice_description: undefined,
            invoice_date: undefined,
            amount: undefined,
            image_info: undefined
          }
        });
      } else {
        // Clear session for regular employees
        await this.clearSession(phone);
      }

      const imageStatus = invoiceData.image_info ? '📸 ફોટો સહિત' : '📝 ફોટો વગર';
      const confirmationMessage = `✅ *ઇન્વૉઇસ સફળતાપૂર્વક નોંધાયું!*

🧾 *ઇન્વૉઇસની વિગતો:*
• કંપની: ${invoiceData.company_name}
• વર્ણન: ${invoiceData.invoice_description}
• તારીખ: ${invoiceData.invoice_date.toLocaleDateString('gu-IN')}
• રકમ: ₹${(invoiceData.amount / 100).toFixed(2)}
• સાઈટ: ${await this.getSiteName(invoiceData.site_id)}
• ${imageStatus}

*ઇન્વૉઇસ ID:* ${invoice[0].id.slice(0, 8)}

તમારો ઇન્વૉઇસ એકાઉન્ટિંગ ટીમને મોકલી દેવામાં આવ્યો છે. પ્રોસેસિંગ સ્ટેટસ વિશે તમને જાણ કરવામાં આવશે.

${invoiceData.is_admin_impersonation ? 
  'Test completed! Type *exit* to return to admin panel or continue testing employee features.' :
  'મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.'
}`;

      await whatsappService.sendTextMessage(phone, confirmationMessage);

    } catch (error) {
      console.error('Error tracking invoice:', error);
      await whatsappService.sendTextMessage(phone, "માફ કરશો, તમારો ઇન્વૉઇસ નોંધવામાં ભૂલ થઈ. કૃપા કરીને ફરીથી પ્રયાસ કરો.");
      
      // Handle session clearing on error
      if (invoiceData.is_admin_impersonation) {
        await this.updateSession(phone, {
          intent: 'impersonate_employee',
          step: 'active',
          data: {
            original_role: 'admin',
            is_admin_impersonation: true,
            selected_site: invoiceData.selected_site,
            site_selection_shown: true
          }
        });
      } else {
        await this.clearSession(phone);
      }
    }
  }

  private async showDashboard(phone: string) {
    try {
      const user = await this.userService.getUserByPhone(phone);
      
      // Get recent activities (last 7 days)
      const recentActivities = await getDb()
        .select()
        .from(activities)
        .where(eq(activities.user_id, user!.id))
        .limit(5);

      // Get pending material requests
      const pendingRequests = await getDb()
        .select()
        .from(material_requests)
        .where(eq(material_requests.user_id, user!.id))
        .limit(3);

      // Get recent invoices (last 5)
      const recentInvoices = await getDb()
        .select()
        .from(invoices)
        .where(eq(invoices.user_id, user!.id))
        .limit(5);

      const totalHours = recentActivities.reduce((sum, activity) => sum + (activity.hours || 0), 0);
      const totalInvoiceAmount = recentInvoices.reduce((sum, invoice) => sum + (invoice.amount || 0), 0);

      const dashboardMessage = `📊 *તમારું ડેશબોર્ડ*

📅 *આ અઠવાડિયે:*
• કુલ નોંધાયેલા કલાકો: ${totalHours}
• નોંધાયેલી પ્રવૃત્તિઓ: ${recentActivities.length}
• બાકી વિનંતીઓ: ${pendingRequests.length}
• નોંધાયેલા ઇન્વૉઇસ: ${recentInvoices.length}
• કુલ ઇન્વૉઇસ રકમ: ₹${(totalInvoiceAmount / 100).toFixed(2)}

📝 *તાજેતરની પ્રવૃત્તિઓ:*
${recentActivities.map(activity => 
  `• ${this.formatActivityType(activity.activity_type || '')} - ${activity.hours}કલ`
).join('\n') || 'કોઈ તાજેતરની પ્રવૃત્તિઓ નથી'}

📦 *બાકી સામગ્રીની વિનંતીઓ:*
${pendingRequests.map(request => 
  `• ${request.material_name} (${request.status})`
).join('\n') || 'કોઈ બાકી વિનંતીઓ નથી'}

🧾 *છેલ્લા ઇન્વૉઇસ:*
${recentInvoices.map(invoice => 
  `• ${invoice.company_name} - ₹${(invoice.amount / 100).toFixed(2)}`
).join('\n') || 'કોઈ નોંધાયેલા ઇન્વૉઇસ નથી'}

વધુ વિકલ્પો માટે *મેનુ* ટાઈપ કરો.`;

      await whatsappService.sendTextMessage(phone, dashboardMessage);

    } catch (error) {
      console.error('Error fetching dashboard:', error);
      await whatsappService.sendTextMessage(phone, "માફ કરશો, તમારું ડેશબોર્ડ લોડ કરવામાં ભૂલ થઈ. કૃપા કરીને ફરીથી પ્રયાસ કરો.");
    }
  }

  // Helper methods - now fully dynamic
  private async getSiteName(siteId: string | undefined): Promise<string> {
    if (!siteId) return 'અજ્ઞાત સાઈટ';
    
    try {
      const site = await getDb()
        .select()
        .from(sites)
        .where(eq(sites.id, siteId))
        .limit(1);
      
      return site[0]?.name || 'અજ્ઞાત સાઈટ';
    } catch (error) {
      console.error('Error fetching site name:', error);
      return 'અજ્ઞાત સાઈટ';
    }
  }

  private getSiteUUID(displayId: string | undefined): string {
    // If it's already a UUID, return as is
    if (displayId && displayId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return displayId;
    }
    
    if (!displayId) {
      console.error('⚠️ [EMPLOYEE] No site ID provided to getSiteUUID');
      throw new Error('Site ID is required for activity logging');
    }
    
    // Handle double prefix case: 'site_site_1' -> 'site_1'
    let normalizedId = displayId;
    if (displayId.startsWith('site_site_')) {
      normalizedId = displayId.replace('site_site_', 'site_');
      console.log('🔧 [EMPLOYEE] Normalizing double-prefixed site ID:', displayId, '→', normalizedId);
    }
    
    // For legacy compatibility, but this should not be used anymore with dynamic site selection
    const siteMapping: { [key: string]: string } = {
      'site_1': '11111111-1111-1111-1111-111111111111',
      'site_2': '22222222-2222-2222-2222-222222222222',
      'site_3': '33333333-3333-3333-3333-333333333333'
    };
    
    const mappedId = siteMapping[normalizedId];
    if (mappedId) {
      console.log('🔧 [EMPLOYEE] Using legacy site mapping:', normalizedId, '→', mappedId);
      return mappedId;
    }
    
    // If we get here, it means we have an invalid site ID
    console.error('⚠️ [EMPLOYEE] Invalid site ID provided:', displayId, 'normalized to:', normalizedId);
    throw new Error(`Invalid site ID: ${displayId} (normalized: ${normalizedId})`);
  }

  private formatActivityType(type: string): string {
    const types: { [key: string]: string } = {
      'construction': '🔨 બાંધકામ',
      'inspection': '🔍 તપાસ',
      'maintenance': '🔧 જાળવણી',
      'planning': '📋 આયોજન',
      'other': '📝 અન્ય'
    };
    return types[type] || type;
  }

  // Centralized image upload handler with improved error handling
  private async handleImageUpload(
    phone: string, 
    currentData: any, 
    messageText: string, 
    imageData?: ImageMessage,
    folderName: string = 'activities',
    photoDescription: string = 'ફોટો',
    completionHandler?: (phone: string, data: any) => Promise<void>
  ) {
    const retryCount = currentData.upload_retry_count || 0;
    
    if (imageData) {
      // Validate image before upload
      if (!this.validateImageData(imageData)) {
        await whatsappService.sendTextMessage(phone, "❌ અયોગ્ય ફોટો ફોર્મેટ. કૃપા કરીને JPEG અથવા PNG ફોટો અપલોડ કરો અથવા 'skip' ટાઈપ કરો.");
        return;
      }

      await whatsappService.sendTextMessage(phone, `📤 ${photoDescription} અપલોડ કરી રહ્યા છીએ...`);
      
      try {
        // Set timeout for upload
        const uploadPromise = r2Service.uploadFromWhatsAppMedia(
          imageData.id,
          process.env.META_WHATSAPP_TOKEN!,
          folderName
        );
        
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Upload timeout')), this.UPLOAD_TIMEOUT_MS)
        );
        
        const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
        
        if (uploadResult.success) {
          const imageInfo = {
            url: uploadResult.url,
            key: uploadResult.key,
            caption: imageData.caption || photoDescription,
            whatsapp_media_id: imageData.id,
            mime_type: imageData.mime_type,
            sha256: imageData.sha256
          };
          
          await whatsappService.sendTextMessage(phone, "✅ ફોટો સફળતાપૂર્વક અપલોડ થયો!");
          
          if (completionHandler) {
            await completionHandler(phone, { ...currentData, image_info: imageInfo });
          }
        } else {
          throw new Error(uploadResult.error || 'Unknown upload error');
        }
        
      } catch (error) {
        console.error('R2 upload error:', error);
        
        if (retryCount < this.MAX_UPLOAD_RETRIES) {
          // Allow retry
          await this.updateSession(phone, {
            data: { ...currentData, upload_retry_count: retryCount + 1 }
          });
          
          const errorMessage = error instanceof Error && error.message === 'Upload timeout' 
            ? "⏰ અપલોડ ટાઈમઆઉટ થયો."
            : "❌ ફોટો અપલોડ કરવામાં ભૂલ.";
            
          await whatsappService.sendTextMessage(phone, 
            `${errorMessage} કૃપા કરીને ફરીથી પ્રયાસ કરો (${retryCount + 1}/${this.MAX_UPLOAD_RETRIES + 1}) અથવા 'skip' ટાઈપ કરો.`
          );
        } else {
          // Max retries reached
          await whatsappService.sendTextMessage(phone, 
            "❌ ફોટો અપલોડ કરવામાં વારંવાર નિષ્ફળતા. 'skip' ટાઈપ કરીને આગળ વધો અથવા પછીથી પ્રયાસ કરો."
          );
        }
        return;
      }
      
    } else if (messageText.toLowerCase() === 'skip') {
      if (completionHandler) {
        await completionHandler(phone, { ...currentData, image_info: null });
      }
    } else {
      await whatsappService.sendTextMessage(phone, "કૃપા કરીને ફોટો અપલોડ કરો અથવા 'skip' ટાઈપ કરો:");
      return;
    }
  }

  // Image validation helper
  private validateImageData(imageData: ImageMessage): boolean {
    if (!imageData || !imageData.id) {
      return false;
    }
    
    // Check MIME type if available
    if (imageData.mime_type) {
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      if (!validTypes.includes(imageData.mime_type.toLowerCase())) {
        return false;
      }
    }
    
    return true;
  }

  private async handleMaterialRequest(phone: string, session: any, messageText: string, imageData?: ImageMessage) {
    const currentData = session.data || {};

    switch (session.step) {
      case 'enter_material':
        if (messageText.length < 2) {
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય સામગ્રીનું નામ દાખલ કરો:");
          return;
        }

        await this.updateSession(phone, {
          step: 'enter_quantity',
          data: { ...currentData, material_name: messageText }
        });

        await whatsappService.sendTextMessage(phone, "કેટલી માત્રામાં જોઈએ છે? (જેમ કે, 10 બેગ, 5 ટન, 100 પીસ):");
        break;

      case 'enter_quantity':
        const quantityMatch = messageText.match(/(\d+)\s*(.+)/);
        if (!quantityMatch) {
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને આ ફોર્મેટમાં માત્રા દાખલ કરો: '10 બેગ' અથવા '5 ટન':");
          return;
        }

        const quantity = parseInt(quantityMatch[1]);
        const unit = quantityMatch[2].trim();

        await this.updateSession(phone, {
          step: 'select_urgency',
          data: { ...currentData, quantity, unit }
        });

        await this.showUrgencyOptions(phone);
        break;

      case 'select_urgency':
        const validUrgency = ['low', 'medium', 'high'];
        if (!validUrgency.includes(messageText)) {
          await whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય તાત્કાલિકતાનું સ્તર પસંદ કરો:");
          await this.showUrgencyOptions(phone);
          return;
        }

        await this.updateSession(phone, {
          step: 'upload_material_image',
          data: { ...currentData, urgency: messageText, upload_retry_count: 0 }
        });

        await whatsappService.sendTextMessage(phone, "📸 કૃપા કરીને સામગ્રીનો ફોટો અપલોડ કરો:\n\n• જરૂરી સામગ્રીનો ફોટો\n• હાલની સામગ્રીની સ્થિતિનો ફોટો\n• કોઈ ફોટો ન હોય તો 'skip' ટાઈપ કરો");
        break;

      case 'upload_material_image':
        await this.handleImageUpload(phone, currentData, messageText, imageData, 'material-requests', 'સામગ્રીનો ફોટો', this.completeMaterialRequest.bind(this));
        break;

      default:
        // Handle null step - start the material request flow
        console.log('🎯 [EMPLOYEE] Starting material request flow - no step found');
        await this.updateSession(phone, {
          step: 'enter_material',
          data: { ...currentData }
        });

        await whatsappService.sendTextMessage(phone, "📦 *સામગ્રીની વિનંતી*\n\nકઈ સામગ્રીની જરૂર છે? (જેમ કે: સિમેન્ટ, ઈંટ, રોડ, બેગ, વગેરે):");
        break;
    }
  }

  private async showUrgencyOptions(phone: string) {
    const urgencyLevels = [
      { id: 'low', title: '🟢 ઓછી પ્રાથમિકતા', description: 'એક અઠવાડિયામાં જોઈએ છે' },
      { id: 'medium', title: '🟡 મધ્યમ પ્રાથમિકતા', description: '2-3 દિવસમાં જોઈએ છે' },
      { id: 'high', title: '🔴 ઉચ્ચ પ્રાથમિકતા', description: 'તાત્કાલિક જોઈએ છે (આજ/આવતીકાલે)' }
    ];

    await whatsappService.sendListMessage(
      phone,
      "આ વિનંતી કેટલી તાત્કાલિક છે?",
      "તાત્કાલિકતા પસંદ કરો",
      [{
        title: "તાત્કાલિકતાના સ્તરો",
        rows: urgencyLevels
      }]
    );
  }

  private async completeMaterialRequest(phone: string, requestData: any) {
    try {
      const user = await this.userService.getUserByPhone(phone);
      
      const request = await getDb().insert(material_requests).values({
        user_id: user!.id,
        material_name: requestData.material_name,
        quantity: requestData.quantity,
        unit: requestData.unit,
        site_id: this.getSiteUUID(requestData.site_id),
        urgency: requestData.urgency,
        requested_date: new Date(),
        image_url: requestData.image_info?.url || null,
        image_key: requestData.image_info?.key || null,
        notes: 'WhatsApp દ્વારા વિનંતી'
      }).returning();

      // Handle session clearing based on admin impersonation
      if (requestData.is_admin_impersonation) {
        console.log('🔧 [EMPLOYEE] Admin impersonation detected, preserving admin context');
        // Don't clear session completely for admin impersonation, just reset the employee flow part
        await this.updateSession(phone, {
          intent: 'impersonate_employee',
          step: 'active',
          data: {
            original_role: 'admin',
            is_admin_impersonation: true,
            selected_site: requestData.selected_site,
            site_selection_shown: true,
            // Clear material request-specific data
            material_name: undefined,
            quantity: undefined,
            unit: undefined,
            urgency: undefined,
            image_info: undefined
          }
        });
      } else {
        // Clear session for regular employees
        await this.clearSession(phone);
      }

      const imageStatus = requestData.image_info ? '📸 ફોટો સહિત' : '📝 ફોટો વગર';
      const confirmationMessage = `✅ *સામગ્રીની વિનંતી મોકલાઈ ગઈ!*

📦 *વિનંતીની વિગતો:*
• સામગ્રી: ${requestData.material_name}
• માત્રા: ${requestData.quantity} ${requestData.unit}
• સાઈટ: ${await this.getSiteName(requestData.site_id)}
• તાત્કાલિકતા: ${this.formatUrgency(requestData.urgency)}
• ${imageStatus}

*વિનંતી ID:* ${request[0].id.slice(0, 8)}

તમારી વિનંતી ખરીદી ટીમને મોકલી દેવામાં આવી છે. સ્ટેટસ વિશે તમને જાણ કરવામાં આવશે.

${requestData.is_admin_impersonation ? 
  'Test completed! Type *exit* to return to admin panel or continue testing employee features.' :
  'મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.'
}`;

      await whatsappService.sendTextMessage(phone, confirmationMessage);

    } catch (error) {
      console.error('Error submitting material request:', error);
      await whatsappService.sendTextMessage(phone, "માફ કરશો, તમારી વિનંતી મોકલવામાં ભૂલ થઈ. કૃપા કરીને ફરીથી પ્રયાસ કરો.");
      
      // Handle session clearing on error
      if (requestData.is_admin_impersonation) {
        await this.updateSession(phone, {
          intent: 'impersonate_employee',
          step: 'active',
          data: {
            original_role: 'admin',
            is_admin_impersonation: true,
            selected_site: requestData.selected_site,
            site_selection_shown: true
          }
        });
      } else {
        await this.clearSession(phone);
      }
    }
  }

  private formatUrgency(urgency: string): string {
    const urgencyMap: { [key: string]: string } = {
      'low': '🟢 ઓછી પ્રાથમિકતા',
      'medium': '🟡 મધ્યમ પ્રાથમિકતા',
      'high': '🔴 ઉચ્ચ પ્રાથમિકતા'
    };
    return urgencyMap[urgency] || urgency;
  }

  // Simplified showSiteSelection - only used for invoice tracking now
  private async showSiteSelection(phone: string) {
    try {
      console.log('👷‍♂️ [EMPLOYEE] Showing site selection for invoice tracking');
      
      // Fetch active sites from database
      const activeSites = await getDb()
        .select()
        .from(sites)
        .where(eq(sites.status, 'active'));
      
      if (activeSites.length === 0) {
        await whatsappService.sendTextMessage(phone, 
          "❌ કોઈ સક્રિય સાઈટ્સ મળી નથી. કૃપા કરીને એડમિનનો સંપર્ક કરો."
        );
        return;
      }

      // Transform sites to WhatsApp list format
      const siteOptions = activeSites.map((site) => {
        const siteDetails = site.details as any;
        return {
          id: site.id, // Use actual UUID as ID
          title: `🏗️ ${site.name}`,
          description: site.location || siteDetails?.description || 'સાઈટ વિગત'
        };
      });

      await whatsappService.sendListMessage(
        phone,
        "કયા સાઈટ માટે છે?",
        "સાઈટ પસંદ કરો",
        [{
          title: "ઉપલબ્ધ સાઈટ્સ",
          rows: siteOptions
        }]
      );
      
    } catch (error) {
      console.error('Error showing site selection:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ સાઈટ્સ લોડ કરવામાં ભૂલ. કૃપા કરીને ફરીથી પ્રયાસ કરો."
      );
    }
  }
} 