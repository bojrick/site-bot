import { getDb } from '../../db';
import { sessions, users, invoices, sites } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { whatsappService, ImageMessage } from '../whatsapp';
import { CustomerFlow } from './customerFlow';
import { EmployeeFlow } from './employeeFlow';
import { InventoryFlow } from './inventoryFlow';
import { r2Service } from '../cloudflareR2';
import process from 'process';

export class AdminFlow {
  private customerFlow: CustomerFlow;
  private employeeFlow: EmployeeFlow;
  private inventoryFlow: InventoryFlow;
  private readonly MAX_UPLOAD_RETRIES = 2;
  private readonly UPLOAD_TIMEOUT_MS = 30000; // 30 seconds

  constructor() {
    this.customerFlow = new CustomerFlow();
    this.employeeFlow = new EmployeeFlow();
    this.inventoryFlow = new InventoryFlow();
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

  async handleMessage(
    user: any,
    session: any,
    messageText: string,
    interactiveData?: any,
    imageData?: ImageMessage
  ) {
    const phone = user.phone;
    
    console.log('🔧 [ADMIN] AdminFlow.handleMessage called with:', {
      phone,
      messageText,
      sessionIntent: session.intent,
      sessionStep: session.step,
      isAdminImpersonation: session.data?.is_admin_impersonation
    });

    // Check if admin is impersonating based on both session intent and impersonation flag
    const isEmployeeImpersonation = session.intent === 'impersonate_employee' || 
                                  (session.data?.is_admin_impersonation && session.data?.original_role === 'admin');
    
    const isCustomerImpersonation = session.intent === 'impersonate_customer' || 
                                  (session.data?.original_role === 'admin' && session.data?.customer_intent !== undefined);

    // Handle inventory management
    if (session.intent === 'inventory_management') {
      await this.inventoryFlow.handleMessage(user, session, messageText, interactiveData);
    } else if (isCustomerImpersonation) {
      await this.handleImpersonateCustomer(user, session, messageText, interactiveData);
    } else if (isEmployeeImpersonation) {
      await this.handleImpersonateEmployee(user, session, messageText, interactiveData, imageData);
    } else if (session.intent === 'track_invoices') {
      await this.handleInvoiceTracking(phone, session, messageText, imageData);
    } else {
      await this.handleMainMenu(user, messageText);
    }
  }

  private async handleMainMenu(user: any, messageText: string) {
    const phone = user.phone;
    const text = messageText.toLowerCase().trim();

    // Handle common commands
    if (text === 'menu' || text === 'main' || text === 'start' || text === 'admin') {
      await this.showMainMenu(phone);
      return;
    }

    if (text === 'help') {
      await this.showHelp(phone);
      return;
    }

    // Handle flow selections
    switch (text) {
      case 'customer_flow':
      case '1':
        await this.startImpersonateCustomer(phone, user);
        break;
      case 'employee_flow':
      case '2':
        await this.startImpersonateEmployee(phone, user);
        break;
      case 'track_invoices':
      case '3':
        await this.startInvoiceTracking(phone);
        break;
      case 'inventory_management':
      case '4':
        await this.startInventoryManagement(phone, user);
        break;
      case 'dashboard':
      case '5':
        await this.showAdminDashboard(phone);
        break;
      case 'reset_session':
      case '6':
        await this.resetSession(phone);
        break;
      default:
        await this.showMainMenu(phone);
        break;
    }
  }

  private async showMainMenu(phone: string) {
    const message = `🔧 *Admin Control Panel*

Welcome to the admin interface! Here you can manage all aspects of the system.

Select what you'd like to do:`;

    // Limit to 3 buttons as per WhatsApp's requirements
    const buttons = [
      { id: 'customer_flow', title: '👥 Customer Flow' },
      { id: 'employee_flow', title: '👷‍♂️ Employee Flow' },
      { id: 'track_invoices', title: '📋 Track Invoices' }
    ];

    await whatsappService.sendButtonMessage(phone, message, buttons);
    setTimeout(async () => {
      await whatsappService.sendListMessage(
        phone,
        "Additional admin options:",
        "More Options",
        [{
          title: "Management Tools",
          rows: [
            { id: 'inventory_management', title: '📦 Inventory Management', description: 'Manage inventory items and stock' },
            { id: 'dashboard', title: '📊 Admin Dashboard', description: 'View system statistics and status' },
            { id: 'reset_session', title: '🔄 Reset Session', description: 'Clear current session state' },
            { id: 'help', title: '❓ Help', description: 'Admin help and commands' }
          ]
        }]
      );
    }, 1000);
  }

  private async showHelp(phone: string) {
    const helpText = `🤝 *Admin Help & Commands*

*Available Commands:*
• *admin* or *menu* - Show admin main menu
• *customer_flow* - Act as customer (real record keeping)
• *employee_flow* - Act as employee (real record keeping)
• *reset* - Reset session and return to admin menu
• *dashboard* - View admin dashboard

*Impersonation:*
• Customer Flow: Create bookings, check pricing, etc. as a customer
• Employee Flow: Log activities, request materials, etc. as an employee

*Quick Commands:*
• During impersonation, type *exit* to return to admin menu
• Type *help* anytime for this help message

*System Status:*
• Database: ✅ Connected
• WhatsApp API: ✅ Active
• Admin Panel: ✅ Ready

Need technical support? Contact: admin@yourcompany.com`;

    await whatsappService.sendTextMessage(phone, helpText);
  }

  private async startImpersonateCustomer(phone: string, user: any) {
    await this.updateSession(phone, {
      intent: 'impersonate_customer',
      step: 'active',
      data: { original_role: 'admin' }
    });

    const message = `🧑‍💼 *Impersonating Customer*

You are now acting as a customer. All actions will be recorded as real customer records.
Type *exit* anytime to return to admin menu.`;
    await whatsappService.sendTextMessage(phone, message);

    const impersonatedUser = {
      ...user,
      role: 'customer',
      is_verified: true,
      introduction_sent: user.introduction_sent ?? false,
      introduction_sent_at: user.introduction_sent_at ?? null,
      email: user.email ?? null,
      verified_at: user.verified_at ?? null,
      created_at: user.created_at ?? new Date(),
      updated_at: user.updated_at ?? new Date(),
      name: user.name ?? null,
      id: user.id ?? 'impersonated-' + phone
    };

    // Initialize a clean customer session
    const customerSession = { phone, intent: null, step: null, data: {}, updated_at: new Date() };

    // Kick-off the customer flow
    setTimeout(async () => {
      await this.customerFlow.handleMessage(impersonatedUser, customerSession, 'start');

      // Fetch latest session state written by customer flow
      const latest = (await getDb().select().from(sessions).where(eq(sessions.phone, phone)).limit(1))[0];

      await this.updateSession(phone, {
        intent: 'impersonate_customer',
        step: 'active',
        data: {
          original_role: 'admin',
          customer_intent: latest?.intent === 'impersonate_customer' ? null : latest?.intent,
          customer_step: latest?.step === 'active' ? null : latest?.step,
          customer_data: latest?.data || customerSession.data
        }
      });
    }, 1000);
  }

  private async startImpersonateEmployee(phone: string, user: any) {
    console.log('🔧 [ADMIN] Starting employee impersonation - showing site selection first');
    
    await this.updateSession(phone, {
      intent: 'impersonate_employee',
      step: 'select_site',
      data: { original_role: 'admin' }
    });

    const message = `🧑‍💼 *Impersonating Employee*

You are now acting as an employee. All actions will be recorded as real employee records.

First, select which site you want to work on:`;
    
    await whatsappService.sendTextMessage(phone, message);
    
    // Show site selection immediately
    setTimeout(async () => {
      await this.showSiteSelection(phone);
    }, 1000);
  }

  private async showSiteSelection(phone: string) {
    try {
      console.log('🔧 [ADMIN] Showing site selection');
      
      // Fetch active sites from database
      const sitesFromDb = await getDb()
        .select()
        .from(sites)
        .where(eq(sites.status, 'active'));
      
      console.log('🔧 [ADMIN] Found sites in DB:', sitesFromDb.length);
      
      if (sitesFromDb.length === 0) {
        await whatsappService.sendTextMessage(phone, 
          "❌ No active sites found in the system. Please contact admin to add sites first."
        );
        await this.clearSession(phone);
        setTimeout(async () => {
          await this.showMainMenu(phone);
        }, 1000);
        return;
      }

      // Transform sites to WhatsApp list format
      const siteOptions = sitesFromDb.map((site) => {
        // Handle site details safely
        const siteDetails = site.details as any;
        return {
          id: site.id, // Use actual UUID as ID
          title: `🏗️ ${site.name}`,
          description: site.location || siteDetails?.description || 'સાઈટ વિગત'
        };
      });

      await whatsappService.sendListMessage(
        phone,
        "Select the site where you are working:",
        "Select Site",
        [{
          title: "Active Sites",
          rows: siteOptions
        }]
      );
      
    } catch (error) {
      console.error('Error fetching sites:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error loading sites. Please try again or contact technical support."
      );
      await this.clearSession(phone);
      setTimeout(async () => {
        await this.showMainMenu(phone);
      }, 1000);
    }
  }

  private async handleImpersonateCustomer(user: any, session: any, messageText: string, interactiveData?: any) {
    const phone = user.phone;
    const text = messageText.toLowerCase().trim();
    if (text === 'exit' || text === 'admin' || text === 'menu') {
      await this.clearSession(phone);
      await whatsappService.sendTextMessage(phone, "🔙 Exiting customer impersonation. Returning to admin panel...");
      setTimeout(async () => {
        await this.showMainMenu(phone);
      }, 1000);
      return;
    }

    const impersonatedUser = {
      ...user,
      role: 'customer',
      is_verified: true,
      introduction_sent: user.introduction_sent ?? false,
      introduction_sent_at: user.introduction_sent_at ?? null,
      email: user.email ?? null,
      verified_at: user.verified_at ?? null,
      created_at: user.created_at ?? new Date(),
      updated_at: user.updated_at ?? new Date(),
      name: user.name ?? null,
      id: user.id ?? 'impersonated-' + phone
    };

    // Reconstruct the nested customer session from admin session.data
    const customerSession = {
      phone,
      intent: session.data?.customer_intent || null,
      step: session.data?.customer_step || null,
      data: session.data?.customer_data || {},
      updated_at: new Date()
    };

    await this.customerFlow.handleMessage(impersonatedUser, customerSession, messageText, interactiveData);

    // Fetch latest session from DB to capture changes
    const latest = (await getDb().select().from(sessions).where(eq(sessions.phone, phone)).limit(1))[0];

    await this.updateSession(phone, {
      intent: 'impersonate_customer',
      step: 'active',
      data: {
        original_role: session.data?.original_role || 'admin',
        customer_intent: latest?.intent === 'impersonate_customer' ? null : latest?.intent,
        customer_step: latest?.step === 'active' ? null : latest?.step,
        customer_data: latest?.data || customerSession.data
      }
    });
  }

  private async handleImpersonateEmployee(user: any, session: any, messageText: string, interactiveData?: any, imageData?: ImageMessage) {
    const phone = user.phone;
    const text = messageText.toLowerCase().trim();
    
    console.log('🔧 [ADMIN] Employee impersonation step:', session.step, 'message:', messageText);
    
    // Handle exit commands
    if (text === 'exit' || text === 'admin' || text === 'menu') {
      await this.clearSession(phone);
      await whatsappService.sendTextMessage(phone, "🔙 Exiting employee impersonation. Returning to admin panel...");
      setTimeout(async () => {
        await this.showMainMenu(phone);
      }, 1000);
      return;
    }

    // Handle site selection in admin flow
    if (session.step === 'select_site') {
      console.log('🔧 [ADMIN] Validating site selection:', messageText);
      
      // Validate that the selected site exists in database
      try {
        const selectedSite = await getDb()
          .select()
          .from(sites)
          .where(eq(sites.id, messageText))
          .limit(1);
          
        if (selectedSite.length === 0) {
          await whatsappService.sendTextMessage(phone, "Please select a valid site from the list:");
          await this.showSiteSelection(phone);
          return;
        }
        
        console.log('🔧 [ADMIN] Valid site selected:', selectedSite[0].name);
        
      } catch (error) {
        console.error('Error validating site selection:', error);
        await whatsappService.sendTextMessage(phone, "Error validating site selection. Please try again:");
        await this.showSiteSelection(phone);
        return;
      }

      console.log('🔧 [ADMIN] Site selected:', messageText);
      
      // Site selected, now start employee flow with site pre-selected
      const impersonatedUser = {
        ...user,
        role: 'employee',
        is_verified: true,
        introduction_sent: true, // Skip intro for admin
        introduction_sent_at: new Date(),
        email: user.email ?? null,
        verified_at: new Date(),
        created_at: user.created_at ?? new Date(),
        updated_at: new Date(),
        name: user.name ?? null,
        id: user.id ?? 'impersonated-' + phone
      };

      // Update admin session to track employee impersonation
      await this.updateSession(phone, {
        intent: 'impersonate_employee',
        step: 'active',
        data: {
          site_id: messageText,
          original_role: 'admin',
          selected_site: messageText,
          is_admin_impersonation: true
        }
      });

      // Show welcome message and start employee flow
      await whatsappService.sendTextMessage(phone, 
        `✅ Site selected: ${await this.getSiteName(messageText)}\n\nNow you can use all employee functions. Type *exit* to return to admin panel.`
      );
      
      setTimeout(async () => {
        // Create a clean employee session with site pre-selected
        const employeeSession = {
          phone,
          intent: null,
          step: null,
          data: {
            selected_site: messageText,
            site_selection_shown: true,
            is_admin_impersonation: true
          },
          updated_at: new Date()
        };
        
        await this.employeeFlow.handleMessage(impersonatedUser, employeeSession, 'menu');
      }, 1000);
      
      return;
    }

    // For active employee flow, delegate directly without complex nested session management
    const impersonatedUser = {
      ...user,
      role: 'employee',
      is_verified: true,
      introduction_sent: true,
      introduction_sent_at: new Date(),
      email: user.email ?? null,
      verified_at: new Date(),
      created_at: user.created_at ?? new Date(),
      updated_at: new Date(),
      name: user.name ?? null,
      id: user.id ?? 'impersonated-' + phone
    };

    // Get the current session from database to avoid nested structures
    const currentSession = (await getDb().select().from(sessions).where(eq(sessions.phone, phone)).limit(1))[0];
    
    // Extract the actual employee session data, avoiding nested structures
    let employeeSessionData: any = {};
    let employeeIntent = null;
    let employeeStep = null;
    
    if (currentSession?.data && typeof currentSession.data === 'object') {
      const sessionData: any = currentSession.data;
      // If this is wrapped in admin session structure, extract the employee data
      if (sessionData.is_admin_impersonation || sessionData.original_role === 'admin') {
        employeeSessionData = {
          selected_site: sessionData.selected_site || sessionData.site_id,
          site_selection_shown: true,
          is_admin_impersonation: true
        };
        
        console.log('🔧 [ADMIN] Extracted session data for employee:', {
          selected_site: sessionData.selected_site,
          site_id: sessionData.site_id,
          final_selected_site: sessionData.selected_site || sessionData.site_id
        });
        
        // Extract any existing employee flow data
        if (sessionData.activity_type) {
          employeeSessionData.activity_type = sessionData.activity_type;
          employeeSessionData.hours = sessionData.hours;
          employeeSessionData.description = sessionData.description;
          employeeSessionData.image_info = sessionData.image_info;
        }
        
        // Check if there are employee flow intent/step that should be preserved
        if (currentSession.intent && currentSession.intent !== 'impersonate_employee') {
          employeeIntent = currentSession.intent;
        }
        if (currentSession.step && currentSession.step !== 'active') {
          employeeStep = currentSession.step;
        }
      } else {
        employeeSessionData = sessionData;
        // For regular employee sessions, preserve the intent and step
        employeeIntent = currentSession.intent;
        employeeStep = currentSession.step;
      }
    }

    // Create a clean employee session structure
    const employeeSession = {
      phone,
      intent: employeeIntent,
      step: employeeStep,
      data: employeeSessionData,
      updated_at: new Date()
    };

    console.log('🔧 [ADMIN] Delegating to employee flow with session:', JSON.stringify(employeeSession, null, 2));

    // Delegate to employee flow
    await this.employeeFlow.handleMessage(impersonatedUser, employeeSession, messageText, interactiveData, imageData);

    // After employee flow handles the message, get the updated session and preserve admin context
    const updatedSession = (await getDb().select().from(sessions).where(eq(sessions.phone, phone)).limit(1))[0];
    
    // Check if employee flow completed and returned to impersonation context
    if (updatedSession && updatedSession.intent === 'impersonate_employee' && updatedSession.step === 'active') {
      // Employee flow completed successfully and already restored admin context
      console.log('🔧 [ADMIN] Employee flow completed, admin context preserved');
      return;
    }
    
    // Only update if the session has changed and we're still in employee impersonation
    if (updatedSession && (updatedSession.intent !== 'impersonate_employee' || updatedSession.step !== 'active')) {
      // Employee flow updated the session, but we need to maintain admin impersonation context
      const sessionData: any = session.data || {};
      const updatedSessionData: any = updatedSession.data || {};
      
      // Check if this was a normal completion (session cleared) vs mid-flow update
      if (!updatedSession.intent && !updatedSession.step && Object.keys(updatedSessionData).length === 0) {
        // Session was completely cleared - this indicates employee flow completion for non-admin users
        // For admin impersonation, we should restore the admin context
        console.log('🔧 [ADMIN] Session was cleared, restoring admin impersonation context');
        await this.updateSession(phone, {
          intent: 'impersonate_employee',
          step: 'active',
          data: {
            original_role: 'admin',
            is_admin_impersonation: true,
            selected_site: sessionData.selected_site,
            site_selection_shown: true
          }
        });
      } else {
        // Regular mid-flow update - preserve the employee flow intent/step but wrap in admin context
        console.log('🔧 [ADMIN] Preserving employee flow state:', {
          intent: updatedSession.intent,
          step: updatedSession.step
        });
        
        console.log('🔧 [ADMIN] Session data before update:', {
          original_selected_site: sessionData.selected_site,
          updated_selected_site: updatedSessionData.selected_site,
          site_id: updatedSessionData.site_id
        });
        
        await this.updateSession(phone, {
          intent: updatedSession.intent || 'impersonate_employee',
          step: updatedSession.step || 'active',
          data: {
            original_role: 'admin',
            is_admin_impersonation: true,
            selected_site: sessionData.selected_site || updatedSessionData.selected_site,
            site_selection_shown: true,
            // Copy all relevant properties from updated session
            ...updatedSessionData
          }
        });
      }
    }
  }

  // Helper methods
  private async getSiteName(siteId: string | undefined): Promise<string> {
    if (!siteId) return 'Unknown Site';
    
    try {
      const site = await getDb()
        .select()
        .from(sites)
        .where(eq(sites.id, siteId))
        .limit(1);
      
      return site[0]?.name || 'Unknown Site';
    } catch (error) {
      console.error('Error fetching site name:', error);
      return 'Unknown Site';
    }
  }

  private async showAdminDashboard(phone: string) {
    try {
      // Get system statistics
      const usersCount = await getDb().select().from(users);
      const sessionsCount = await getDb().select().from(sessions);
      const invoicesCount = await getDb().select().from(invoices);
      
      const totalUsers = usersCount.length;
      const activeUsers = usersCount.filter(u => u.is_verified).length;
      const activeSessions = sessionsCount.filter(s => s.intent).length;
      
      const customerCount = usersCount.filter(u => u.role === 'customer').length;
      const employeeCount = usersCount.filter(u => u.role === 'employee').length;
      const adminCount = usersCount.filter(u => u.role === 'admin').length;

      const totalInvoices = invoicesCount.length;
      const totalInvoiceAmount = invoicesCount.reduce((sum, invoice) => sum + (invoice.amount || 0), 0);
      const pendingInvoices = invoicesCount.filter(inv => inv.status === 'received').length;

      const dashboardMessage = `📊 *Admin Dashboard*

*System Overview:*
• Total Users: ${totalUsers}
• Active Users: ${activeUsers}
• Active Sessions: ${activeSessions}

*User Breakdown:*
• 👥 Customers: ${customerCount}
• 👷‍♂️ Employees: ${employeeCount}
• 🔧 Admins: ${adminCount}

*Invoice Statistics:*
• 🧾 Total Invoices: ${totalInvoices}
• 💰 Total Amount: ₹${(totalInvoiceAmount / 100).toFixed(2)}
• ⏳ Pending Invoices: ${pendingInvoices}

*Recent Activity:*
• Database: ✅ Operational
• WhatsApp API: ✅ Connected
• Flows: ✅ Customer, Employee & Invoice flows active

*Quick Actions:*
• Type *customer_flow* - Act as customer
• Type *employee_flow* - Act as employee
• Type *track_invoices* - Add new invoice
• Type *menu* - Return to main menu

System uptime: Running smoothly 🟢`;

      await whatsappService.sendTextMessage(phone, dashboardMessage);

    } catch (error) {
      console.error('Error fetching admin dashboard:', error);
      await whatsappService.sendTextMessage(phone, "❌ Error loading dashboard. Please try again or contact technical support.");
    }
  }

  private async resetSession(phone: string) {
    await this.clearSession(phone);
    await whatsappService.sendTextMessage(phone, "🔄 Session reset successfully! All test states cleared.");
    setTimeout(async () => {
      await this.showMainMenu(phone);
    }, 1000);
  }

  private async startInvoiceTracking(phone: string) {
    await this.updateSession(phone, {
      intent: 'track_invoices',
      step: 'enter_company_name',
      data: {}
    });

    await whatsappService.sendTextMessage(phone, "🧾 *Invoice Tracking - Admin Panel*\n\nWhich company is this invoice from? Enter company name:");
  }

  private async startInventoryManagement(phone: string, user: any) {
    console.log('🔧 [ADMIN] Starting inventory management');
    
    await whatsappService.sendTextMessage(phone, 
      `📦 *Inventory Management*\n\nStarting inventory management system...\nType *exit* anytime to return to admin panel.`
    );
    
    // Start inventory flow - just show the main menu
    setTimeout(async () => {
      await this.inventoryFlow.handleMessage(user, { intent: 'inventory_management', step: null, data: { user_id: user.id } }, '');
    }, 1000);
  }

  // Centralized image upload handler for admin
  private async handleAdminImageUpload(
    phone: string, 
    currentData: any, 
    messageText: string, 
    imageData?: ImageMessage,
    folderName: string = 'admin-invoices',
    photoDescription: string = 'Invoice Photo'
  ): Promise<boolean> {
    const retryCount = currentData.upload_retry_count || 0;
    
    if (imageData) {
      // Validate image before upload
      if (!this.validateImageData(imageData)) {
        await whatsappService.sendTextMessage(phone, "❌ Invalid photo format. Please upload JPEG or PNG photo or type 'skip'.");
        return false;
      }

      await whatsappService.sendTextMessage(phone, `📤 Uploading ${photoDescription.toLowerCase()}...`);
      
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
          
          await whatsappService.sendTextMessage(phone, "✅ Photo uploaded successfully!");
          
          await this.completeInvoiceTracking(phone, {
            ...currentData,
            image_info: imageInfo
          });
          
          return true;
        } else {
          throw new Error(uploadResult.error || 'Unknown upload error');
        }
        
      } catch (error) {
        console.error('Admin R2 upload error:', error);
        
        if (retryCount < this.MAX_UPLOAD_RETRIES) {
          // Allow retry
          await this.updateSession(phone, {
            step: 'upload_invoice_image',
            data: { ...currentData, upload_retry_count: retryCount + 1 }
          });
          
          const errorMessage = error instanceof Error && error.message === 'Upload timeout' 
            ? "⏰ Upload timeout occurred."
            : "❌ Photo upload failed.";
            
          await whatsappService.sendTextMessage(phone, 
            `${errorMessage} Please try again (${retryCount + 1}/${this.MAX_UPLOAD_RETRIES + 1}) or type 'skip'.`
          );
        } else {
          // Max retries reached
          await whatsappService.sendTextMessage(phone, 
            "❌ Photo upload failed repeatedly. Type 'skip' to continue or try again later."
          );
        }
        return false;
      }
      
    } else if (messageText.toLowerCase() === 'skip') {
      await this.completeInvoiceTracking(phone, { ...currentData, image_info: null });
      return true;
    } else {
      await whatsappService.sendTextMessage(phone, "Please upload the invoice photo or type 'skip':");
      return false;
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

  private async handleInvoiceTracking(phone: string, session: any, messageText: string, imageData?: ImageMessage) {
    const currentData = session.data || {};

    switch (session.step) {
      case 'enter_company_name':
        if (!messageText.trim()) {
          await whatsappService.sendTextMessage(phone, "Please enter the company name:");
          return;
        }

        await this.updateSession(phone, {
          step: 'enter_invoice_description',
          data: { ...currentData, company_name: messageText.trim() }
        });

        await whatsappService.sendTextMessage(phone, "📝 What is this invoice for? (e.g., materials purchase, service, electricity bill, etc.):");
        break;

      case 'enter_invoice_description':
        if (!messageText.trim()) {
          await whatsappService.sendTextMessage(phone, "Please enter the invoice description:");
          return;
        }

        await this.updateSession(phone, {
          step: 'enter_invoice_date',
          data: { ...currentData, invoice_description: messageText.trim() }
        });

        await whatsappService.sendTextMessage(phone, "📅 What is the invoice date? (Enter in DD/MM/YYYY format, e.g., 15/12/2024):");
        break;

      case 'enter_invoice_date':
        const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        const dateMatch = messageText.trim().match(datePattern);
        
        if (!dateMatch) {
          await whatsappService.sendTextMessage(phone, "Please enter a valid date in DD/MM/YYYY format, e.g., 15/12/2024:");
          return;
        }

        const [, day, month, year] = dateMatch;
        const invoiceDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        if (isNaN(invoiceDate.getTime()) || invoiceDate > new Date()) {
          await whatsappService.sendTextMessage(phone, "Please enter a valid date (future dates not allowed):");
          return;
        }

        await this.updateSession(phone, {
          step: 'enter_amount',
          data: { ...currentData, invoice_date: invoiceDate }
        });

        await whatsappService.sendTextMessage(phone, "💰 What is the invoice amount? (Enter numbers only, e.g., 5000):");
        break;

      case 'enter_amount':
        const amount = parseFloat(messageText.trim());
        
        if (isNaN(amount) || amount <= 0) {
          await whatsappService.sendTextMessage(phone, "Please enter a valid amount (numbers only, e.g., 5000):");
          return;
        }

        await this.updateSession(phone, {
          step: 'upload_invoice_image',
          data: { ...currentData, amount: Math.round(amount * 100), upload_retry_count: 0 } // Store in paise
        });

        await whatsappService.sendTextMessage(phone, "📸 *Now upload the invoice photo:*\n\n• Clear and readable photo\n• All parts of the invoice should be visible\n• Upload photo or type 'skip'");
        break;

      case 'upload_invoice_image':
        await this.handleAdminImageUpload(phone, currentData, messageText, imageData);
        break;
    }
  }

  private async completeInvoiceTracking(phone: string, invoiceData: any) {
    try {
      // For admin, we'll use the admin user ID
      const adminUser = await getDb().select().from(users).where(eq(users.phone, phone));
      
      const invoice = await getDb().insert(invoices).values({
        user_id: adminUser[0].id,
        company_name: invoiceData.company_name,
        invoice_description: invoiceData.invoice_description,
        invoice_date: invoiceData.invoice_date,
        amount: invoiceData.amount,
        site_id: null, // Admin invoices may not be tied to specific sites
        image_url: invoiceData.image_info?.url || null,
        image_key: invoiceData.image_info?.key || null,
        notes: 'Added by admin via WhatsApp'
      }).returning();

      await this.clearSession(phone);

      const imageStatus = invoiceData.image_info ? '📸 With photo' : '📝 Without photo';
      const confirmationMessage = `✅ *Invoice successfully recorded!*

🧾 *Invoice Details:*
• Company: ${invoiceData.company_name}
• Description: ${invoiceData.invoice_description}
• Date: ${invoiceData.invoice_date.toLocaleDateString('en-US')}
• Amount: ₹${(invoiceData.amount / 100).toFixed(2)}
• ${imageStatus}

*Invoice ID:* ${invoice[0].id.slice(0, 8)}

The invoice has been added to the accounting system for processing.

Type *menu* to return to the admin panel.`;

      await whatsappService.sendTextMessage(phone, confirmationMessage);

    } catch (error) {
      console.error('Error tracking admin invoice:', error);
      await whatsappService.sendTextMessage(phone, "Sorry, there was an error recording your invoice. Please try again.");
      await this.clearSession(phone);
    }
  }
} 