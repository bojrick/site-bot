import { getDb } from '../../../../db';
import { material_requests } from '../../../../db/schema';
import { whatsappService, ImageMessage } from '../../../whatsapp';
import { SessionManager, EmployeeSessionData } from '../shared/SessionManager';
import { SiteContextService } from '../site/SiteContextService';
import { UserService } from '../../../userService';
import { r2Service } from '../../../cloudflareR2';
import process from 'process';

interface MaterialConfig {
  id: string;
  short: string;
  long: string;
  subtypes?: { [key: string]: { short: string; long: string; unit: string } };
}

interface MaterialTypeConfig {
  [category: string]: MaterialConfig;
}

export class MaterialRequestService {
  private sessionManager: SessionManager;
  private siteService: SiteContextService;
  private userService: UserService;
  
  private readonly MAX_UPLOAD_RETRIES = 2;
  private readonly UPLOAD_TIMEOUT_MS = 30000;

  // Construction-focused material types
  private readonly MATERIAL_TYPES: MaterialTypeConfig = {
    rmc: {
      id: 'rmc',
      short: '🏗️ RMC કોંક્રિટ',
      long: 'રેડી મિક્સ કોંક્રિટ (કોંક્રિટ મિશ્રણ)',
      subtypes: {
        m15: {
          short: 'M15 કોંક્રિટ',
          long: 'M15 - નાના કામ, ફાઉન્ડેશન બેસ માટે',
          unit: 'cubic_meters'
        },
        m25: {
          short: 'M25 કોંક્રિટ',  
          long: 'M25 - બીમ, કોલમ, સ્લેબ માટે સામાન્ય',
          unit: 'cubic_meters'
        },
        m30: {
          short: 'M30 કોંક્રિટ',
          long: 'M30 - મજબૂત સ્ર્કચર, હાઇ-રાઇઝ બિલ્ડિંગ માટે',
          unit: 'cubic_meters'
        }
      }
    },
    steel: {
      id: 'steel',
      short: '🔩 સ્ટીલ/રિબાર',
      long: 'સ્ટીલ રોડ/રિબાર વિવિધ ડાયામીટરમાં'
    },
    aac_block: {
      id: 'aac_block',
      short: '🧱 AAC બ્લોક',
      long: 'ઓટોક્લેવ્ડ એરેટેડ કોંક્રિટ બ્લોક',
      subtypes: {
        '100mm': {
          short: '100mm AAC બ્લોક',
          long: '600x200x100mm - પાર્ટિશન વોલ માટે',
          unit: 'pieces'
        },
        '150mm': {
          short: '150mm AAC બ્લોક', 
          long: '600x200x150mm - મધ્યમ વોલ માટે',
          unit: 'pieces'
        },
        '200mm': {
          short: '200mm AAC બ્લોક',
          long: '600x200x200mm - લોડ બેરિંગ વોલ માટે',
          unit: 'pieces'
        },
        '230mm': {
          short: '230mm AAC બ્લોક',
          long: '600x200x230mm - એક્સટર્નલ વોલ માટે',
          unit: 'pieces'
        },
        '250mm': {
          short: '250mm AAC બ્લોક',
          long: '600x200x250mm - મુખ્ય બેરિંગ વોલ માટે',
          unit: 'pieces'
        },
        '300mm': {
          short: '300mm AAC બ્લોક',
          long: '600x200x300mm - હેવી ડ્યુટી વોલ માટે',
          unit: 'pieces'
        }
      }
    },
    other: {
      id: 'other',
      short: '📦 અન્ય સામગ્રી',
      long: 'અન્ય બાંધકામ સામગ્રી'
    }
  };

  constructor() {
    this.sessionManager = new SessionManager();
    this.siteService = new SiteContextService(this.sessionManager);
    this.userService = new UserService();
  }

