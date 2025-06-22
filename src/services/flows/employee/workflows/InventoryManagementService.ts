import { getDb } from '../../../../db';
import { inventory_items, inventory_transactions, sessions } from '../../../../db/schema';
import { whatsappService, ImageMessage } from '../../../whatsapp';
import { SessionManager, EmployeeSessionData } from '../shared/SessionManager';
import { SiteContextService } from '../site/SiteContextService';
import { UserService } from '../../../userService';
import { r2Service } from '../../../cloudflareR2';
import { eq, and } from 'drizzle-orm';
import * as process from 'process';

interface CategoryConfig {
  id: string;
  gujarati_name: string;
  english_name: string;
  description: string;
}

interface InventoryItemWithStock {
  id: string;
  name: string;
  gujarati_name?: string;
  unit: string;
  gujarati_unit?: string;
  category: string;
  current_stock: number; // Calculated from transactions
}

export class InventoryManagementService {
  private sessionManager: SessionManager;
  private siteService: SiteContextService;
  private userService: UserService;
  
  private readonly MAX_UPLOAD_RETRIES = 2;
  private readonly UPLOAD_TIMEOUT_MS = 30000;
  private readonly ITEMS_PER_PAGE = 8; // Leave 2 slots for navigation

  // Inventory categories in Gujarati
  private readonly CATEGORIES: CategoryConfig[] = [
    {
      id: 'building_material',
      gujarati_name: '🏗️ બાંધકામ સામગ્રી',
      english_name: 'Building Materials',
      description: 'સિમેન્ટ, સ્ટીલ, ઈંટો, રેતી વગેરે'
    },
    {
      id: 'contractor_materials',
      gujarati_name: '🛠️ કોન્ટ્રાક્ટર સામગ્રી',
      english_name: 'Contractor Materials',
      description: 'સ્કેફોલ્ડિંગ, પ્રોપ્સ, ટૂલ્સ વગેરે'
    },
    {
      id: 'electrical_materials',
      gujarati_name: '⚡ ઇલેક્ટ્રિકલ સામગ્રી',
      english_name: 'Electrical Materials',
      description: 'વાયર, સ્વિચ, MCB વગેરે'
    }
  ];

  constructor() {
    this.sessionManager = new SessionManager();
    this.siteService = new SiteContextService(this.sessionManager);
    this.userService = new UserService();
  }

  /**
   * Get database session for admin impersonation
   */
  private async getDbSession(phone: string): Promise<any> {
    try {
      const result = await getDb()
        .select()
        .from(sessions)
        .where(eq(sessions.phone, phone))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('Error getting database session:', error);
      return null;
    }
  }

  /**
   * Update database session for admin impersonation
   */
  private async updateDbSession(phone: string, updates: any): Promise<void> {
    try {
      const currentSession = await this.getDbSession(phone);
      if (currentSession) {
        const updatedData = {
          ...currentSession.data,
          ...updates.data
        };
        
        await getDb()
          .update(sessions)
          .set({
            intent: updates.intent || currentSession.intent,
            step: updates.step || currentSession.step,
            data: updatedData,
            updated_at: new Date()
          })
          .where(eq(sessions.phone, phone));
      }
    } catch (error) {
      console.error('Error updating database session:', error);
    }
  }

  /**
   * Get session data (works for both session types)
   */
  private async getSessionData(phone: string): Promise<any> {
    // First try database session (for admin impersonation)
    const dbSession = await this.getDbSession(phone);
    if (dbSession?.data?.is_admin_impersonation) {
      return dbSession;
    }
    
    // Fall back to in-memory session (for regular employees)
    return await this.sessionManager.getSession(phone);
  }

  /**
   * Update session data (works for both session types)
   */
  private async updateSessionData(phone: string, updates: any): Promise<void> {
    // Check if this is admin impersonation
    const dbSession = await this.getDbSession(phone);
    if (dbSession?.data?.is_admin_impersonation) {
      await this.updateDbSession(phone, updates);
    } else {
      await this.sessionManager.updateSession(phone, updates);
    }
  }

