import { ImageMessage } from '../../whatsapp';
import { SessionManager } from './shared/SessionManager';
import { EmployeeAuthService } from './auth/EmployeeAuthService';
import { SiteContextService } from './site/SiteContextService';
import { ActivityLoggingService } from './workflows/ActivityLoggingService';
import { MaterialRequestService } from './workflows/MaterialRequestService';
import { InventoryManagementService } from './workflows/InventoryManagementService';
import { whatsappService } from '../../whatsapp';

export class EmployeeFlowOrchestrator {
  private sessionManager: SessionManager;
  private authService: EmployeeAuthService;
  private siteService: SiteContextService;
  private activityService: ActivityLoggingService;
  private materialService: MaterialRequestService;
  private inventoryService: InventoryManagementService;

  constructor() {
    console.log('🏗️ [EMPLOYEE-ORCHESTRATOR] Initializing...');
    this.sessionManager = new SessionManager();
    this.authService = new EmployeeAuthService();
    this.siteService = new SiteContextService(this.sessionManager);
    this.activityService = new ActivityLoggingService();
    this.materialService = new MaterialRequestService();
    this.inventoryService = new InventoryManagementService();
  }

  /**
   * Main entry point for all employee messages
   */
  async handleMessage(
    user: any,
    session: any,
    messageText: string,
    interactiveData?: any,
    imageData?: ImageMessage
  ): Promise<void> {
    const phone = user.phone;
    
    console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Handling message:', {
      phone,
      messageText: messageText.substring(0, 50),
      sessionIntent: session?.intent,
      sessionStep: session?.step,
      isAdminImpersonation: session?.data?.is_admin_impersonation
    });

    try {
      // Handle authentication first
      if (!user.is_verified && !session?.data?.is_admin_impersonation) {
        console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] User not verified, routing to auth');
        const authResult = await this.authService.handleVerification(user, phone, messageText);
        if (!authResult.verified) {
          return; // Stay in auth flow
        }
        // If verified, continue with normal flow
      }

      // For admin impersonation, use the passed session directly
      if (session?.data?.is_admin_impersonation) {
        console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Admin impersonation mode - using passed session');
        await this.handleAdminImpersonation(user, session, messageText, interactiveData, imageData);
        return;
      }

      // For regular employee flow, use SessionManager
      // Route based on active flow
      if (session?.intent) {
        await this.handleActiveFlow(user, session, messageText, interactiveData, imageData);
      } else {
        await this.handleInitialMessage(user, phone, messageText, interactiveData);
      }
    } catch (error) {
      console.error('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Error handling message:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ માફ કરશો, કોઈ ભૂલ થઈ છે. કૃપા કરીને ફરીથી પ્રયાસ કરો."
      );
    }
  }

  /**
   * Handle admin impersonation mode
   */
  private async handleAdminImpersonation(
    user: any,
    session: any,
    messageText: string,
    interactiveData?: any,
    imageData?: ImageMessage
  ): Promise<void> {
    const phone = user.phone;
    
    console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Admin impersonation - session data:', {
      intent: session?.intent,
      step: session?.step,
      selected_site: session?.data?.selected_site,
      site_selection_shown: session?.data?.site_selection_shown
    });

    // Ensure site context is set if we have site data
    if (session?.data?.selected_site) {
      // Set site context in our internal state for workflows that need it
      await this.siteService.setSiteContext(phone, session.data.selected_site);
    }

    // Route based on active flow or initial message
    if (session?.intent && session.intent !== 'impersonate_employee') {
      // We have an active employee flow within admin impersonation
      await this.handleActiveFlowForAdmin(user, session, messageText, interactiveData, imageData);
    } else {
      // No active employee flow, handle as initial message
      await this.handleInitialMessageForAdmin(user, phone, messageText, interactiveData, session);
    }
  }

  /**
   * Handle active flows for admin impersonation
   */
  private async handleActiveFlowForAdmin(
    user: any,
    session: any,
    messageText: string,
    interactiveData?: any,
    imageData?: ImageMessage
  ): Promise<void> {
    const phone = user.phone;
    
    console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Handling active flow for admin:', session.intent);

    switch (session.intent) {
      case 'activity_logging':
        await this.activityService.handleFlowStep(user, phone, messageText, interactiveData, imageData);
        break;

      case 'material_request':
        await this.materialService.handleFlowStep(user, phone, messageText, interactiveData, imageData);
        break;

      case 'inventory_management_gujarati':
        await this.inventoryService.handleFlowStep(user, phone, messageText, interactiveData, imageData);
        break;

      default:
        console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Unknown flow intent for admin:', session.intent);
        await this.showMainMenu(user, phone);
        break;
    }
  }

  /**
   * Handle initial message for admin impersonation
   */
  private async handleInitialMessageForAdmin(
    user: any,
    phone: string,
    messageText: string,
    interactiveData?: any,
    session?: any
  ): Promise<void> {
    const text = messageText.toLowerCase().trim();

    // Quick commands
    if (text === 'menu' || text === 'મેનુ') {
      await this.showMainMenu(user, phone);
      return;
    }

    // Site should already be selected in admin impersonation mode
    // If not, there's an issue with the admin flow setup
    if (!session?.data?.selected_site) {
      console.error('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Admin impersonation without site selection');
      await whatsappService.sendTextMessage(phone, 
        "❌ Site not selected properly. Please exit and restart employee impersonation."
      );
      return;
    }

    // Handle main menu selection directly
    await this.handleMainMenuSelection(user, phone, messageText, interactiveData);
  }

  /**
   * Handle active flows
   */
  private async handleActiveFlow(
    user: any,
    session: any,
    messageText: string,
    interactiveData?: any,
    imageData?: ImageMessage
  ): Promise<void> {
    const phone = user.phone;
    
    console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Handling active flow:', session.intent);

    switch (session.intent) {
      case 'activity_logging':
        await this.activityService.handleFlowStep(user, phone, messageText, interactiveData, imageData);
        break;

      case 'material_request':
        await this.materialService.handleFlowStep(user, phone, messageText, interactiveData, imageData);
        break;

      case 'inventory_management_gujarati':
        await this.inventoryService.handleFlowStep(user, phone, messageText, interactiveData, imageData);
        break;

      case 'site_selection':
        const siteSelectionComplete = await this.siteService.handleSiteSelection(user, phone, messageText);
        if (!siteSelectionComplete) {
          // Site selection complete, show main menu
          await this.showMainMenu(user, phone);
        }
        break;

      default:
        console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Unknown flow intent:', session.intent);
        await this.showMainMenu(user, phone);
        break;
    }
  }

  /**
   * Handle initial message (no active flow)
   */
  private async handleInitialMessage(
    user: any,
    phone: string,
    messageText: string,
    interactiveData?: any
  ): Promise<void> {
    const text = messageText.toLowerCase().trim();

    // Quick commands
    if (text === 'menu' || text === 'મેનુ') {
      await this.showMainMenu(user, phone);
      return;
    }

    // Handle site selection if needed (for regular employee flow)
    const needsSiteSelection = await this.siteService.needsSiteSelection(user, phone);
    if (needsSiteSelection) {
      // Store the original intent before site selection
      const originalIntent = this.extractSelectionIntent(messageText, interactiveData);
      
      const siteSelectionComplete = await this.siteService.handleSiteSelection(user, phone, messageText);
      if (!siteSelectionComplete) {
        // Site selection complete, now continue with original intent
        if (originalIntent) {
          console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Continuing with original intent after site selection:', originalIntent);
          await this.handleMainMenuSelection(user, phone, originalIntent, interactiveData);
        } else {
          await this.showMainMenu(user, phone);
        }
      }
      return;
    }

    // Handle main menu selection or show menu
    await this.handleMainMenuSelection(user, phone, messageText, interactiveData);
  }

  /**
   * Show main menu
   */
  private async showMainMenu(user: any, phone: string): Promise<void> {
    console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Showing main menu for:', phone);

    const message = `👷‍♂️ *કર્મચારી પોર્ટલ*

આજે હું તમારી કેવી મદદ કરી શકું?

કૃપા કરીને એક વિકલ્પ પસંદ કરો:`;

    const buttons = [
      { id: 'activity_logging', title: '📝 કામની નોંધ' },
      { id: 'material_request', title: '📦 સામગ્રીની માંગ' },
      { id: 'inventory_gujarati', title: '📊 ઇન્વેન્ટરી' }
    ];

    await whatsappService.sendButtonMessage(phone, message, buttons);
    
    // Send additional options as list
    setTimeout(async () => {
      await whatsappService.sendListMessage(
        phone,
        "વધારાના વિકલ્પો:",
        "અન્ય વિકલ્પો",
        [{
          title: "મેનેજમેન્ટ",
          rows: [
            { id: 'dashboard', title: '📊 ડેશબોર્ડ', description: 'તમારા કામની સ્થિતિ જુઓ' },
            { id: 'help', title: '❓ મદદ', description: 'મદદ અને માર્ગદર્શન' }
          ]
        }]
      );
    }, 1000);
  }

  /**
   * Extract the original selection intent from message text or interactive data
   */
  private extractSelectionIntent(messageText: string, interactiveData?: any): string | null {
    // Extract selection from interactive data or text
    if (interactiveData && interactiveData.type === 'button_reply' && interactiveData.button_reply) {
      return interactiveData.button_reply.id;
    } else if (interactiveData && interactiveData.type === 'list_reply' && interactiveData.list_reply) {
      return interactiveData.list_reply.id;
    }
    
    // Check if messageText matches known selections
    const text = messageText.toLowerCase().trim();
    
    // Map various inputs to standard selections
    if (text === 'inventory_gujarati' || text === 'ઇન્વેન્ટરી' || text === '3') {
      return 'inventory_gujarati';
    } else if (text === 'activity_logging' || text === 'કામની નોંધ' || text === '1') {
      return 'activity_logging';
    } else if (text === 'material_request' || text === 'સામગ્રીની માંગ' || text === '2') {
      return 'material_request';
    } else if (text === 'dashboard' || text === 'ડેશબોર્ડ') {
      return 'dashboard';
    } else if (text === 'help' || text === 'મદદ') {
      return 'help';
    }
    
    return null;
  }

  /**
   * Handle main menu selection
   */
  private async handleMainMenuSelection(
    user: any,
    phone: string,
    messageText: string,
    interactiveData?: any
  ): Promise<void> {
    let selection: string;

    // Extract selection from interactive data or text
    if (interactiveData && interactiveData.type === 'button_reply' && interactiveData.button_reply) {
      selection = interactiveData.button_reply.id;
    } else if (interactiveData && interactiveData.type === 'list_reply' && interactiveData.list_reply) {
      selection = interactiveData.list_reply.id;
    } else {
      selection = messageText.toLowerCase().trim();
    }

    console.log('👷‍♂️ [EMPLOYEE-ORCHESTRATOR] Menu selection:', selection);

    switch (selection) {
      case 'activity_logging':
      case 'કામની નોંધ':
      case '1':
        await this.activityService.startFlow(phone);
        break;

      case 'material_request':
      case 'સામગ્રીની માંગ':
      case '2':
        await this.materialService.startFlow(phone);
        break;

      case 'inventory_gujarati':
      case 'ઇન્વેન્ટરી':
      case '3':
        await this.inventoryService.startFlow(phone);
        break;

      case 'dashboard':
      case 'ડેશબોર્ડ':
        await this.showDashboard(user, phone);
        break;

      case 'help':
      case 'મદદ':
        await this.showHelp(phone);
        break;

      default:
        await this.showMainMenu(user, phone);
        break;
    }
  }

  /**
   * Show dashboard
   */
  private async showDashboard(user: any, phone: string): Promise<void> {
    await whatsappService.sendTextMessage(phone,
      `📊 *તમારું ડેશબોર્ડ*

📅 આ અઠવાડિયે:
• કુલ નોંધાયેલા કલાકો: --
• નોંધાયેલી પ્રવૃત્તિઓ: --
• બાકી વિનંતીઓ: --

📝 તાજેતરની પ્રવૃત્તિઓ:
• --

📦 બાકી સામગ્રીની વિનંતીઓ:
• --

મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.`
    );
  }

  /**
   * Show help
   */
  private async showHelp(phone: string): Promise<void> {
    await whatsappService.sendTextMessage(phone,
      `❓ *મદદ અને માર્ગદર્શન*

🔤 *મુખ્ય કમાન્ડ્સ:*
• \`મેનુ\` - મુખ્ય મેનુ
• \`લોગ\` - ઝડપથી પ્રવૃત્તિ નોંધો
• \`સામગ્રી\` - સામગ્રીની માંગ
• \`ડેશબોર્ડ\` - તમારું ડેશબોર્ડ

📞 *સપોર્ટ:*
સમસ્યા માટે એડમિનનો સંપર્ક કરો.

મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.`
    );
  }
} 