  /**
   * Start the material request flow
   */
  async startFlow(phone: string): Promise<void> {
    console.log('📦 [MATERIAL-REQUEST] Starting construction material request flow');
    
    await this.sessionManager.startFlow(phone, 'material_request', 'select_material_type');
    await this.showMaterialTypes(phone);
  }

  /**
   * Handle material request flow steps
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
      console.error('📦 [MATERIAL-REQUEST] No session found');
      return;
    }

    console.log('📦 [MATERIAL-REQUEST] Handling step:', session.step, 'with message:', messageText.substring(0, 50));

    switch (session.step) {
      case 'select_material_type':
        await this.handleMaterialTypeSelection(phone, messageText, interactiveData);
        break;
        
      case 'configure_rmc':
        await this.handleRMCConfiguration(phone, messageText, interactiveData);
        break;
        
      case 'enter_rmc_quantity':
        await this.handleRMCQuantityEntry(phone, messageText);
        break;
        
      case 'configure_steel':
        await this.handleSteelConfiguration(phone, messageText);
        break;
        
      case 'configure_aac_block':
        await this.handleAACBlockConfiguration(phone, messageText, interactiveData);
        break;
        
      case 'enter_aac_quantity':
        await this.handleAACQuantityEntry(phone, messageText);
        break;
        
      case 'configure_other_material':
        await this.handleOtherMaterialConfiguration(phone, messageText);
        break;
        
      case 'enter_delivery_datetime':
        await this.handleDeliveryDateTimeEntry(phone, messageText);
        break;
        
      case 'upload_reference_image':
        await this.handleReferenceImageUpload(phone, messageText, imageData);
        break;
        
      default:
        console.log('📦 [MATERIAL-REQUEST] Unknown step:', session.step);
        await this.startFlow(phone);
        break;
    }
  }

  /**
   * Show main material types
   */
  private async showMaterialTypes(phone: string): Promise<void> {
    const message = `📦 *બાંધકામ સામગ્રી માગો*

તમને કયા પ્રકારની સામગ્રીની જરૂર છે?`;

    const materialTypes = Object.values(this.MATERIAL_TYPES).map(type => ({
      id: type.id,
      title: type.short,
      description: type.long
    }));

    await whatsappService.sendListMessage(
      phone,
      message,
      "સામગ્રી પસંદ કરો",
      [{
        title: "બાંધકામ સામગ્રી",
        rows: materialTypes
      }]
    );
  }