  /**
   * Clear flow data (works for both session types)
   */
  private async clearFlowData(phone: string, keepSiteContext: boolean = false): Promise<void> {
    // Check if this is admin impersonation
    const dbSession = await this.getDbSession(phone);
    if (dbSession?.data?.is_admin_impersonation) {
      // For admin impersonation, just reset to the impersonation state
      await this.updateDbSession(phone, {
        intent: 'impersonate_employee',
        step: 'active',
        data: {
          original_role: 'admin',
          is_admin_impersonation: true,
          selected_site: dbSession.data.selected_site,
          site_selection_shown: true
        }
      });
    } else {
      await this.sessionManager.clearFlowData(phone, keepSiteContext);
    }
  }

  /**
   * Start the Gujarati inventory management flow
   */
  async startFlow(phone: string): Promise<void> {
    console.log('📦 [INVENTORY-GUJARATI] Starting Gujarati inventory management flow');
    
    // Check if this is admin impersonation by looking at the database session
    const dbSession = await this.getDbSession(phone);
    const isAdminImpersonation = dbSession?.data?.is_admin_impersonation || false;
    
    if (isAdminImpersonation) {
      // For admin impersonation, use database session management
      await this.updateDbSession(phone, {
        intent: 'inventory_management_gujarati',
        step: 'select_operation'
      });
      console.log('📦 [INVENTORY-GUJARATI] Using database session for admin impersonation');
    } else {
      // For regular employee sessions, use in-memory session management
      await this.sessionManager.startFlow(phone, 'inventory_management_gujarati', 'select_operation');
    }
    
    await this.showOperationSelection(phone);
  }

  /**
   * Handle inventory management flow steps
   */
  async handleFlowStep(
    user: any,
    phone: string,
    messageText: string,
    interactiveData?: any,
    imageData?: ImageMessage
  ): Promise<void> {
    const session = await this.getSessionData(phone);
    
    if (!session) {
      console.error('📦 [INVENTORY-GUJARATI] No session found');
      return;
    }

    console.log('📦 [INVENTORY-GUJARATI] Handling step:', session.step, 'with message:', messageText.substring(0, 50), 'interactive:', !!interactiveData);

    switch (session.step) {
      case 'select_operation':
        await this.handleOperationSelection(phone, messageText, interactiveData);
        break;
        
      case 'select_category':
        await this.handleCategorySelection(phone, messageText, interactiveData);
        break;
        
      case 'select_item':
        await this.handleItemSelection(phone, messageText, interactiveData);
        break;
        
      case 'enter_quantity':
        await this.handleQuantityEntry(phone, messageText);
        break;
        
      case 'enter_notes':
        await this.handleNotesEntry(phone, messageText);
        break;
        
      case 'upload_image':
        await this.handleImageUpload(phone, messageText, imageData);
        break;
        
      default:
        console.log('📦 [INVENTORY-GUJARATI] Unknown step:', session.step);
        await this.startFlow(phone);
        break;
    }
  }

  /**
   * Show operation selection using buttons
   */
  private async showOperationSelection(phone: string): Promise<void> {
    const message = `📦 *ઇન્વેન્ટરી મેનેજમેન્ટ*

તમે શું કરવા માંગો છો?`;

    const buttons = [
      { id: 'item_in', title: '📦 સ્ટોક ઉમેરો' },
      { id: 'item_out', title: '📤 સ્ટોક કાઢો' },
      { id: 'stock_report', title: '📊 સ્ટોક રિપોર્ટ' }
    ];

    await whatsappService.sendButtonMessage(phone, message, buttons);
  }

