import { getDb } from '../../../../db';
import { inventory_items, inventory_transactions } from '../../../../db/schema';
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
   * Start the Gujarati inventory management flow
   */
  async startFlow(phone: string): Promise<void> {
    console.log('📦 [INVENTORY-GUJARATI] Starting Gujarati inventory management flow');
    
    await this.sessionManager.startFlow(phone, 'inventory_management_gujarati', 'select_operation');
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
    const session = await this.sessionManager.getSession(phone);
    
    if (!session) {
      console.error('📦 [INVENTORY-GUJARATI] No session found');
      return;
    }

    console.log('📦 [INVENTORY-GUJARATI] Handling step:', session.step, 'with message:', messageText.substring(0, 50));

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
   * Show operation selection (Stock In/Out)
   */
  private async showOperationSelection(phone: string): Promise<void> {
    const message = `📦 *ઇન્વેન્ટરી મેનેજમેન્ટ*

તમે શું કરવા માંગો છો?

*નંબર ટાઈપ કરો:*
1️⃣ સ્ટોક ઉમેરો (નવો સ્ટોક ઉમેરવા માટે)
2️⃣ સ્ટોક કાઢો (સ્ટોક કાઢવા માટે)  
3️⃣ નવી આઇટમ (નવી આઇટમ ઉમેરવા માટે)
4️⃣ સ્ટોક રિપોર્ટ (વર્તમાન સ્ટોક જોવા માટે)

*કૃપા કરીને નંબર ટાઈપ કરો (1-4):*`;

    await whatsappService.sendTextMessage(phone, message);
  }

  /**
   * Handle operation selection
   */
  private async handleOperationSelection(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    const operation = messageText.trim();
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};

    let operationType: string;
    switch (operation) {
      case '1':
        operationType = 'item_in';
        break;
      case '2':
        operationType = 'item_out';
        break;
      case '3':
        operationType = 'new_item';
        break;
      case '4':
        operationType = 'stock_report';
        await this.showStockReport(phone);
        return;
      default:
        await whatsappService.sendTextMessage(phone, 
          "❌ કૃપા કરીને યોગ્ય વિકલ્પ પસંદ કરો (1-4):"
        );
        await this.showOperationSelection(phone);
        return;
    }

    await this.sessionManager.updateSession(phone, {
      step: 'select_category',
      data: {
        ...sessionData,
        operation: operationType
      }
    });

    await this.showCategorySelection(phone, operationType);
  }

  /**
   * Show category selection
   */
  private async showCategorySelection(phone: string, operation: string): Promise<void> {
    const operationText = this.getOperationText(operation);
    
    const message = `📂 *કેટેગરી પસંદ કરો*

${operationText} માટે કઈ પ્રકારની સામગ્રી?

*નંબર ટાઈપ કરો:*
1️⃣ ${this.CATEGORIES[0].gujarati_name} (${this.CATEGORIES[0].description})
2️⃣ ${this.CATEGORIES[1].gujarati_name} (${this.CATEGORIES[1].description})
3️⃣ ${this.CATEGORIES[2].gujarati_name} (${this.CATEGORIES[2].description})

*કૃપા કરીને નંબર ટાઈપ કરો (1-3):*`;

    await whatsappService.sendTextMessage(phone, message);
  }

  /**
   * Handle category selection
   */
  private async handleCategorySelection(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    const categoryIndex = parseInt(messageText.trim()) - 1;
    
    if (categoryIndex < 0 || categoryIndex >= this.CATEGORIES.length) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય કેટેગરી પસંદ કરો (1-3):"
      );
      const session = await this.sessionManager.getSession(phone);
      await this.showCategorySelection(phone, session?.data?.operation || 'item_in');
      return;
    }

    const selectedCategory = this.CATEGORIES[categoryIndex];
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};

    await this.sessionManager.updateSession(phone, {
      step: 'select_item',
      data: {
        ...sessionData,
        category: selectedCategory.id
      }
    });

    await this.showItemSelection(phone, selectedCategory, sessionData.operation);
  }

  /**
   * Show item selection
   */
  private async showItemSelection(phone: string, category: CategoryConfig, operation: string): Promise<void> {
    try {
      console.log('📦 [INVENTORY-GUJARATI] Showing item selection for category:', category.id);
      
      const items = await this.getItemsByCategory(category.id);
      
      if (items.length === 0) {
        await whatsappService.sendTextMessage(phone, 
          `❌ આ કેટેગરીમાં કોઈ આઇટમ મળી નથી: ${category.gujarati_name}

નવી આઇટમ ઉમેરવા માટે ઓપશન 3 પસંદ કરો.`
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

      const operationText = this.getOperationText(operation);
      let message = `📦 *${category.gujarati_name} - ${operationText}*

આઇટમ પસંદ કરો:

`;

      filteredItems.forEach((item, index) => {
        const displayName = item.gujarati_name || item.name;
        const displayUnit = item.gujarati_unit || item.unit;
        message += `${index + 1}️⃣ ${displayName} (${item.current_stock || 0} ${displayUnit})\n`;
      });

      message += `\n*કૃપા કરીને નંબર ટાઈપ કરો (1-${filteredItems.length}):*`;

      await whatsappService.sendTextMessage(phone, message);

      // Store filtered items in session for reference
      const session = await this.sessionManager.getSession(phone);
      const sessionData = session?.data || {};
      await this.sessionManager.updateSession(phone, {
        data: {
          ...sessionData,
          available_items: filteredItems
        }
      });

    } catch (error) {
      console.error('Error showing item selection:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ આઇટમ લોડ કરવામાં ભૂલ. ફરીથી પ્રયાસ કરો."
      );
    }
  }

  /**
   * Handle item selection
   */
  private async handleItemSelection(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};
    const availableItems = sessionData.available_items || [];

    const itemIndex = parseInt(messageText.trim()) - 1;
    
    if (itemIndex < 0 || itemIndex >= availableItems.length) {
      await whatsappService.sendTextMessage(phone, 
        `❌ કૃપા કરીને યોગ્ય આઇટમ પસંદ કરો (1-${availableItems.length}):`
      );
      return;
    }

    const selectedItem = availableItems[itemIndex];
    
    await this.sessionManager.updateSession(phone, {
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
    const session = await this.sessionManager.getSession(phone);
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

    await this.sessionManager.updateSession(phone, {
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
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};

    await this.sessionManager.updateSession(phone, {
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
    const session = await this.sessionManager.getSession(phone);
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
        await this.sessionManager.updateSession(phone, {
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
      await this.sessionManager.clearFlowData(phone, true);

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
      await this.sessionManager.clearFlowData(phone, true);
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