  /**
   * Handle material type selection
   */
  private async handleMaterialTypeSelection(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    let materialType: string;
    
    // Handle interactive data
    if (interactiveData && interactiveData.type === 'list_reply' && interactiveData.list_reply) {
      materialType = interactiveData.list_reply.id;
    } else {
      materialType = messageText.toLowerCase().trim();
    }

    console.log('📦 [MATERIAL-REQUEST] DEBUG - Selected material type:', materialType);

    const validTypes = Object.keys(this.MATERIAL_TYPES);
    console.log('📦 [MATERIAL-REQUEST] DEBUG - Valid types:', validTypes);
    
    if (!validTypes.includes(materialType)) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય સામગ્રીનો પ્રકાર પસંદ કરો:"
      );
      await this.showMaterialTypes(phone);
      return;
    }

    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};
    
    // Update session with material type
    await this.sessionManager.updateSession(phone, {
      data: {
        ...sessionData,
        material_type: materialType as 'rmc' | 'steel' | 'aac_block' | 'other'
      }
    });

    // Route to specific configuration based on material type
    switch (materialType) {
      case 'rmc':
        await this.sessionManager.updateSession(phone, { step: 'configure_rmc' });
        await this.showRMCOptions(phone);
        break;
        
      case 'steel':
        await this.sessionManager.updateSession(phone, { step: 'configure_steel' });
        await this.showSteelInstructions(phone);
        break;
        
      case 'aac_block':
        await this.sessionManager.updateSession(phone, { step: 'configure_aac_block' });
        await this.showAACBlockOptions(phone);
        break;
        
      case 'other':
        await this.sessionManager.updateSession(phone, { step: 'configure_other_material' });
        await this.askForOtherMaterialConfiguration(phone);
        break;
        
      default:
        await this.startFlow(phone);
    }
  }

  /**
   * Show RMC concrete options
   */
  private async showRMCOptions(phone: string): Promise<void> {
    const message = `🏗️ *RMC કોંક્રિટ મિક્સ પસંદ કરો*

કયા મિક્સ ડિઝાઇનની જરૂર છે?`;

    const rmcTypes = Object.entries(this.MATERIAL_TYPES.rmc.subtypes!).map(([key, config]) => ({
      id: key,
      title: config.short,
      description: config.long
    }));

    await whatsappService.sendListMessage(
      phone,
      message,
      "મિક્સ પસંદ કરો",
      [{
        title: "કોંક્રિટ મિક્સ ડિઝાઇન",
        rows: rmcTypes
      }]
    );
  }

  /**
   * Handle RMC configuration
   */
  private async handleRMCConfiguration(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    let rmcType: string;
    
    // Handle interactive data
    if (interactiveData && interactiveData.type === 'list_reply' && interactiveData.list_reply) {
      rmcType = interactiveData.list_reply.id;
    } else {
      rmcType = messageText.toLowerCase().trim();
    }

    const validRMCTypes = Object.keys(this.MATERIAL_TYPES.rmc.subtypes || {});
    
    if (!validRMCTypes.includes(rmcType)) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય RMC મિક્સ પસંદ કરો:"
      );
      await this.showRMCOptions(phone);
      return;
    }

    const rmcConfig = this.MATERIAL_TYPES.rmc.subtypes![rmcType];
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};
    
    await this.sessionManager.updateSession(phone, {
      step: 'enter_rmc_quantity',
      data: {
        ...sessionData,
        rmc_mix: rmcType as 'm15' | 'm25' | 'm30',
        material_description: rmcConfig.long,
        unit: 'cubic_meters'
      }
    });

    await whatsappService.sendTextMessage(phone, 
      `✅ પસંદ કરેલ મિક્સ: ${rmcConfig.short}

📏 *કેટલા ક્યુબિક મીટર જરૂર છે?*

કૃપા કરીને જથ્થો દાખલ કરો:
• પૂરા નંબર માટે: 10, 15, 20
• દશાંશ માટે: 2.5, 7.5, 12.5
• ક્યુબિક મીટરમાં (m³)

જથ્થો દાખલ કરો:`
    );
  }

  /**
   * Handle RMC quantity entry
   */
  private async handleRMCQuantityEntry(phone: string, messageText: string): Promise<void> {
    const quantity = parseFloat(messageText.trim());
    
    if (isNaN(quantity) || quantity <= 0 || quantity > 1000) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય જથ્થો દાખલ કરો (0.1-1000 ક્યુબિક મીટર વચ્ચે):\n\n" +
        "ઉદાહરણ:\n• 5 (પાંચ ક્યુબિક મીટર)\n• 2.5 (બે અડધા ક્યુબિક મીટર)\n• 10.75 (દસ ત્રણ ચોથાઈ)"
      );
      return;
    }

    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};

    await this.sessionManager.updateSession(phone, {
      step: 'enter_delivery_datetime',
      data: {
        ...sessionData,
        quantity: quantity, // Store directly as decimal - no conversion needed
        quantity_display: quantity,
        final_description: `${sessionData.material_description} - ${quantity} ક્યુબિક મીટર`
      }
    });

    await this.askForDeliveryDateTime(phone, sessionData.final_description);
  }

  /**
   * Show steel input instructions
   */
  private async showSteelInstructions(phone: string): Promise<void> {
    await whatsappService.sendTextMessage(phone, 
      `🔩 *સ્ટીલ/રિબાર ઓર્ડર કરો*

📏 *આ ફોર્મેટ અનુસાર લખો:*

\`\`\`
8mm - 2 tonnes
10mm - 1.5 tonnes
12mm - 3 tonnes
16mm - 0.5 tonnes
\`\`\`

🔸 **માત્ર આ ડાયામીટર જ:** 8, 10, 12, 16, 20, 25 mm
🔸 **ટન્સમાં જથ્થો** (દા.ત. 2, 1.5, 0.5)  
🔸 **એક લાઇનમાં એક ડાયામીટર**

અહીં તમારો સ્ટીલ ઓર્ડર લખો:`
    );
  }

  /**
   * Handle steel configuration
   */
  private async handleSteelConfiguration(phone: string, messageText: string): Promise<void> {
    const steelText = messageText.trim();
    
    // Validate steel format
    const validationResult = this.validateSteelInput(steelText);
    
    if (!validationResult.isValid) {
      await whatsappService.sendTextMessage(phone, 
        `❌ ${validationResult.error}\n\n` +
        "કૃપા કરીને આ ફોર્મેટ અનુસાર લખો:\n" +
        "8mm - 2 tonnes\n10mm - 1.5 tonnes\n\n" +
        "વૈધ ડાયામીટર: 8, 10, 12, 16, 20, 25 mm"
      );
      return;
    }

    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};
    
    const totalTonnes = validationResult.items!.reduce((sum, item) => sum + item.tonnes, 0);

    await this.sessionManager.updateSession(phone, {
      step: 'enter_delivery_datetime',
      data: {
        ...sessionData,
        steel_details: validationResult.items,
        quantity: totalTonnes, // Store directly as decimal tonnes
        quantity_display: totalTonnes,
        unit: 'tonnes',
        material_description: 'સ્ટીલ/રિબાર વિવિધ ડાયામીટર',
        final_description: this.formatSteelDescription(validationResult.items!)
      }
    });

    await whatsappService.sendTextMessage(phone, 
      `✅ *સ્ટીલ ઓર્ડર કન્ફર્મ:*\n\n${this.formatSteelDescription(validationResult.items!)}\n\n` +
      `**કુલ જથ્થો:** ${totalTonnes} ટન્સ`
    );

    await this.askForDeliveryDateTime(phone, sessionData.final_description);
  }

  /**
   * Show AAC block options
   */
  private async showAACBlockOptions(phone: string): Promise<void> {
    const message = `🧱 *AAC બ્લોક જાડાઈ પસંદ કરો*

કઈ જાડાઈના બ્લોકની જરૂર છે?
(લંબાઈ: 600mm, પહોળાઈ: 200mm)`;

    const aacTypes = Object.entries(this.MATERIAL_TYPES.aac_block.subtypes!).map(([key, config]) => ({
      id: key,
      title: config.short,
      description: config.long
    }));

    await whatsappService.sendListMessage(
      phone,
      message,
      "જાડાઈ પસંદ કરો",
      [{
        title: "AAC બ્લોક જાડાઈ વિકલ્પો",
        rows: aacTypes
      }]
    );
  }

  /**
   * Handle AAC block configuration
   */
  private async handleAACBlockConfiguration(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    let blockType: string;
    
    // Handle interactive data
    if (interactiveData && interactiveData.type === 'list_reply' && interactiveData.list_reply) {
      blockType = interactiveData.list_reply.id;
    } else {
      blockType = messageText.toLowerCase().trim();
    }

    const validBlockTypes = Object.keys(this.MATERIAL_TYPES.aac_block.subtypes || {});
    
    if (!validBlockTypes.includes(blockType)) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય AAC બ્લોક જાડાઈ પસંદ કરો:"
      );
      await this.showAACBlockOptions(phone);
      return;
    }

    const blockConfig = this.MATERIAL_TYPES.aac_block.subtypes![blockType as '100mm' | '150mm' | '200mm' | '230mm' | '250mm' | '300mm'];
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};
    
    await this.sessionManager.updateSession(phone, {
      step: 'enter_aac_quantity',
      data: {
        ...sessionData,
        block_type: blockType as '100mm' | '150mm' | '200mm' | '230mm' | '250mm' | '300mm',
        material_description: blockConfig.long,
        unit: 'pieces'
      }
    });

    await whatsappService.sendTextMessage(phone, 
      `✅ પસંદ કરેલ બ્લોક: ${blockConfig.short}

🔢 *કેટલા બ્લોકની જરૂર છે?*

કૃપા કરીને સંખ્યા (પીસ) દાખલ કરો:
• ઉદાહરણ: 100, 250, 500
• પૂર્ણ સંખ્યા આપો

જથ્થો દાખલ કરો:`
    );
  }

  /**
   * Handle AAC quantity entry
   */
  private async handleAACQuantityEntry(phone: string, messageText: string): Promise<void> {
    const quantity = parseInt(messageText.trim());
    
    if (isNaN(quantity) || quantity <= 0 || quantity > 50000) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય સંખ્યા દાખલ કરો (1-50000 પીસ વચ્ચે):\n\n" +
        "ઉદાહરણ:\n• 100 (સો પીસ)\n• 250 (બેસો પચાસ પીસ)\n• 1500 (પંદર સો પીસ)"
      );
      return;
    }

    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};

    await this.sessionManager.updateSession(phone, {
      step: 'enter_delivery_datetime',
      data: {
        ...sessionData,
        quantity: quantity,
        quantity_display: quantity,
        final_description: `${sessionData.material_description} - ${quantity} પીસ`
      }
    });

    await this.askForDeliveryDateTime(phone, sessionData.final_description);
  }

  /**
   * Handle other material configuration
   */
  private async handleOtherMaterialConfiguration(phone: string, messageText: string): Promise<void> {
    const materialDescription = messageText.trim();
    
    if (materialDescription.length < 5) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને સામગ્રીની વિસ્તૃત માહિતી આપો (ઓછામાં ઓછા 5 અક્ષરો):\n\n" +
        "ઉદાહરણ:\n• સિમેન્ટ - 50 બેગ\n• રેડી મિક્સ મોર્ટાર - 20 બેગ\n• પાઇપ ફિટિંગ્સ - 1 સેટ"
      );
      return;
    }

    // Extract quantity and unit from description
    const quantityMatch = materialDescription.match(/(\d+(?:\.\d+)?)\s*([a-zA-Zઅ-હ]+)/);
    let quantity = 1;
    let unit = 'units';
    
    if (quantityMatch) {
      quantity = parseFloat(quantityMatch[1]);
      unit = quantityMatch[2];
    }

    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};

    await this.sessionManager.updateSession(phone, {
      step: 'enter_delivery_datetime',
      data: {
        ...sessionData,
        quantity: quantity, // Store directly as decimal
        quantity_display: quantity,
        unit: unit,
        material_description: materialDescription,
        final_description: materialDescription
      }
    });

    await this.askForDeliveryDateTime(phone, materialDescription);
  }

  /**
   * Ask for other material details
   */
  private async askForOtherMaterialConfiguration(phone: string): Promise<void> {
    await whatsappService.sendTextMessage(phone, 
      `📦 *અન્ય બાંધકામ સામગ્રી*

કૃપા કરીને સામગ્રીની વિગતો માહિતી આપો:

📝 *આ ફોર્મેટમાં લખો:*
• **સિમેન્ટ - 50 બેગ**
• **રેડી મિક્સ મોર્ટાર - 20 બેગ**
• **પાઇપ ફિટિંગ્સ - 1 સેટ**
• **બ્રિક્સ - 1000 પીસ**
• **ટાઇલ્સ - 100 square feet**

🔸 **સામગ્રીનું નામ અને જથ્થો સ્પષ્ટ લખો**
🔸 **યોગ્ય યુનિટ આપો (બેગ, પીસ, કિલો, મીટર વગેરે)**

સામગ્રીની વિગતો લખો:`
    );
  }

  /**
   * Ask for delivery date and time
   */
  private async askForDeliveryDateTime(phone: string, materialDescription: string): Promise<void> {
    await whatsappService.sendTextMessage(phone, 
      `✅ *સામગ્રી:* ${materialDescription}

📅 *ડિલિવરી તારીખ અને સમય*

કયારે ડિલિવરી જોઈએ છે?

📝 *આ ફોર્મેટમાં લખો:*
• **આવતીકાલ સવારે 10 વાગ્યે**
• **25/12/2024 બપોરે 2 વાગ્યે**  
• **આજથી 3 દિવસ બાદ સવારે**
• **સોમવારે સવારે 9 વાગ્યે**

તારીખ અને સમય દાખલ કરો:`
    );
  }

  /**
   * Handle delivery date time entry
   */
  private async handleDeliveryDateTimeEntry(phone: string, messageText: string): Promise<void> {
    const deliveryText = messageText.trim();
    
    if (deliveryText.length < 5) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને ડિલિવરી તારીખ અને સમય સ્પષ્ટ રીતે લખો:\n\n" +
        "ઉદાહરણ:\n• આવતીકાલ સવારે 10 વાગ્યે\n• 25/12/2024 બપોરે 2 વાગ્યે"
      );
      return;
    }

    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};

    await this.sessionManager.updateSession(phone, {
      step: 'upload_reference_image',
      data: {
        ...sessionData,
        delivery_datetime: deliveryText,
        upload_retry_count: 0
      }
    });

    await whatsappService.sendTextMessage(phone, 
      `✅ *ડિલિવરી:* ${deliveryText}

📸 *રેફરન્સ ફોટો (વૈકલ્પિક)*

જો તમારી પાસે કોઈ રેફરન્સ છે તો અપલોડ કરો:
• કેલ્ક્યુલેશન/એસ્ટિમેટ ફોટો
• સાઈટ પ્લાન/ડ્રોઇંગ
• સેમ્પલ મટેરિયલ ફોટો

📱 ફોટો અપલોડ કરો અથવા *skip* ટાઈપ કરો:`
    );
  }

  /**
   * Handle reference image upload (OPTIONAL)
   */
  private async handleReferenceImageUpload(phone: string, messageText: string, imageData?: ImageMessage): Promise<void> {
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};
    const retryCount = sessionData.upload_retry_count || 0;

    // Allow skipping image upload
    if (messageText.toLowerCase().trim() === 'skip') {
      await this.completeMaterialRequest(phone, { ...sessionData, image_info: null });
      return;
    }

    if (!imageData) {
      await whatsappService.sendTextMessage(phone, 
        "📱 કૃપા કરીને રેફરન્સ ફોટો અપલોડ કરો અથવા *skip* ટાઈપ કરો છોડવા માટે."
      );
      return;
    }

    // Validate image
    if (!this.validateImageData(imageData)) {
      await whatsappService.sendTextMessage(phone, 
        "❌ અયોગ્ય ફોટો ફોર્મેટ. કૃપા કરીને JPEG અથવા PNG ફોટો અપલોડ કરો."
      );
      return;
    }

    await whatsappService.sendTextMessage(phone, "📤 રેફરન્સ ફોટો અપલોડ કરી રહ્યા છીએ...");
    
    try {
      // Upload with timeout
      const uploadPromise = r2Service.uploadFromWhatsAppMedia(
        imageData.id,
        process.env.META_WHATSAPP_TOKEN!,
        'material-requests'
      );
      
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Upload timeout')), this.UPLOAD_TIMEOUT_MS)
      );
      
      const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
      
      if (uploadResult.success) {
        const imageInfo = {
          url: uploadResult.url,
          key: uploadResult.key,
          caption: imageData.caption || 'રેફરન્સ ફોટો',
          whatsapp_media_id: imageData.id,
          mime_type: imageData.mime_type,
          sha256: imageData.sha256
        };
        
        await whatsappService.sendTextMessage(phone, "✅ રેફરન્સ ફોટો અપલોડ થયો!");
        await this.completeMaterialRequest(phone, { ...sessionData, image_info: imageInfo });
      } else {
        throw new Error(uploadResult.error || 'Unknown upload error');
      }
      
    } catch (error) {
      console.error('Reference image upload error:', error);
      
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
          `${errorMessage} ફરીથી પ્રયાસ કરો (${retryCount + 1}/${this.MAX_UPLOAD_RETRIES + 1}) અથવા *skip* ટાઈપ કરો:`
        );
      } else {
        await whatsappService.sendTextMessage(phone, 
          "❌ ફોટો અપલોડ કરવામાં વારંવાર નિષ્ફળતા. આગળ વધી રહ્યા છીએ..."
        );
        await this.completeMaterialRequest(phone, { ...sessionData, image_info: null });
      }
      return;
    }
  }

  /**
   * Complete material request
   */
  private async completeMaterialRequest(phone: string, requestData: EmployeeSessionData): Promise<void> {
    try {
      const user = await this.userService.getUserByPhone(phone);
      const siteContext = await this.siteService.getCurrentSiteContext(phone);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      if (!siteContext) {
        throw new Error('Site context not found');
      }

      console.log('📦 [MATERIAL-REQUEST] Completing material request:', {
        materialType: requestData.material_type,
        quantity: requestData.quantity,
        unit: requestData.unit,
        siteId: siteContext.siteId,
        hasImage: !!requestData.image_info
      });

      // Prepare material specifications for jsonb field
      const materialSpecifications: any = {};
      
      if (requestData.material_type === 'rmc') {
        materialSpecifications.mix_type = requestData.rmc_mix;
        materialSpecifications.grade = requestData.rmc_mix?.toUpperCase();
      } else if (requestData.material_type === 'steel') {
        materialSpecifications.steel_details = requestData.steel_details;
        materialSpecifications.total_tonnes = requestData.quantity;
      } else if (requestData.material_type === 'aac_block') {
        materialSpecifications.block_thickness = requestData.block_type;
        materialSpecifications.dimensions = `600x200x${requestData.block_type}`;
      }

      // Prepare request details for jsonb field
      const requestDetails: any = { 
        logged_via: 'whatsapp',
        language: 'gujarati',
        site_name: siteContext.siteName,
        material_type: requestData.material_type,
        delivery_datetime: requestData.delivery_datetime,
        reference_photo: requestData.image_info,
        quantity_display: requestData.quantity_display,
        final_description: requestData.final_description
      };

      // Determine material name based on type
      let materialName = requestData.final_description || 'અન્ય સામગ્રી';
      if (requestData.material_type === 'rmc') {
        materialName = `RMC ${requestData.rmc_mix?.toUpperCase()} કોંક્રિટ`;
      } else if (requestData.material_type === 'steel') {
        materialName = 'સ્ટીલ/રિબાર વિવિધ ડાયામીટર';
      } else if (requestData.material_type === 'aac_block') {
        materialName = `AAC બ્લોક ${requestData.block_type}`;
      }

      // Parse delivery date (basic parsing - can be enhanced later)
      let deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + 1); // Default to tomorrow

      // Create material request in database using new schema
      const materialRequest = await getDb().insert(material_requests).values({
        user_id: user.id,
        site_id: siteContext.siteId,
        material_name: materialName,
        material_type: requestData.material_type!,
        quantity: requestData.quantity!.toString(), // Convert decimal to string for database
        unit: requestData.unit || 'units',
        material_specifications: materialSpecifications,
        requested_delivery_date: deliveryDate,
        delivery_instructions: requestData.delivery_datetime,
        description: requestData.final_description,
        urgency: 'medium', // Can be enhanced to ask user
        image_url: requestData.image_info?.url || null,
        image_key: requestData.image_info?.key || null,
        notes: requestData.user_comments || null,
        details: requestDetails
      }).returning();

      // Clear flow data but keep site context
      await this.sessionManager.clearFlowData(phone, true);

      // Send comprehensive confirmation
      const confirmationMessage = `✅ *સામગ્રી માગણી સફળતાપૂર્વક નોંધાઈ!*

📋 *વિગતો:*
• સાઈટ: ${siteContext.siteName}
• સામગ્રી: ${materialName}
• જથ્થો: ${requestData.quantity_display} ${this.getUnitDisplay(requestData.unit || 'units')}
• વર્ણન: ${requestData.final_description}
• ડિલિવરી: ${requestData.delivery_datetime}
${requestData.image_info ? '• 📸 રેફરન્સ ફોટો સેવ થયો' : '• 📸 કોઈ રેફરન્સ ફોટો નથી'}

*માગણી ID:* ${materialRequest[0].id.slice(0, 8)}
📋 સ્ટેટસ: ${materialRequest[0].status}
🕒 સમય: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

તમારી સામગ્રી માગણી સિસ્ટમમાં સેવ થઈ ગઈ છે!

મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.`;

      await whatsappService.sendTextMessage(phone, confirmationMessage);

    } catch (error) {
      console.error('Error completing material request:', error);
      
      let errorMessage = "❌ માફ કરશો, તમારી સામગ્રી માગણી નોંધવામાં ભૂલ થઈ.";
      
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
   * Validate steel input format
   */
  private validateSteelInput(input: string): { 
    isValid: boolean; 
    error?: string; 
    items?: { diameter: number; tonnes: number }[] 
  } {
    const lines = input.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length === 0) {
      return { isValid: false, error: "કૃપા કરીને સ્ટીલની વિગતો લખો." };
    }

    const validDiameters = [8, 10, 12, 16, 20, 25];
    const items: { diameter: number; tonnes: number }[] = [];

    for (const line of lines) {
      // Match pattern: "8mm - 2 tonnes" or "8mm-2" etc
      const match = line.match(/(\d+)\s*mm\s*-\s*(\d+(?:\.\d+)?)\s*(?:tonnes?|tons?|ટન)?/i);
      
      if (!match) {
        return { 
          isValid: false, 
          error: `આ લાઇન યોગ્ય નથી: "${line}"\nફોર્મેટ: "8mm - 2 tonnes"` 
        };
      }

      const diameter = parseInt(match[1]);
      const tonnes = parseFloat(match[2]);

      if (!validDiameters.includes(diameter)) {
        return { 
          isValid: false, 
          error: `અયોગ્ય ડાયામીટર: ${diameter}mm\nવૈધ ડાયામીટર: ${validDiameters.join(', ')} mm` 
        };
      }

      if (tonnes <= 0 || tonnes > 100) {
        return { 
          isValid: false, 
          error: `અયોગ્ય જથ્થો: ${tonnes} ટન્સ\n0.1-100 ટન્સ વચ્ચે હોવું જોઈએ` 
        };
      }

      items.push({ diameter, tonnes });
    }

    return { isValid: true, items };
  }

  /**
   * Format steel description for display
   */
  private formatSteelDescription(items: { diameter: number; tonnes: number }[]): string {
    return items.map(item => `${item.diameter}mm - ${item.tonnes} ટન્સ`).join('\n');
  }

  /**
   * Get unit display text
   */
  private getUnitDisplay(unit: string): string {
    const unitMap: { [key: string]: string } = {
      'cubic_meters': 'ક્યુબિક મીટર',
      'tonnes': 'ટન્સ',
      'pieces': 'પીસ',
      'units': 'યુનિટ',
      'kg': 'કિલો',
      'bags': 'બેગ'
    };
    
    return unitMap[unit] || unit;
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