  /**
   * Handle operation selection
   */
  private async handleOperationSelection(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    // Extract the selection properly from interactiveData or messageText
    let selection: string;
    
    if (interactiveData) {
      if (interactiveData.type === 'button_reply' && interactiveData.button_reply) {
        selection = interactiveData.button_reply.id;
      } else if (interactiveData.type === 'list_reply' && interactiveData.list_reply) {
        selection = interactiveData.list_reply.id;
      } else if (typeof interactiveData === 'string') {
        selection = interactiveData;
      } else {
        selection = messageText.toLowerCase().trim();
      }
    } else {
      selection = messageText.toLowerCase().trim();
    }

    console.log('📦 [INVENTORY-GUJARATI] Operation selected:', selection);

    const session = await this.getSessionData(phone);
    const sessionData = session?.data || {};

    switch (selection) {
      case 'item_in':
        await this.updateSessionData(phone, {
          step: 'select_category',
          data: {
            ...sessionData,
            operation: 'item_in'
          }
        });
        await this.showCategorySelection(phone, 'item_in');
        break;
        
      case 'item_out':
        await this.updateSessionData(phone, {
          step: 'select_category',
          data: {
            ...sessionData,
            operation: 'item_out'
          }
        });
        await this.showCategorySelection(phone, 'item_out');
        break;
        
      case 'stock_report':
        await this.showStockReport(phone);
        return;
        
      default:
        await whatsappService.sendTextMessage(phone, 
          "❌ કૃપા કરીને યોગ્ય વિકલ્પ પસંદ કરો:"
        );
        await this.showOperationSelection(phone);
        break;
    }
  }

  /**
   * Show category selection using list message
   */
  private async showCategorySelection(phone: string, operation: string): Promise<void> {
    const operationText = this.getOperationText(operation);
    
    const message = `📂 *કેટેગરી પસંદ કરો*

${operationText} માટે કઈ પ્રકારની સામગ્રી?`;

    const categoryRows = this.CATEGORIES.map(category => ({
      id: category.id,
      title: category.gujarati_name,
      description: category.description
    }));

    await whatsappService.sendListMessage(
      phone,
      message,
      "કેટેગરી પસંદ કરો",
      [{
        title: "ઇન્વેન્ટરી કેટેગરીઓ",
        rows: categoryRows
      }]
    );
  }

