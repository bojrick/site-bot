import { getDb } from '../../db';
import { sessions, users, sites, inventory_items, inventory_transactions } from '../../db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { whatsappService, ImageMessage } from '../whatsapp';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { r2Service } from '../cloudflareR2';
import process from 'process';

export class InventoryFlow {
  private readonly ADMIN_ROLE = 'admin';
  private readonly MAX_UPLOAD_RETRIES = 2;
  private readonly UPLOAD_TIMEOUT_MS = 30000; // 30 seconds

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
    
    console.log('📦 [INVENTORY] InventoryFlow.handleMessage called with:', {
      phone,
      messageText,
      interactiveData,
      imageData,
      sessionIntent: session.intent,
      sessionStep: session.step,
      sessionData: session.data
    });

    // Check if user is admin
    if (user.role !== this.ADMIN_ROLE) {
      await whatsappService.sendTextMessage(phone, 
        "❌ Access denied. Inventory management is only available for administrators."
      );
      return;
    }

    // Handle main inventory flow
    if (session.intent === 'inventory_management') {
      await this.handleInventoryFlow(phone, session, messageText, interactiveData, user, imageData);
    } else {
      await this.showInventoryMainMenu(phone, user);
    }
  }

  private async handleInventoryFlow(phone: string, session: any, messageText: string, interactiveData?: any, user?: any, imageData?: ImageMessage) {
    const text = messageText.toLowerCase().trim();
    const step = session.step;
    const data = session.data || {};

    console.log('📦 [INVENTORY] Processing step:', step, 'with message:', messageText, 'interactiveData:', interactiveData);

    // Handle exit commands
    if (text === 'exit' || text === 'menu' || text === 'back') {
      await this.clearSession(phone);
      await whatsappService.sendTextMessage(phone, "🔙 Exiting inventory management...");
      return;
    }

    // Handle initial state - show main menu without processing message
    if (!step || step === 'main_menu') {
      // If step is null or main_menu, and we have interactiveData or a valid selection, process it
      if (interactiveData || (step === 'main_menu' && ['item_in', 'item_out', 'new_item', 'inventory_balance', 'day_to_day', 'setup_comprehensive_inventory', 'create_sample_data', '1', '2', '3', '4', '5', '6', '7'].includes(text))) {
        await this.handleMainMenuSelection(phone, messageText, interactiveData, user);
      } else {
        // Just show the main menu (this handles the initial 'start' message from admin flow)
        await this.showInventoryMainMenu(phone, user);
      }
      return;
    }

    // Handle category selection
    if (step === 'category_select') {
      await this.handleCategorySelection(phone, messageText, data, user, interactiveData);
      return;
    }

    // Handle category-selected steps
    if (step === 'item_in_category_selected' || step === 'item_out_category_selected' || step === 'new_item_category_selected') {
      // These steps are handled by the category-specific methods, just return
      return;
    }

    // Handle specific flows based on step
    switch (step) {
      case 'item_in_select':
        await this.handleItemInSelect(phone, messageText, data, interactiveData);
        break;
      case 'item_in_quantity':
        await this.handleItemInQuantity(phone, messageText, data);
        break;
      case 'item_in_upload_image':
        await this.handleImageUpload(phone, data, messageText, imageData, 'inventory-in', 'Stock In Image', this.completeItemIn.bind(this));
        break;
      case 'item_out_select':
        await this.handleItemOutSelect(phone, messageText, data, interactiveData);
        break;
      case 'item_out_quantity':
        await this.handleItemOutQuantity(phone, messageText, data);
        break;
      case 'item_out_upload_image':
        await this.handleImageUpload(phone, data, messageText, imageData, 'inventory-out', 'Stock Out Image', this.completeItemOut.bind(this));
        break;
      case 'new_item_name':
        await this.handleNewItemName(phone, messageText, data);
        break;
      case 'new_item_unit':
        await this.handleNewItemUnit(phone, messageText, data);
        break;
      default:
        console.log('📦 [INVENTORY] Unknown step:', step, 'going to main menu');
        await this.showInventoryMainMenu(phone, user);
        break;
    }
  }

  private async showInventoryMainMenu(phone: string, user?: any) {
    console.log('📦 [INVENTORY] Showing main menu for phone:', phone, 'user_id:', user?.id);
    
    await this.updateSession(phone, {
      intent: 'inventory_management',
      step: 'main_menu',
      data: { user_id: user?.id }
    });

    const message = `📦 *Inventory Management System*

Welcome to the inventory management system! 

Select what you'd like to do:`;

    const buttons = [
      { id: 'item_in', title: '📦 Item In' },
      { id: 'item_out', title: '📤 Item Out' },
      { id: 'new_item', title: '🆕 New Item' }
    ];

    console.log('📦 [INVENTORY] Sending button message with buttons:', buttons.map(b => b.id));
    await whatsappService.sendButtonMessage(phone, message, buttons);
    
    // Send additional options as list
    setTimeout(async () => {
      console.log('📦 [INVENTORY] Sending additional options list');
      await whatsappService.sendListMessage(
        phone,
        "Additional inventory options:",
        "More Options",
        [{
          title: "Reports & Analytics",
          rows: [
            { id: 'inventory_balance', title: '📊 Stock Balance', description: 'View current stock levels' },
            { id: 'day_to_day', title: '📅 Daily Reports', description: 'Daily transaction log' },
            { id: 'setup_comprehensive_inventory', title: '🚀 Setup Inventory', description: 'Add all category items with 0 stock' },
            { id: 'create_sample_data', title: '🧪 Sample Data', description: 'Add sample items with stock for testing' }
          ]
        }]
      );
    }, 1000);
  }

  private async handleMainMenuSelection(phone: string, messageText: string, interactiveData?: any, user?: any) {
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
    
    console.log('📦 [INVENTORY] Handling main menu selection:', selection, 'interactiveData:', interactiveData);
    
    switch (selection) {
      case 'item_in':
      case '1':
        console.log('📦 [INVENTORY] Starting Item In flow with category selection');
        await this.showCategorySelection(phone, 'item_in', user);
        break;
      case 'item_out':
      case '2':
        console.log('📦 [INVENTORY] Starting Item Out flow with category selection');
        await this.showCategorySelection(phone, 'item_out', user);
        break;
      case 'new_item':
      case '3':
        console.log('📦 [INVENTORY] Starting New Item flow with category selection');
        await this.showCategorySelection(phone, 'new_item', user);
        break;
      case 'inventory_balance':
      case '4':
        console.log('📦 [INVENTORY] Generating inventory balance report');
        await this.generateInventoryBalanceReport(phone);
        break;
      case 'day_to_day':
      case '5':
        console.log('📦 [INVENTORY] Generating day-to-day report');
        await this.generateDayToDayReport(phone);
        break;
      case 'setup_comprehensive_inventory':
      case '6':
        console.log('📦 [INVENTORY] Setting up comprehensive inventory');
        await this.createComprehensiveInventory(phone);
        break;
      case 'create_sample_data':
      case '7':
        console.log('📦 [INVENTORY] Creating sample data');
        await this.createSampleData(phone);
        break;
      default:
        console.log('📦 [INVENTORY] Invalid selection received:', selection);
        await whatsappService.sendTextMessage(phone, 
          "❌ Invalid selection. Please choose from the available options."
        );
        await this.showInventoryMainMenu(phone, user);
        break;
    }
  }

  // === CATEGORY SELECTION ===
  private async showCategorySelection(phone: string, action: string, user?: any) {
    console.log('📦 [INVENTORY] Showing category selection for action:', action, 'user_id:', user?.id);
    
    await this.updateSession(phone, {
      intent: 'inventory_management',
      step: 'category_select',
      data: { action, user_id: user?.id }
    });

    const actionText = action === 'item_in' ? 'add stock to' : 
                      action === 'item_out' ? 'remove stock from' : 
                      'create new item in';

    console.log('📦 [INVENTORY] Sending category selection list with action text:', actionText);
    await whatsappService.sendListMessage(
      phone,
      `📦 *Select Inventory Category*\n\nWhich type of inventory do you want to ${actionText}?`,
      "Select Category",
      [{
        title: "Inventory Categories",
        rows: [
          { id: 'building_material', title: '🏗️ Building Material', description: 'Cement, Steel, Bricks, Sand, etc.' },
          { id: 'contractor_materials', title: '🛠️ Contractor Materials', description: 'Scaffolding, Props, Tools, etc.' },
          { id: 'electrical_materials', title: '⚡ Electrical Materials', description: 'Wires, Switches, MCBs, etc.' }
        ]
      }]
    );
  }

  private async handleCategorySelection(phone: string, messageText: string, data: any, user?: any, interactiveData?: any) {
    // Extract the category properly from interactiveData or messageText
    let category: string;
    
    if (interactiveData) {
      if (interactiveData.type === 'list_reply' && interactiveData.list_reply) {
        category = interactiveData.list_reply.id;
      } else if (typeof interactiveData === 'string') {
        category = interactiveData;
      } else {
        category = messageText;
      }
    } else {
      category = messageText;
    }
    
    const action = data.action;

    console.log('📦 [INVENTORY] Category selected:', category, 'for action:', action);

    // Update session with category-selected step and preserve data
    await this.updateSession(phone, {
      intent: 'inventory_management',
      step: `${action}_category_selected`,
      data: { action, category, user_id: data.user_id || user?.id }
    });

    switch (action) {
      case 'item_in':
        await this.startItemInWithCategory(phone, category, user);
        break;
      case 'item_out':
        await this.startItemOutWithCategory(phone, category, user);
        break;
      case 'new_item':
        await this.startNewItemWithCategory(phone, category, user);
        break;
    }
  }

  // === ITEM IN FLOW ===
  private async startItemIn(phone: string, user?: any) {
    console.log('📦 [INVENTORY] Starting Item In flow');
    
    try {
      const items = await this.getActiveItems();
      
      if (items.length === 0) {
        await whatsappService.sendTextMessage(phone, 
          "❌ *No items found in inventory*\n\n" +
          "To use Item In, you need to add items first.\n\n" +
          "🔹 Use 'New Item' to add your first inventory item\n" +
          "🔹 Then you can add stock using 'Item In'"
        );
        
        // Stay in inventory management but go back to main menu
        setTimeout(async () => {
          await this.showInventoryMainMenu(phone, user);
        }, 2000);
        return;
      }

      await this.updateSession(phone, {
        intent: 'inventory_management',
        step: 'item_in_select',
        data: { user_id: user?.id, page: 1, total_items: items.length }
      });

      await this.showItemListWithPagination(phone, items, 'all', 'item_in', 1);
    } catch (error) {
      console.error('Error in startItemIn:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error loading items. Please try again."
      );
      await this.showInventoryMainMenu(phone, user);
    }
  }

  private async handleItemInSelect(phone: string, messageText: string, data: any, interactiveData?: any) {
    // Extract the item ID properly from interactiveData or messageText
    let itemId: string;
    
    if (interactiveData) {
      if (interactiveData.type === 'list_reply' && interactiveData.list_reply) {
        itemId = interactiveData.list_reply.id;
      } else if (typeof interactiveData === 'string') {
        itemId = interactiveData;
      } else {
        itemId = messageText;
      }
    } else {
      itemId = messageText;
    }

    // Handle pagination
    if (itemId.startsWith('next_page_') || itemId.startsWith('prev_page_')) {
      const pageNumber = parseInt(itemId.split('_')[2]);
      let items;
      
      if (data.category && data.category !== 'all') {
        items = await this.getActiveItemsByCategory(data.category);
      } else {
        items = await this.getActiveItems();
      }
      
      await this.updateSession(phone, {
        intent: 'inventory_management',
        step: 'item_in_select',
        data: { ...data, page: pageNumber }
      });

      await this.showItemListWithPagination(phone, items, data.category || 'all', 'item_in', pageNumber);
      return;
    }
    
    const item = await this.getItemById(itemId);
    
    if (!item) {
      await whatsappService.sendTextMessage(phone, "❌ Invalid item selection. Please try again.");
      
      // If we have category data, restart the category-specific flow
      if (data.category) {
        await this.startItemInWithCategory(phone, data.category, data.user_id);
      } else {
        await this.startItemIn(phone);
      }
      return;
    }

    await this.updateSession(phone, {
      intent: 'inventory_management',
      step: 'item_in_quantity',
      data: { 
        selected_item: item,
        category: data.category,
        user_id: data.user_id
      }
    });

    await whatsappService.sendTextMessage(phone, 
      `📦 *Adding stock for: ${item.name}*\n\n` +
      `Current Stock: ${item.current_stock ?? 0} ${item.unit}\n\n` +
      `Enter the quantity to add:`
    );
  }

  private async handleItemInQuantity(phone: string, messageText: string, data: any) {
    const quantity = parseInt(messageText);
    
    if (isNaN(quantity) || quantity <= 0) {
      await whatsappService.sendTextMessage(phone, 
        "❌ Please enter a valid positive number for quantity."
      );
      return;
    }

    await this.updateSession(phone, {
      intent: 'inventory_management',
      step: 'item_in_upload_image',
      data: { 
        ...data,
        quantity,
        upload_retry_count: 0
      }
    });

    await whatsappService.sendTextMessage(phone, 
      `📸 *Upload Stock In Image*\n\n` +
      `Please upload an image of the stock being added:\n\n` +
      `• Photo of the materials received\n` +
      `• Stock location or storage area\n` +
      `• Any relevant documentation\n\n` +
      `Upload an image or type 'skip' to continue without image:`
    );
  }

  private async completeItemIn(phone: string, itemInData: any) {
    try {
      const item = itemInData.selected_item;
      const quantity = itemInData.quantity;
      const currentStock = item.current_stock ?? 0;
      const newStock = currentStock + quantity;
      
      // Update item stock
      await getDb()
        .update(inventory_items)
        .set({ 
          current_stock: newStock,
          updated_at: new Date()
        })
        .where(eq(inventory_items.id, item.id));

      // Record transaction with image info
      await getDb()
        .insert(inventory_transactions)
        .values({
          item_id: item.id,
          site_id: item.site_id,
          transaction_type: 'in',
          quantity: quantity,
          previous_stock: currentStock,
          new_stock: newStock,
          notes: `Admin added ${quantity} ${item.unit}${itemInData.image_info ? ' with image' : ''}`,
          created_by: itemInData.user_id || null
        });

      const imageStatus = itemInData.image_info ? '📸 with image' : '📝 without image';
      await whatsappService.sendTextMessage(phone, 
        `✅ *Stock Added Successfully!*\n\n` +
        `Item: ${item.name}\n` +
        `Added: ${quantity} ${item.unit}\n` +
        `Previous Stock: ${currentStock} ${item.unit}\n` +
        `New Stock: ${newStock} ${item.unit}\n` +
        `Status: ${imageStatus}\n\n` +
        `Transaction recorded at ${new Date().toLocaleString()}`
      );

      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 2000);

    } catch (error) {
      console.error('Error adding stock:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error adding stock. Please try again or contact support."
      );
    }
  }

  // === ITEM OUT FLOW ===
  private async startItemOut(phone: string, user?: any) {
    console.log('📦 [INVENTORY] Starting Item Out flow');
    
    try {
      const items = await this.getActiveItems();
      
      if (items.length === 0) {
        await whatsappService.sendTextMessage(phone, 
          "❌ *No items found in inventory*\n\n" +
          "To use Item Out, you need to add items first.\n\n" +
          "🔹 Use 'New Item' to add your first inventory item\n" +
          "🔹 Then add stock using 'Item In'\n" +
          "🔹 Finally you can remove stock using 'Item Out'"
        );
        
        // Stay in inventory management but go back to main menu
        setTimeout(async () => {
          await this.showInventoryMainMenu(phone, user);
        }, 2000);
        return;
      }

      // Check if any items have stock
      const itemsWithStock = items.filter(item => (item.current_stock ?? 0) > 0);
      
      if (itemsWithStock.length === 0) {
        await whatsappService.sendTextMessage(phone, 
          "❌ *No items with stock available*\n\n" +
          "All items have zero stock. Please add stock first using 'Item In'.\n\n" +
          "Available items with zero stock:\n" +
          items.slice(0, 10).map(item => `• ${item.name}: ${item.current_stock ?? 0} ${item.unit}`).join('\n') +
          (items.length > 10 ? `\n... and ${items.length - 10} more items` : '')
        );
        
        setTimeout(async () => {
          await this.showInventoryMainMenu(phone, user);
        }, 3000);
        return;
      }

      await this.updateSession(phone, {
        intent: 'inventory_management',
        step: 'item_out_select',
        data: { user_id: user?.id, page: 1, total_items: itemsWithStock.length }
      });

      await this.showItemListWithPagination(phone, itemsWithStock, 'all', 'item_out', 1);
    } catch (error) {
      console.error('Error in startItemOut:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error loading items. Please try again."
      );
      await this.showInventoryMainMenu(phone, user);
    }
  }

  private async handleItemOutSelect(phone: string, messageText: string, data: any, interactiveData?: any) {
    console.log('📦 [INVENTORY] Handling item out select:', messageText);
    
    // Extract the item ID properly from interactiveData or messageText
    let itemId: string;
    
    if (interactiveData) {
      if (interactiveData.type === 'list_reply' && interactiveData.list_reply) {
        itemId = interactiveData.list_reply.id;
      } else if (typeof interactiveData === 'string') {
        itemId = interactiveData;
      } else {
        itemId = messageText;
      }
    } else {
      itemId = messageText;
    }

    // Handle pagination
    if (itemId.startsWith('next_page_') || itemId.startsWith('prev_page_')) {
      const pageNumber = parseInt(itemId.split('_')[2]);
      let allItems;
      
      if (data.category && data.category !== 'all') {
        allItems = await this.getActiveItemsByCategory(data.category);
      } else {
        allItems = await this.getActiveItems();
      }
      
      const itemsWithStock = allItems.filter(item => (item.current_stock ?? 0) > 0);
      
      await this.updateSession(phone, {
        intent: 'inventory_management',
        step: 'item_out_select',
        data: { ...data, page: pageNumber }
      });

      await this.showItemListWithPagination(phone, itemsWithStock, data.category || 'all', 'item_out', pageNumber);
      return;
    }
    
    const item = await this.getItemById(itemId);
    
    if (!item) {
      await whatsappService.sendTextMessage(phone, "❌ Invalid item selection. Please try again.");
      
      // If we have category data, restart the category-specific flow
      if (data.category) {
        await this.startItemOutWithCategory(phone, data.category, data.user_id);
      } else {
        await this.startItemOut(phone);
      }
      return;
    }

    if ((item.current_stock ?? 0) <= 0) {
      await whatsappService.sendTextMessage(phone, 
        `❌ *No stock available for: ${item.name}*\n\n` +
        `Current Stock: ${item.current_stock ?? 0} ${item.unit}\n\n` +
        `You need to add stock first using 'Item In'.`
      );
      
      // If we have category data, restart the category-specific flow
      if (data.category) {
        await this.startItemOutWithCategory(phone, data.category, data.user_id);
      } else {
        await this.startItemOut(phone);
      }
      return;
    }

    await this.updateSession(phone, {
      intent: 'inventory_management',
      step: 'item_out_quantity',
      data: { 
        selected_item: item,
        category: data.category,
        user_id: data.user_id
      }
    });

    await whatsappService.sendTextMessage(phone, 
      `📤 *Removing stock for: ${item.name}*\n\n` +
      `Current Stock: ${item.current_stock ?? 0} ${item.unit}\n\n` +
      `Enter the quantity to remove:`
    );
  }

  private async handleItemOutQuantity(phone: string, messageText: string, data: any) {
    const quantity = parseInt(messageText);
    
    if (isNaN(quantity) || quantity <= 0) {
      await whatsappService.sendTextMessage(phone, 
        "❌ Please enter a valid positive number for quantity."
      );
      return;
    }

    const item = data.selected_item;
    const currentStock = item.current_stock ?? 0;
    
    if (quantity > currentStock) {
      await whatsappService.sendTextMessage(phone, 
        `❌ Insufficient stock! Available: ${currentStock} ${item.unit}, Requested: ${quantity} ${item.unit}`
      );
      return;
    }

    await this.updateSession(phone, {
      intent: 'inventory_management',
      step: 'item_out_upload_image',
      data: { 
        ...data,
        quantity,
        upload_retry_count: 0
      }
    });

    await whatsappService.sendTextMessage(phone, 
      `📸 *Upload Stock Out Image*\n\n` +
      `Please upload an image of the stock being removed:\n\n` +
      `• Photo of materials being taken out\n` +
      `• Delivery or usage location\n` +
      `• Any relevant documentation\n\n` +
      `Upload an image or type 'skip' to continue without image:`
    );
  }

  private async completeItemOut(phone: string, itemOutData: any) {
    try {
      const item = itemOutData.selected_item;
      const quantity = itemOutData.quantity;
      const currentStock = item.current_stock ?? 0;
      const newStock = currentStock - quantity;
      
      // Update item stock
      await getDb()
        .update(inventory_items)
        .set({ 
          current_stock: newStock,
          updated_at: new Date()
        })
        .where(eq(inventory_items.id, item.id));

      // Record transaction with image info
      await getDb()
        .insert(inventory_transactions)
        .values({
          item_id: item.id,
          site_id: item.site_id,
          transaction_type: 'out',
          quantity: quantity,
          previous_stock: currentStock,
          new_stock: newStock,
          notes: `Admin removed ${quantity} ${item.unit}${itemOutData.image_info ? ' with image' : ''}`,
          created_by: itemOutData.user_id || null
        });

      const imageStatus = itemOutData.image_info ? '📸 with image' : '📝 without image';
      await whatsappService.sendTextMessage(phone, 
        `✅ *Stock Removed Successfully!*\n\n` +
        `Item: ${item.name}\n` +
        `Removed: ${quantity} ${item.unit}\n` +
        `Previous Stock: ${currentStock} ${item.unit}\n` +
        `New Stock: ${newStock} ${item.unit}\n` +
        `Status: ${imageStatus}\n\n` +
        `Transaction recorded at ${new Date().toLocaleString()}`
      );

      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 2000);

    } catch (error) {
      console.error('Error removing stock:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error removing stock. Please try again or contact support."
      );
    }
  }

  // === NEW ITEM FLOW ===
  private async startNewItem(phone: string, user?: any) {
    console.log('📦 [INVENTORY] Starting New Item flow');
    
    await this.updateSession(phone, {
      intent: 'inventory_management',
      step: 'new_item_name',
      data: { user_id: user?.id }
    });

    await whatsappService.sendTextMessage(phone, 
      `🆕 *Add New Item to Inventory*\n\n` +
      `Enter the name of the new item:\n\n` +
      `💡 *Examples:*\n` +
      `• Rice Bags\n` +
      `• Steel Rods\n` +
      `• Cement Bags\n` +
      `• Office Supplies\n\n` +
      `*Type the item name:*`
    );
  }

  private async handleNewItemName(phone: string, messageText: string, data: any) {
    const itemName = messageText.trim();
    
    if (!itemName || itemName.length < 2) {
      await whatsappService.sendTextMessage(phone, 
        "❌ Please enter a valid item name (at least 2 characters)."
      );
      return;
    }

    // Check if item already exists
    try {
      const existingItem = await getDb()
        .select()
        .from(inventory_items)
        .where(eq(inventory_items.name, itemName))
        .limit(1);

      if (existingItem.length > 0) {
        await whatsappService.sendTextMessage(phone, 
          `❌ Item "${itemName}" already exists in inventory. Please choose a different name.`
        );
        return;
      }

      await this.updateSession(phone, {
        intent: 'inventory_management',
        step: 'new_item_unit',
        data: { 
          item_name: itemName, 
          category: data.category,
          user_id: data.user_id
        }
      });

      const categoryName = this.getCategoryDisplayName(data.category);
      await whatsappService.sendTextMessage(phone, 
        `✅ Item name: "${itemName}"\n` +
        `📂 Category: ${categoryName}\n\n` +
        `Now enter the unit of measurement:\n\n` +
        `💡 *Common units:*\n` +
        `• kg (kilograms)\n` +
        `• pieces\n` +
        `• bags\n` +
        `• liters\n` +
        `• meters\n` +
        `• cubic_ft\n` +
        `• sq_ft\n` +
        `• sheets\n\n` +
        `*Type the unit:*`
      );
    } catch (error) {
      console.error('Error checking existing item:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error checking item name. Please try again."
      );
    }
  }

  private async handleNewItemUnit(phone: string, messageText: string, data: any) {
    const unit = messageText.trim().toLowerCase();
    
    if (!unit || unit.length < 1) {
      await whatsappService.sendTextMessage(phone, 
        "❌ Please enter a valid unit of measurement."
      );
      return;
    }

    try {
      // Create new inventory item with category
      const newItem = await getDb()
        .insert(inventory_items)
        .values({
          name: data.item_name,
          unit: unit,
          current_stock: 0,
          site_id: null,
          status: 'active',
          created_by: data.user_id || null,
          category: data.category // Store category in category field
        })
        .returning();

      const categoryName = this.getCategoryDisplayName(data.category);
      await whatsappService.sendTextMessage(phone, 
        `✅ *New ${categoryName} Item Added Successfully!*\n\n` +
        `📦 Item Name: ${data.item_name}\n` +
        `📂 Category: ${categoryName}\n` +
        `📏 Unit: ${unit}\n` +
        `📊 Initial Stock: 0 ${unit}\n` +
        `✅ Status: Active\n\n` +
        `🕒 Created at ${new Date().toLocaleString()}\n\n` +
        `🎉 You can now add stock using the "Item In" option!`
      );

      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 3000);

    } catch (error) {
      console.error('Error creating new item:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error creating new item. Please try again or contact support."
      );
    }
  }

  // === INVENTORY BALANCE REPORT ===
  private async generateInventoryBalanceReport(phone: string) {
    try {
      await whatsappService.sendTextMessage(phone, 
        "📊 Generating inventory balance report... Please wait."
      );

      const items = await getDb()
        .select()
        .from(inventory_items)
        .where(eq(inventory_items.status, 'active'))
        .orderBy(inventory_items.name);

      if (items.length === 0) {
        await whatsappService.sendTextMessage(phone, 
          "❌ No active items found in inventory."
        );
        await this.clearSession(phone);
        setTimeout(() => this.showInventoryMainMenu(phone), 2000);
        return;
      }

      // Generate PDF
      const pdfBuffer = await this.generateInventoryBalancePDF(items);
      
      // Upload to R2
      const fileName = `inventory-balance-${new Date().toISOString().split('T')[0]}.pdf`;
      const uploadResult = await r2Service.uploadFile(
        pdfBuffer,
        fileName,
        'application/pdf',
        'inventory-reports'
      );

      if (uploadResult.success && uploadResult.url) {
        await whatsappService.sendDocumentMessage(
          phone,
          uploadResult.url,
          fileName,
          `📊 *Inventory Balance Report*\n\nGenerated on: ${new Date().toLocaleString()}\nTotal Items: ${items.length}`
        );
      } else {
        // Fallback to text format
        await this.sendInventoryBalanceText(phone, items);
      }

      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 2000);

    } catch (error) {
      console.error('Error generating inventory balance report:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error generating report. Please try again or contact support."
      );
      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 2000);
    }
  }

  // === DAY-TO-DAY TRANSACTIONS REPORT ===
  private async generateDayToDayReport(phone: string) {
    try {
      await whatsappService.sendTextMessage(phone, 
        "📅 Generating day-to-day transactions report... Please wait."
      );

      // Get transactions from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const transactions = await getDb()
        .select({
          id: inventory_transactions.id,
          transaction_type: inventory_transactions.transaction_type,
          quantity: inventory_transactions.quantity,
          notes: inventory_transactions.notes,
          created_at: inventory_transactions.created_at,
          item_name: inventory_items.name,
          item_unit: inventory_items.unit,
          user_name: users.name
        })
        .from(inventory_transactions)
        .leftJoin(inventory_items, eq(inventory_transactions.item_id, inventory_items.id))
        .leftJoin(users, eq(inventory_transactions.created_by, users.id))
        .where(sql`${inventory_transactions.created_at} >= ${thirtyDaysAgo}`)
        .orderBy(desc(inventory_transactions.created_at));

      if (transactions.length === 0) {
        await whatsappService.sendTextMessage(phone, 
          "❌ No transactions found in the last 30 days."
        );
        await this.clearSession(phone);
        setTimeout(() => this.showInventoryMainMenu(phone), 2000);
        return;
      }

      // Generate PDF
      const pdfBuffer = await this.generateDayToDayPDF(transactions);
      
      // Upload to R2
      const fileName = `inventory-transactions-${new Date().toISOString().split('T')[0]}.pdf`;
      const uploadResult = await r2Service.uploadFile(
        pdfBuffer,
        fileName,
        'application/pdf',
        'inventory-reports'
      );

      if (uploadResult.success && uploadResult.url) {
        await whatsappService.sendDocumentMessage(
          phone,
          uploadResult.url,
          fileName,
          `📅 *Day-to-Day Transactions Report*\n\nGenerated on: ${new Date().toLocaleString()}\nTotal Transactions: ${transactions.length}`
        );
      } else {
        // Fallback to text format
        await this.sendDayToDayText(phone, transactions);
      }

      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 2000);

    } catch (error) {
      console.error('Error generating day-to-day report:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error generating report. Please try again or contact support."
      );
      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 2000);
    }
  }

  // === SAMPLE DATA CREATION ===
  private async createSampleData(phone: string) {
    try {
      await whatsappService.sendTextMessage(phone, 
        "🧪 Creating comprehensive sample inventory data for all categories... Please wait."
      );

      const sampleItems = [
        // Building Materials
        { name: 'Cement Bags', unit: 'bags', stock: 50, category: 'building_material' },
        { name: 'Steel Rods 10mm', unit: 'pieces', stock: 100, category: 'building_material' },
        { name: 'Steel Rods 12mm', unit: 'pieces', stock: 80, category: 'building_material' },
        { name: 'Red Bricks', unit: 'pieces', stock: 500, category: 'building_material' },
        { name: 'River Sand', unit: 'cubic_ft', stock: 25, category: 'building_material' },
        { name: 'Stone Chips', unit: 'cubic_ft', stock: 20, category: 'building_material' },
        { name: 'Concrete Blocks', unit: 'pieces', stock: 200, category: 'building_material' },
        { name: 'Floor Tiles', unit: 'sq_ft', stock: 150, category: 'building_material' },
        { name: 'Wall Paint', unit: 'liters', stock: 30, category: 'building_material' },
        { name: 'Plywood Sheets', unit: 'sheets', stock: 15, category: 'building_material' },

        // Contractor Materials
        { name: 'Scaffolding Plates 3ft×2ft', unit: 'pieces', stock: 20, category: 'contractor_materials' },
        { name: 'Scaffolding Plates 3ft×1.5ft', unit: 'pieces', stock: 15, category: 'contractor_materials' },
        { name: 'Scaffolding Plates 3ft×1.25ft', unit: 'pieces', stock: 12, category: 'contractor_materials' },
        { name: 'Scaffolding Plates 3ft×1ft', unit: 'pieces', stock: 10, category: 'contractor_materials' },
        { name: 'Jack Prop 2.3m', unit: 'pieces', stock: 8, category: 'contractor_materials' },
        { name: 'Jack Prop 2.2m', unit: 'pieces', stock: 6, category: 'contractor_materials' },
        { name: 'Ring Machine 12mm', unit: 'pieces', stock: 2, category: 'contractor_materials' },
        { name: 'Ring Machine 8mm', unit: 'pieces', stock: 2, category: 'contractor_materials' },
        { name: 'Cutter Machine 14inch', unit: 'pieces', stock: 1, category: 'contractor_materials' },
        { name: '4×2 Wall Plate', unit: 'pieces', stock: 25, category: 'contractor_materials' },
        { name: '3×2 Patti', unit: 'pieces', stock: 30, category: 'contractor_materials' },
        { name: '3×1.5 Patti', unit: 'pieces', stock: 25, category: 'contractor_materials' },
        { name: 'Sikanja 2ft', unit: 'pieces', stock: 40, category: 'contractor_materials' },
        { name: 'Sikanja 2.5ft', unit: 'pieces', stock: 35, category: 'contractor_materials' },
        { name: 'Sikanja 3ft', unit: 'pieces', stock: 30, category: 'contractor_materials' },
        { name: 'Bamboo 8ft', unit: 'pieces', stock: 50, category: 'contractor_materials' },
        { name: 'Bamboo 10ft', unit: 'pieces', stock: 40, category: 'contractor_materials' },
        { name: 'Ply Cutter 5inch', unit: 'pieces', stock: 3, category: 'contractor_materials' },
        { name: 'Ply Cutter 7inch', unit: 'pieces', stock: 2, category: 'contractor_materials' },

        // Electrical Materials
        { name: 'PVC Wire 2.5mm', unit: 'meters', stock: 200, category: 'electrical_materials' },
        { name: 'PVC Wire 4mm', unit: 'meters', stock: 150, category: 'electrical_materials' },
        { name: 'PVC Wire 6mm', unit: 'meters', stock: 100, category: 'electrical_materials' },
        { name: 'Modular Switches', unit: 'pieces', stock: 50, category: 'electrical_materials' },
        { name: '3-Pin Sockets', unit: 'pieces', stock: 40, category: 'electrical_materials' },
        { name: '2-Pin Sockets', unit: 'pieces', stock: 30, category: 'electrical_materials' },
        { name: 'MCB 16A', unit: 'pieces', stock: 20, category: 'electrical_materials' },
        { name: 'MCB 32A', unit: 'pieces', stock: 15, category: 'electrical_materials' },
        { name: 'Distribution Board 8-way', unit: 'pieces', stock: 5, category: 'electrical_materials' },
        { name: 'PVC Conduit 20mm', unit: 'meters', stock: 100, category: 'electrical_materials' },
        { name: 'Junction Boxes', unit: 'pieces', stock: 25, category: 'electrical_materials' },
        { name: 'Cable Ties', unit: 'packets', stock: 10, category: 'electrical_materials' },
        { name: 'Insulation Tape', unit: 'rolls', stock: 15, category: 'electrical_materials' }
      ];

      let createdCount = 0;
      let skippedCount = 0;

      for (const item of sampleItems) {
        // Check if item already exists
        const existing = await getDb()
          .select()
          .from(inventory_items)
          .where(eq(inventory_items.name, item.name))
          .limit(1);

        if (existing.length === 0) {
          // Create the item with category stored in category field
          const newItem = await getDb()
            .insert(inventory_items)
            .values({
              name: item.name,
              unit: item.unit,
              current_stock: item.stock,
              site_id: null,
              status: 'active',
              created_by: null,
              category: item.category // Store category in category field
            })
            .returning();

          // Record the initial stock transaction
          if (newItem.length > 0) {
            await getDb()
              .insert(inventory_transactions)
              .values({
                item_id: newItem[0].id,
                site_id: null,
                transaction_type: 'in',
                quantity: item.stock,
                previous_stock: 0,
                new_stock: item.stock,
                notes: `Sample data - Initial ${item.category} stock added`,
                created_by: null
              });
          }

          createdCount++;
        } else {
          skippedCount++;
        }
      }

      await whatsappService.sendTextMessage(phone, 
        `✅ *Sample Data Creation Complete!*\n\n` +
        `📦 Created: ${createdCount} new items\n` +
        `⏭️ Skipped: ${skippedCount} existing items\n\n` +
        `*Categories Added:*\n` +
        `🏗️ Building Materials: ${sampleItems.filter(i => i.category === 'building_material').length} items\n` +
        `🛠️ Contractor Materials: ${sampleItems.filter(i => i.category === 'contractor_materials').length} items\n` +
        `⚡ Electrical Materials: ${sampleItems.filter(i => i.category === 'electrical_materials').length} items\n\n` +
        `🎉 You can now test all inventory flows with categorized items!`
      );

      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 3000);

    } catch (error) {
      console.error('Error creating sample data:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error creating sample data. Please try again."
      );
      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 2000);
    }
  }

  // === COMPREHENSIVE INVENTORY SETUP ===
  private async createComprehensiveInventory(phone: string) {
    try {
      await whatsappService.sendTextMessage(phone, 
        "🚀 Creating comprehensive inventory with all categories...\n\n" +
        "🛠️ Contractor Materials\n" +
        "🏗️ Building Materials\n" +
        "⚡ Electrical Materials\n\n" +
        "Please wait..."
      );

      const inventoryItems = [
        // 🛠️ CONTRACTOR MATERIALS
        // 1. Scaffolding Plates
        { name: 'Scaffolding Plate 3ft×2ft', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        { name: 'Scaffolding Plate 3ft×1.5ft', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        { name: 'Scaffolding Plate 3ft×1.25ft', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        { name: 'Scaffolding Plate 3ft×1ft', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        
        // 2. Jack Prop
        { name: 'Jack Prop 2.3m', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        { name: 'Jack Prop 2.2m', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        
        // 3. Ring Machine
        { name: 'Ring Machine 12mm', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        { name: 'Ring Machine 8mm', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        
        // 4. Cutter Machine
        { name: 'Cutter Machine 14inch', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        
        // 5. Wall Plate
        { name: '4×2 Wall Plate', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        
        // 6. Patti
        { name: '3×2 Patti', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        { name: '3×1.5 Patti', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        
        // 7. Sikanja
        { name: 'Sikanja 2ft', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        { name: 'Sikanja 2.5ft', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        { name: 'Sikanja 3ft', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        
        // 8. Bamboo
        { name: 'Bamboo 8ft', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        { name: 'Bamboo 10ft', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        
        // 9. Ply Cutter
        { name: 'Ply Cutter 5inch', unit: 'pieces', stock: 0, category: 'contractor_materials' },
        { name: 'Ply Cutter 7inch', unit: 'pieces', stock: 0, category: 'contractor_materials' },

        // 🏗️ BUILDING MATERIALS
        // Cement & Concrete
        { name: 'Cement Bags 50kg', unit: 'bags', stock: 0, category: 'building_material' },
        { name: 'Cement Bags 25kg', unit: 'bags', stock: 0, category: 'building_material' },
        { name: 'Ready Mix Concrete', unit: 'cubic_meters', stock: 0, category: 'building_material' },
        
        // Steel & Rebar
        { name: 'Steel Rod 8mm', unit: 'pieces', stock: 0, category: 'building_material' },
        { name: 'Steel Rod 10mm', unit: 'pieces', stock: 0, category: 'building_material' },
        { name: 'Steel Rod 12mm', unit: 'pieces', stock: 0, category: 'building_material' },
        { name: 'Steel Rod 16mm', unit: 'pieces', stock: 0, category: 'building_material' },
        { name: 'Steel Rod 20mm', unit: 'pieces', stock: 0, category: 'building_material' },
        { name: 'Steel Mesh', unit: 'sheets', stock: 0, category: 'building_material' },
        
        // Bricks & Blocks
        { name: 'Red Clay Bricks', unit: 'pieces', stock: 0, category: 'building_material' },
        { name: 'Fly Ash Bricks', unit: 'pieces', stock: 0, category: 'building_material' },
        { name: 'Concrete Blocks 6inch', unit: 'pieces', stock: 0, category: 'building_material' },
        { name: 'Concrete Blocks 8inch', unit: 'pieces', stock: 0, category: 'building_material' },
        { name: 'AAC Blocks', unit: 'pieces', stock: 0, category: 'building_material' },
        
        // Aggregates
        { name: 'River Sand', unit: 'cubic_ft', stock: 0, category: 'building_material' },
        { name: 'M-Sand', unit: 'cubic_ft', stock: 0, category: 'building_material' },
        { name: 'Stone Chips 20mm', unit: 'cubic_ft', stock: 0, category: 'building_material' },
        { name: 'Stone Chips 10mm', unit: 'cubic_ft', stock: 0, category: 'building_material' },
        { name: 'Gravel', unit: 'cubic_ft', stock: 0, category: 'building_material' },
        
        // Tiles & Flooring
        { name: 'Ceramic Floor Tiles', unit: 'sq_ft', stock: 0, category: 'building_material' },
        { name: 'Vitrified Tiles', unit: 'sq_ft', stock: 0, category: 'building_material' },
        { name: 'Wall Tiles', unit: 'sq_ft', stock: 0, category: 'building_material' },
        { name: 'Marble Tiles', unit: 'sq_ft', stock: 0, category: 'building_material' },
        
        // Wood & Plywood
        { name: 'Plywood 18mm', unit: 'sheets', stock: 0, category: 'building_material' },
        { name: 'Plywood 12mm', unit: 'sheets', stock: 0, category: 'building_material' },
        { name: 'Plywood 6mm', unit: 'sheets', stock: 0, category: 'building_material' },
        { name: 'Timber 4×2 inch', unit: 'feet', stock: 0, category: 'building_material' },
        { name: 'Timber 3×2 inch', unit: 'feet', stock: 0, category: 'building_material' },
        
        // Paints & Chemicals
        { name: 'Exterior Wall Paint', unit: 'liters', stock: 0, category: 'building_material' },
        { name: 'Interior Wall Paint', unit: 'liters', stock: 0, category: 'building_material' },
        { name: 'Primer', unit: 'liters', stock: 0, category: 'building_material' },
        { name: 'Waterproofing Compound', unit: 'kg', stock: 0, category: 'building_material' },
        { name: 'Tile Adhesive', unit: 'bags', stock: 0, category: 'building_material' },

        // ⚡ ELECTRICAL MATERIALS
        // Wires & Cables
        { name: 'PVC Wire 1.5mm', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'PVC Wire 2.5mm', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'PVC Wire 4mm', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'PVC Wire 6mm', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'PVC Wire 10mm', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'Armored Cable 4 Core', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'Coaxial Cable', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'Telephone Cable', unit: 'meters', stock: 0, category: 'electrical_materials' },
        
        // Switches & Sockets
        { name: 'Modular Switch 1-way', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Modular Switch 2-way', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Dimmer Switch', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: '3-Pin Socket 16A', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: '2-Pin Socket 6A', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'USB Socket', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'TV Socket', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Telephone Socket', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        
        // MCBs & Protection
        { name: 'MCB 6A Single Pole', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'MCB 10A Single Pole', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'MCB 16A Single Pole', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'MCB 32A Single Pole', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'MCB 20A Double Pole', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'MCB 32A Double Pole', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'RCCB 25A', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'RCCB 40A', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'ELCB', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        
        // Distribution & Panels
        { name: 'Distribution Board 4-way', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Distribution Board 8-way', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Distribution Board 12-way', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Distribution Board 16-way', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Main Switch 32A', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Main Switch 63A', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        
        // Conduits & Accessories
        { name: 'PVC Conduit 20mm', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'PVC Conduit 25mm', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'PVC Conduit 32mm', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'Flexible Conduit', unit: 'meters', stock: 0, category: 'electrical_materials' },
        { name: 'Junction Box 4×4', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Junction Box 6×6', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Ceiling Rose', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Batten Holder', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        
        // Accessories & Hardware
        { name: 'Wire Nuts', unit: 'packets', stock: 0, category: 'electrical_materials' },
        { name: 'Terminal Blocks', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'Cable Ties Small', unit: 'packets', stock: 0, category: 'electrical_materials' },
        { name: 'Cable Ties Large', unit: 'packets', stock: 0, category: 'electrical_materials' },
        { name: 'Insulation Tape', unit: 'rolls', stock: 0, category: 'electrical_materials' },
        { name: 'Duct Tape', unit: 'rolls', stock: 0, category: 'electrical_materials' },
        { name: 'Cable Clips', unit: 'packets', stock: 0, category: 'electrical_materials' },
        
        // Lighting
        { name: 'LED Bulb 9W', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'LED Bulb 12W', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'LED Tube Light 18W', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'LED Tube Light 36W', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'CFL 20W', unit: 'pieces', stock: 0, category: 'electrical_materials' },
        { name: 'LED Panel Light', unit: 'pieces', stock: 0, category: 'electrical_materials' }
      ];

      let createdCount = 0;
      let skippedCount = 0;

      for (const item of inventoryItems) {
        // Check if item already exists
        const existing = await getDb()
          .select()
          .from(inventory_items)
          .where(eq(inventory_items.name, item.name))
          .limit(1);

        if (existing.length === 0) {
          // Create the item with zero stock
          await getDb()
            .insert(inventory_items)
            .values({
              name: item.name,
              unit: item.unit,
              current_stock: item.stock,
              site_id: null,
              status: 'active',
              created_by: null,
              category: item.category
            });

          createdCount++;
        } else {
          skippedCount++;
        }
      }

      // Count items by category
      const contractorCount = inventoryItems.filter(i => i.category === 'contractor_materials').length;
      const buildingCount = inventoryItems.filter(i => i.category === 'building_material').length;
      const electricalCount = inventoryItems.filter(i => i.category === 'electrical_materials').length;

      await whatsappService.sendTextMessage(phone, 
        `✅ *Comprehensive Inventory Setup Complete!*\n\n` +
        `📦 Created: ${createdCount} new items\n` +
        `⏭️ Skipped: ${skippedCount} existing items\n\n` +
        `*Items by Category:*\n` +
        `🛠️ Contractor Materials: ${contractorCount} items\n` +
        `🏗️ Building Materials: ${buildingCount} items\n` +
        `⚡ Electrical Materials: ${electricalCount} items\n\n` +
        `*Key Features:*\n` +
        `• All items start with 0 stock\n` +
        `• Properly categorized for easy selection\n` +
        `• Ready for Item In/Out operations\n` +
        `• Complete with appropriate units\n\n` +
        `🎉 Your inventory system is now fully equipped!\n\n` +
        `*Next Steps:*\n` +
        `1️⃣ Use "Item In" to add stock\n` +
        `2️⃣ Select category to see filtered items\n` +
        `3️⃣ Choose item and enter quantity`
      );

      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 4000);

    } catch (error) {
      console.error('Error creating comprehensive inventory:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error creating comprehensive inventory. Please try again."
      );
      await this.clearSession(phone);
      setTimeout(() => this.showInventoryMainMenu(phone), 2000);
    }
  }

  // === UTILITY METHODS ===
  private async getActiveItems() {
    return await getDb()
      .select()
      .from(inventory_items)
      .where(eq(inventory_items.status, 'active'))
      .orderBy(inventory_items.name);
  }

  private async getActiveItemsByCategory(category: string) {
    return await getDb()
      .select()
      .from(inventory_items)
      .where(
        and(
          eq(inventory_items.status, 'active'),
          eq(inventory_items.category, category)
        )
      )
      .orderBy(inventory_items.name);
  }

  private getCategoryDisplayName(category: string): string {
    switch (category) {
      case 'building_material':
        return 'Building Material';
      case 'contractor_materials':
        return 'Contractor Materials';
      case 'electrical_materials':
        return 'Electrical Materials';
      case 'all':
        return 'All Items';
      default:
        return 'Unknown Category';
    }
  }

  private getCategoryExamples(category: string): string {
    switch (category) {
      case 'building_material':
        return `• Cement Bags\n• Steel Rods 10mm/12mm\n• Red Bricks\n• River Sand\n• Stone Chips\n• Floor Tiles`;
      case 'contractor_materials':
        return `• Scaffolding Plates 3ft×2ft\n• Jack Prop 2.3m\n• Ring Machine 12mm\n• Cutter Machine 14inch\n• Sikanja 2ft\n• Bamboo 8ft`;
      case 'electrical_materials':
        return `• PVC Wire 2.5mm\n• Modular Switches\n• 3-Pin Sockets\n• MCB 16A/32A\n• Distribution Board\n• PVC Conduit 20mm`;
      default:
        return `• Various items`;
    }
  }

  private async getItemById(itemId: string) {
    const items = await getDb()
      .select()
      .from(inventory_items)
      .where(eq(inventory_items.id, itemId))
      .limit(1);
    
    return items.length > 0 ? items[0] : null;
  }

  // === PDF GENERATION METHODS ===
  private async generateInventoryBalancePDF(items: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(18).text('📦 Inventory Balance Report', { align: 'center' });
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // Table header
      doc.fontSize(14).text('Item List', 50, doc.y);
      doc.text('Quantity', 250, doc.y);
      doc.text('Unit', 350, doc.y);
      doc.moveTo(50, doc.y + 5).lineTo(500, doc.y + 5).stroke();
      doc.moveDown();

      // Table rows
      items.forEach((item) => {
        doc.fontSize(12);
        doc.text(item.name, 50, doc.y);
        doc.text(item.current_stock.toString(), 250, doc.y);
        doc.text(item.unit, 350, doc.y);
        doc.moveDown();
      });

      // Footer
      doc.moveDown(2);
      doc.fontSize(10).text(`Total Items: ${items.length}`, { align: 'center' });

      doc.end();
    });
  }

  private async generateDayToDayPDF(transactions: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(18).text('📅 Day-to-Day Transactions Report', { align: 'center' });
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // Table header
      doc.fontSize(10);
      doc.text('Date', 50, doc.y);
      doc.text('Item', 120, doc.y);
      doc.text('In/Out', 200, doc.y);
      doc.text('Units', 250, doc.y);
      doc.text('Entry By', 300, doc.y);
      doc.moveTo(50, doc.y + 5).lineTo(500, doc.y + 5).stroke();
      doc.moveDown();

      // Table rows
      transactions.forEach((transaction) => {
        const date = new Date(transaction.created_at).toLocaleDateString();
        const entryBy = transaction.user_name || 'System';
        
        doc.fontSize(9);
        doc.text(date, 50, doc.y);
        doc.text(transaction.item_name || 'Unknown', 120, doc.y);
        doc.text(transaction.transaction_type.toUpperCase(), 200, doc.y);
        doc.text(`${transaction.quantity} ${transaction.item_unit}`, 250, doc.y);
        doc.text(entryBy, 300, doc.y);
        doc.moveDown(0.5);
      });

      // Footer
      doc.moveDown(2);
      doc.fontSize(10).text(`Total Transactions: ${transactions.length}`, { align: 'center' });

      doc.end();
    });
  }

  // === FALLBACK TEXT METHODS ===
  private async sendInventoryBalanceText(phone: string, items: any[]) {
    let message = `📊 *Inventory Balance Report*\n\n`;
    message += `Generated: ${new Date().toLocaleString()}\n\n`;
    message += `*Item List*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    items.forEach((item) => {
      message += `• ${item.name}: ${item.current_stock ?? 0} ${item.unit}\n`;
    });

    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `Total Items: ${items.length}`;

    await whatsappService.sendTextMessage(phone, message);
  }

  private async sendDayToDayText(phone: string, transactions: any[]) {
    let message = `📅 *Day-to-Day Transactions Report*\n\n`;
    message += `Generated: ${new Date().toLocaleString()}\n`;
    message += `Last 30 Days\n\n`;

    // Group by date
    const groupedByDate = transactions.reduce((acc: any, transaction: any) => {
      const date = new Date(transaction.created_at).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(transaction);
      return acc;
    }, {});

    Object.keys(groupedByDate).forEach(date => {
      message += `*${date}*\n`;
      groupedByDate[date].forEach((transaction: any) => {
        const entryBy = transaction.user_name || 'System';
        message += `• ${transaction.item_name} - ${transaction.transaction_type.toUpperCase()} - ${transaction.quantity} ${transaction.item_unit} (${entryBy})\n`;
      });
      message += `\n`;
    });

    message += `Total Transactions: ${transactions.length}`;

    await whatsappService.sendTextMessage(phone, message);
  }

  // === CATEGORY-SPECIFIC ITEM FLOWS ===
  private async startItemInWithCategory(phone: string, category: string, user?: any) {
    console.log('📦 [INVENTORY] Starting Item In flow for category:', category);
    
    try {
      const items = await this.getActiveItemsByCategory(category);
      
      if (items.length === 0) {
        const categoryName = this.getCategoryDisplayName(category);
        await whatsappService.sendTextMessage(phone, 
          `❌ *No ${categoryName} items found*\n\n` +
          `To use Item In, you need to add items first.\n\n` +
          `🔹 Use 'New Item' to add your first ${categoryName.toLowerCase()} item\n` +
          `🔹 Then you can add stock using 'Item In'`
        );
        
        setTimeout(async () => {
          await this.showInventoryMainMenu(phone, user);
        }, 2000);
        return;
      }

      await this.updateSession(phone, {
        intent: 'inventory_management',
        step: 'item_in_select',
        data: { category, user_id: user?.id, page: 1, total_items: items.length }
      });

      await this.showItemListWithPagination(phone, items, category, 'item_in', 1);
    } catch (error) {
      console.error('Error in startItemInWithCategory:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error loading items. Please try again."
      );
      await this.showInventoryMainMenu(phone, user);
    }
  }

  private async startItemOutWithCategory(phone: string, category: string, user?: any) {
    console.log('📦 [INVENTORY] Starting Item Out flow for category:', category);
    
    try {
      const items = await this.getActiveItemsByCategory(category);
      
      if (items.length === 0) {
        const categoryName = this.getCategoryDisplayName(category);
        await whatsappService.sendTextMessage(phone, 
          `❌ *No ${categoryName} items found*\n\n` +
          `To use Item Out, you need to add items first.\n\n` +
          `🔹 Use 'New Item' to add your first ${categoryName.toLowerCase()} item\n` +
          `🔹 Then add stock using 'Item In'\n` +
          `🔹 Finally you can remove stock using 'Item Out'`
        );
        
        setTimeout(async () => {
          await this.showInventoryMainMenu(phone, user);
        }, 2000);
        return;
      }

      // Check if any items have stock
      const itemsWithStock = items.filter(item => (item.current_stock ?? 0) > 0);
      
      if (itemsWithStock.length === 0) {
        const categoryName = this.getCategoryDisplayName(category);
        await whatsappService.sendTextMessage(phone, 
          `❌ *No ${categoryName.toLowerCase()} items with stock available*\n\n` +
          `All items have zero stock. Please add stock first using 'Item In'.\n\n` +
          `Available items with zero stock:\n` +
          items.slice(0, 10).map(item => `• ${item.name}: ${item.current_stock ?? 0} ${item.unit}`).join('\n') +
          (items.length > 10 ? `\n... and ${items.length - 10} more items` : '')
        );
        
        setTimeout(async () => {
          await this.showInventoryMainMenu(phone, user);
        }, 3000);
        return;
      }

      await this.updateSession(phone, {
        intent: 'inventory_management',
        step: 'item_out_select',
        data: { category, user_id: user?.id, page: 1, total_items: itemsWithStock.length }
      });

      await this.showItemListWithPagination(phone, itemsWithStock, category, 'item_out', 1);
    } catch (error) {
      console.error('Error in startItemOutWithCategory:', error);
      await whatsappService.sendTextMessage(phone, 
        "❌ Error loading items. Please try again."
      );
      await this.showInventoryMainMenu(phone, user);
    }
  }

  private async showItemListWithPagination(phone: string, items: any[], category: string, action: string, page: number) {
    const itemsPerPage = 8; // Leave 2 slots for navigation if needed
    const totalPages = Math.ceil(items.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, items.length);
    const pageItems = items.slice(startIndex, endIndex);

    const categoryName = this.getCategoryDisplayName(category);
    const actionText = action === 'item_in' ? 'Item In' : 'Item Out';
    const stockText = action === 'item_in' ? 'Current' : 'Available';

    // Create shorter section title to fit 24-char limit
    const getSectionTitle = (category: string) => {
      switch (category) {
        case 'building_material':
          return 'Building Materials';
        case 'contractor_materials':
          return 'Contractor Items';
        case 'electrical_materials':
          return 'Electrical Items';
        case 'all':
          return 'All Items';
        default:
          return 'Items';
      }
    };

    const itemOptions = pageItems.map(item => ({
      id: item.id,
      title: item.name.length > 24 ? `${item.name.substring(0, 21)}...` : item.name,
      description: `${stockText}: ${item.current_stock ?? 0} ${item.unit}`
    }));

    // Add navigation options
    const rows = [...itemOptions];
    
    if (totalPages > 1) {
      if (page > 1) {
        rows.push({
          id: `prev_page_${page - 1}`,
          title: `◀️ Previous`,
          description: `Page ${page - 1} of ${totalPages}`
        });
      }
      if (page < totalPages) {
        rows.push({
          id: `next_page_${page + 1}`,
          title: `▶️ Next`,
          description: `Page ${page + 1} of ${totalPages}`
        });
      }
    }

    const pageInfo = totalPages > 1 ? `\n📄 Page ${page} of ${totalPages} (${items.length} total items)` : `\n📦 ${items.length} items available`;

    await whatsappService.sendListMessage(
      phone,
      `📦 *${categoryName} - ${actionText}*\n\nSelect item to ${action === 'item_in' ? 'add' : 'remove'} stock:${pageInfo}`,
      "Select Item",
      [{
        title: getSectionTitle(category),
        rows: rows
      }]
    );
  }

  private async startNewItemWithCategory(phone: string, category: string, user?: any) {
    console.log('📦 [INVENTORY] Starting New Item flow for category:', category);
    
    await this.updateSession(phone, {
      intent: 'inventory_management',
      step: 'new_item_name',
      data: { category, user_id: user?.id }
    });

    const categoryName = this.getCategoryDisplayName(category);
    const examples = this.getCategoryExamples(category);

    await whatsappService.sendTextMessage(phone, 
      `🆕 *Add New ${categoryName} Item*\n\n` +
      `Enter the name of the new ${categoryName.toLowerCase()} item:\n\n` +
      `💡 *${categoryName} Examples:*\n${examples}\n\n` +
      `*Type the item name:*`
    );
  }

  // Image upload handler similar to employeeFlow.ts
  private async handleImageUpload(
    phone: string, 
    currentData: any, 
    messageText: string, 
    imageData?: ImageMessage,
    folderName: string = 'inventory',
    photoDescription: string = 'Inventory Image',
    completionHandler?: (phone: string, data: any) => Promise<void>
  ) {
    const retryCount = currentData.upload_retry_count || 0;
    
    if (imageData) {
      // Validate image before upload
      if (!this.validateImageData(imageData)) {
        await whatsappService.sendTextMessage(phone, "❌ Invalid image format. Please upload JPEG or PNG image or type 'skip'.");
        return;
      }

      await whatsappService.sendTextMessage(phone, `📤 Uploading ${photoDescription}...`);
      
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
          
          await whatsappService.sendTextMessage(phone, "✅ Image uploaded successfully!");
          
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
            ? "⏰ Upload timeout occurred."
            : "❌ Error uploading image.";
            
          await whatsappService.sendTextMessage(phone, 
            `${errorMessage} Please try again (${retryCount + 1}/${this.MAX_UPLOAD_RETRIES + 1}) or type 'skip'.`
          );
        } else {
          // Max retries reached
          await whatsappService.sendTextMessage(phone, 
            "❌ Repeated upload failures. Type 'skip' to continue without image or try again later."
          );
        }
        return;
      }
      
    } else if (messageText.toLowerCase() === 'skip') {
      if (completionHandler) {
        await completionHandler(phone, { ...currentData, image_info: null });
      }
    } else {
      await whatsappService.sendTextMessage(phone, "Please upload an image or type 'skip':");
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
} 