  /**
   * Handle category selection
   */
  private async handleCategorySelection(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    // Extract the category properly from interactiveData or messageText
    let categoryId: string;
    
    if (interactiveData) {
      if (interactiveData.type === 'list_reply' && interactiveData.list_reply) {
        categoryId = interactiveData.list_reply.id;
      } else if (typeof interactiveData === 'string') {
        categoryId = interactiveData;
      } else {
        categoryId = messageText.trim();
      }
    } else {
      categoryId = messageText.trim();
    }

    const selectedCategory = this.CATEGORIES.find(cat => cat.id === categoryId);
    
    if (!selectedCategory) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય કેટેગરી પસંદ કરો:"
      );
      const session = await this.getSessionData(phone);
      await this.showCategorySelection(phone, session?.data?.operation || 'item_in');
      return;
    }

    const session = await this.getSessionData(phone);
    const sessionData = session?.data || {};

    await this.updateSessionData(phone, {
      step: 'select_item',
      data: {
        ...sessionData,
        category: selectedCategory.id,
        page: 1
      }
    });

    await this.showItemSelection(phone, selectedCategory, sessionData.operation, 1);
  }

  /**
   * Show item selection with pagination
   */
  private async showItemSelection(phone: string, category: CategoryConfig, operation: string, page: number): Promise<void> {
    try {
      console.log('📦 [INVENTORY-GUJARATI] Showing item selection for category:', category.id, 'page:', page);
      
      const items = await this.getItemsByCategory(category.id);
      
      if (items.length === 0) {
        await whatsappService.sendTextMessage(phone, 
          `❌ આ કેટેગરીમાં કોઈ આઇટમ મળી નથી: ${category.gujarati_name}

નવી આઇટમ ઉમેરવા માટે એડમિનનો સંપર્ક કરો.`
        );
        return;
      }

      // Get current site context for stock calculation
      const siteContext = await this.siteService.getCurrentSiteContext(phone);
      if (!siteContext) {
        await whatsappService.sendTextMessage(phone, 
          "❌ સાઈટ માહિતી મળી નથી. કૃપા કરીને ફરીથી પ્રયાસ કરો."
        );
        return;
      }

      // Calculate current stock for each item for this site
      const itemsWithStock: InventoryItemWithStock[] = await Promise.all(
        items.map(async (item): Promise<InventoryItemWithStock> => {
          const currentStock = await this.calculateItemStock(item.id, siteContext.siteId);
          return {
            id: item.id,
            name: item.name,
            gujarati_name: item.gujarati_name || undefined,
            unit: item.unit,
            gujarati_unit: item.gujarati_unit || undefined,
            category: item.category || '',
            current_stock: currentStock
          };
        })
      );

      // Filter items based on operation
      let filteredItems = itemsWithStock;
      if (operation === 'item_out') {
        filteredItems = itemsWithStock.filter(item => (item.current_stock || 0) > 0);
        if (filteredItems.length === 0) {
          await whatsappService.sendTextMessage(phone, 
            `❌ આ કેટેગરીમાં સ્ટોક ધરાવતી કોઈ આઇટમ નથી: ${category.gujarati_name}

પહેલા સ્ટોક ઉમેરો.`
          );
          return;
        }
      }

      await this.showItemListWithPagination(phone, filteredItems, category, operation, page);

    } catch (error) {
      console.error('Error showing item selection:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ આઇટમ લોડ કરવામાં ભૂલ. ફરીથી પ્રયાસ કરો."
      );
    }
  }

  /**
   * Show item list with pagination
   */
  private async showItemListWithPagination(
    phone: string, 
    items: InventoryItemWithStock[], 
    category: CategoryConfig, 
    operation: string, 
    page: number
  ): Promise<void> {
    const totalPages = Math.ceil(items.length / this.ITEMS_PER_PAGE);
    const startIndex = (page - 1) * this.ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + this.ITEMS_PER_PAGE, items.length);
    const pageItems = items.slice(startIndex, endIndex);

    const operationText = this.getOperationText(operation);
    const stockText = operation === 'item_in' ? 'વર્તમાન' : 'ઉપલબ્ધ';

    const itemOptions = pageItems.map(item => {
      const displayName = item.gujarati_name || item.name;
      const displayUnit = item.gujarati_unit || item.unit;
      const itemTitle = displayName.length > 24 ? `${displayName.substring(0, 21)}...` : displayName;
      
      return {
        id: item.id,
        title: itemTitle,
        description: `${stockText}: ${item.current_stock || 0} ${displayUnit}`
      };
    });

    // Add navigation options
    const rows = [...itemOptions];
    
    if (totalPages > 1) {
      if (page > 1) {
        rows.push({
          id: `prev_page_${page - 1}`,
          title: `◀️ પાછલું પાનું`,
          description: `પાનું ${page - 1} / ${totalPages}`
        });
      }
      if (page < totalPages) {
        rows.push({
          id: `next_page_${page + 1}`,
          title: `▶️ આગળનું પાનું`,
          description: `પાનું ${page + 1} / ${totalPages}`
        });
      }
    }

    const pageInfo = totalPages > 1 
      ? `\n📄 પાનું ${page} / ${totalPages} (કુલ ${items.length} આઇટમ)` 
      : `\n📦 ${items.length} આઇટમ ઉપલબ્ધ`;

    await whatsappService.sendListMessage(
      phone,
      `📦 *${category.gujarati_name} - ${operationText}*\n\nઆઇટમ પસંદ કરો:${pageInfo}`,
      "આઇટમ પસંદ કરો",
      [{
        title: category.gujarati_name,
        rows: rows
      }]
    );

    // Store filtered items in session for reference
    const session = await this.getSessionData(phone);
    const sessionData = session?.data || {};
    await this.updateSessionData(phone, {
      data: {
        ...sessionData,
        available_items: items,
        page: page
      }
    });
  }

  /**
   * Handle item selection
   */
  private async handleItemSelection(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    // Extract the item ID properly from interactiveData or messageText
    let itemId: string;
    
    if (interactiveData) {
      if (interactiveData.type === 'list_reply' && interactiveData.list_reply) {
        itemId = interactiveData.list_reply.id;
      } else if (typeof interactiveData === 'string') {
        itemId = interactiveData;
      } else {
        itemId = messageText.trim();
      }
    } else {
      itemId = messageText.trim();
    }

    const session = await this.getSessionData(phone);
    const sessionData = session?.data || {};
    const availableItems = sessionData.available_items || [];
    const currentPage = sessionData.page || 1;

    // Handle pagination
    if (itemId.startsWith('next_page_') || itemId.startsWith('prev_page_')) {
      const pageNumber = parseInt(itemId.split('_')[2]);
      const category = this.CATEGORIES.find(cat => cat.id === sessionData.category);
      
      if (category) {
        await this.updateSessionData(phone, {
          data: {
            ...sessionData,
            page: pageNumber
          }
        });
        await this.showItemSelection(phone, category, sessionData.operation, pageNumber);
      }
      return;
    }

    const selectedItem = availableItems.find((item: InventoryItemWithStock) => item.id === itemId);
    
    if (!selectedItem) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય આઇટમ પસંદ કરો:"
      );
      return;
    }

    await this.updateSessionData(phone, {
      step: 'enter_quantity',
      data: {
        ...sessionData,
        selected_item: selectedItem
      }
    });

    const displayName = selectedItem.gujarati_name || selectedItem.name;
    const displayUnit = selectedItem.gujarati_unit || selectedItem.unit;
    const operationText = sessionData.operation === 'item_in' ? 'ઉમેરવાની' : 'કાઢવાની';

    let quantityMessage = `✅ પસંદ કરેલ આઇટમ: ${displayName}

📊 વર્તમાન સ્ટોક: ${selectedItem.current_stock || 0} ${displayUnit}

🔢 ${operationText} માત્રા દાખલ કરો:`;

    if (sessionData.operation === 'item_out') {
      quantityMessage += `\n\n⚠️ મહત્તમ: ${selectedItem.current_stock || 0} ${displayUnit}`;
    }

    await whatsappService.sendTextMessage(phone, quantityMessage);
  }

  /**
   * Handle quantity entry
   */
  private async handleQuantityEntry(phone: string, messageText: string): Promise<void> {
    const quantity = parseInt(messageText.trim());
    const session = await this.getSessionData(phone);
    const sessionData = session?.data || {};
    const selectedItem = sessionData.selected_item;

    if (!selectedItem) {
      await whatsappService.sendTextMessage(phone, "❌ આઇટમ માહિતી મળી નથી. ફરીથી શરૂ કરો.");
      await this.startFlow(phone);
      return;
    }

    if (isNaN(quantity) || quantity <= 0) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય માત્રા દાખલ કરો (0 કરતા વધુ):"
      );
      return;
    }

    // Check stock for item_out operation
    if (sessionData.operation === 'item_out' && quantity > (selectedItem.current_stock || 0)) {
      await whatsappService.sendTextMessage(phone, 
        `❌ અપૂરતો સ્ટોક! ઉપલબ્ધ: ${selectedItem.current_stock || 0}, માંગેલ: ${quantity}

કૃપા કરીને યોગ્ય માત્રા દાખલ કરો:`
      );
      return;
    }

    await this.updateSessionData(phone, {
      step: 'enter_notes',
      data: {
        ...sessionData,
        quantity: quantity
      }
    });

    await whatsappService.sendTextMessage(phone, 
      `✅ માત્રા: ${quantity} ${selectedItem.gujarati_unit || selectedItem.unit}

📝 *ટિપ્પણી (વૈકલ્પિક):*

કૃપા કરીને ટિપ્પણી લખો અથવા 'skip' ટાઈપ કરો છોડવા માટે:`
    );
  }

  /**
   * Handle notes entry
   */
  private async handleNotesEntry(phone: string, messageText: string): Promise<void> {
    const notes = messageText.toLowerCase().trim() === 'skip' ? '' : messageText.trim();
    const session = await this.getSessionData(phone);
    const sessionData = session?.data || {};

    await this.updateSessionData(phone, {
      step: 'upload_image',
      data: {
        ...sessionData,
        notes: notes,
        upload_retry_count: 0
      }
    });

    const notesText = notes ? `✅ ટિપ્પણી: ${notes}` : '📝 કોઈ ટિપ્પણી નથી';

    await whatsappService.sendTextMessage(phone, 
      `${notesText}

📸 *ફોટો અપલોડ કરો (ફરજિયાત):*

🚨 **મહત્વપૂર્ણ**: સ્ટોકનો ફોટો અપલોડ કરવો ફરજિયાત છે.

કૃપા કરીને નીચેમાંથી કોઈ એક અપલોડ કરો:
• સ્ટોકનો ફોટો
• સામગ્રીનો ફોટો  
• સ્ટોરેજ એરિયાનો ફોટો
• ડોક્યુમેન્ટેશનનો ફોટો

📱 ફોટો અપલોડ કરો:`
    );
  }

  /**
   * Handle image upload (MANDATORY)
   */
  private async handleImageUpload(phone: string, messageText: string, imageData?: ImageMessage): Promise<void> {
    const session = await this.getSessionData(phone);
    const sessionData = session?.data || {};
    const retryCount = sessionData.upload_retry_count || 0;

    if (!imageData) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને ફોટો અપલોડ કરો.\n\n" +
        "📱 તમારા ફોનમાંથી ગેલેરી અથવા કેમેરાનો ઉપયોગ કરીને ફોટો મોકલો."
      );
      return;
    }

    if (!this.validateImageData(imageData)) {
      await whatsappService.sendTextMessage(phone, 
        "❌ અયોગ્ય ફોટો ફોર્મેટ. કૃપા કરીને JPEG અથવા PNG ફોટો અપલોડ કરો."
      );
      return;
    }

    await whatsappService.sendTextMessage(phone, "📤 ફોટો અપલોડ કરી રહ્યા છીએ...");
    
    try {
      const uploadPromise = r2Service.uploadFromWhatsAppMedia(
        imageData.id,
        process.env.META_WHATSAPP_TOKEN!,
        'inventory'
      );
      
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Upload timeout')), this.UPLOAD_TIMEOUT_MS)
      );
      
      const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
      
      if (uploadResult.success) {
        const imageInfo = {
          url: uploadResult.url,
          key: uploadResult.key,
          caption: imageData.caption || 'સ્ટોક ફોટો',
          whatsapp_media_id: imageData.id,
          mime_type: imageData.mime_type,
          sha256: imageData.sha256
        };
        
        await whatsappService.sendTextMessage(phone, "✅ ફોટો સફળતાપૂર્વક અપલોડ થયો!");
        await this.completeInventoryTransaction(phone, { ...sessionData, image_info: imageInfo });
      } else {
        throw new Error(uploadResult.error || 'Unknown upload error');
      }
      
    } catch (error) {
      console.error('Image upload error:', error);
      
      if (retryCount < this.MAX_UPLOAD_RETRIES) {
        await this.updateSessionData(phone, {
          data: { 
            ...sessionData,
            upload_retry_count: retryCount + 1 
          }
        });
        
        const errorMessage = error instanceof Error && error.message === 'Upload timeout' 
          ? "⏰ અપલોડ ટાઈમઆઉટ થયો."
          : "❌ ફોટો અપલોડ કરવામાં ભૂલ.";
          
        await whatsappService.sendTextMessage(phone, 
          `${errorMessage} કૃપા કરીને ફરીથી પ્રયાસ કરો (${retryCount + 1}/${this.MAX_UPLOAD_RETRIES + 1}):\n\n` +
          "📱 ફોટો અપલોડ કરો ફરજિયાત છે."
        );
      } else {
        await whatsappService.sendTextMessage(phone, 
          "❌ ફોટો અપલોડ કરવામાં વારંવાર નિષ્ફળતા.\n\n" +
          "કૃપા કરીને:\n• ઇન્ટરનેટ કનેક્શન ચેક કરો\n• નાનો ફોટો અપલોડ કરો\n• પછીથી પ્રયાસ કરો"
        );
      }
      return;
    }
  }

  /**
   * Complete inventory transaction
   */
  private async completeInventoryTransaction(phone: string, transactionData: EmployeeSessionData): Promise<void> {
    try {
      const user = await this.userService.getUserByPhone(phone);
      const siteContext = await this.siteService.getCurrentSiteContext(phone);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      if (!siteContext) {
        throw new Error('Site context not found');
      }

      const selectedItem = transactionData.selected_item;
      const operation = transactionData.operation;
      const quantity = transactionData.quantity!;
      
      // Calculate current stock from transactions for this site
      const currentStock = await this.calculateItemStock(selectedItem.id, siteContext.siteId);

      let newStock: number;
      let transactionType: 'in' | 'out';

      if (operation === 'item_in') {
        newStock = currentStock + quantity;
        transactionType = 'in';
      } else {
        newStock = currentStock - quantity;
        transactionType = 'out';
      }

      // Record transaction with image info (no need to update inventory_items table)
      await getDb()
        .insert(inventory_transactions)
        .values({
          item_id: selectedItem.id,
          site_id: siteContext.siteId,
          transaction_type: transactionType,
          quantity: quantity,
          previous_stock: currentStock,
          new_stock: newStock,
          notes: transactionData.notes || `ગુજરાતી ફ્લો દ્વારા ${operation === 'item_in' ? 'સ્ટોક ઉમેર્યો' : 'સ્ટોક કાઢ્યો'}`,
          image_url: transactionData.image_info!.url,
          image_key: transactionData.image_info!.key,
          created_by: user.id
        });

      // Clear flow data but keep site context
      await this.clearFlowData(phone, true);

      const displayName = selectedItem.gujarati_name || selectedItem.name;
      const displayUnit = selectedItem.gujarati_unit || selectedItem.unit;
      const operationText = operation === 'item_in' ? 'ઉમેર્યો' : 'કાઢ્યો';

      const confirmationMessage = `✅ *ઇન્વેન્ટરી અપડેટ સફળ!*

📦 *વિગતો:*
• આઇટમ: ${displayName}
• ${operationText}: ${quantity} ${displayUnit}
• પહેલાનો સ્ટોક: ${currentStock} ${displayUnit}
• નવો સ્ટોક: ${newStock} ${displayUnit}
• સાઈટ: ${siteContext.siteName}
${transactionData.notes ? `• ટિપ્પણી: ${transactionData.notes}` : ''}
• 📸 ફોટો સેવ થયો

🕒 સમય: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

તમારી ઇન્વેન્ટરી અપડેટ સિસ્ટમમાં સેવ થઈ ગઈ છે!

મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.`;

      await whatsappService.sendTextMessage(phone, confirmationMessage);

    } catch (error) {
      console.error('Error completing inventory transaction:', error);
      
      let errorMessage = "❌ માફ કરશો, તમારી ઇન્વેન્ટરી અપડેટ કરવામાં ભૂલ થઈ.";
      
      if (error instanceof Error) {
        if (error.message.includes('Site context')) {
          errorMessage += " સાઈટ માહિતી મળી નથી.";
        } else if (error.message.includes('User not found')) {
          errorMessage += " વપરાશકર્તા માહિતી મળી નથી.";
        }
      }
      
      errorMessage += " કૃપા કરીને ફરીથી પ્રયાસ કરો અથવા એડમિનનો સંપર્ક કરો.";
      
      await whatsappService.sendTextMessage(phone, errorMessage);
      await this.clearFlowData(phone, true);
    }
  }

  /**
   * Calculate current stock for an item at a specific site from transactions
   */
  private async calculateItemStock(itemId: string, siteId: string): Promise<number> {
    try {
      const transactions = await getDb()
        .select()
        .from(inventory_transactions)
        .where(and(
          eq(inventory_transactions.item_id, itemId),
          eq(inventory_transactions.site_id, siteId)
        ));

      let currentStock = 0;
      for (const transaction of transactions) {
        if (transaction.transaction_type === 'in') {
          currentStock += transaction.quantity;
        } else {
          currentStock -= transaction.quantity;
        }
      }

      return Math.max(0, currentStock); // Ensure stock is never negative
    } catch (error) {
      console.error('Error calculating item stock:', error);
      return 0;
    }
  }

  /**
   * Show stock report
   */
  private async showStockReport(phone: string): Promise<void> {
    try {
      const siteContext = await this.siteService.getCurrentSiteContext(phone);
      if (!siteContext) {
        await whatsappService.sendTextMessage(phone, 
          "❌ સાઈટ માહિતી મળી નથી. કૃપા કરીને ફરીથી પ્રયાસ કરો."
        );
        return;
      }

      const items = await getDb()
        .select()
        .from(inventory_items)
        .where(eq(inventory_items.status, 'active'))
        .orderBy(inventory_items.category, inventory_items.name);

      if (items.length === 0) {
        await whatsappService.sendTextMessage(phone, 
          "📊 *સ્ટોક રિપોર્ટ*\n\nકોઈ આઇટમ મળી નથી."
        );
        return;
      }

      // Calculate stock for each item for the current site
      const itemsWithStock: InventoryItemWithStock[] = await Promise.all(
        items.map(async (item): Promise<InventoryItemWithStock> => {
          const currentStock = await this.calculateItemStock(item.id, siteContext.siteId);
          return {
            id: item.id,
            name: item.name,
            gujarati_name: item.gujarati_name || undefined,
            unit: item.unit,
            gujarati_unit: item.gujarati_unit || undefined,
            category: item.category || '',
            current_stock: currentStock
          };
        })
      );

      let message = `📊 *સ્ટોક રિપોર્ટ - ${siteContext.siteName}*\n\n🕒 સમય: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n`;

      // Group by category
      const groupedItems: { [key: string]: InventoryItemWithStock[] } = {};
      itemsWithStock.forEach(item => {
        const category = item.category || 'other';
        if (!groupedItems[category]) {
          groupedItems[category] = [];
        }
        groupedItems[category].push(item);
      });

      for (const [categoryId, categoryItems] of Object.entries(groupedItems)) {
        const categoryConfig = this.CATEGORIES.find(c => c.id === categoryId);
        const categoryName = categoryConfig?.gujarati_name || categoryId;
        
        message += `📂 **${categoryName}:**\n`;
        
        categoryItems.forEach(item => {
          const displayName = item.gujarati_name || item.name;
          const displayUnit = item.gujarati_unit || item.unit;
          const stockStatus = item.current_stock > 0 ? '✅' : '❌';
          message += `${stockStatus} ${displayName}: ${item.current_stock} ${displayUnit}\n`;
        });
        
        message += '\n';
      }

      message += `📊 કુલ આઇટમ્સ: ${items.length}\n\n`;
      message += 'મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.';

      await whatsappService.sendTextMessage(phone, message);

    } catch (error) {
      console.error('Error showing stock report:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ સ્ટોક રિપોર્ટ લોડ કરવામાં ભૂલ. ફરીથી પ્રયાસ કરો."
      );
    }
  }

  /**
   * Get items by category
   */
  private async getItemsByCategory(category: string): Promise<any[]> {
    console.log('📦 [INVENTORY-GUJARATI] Getting items for category:', category);
    
    return await getDb()
      .select()
      .from(inventory_items)
      .where(and(
        eq(inventory_items.category, category),
        eq(inventory_items.status, 'active')
      ))
      .orderBy(inventory_items.name);
  }

  /**
   * Get operation text in Gujarati
   */
  private getOperationText(operation: string): string {
    switch (operation) {
      case 'item_in':
        return 'સ્ટોક ઉમેરવા';
      case 'item_out':
        return 'સ્ટોક કાઢવા';
      case 'new_item':
        return 'નવી આઇટમ ઉમેરવા';
      default:
        return 'પ્રક્રિયા';
    }
  }

  /**
   * Validate image data
   */
  private validateImageData(imageData: ImageMessage): boolean {
    if (!imageData || !imageData.id) {
      return false;
    }
    
    if (imageData.mime_type) {
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      if (!validTypes.includes(imageData.mime_type.toLowerCase())) {
        return false;
      }
    }
    
    return true;
  }
} 