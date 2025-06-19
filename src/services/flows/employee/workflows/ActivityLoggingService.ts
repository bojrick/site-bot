import { getDb } from '../../../../db';
import { activities } from '../../../../db/schema';
import { whatsappService, ImageMessage } from '../../../whatsapp';
import { SessionManager, EmployeeSessionData } from '../shared/SessionManager';
import { SiteContextService } from '../site/SiteContextService';
import { UserService } from '../../../userService';
import { r2Service } from '../../../cloudflareR2';
import process from 'process';

interface ActivityConfig {
  id: string;
  short: string;
  long: string;
  subtypes?: { [key: string]: { short: string; long: string } };
}

interface ActivityTypeConfig {
  [category: string]: ActivityConfig;
}

export class ActivityLoggingService {
  private sessionManager: SessionManager;
  private siteService: SiteContextService;
  private userService: UserService;
  
  private readonly MAX_UPLOAD_RETRIES = 2;
  private readonly UPLOAD_TIMEOUT_MS = 30000;

  // Construction-focused activity types with predefined descriptions
  private readonly ACTIVITY_TYPES: ActivityTypeConfig = {
    inspection: {
      id: 'inspection',
      short: '🔍 ઇન્સ્પેક્શન',
      long: 'બાંધકામના વિવિધ તબક્કાઓની તપાસ',
      subtypes: {
        foundation: {
          short: '🏗️ ફાઉન્ડેશન',
          long: 'ફાઉન્ડેશન ખોદકામ, કોંક્રિટ અને સબ-સ્ર્કચર ચેક'
        },
        structural: {
          short: '🧱 સ્ટ્રક્ચર',
          long: 'સ્ટીલ ફ્રેમ, બીમ્સ, કોલમ્સ અને માચરી ચેક'
        },
        electrical: {
          short: '⚡ ઇલેક્ટ્રિકલ',
          long: 'વાયરિંગ, ફિક્સર્સ, પેનલ અને વિદ્યુત સંયોજન ચેક'
        },
        plumbing: {
          short: '🚿 પ્લમ્બિંગ',
          long: 'વોટર પાઇપિંગ, ડ્રેનેજ, ફિટિંગ્સ અને લીકેજ ચેક'
        },
        finishes: {
          short: '🎨 ફિનિશ',
          long: 'પ્લાસ્ટરિંગ, પેઈન્ટિંગ, ફ્લોરિંગ અને સીલિંગ ફિનિશ ચેક'
        },
        mep: {
          short: '🔧 MEP',
          long: 'હીતિંગ, વેન્ટિલેશન, એસી, પ્લમ્બિંગ અને ઇલેક્ટ્રિકલ સંકલન ચેક'
        },
        safety: {
          short: '🦺 સેફ્ટી',
          long: 'હાર્ડહેટ, ગાર્ડરેઇલ, ફાયર એક્સિટ અને સલામતી ગિયર ચેક'
        },
        final: {
          short: '🏁 ફાઇનલ',
          long: 'હેન્ડઓવર પૂર્વે સમગ્ર સમીક્ષા'
        }
      }
    }
  };

  constructor() {
    this.sessionManager = new SessionManager();
    this.siteService = new SiteContextService(this.sessionManager);
    this.userService = new UserService();
  }

  /**
   * Start the activity logging flow
   */
  async startFlow(phone: string): Promise<void> {
    console.log('📝 [ACTIVITY-LOGGING] Starting construction activity logging flow');
    
    await this.sessionManager.startFlow(phone, 'activity_logging', 'select_activity_category');
    await this.showActivityCategories(phone);
  }

  /**
   * Handle activity logging flow steps
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
      console.error('📝 [ACTIVITY-LOGGING] No session found');
      return;
    }

    console.log('📝 [ACTIVITY-LOGGING] Handling step:', session.step, 'with message:', messageText.substring(0, 50));

    switch (session.step) {
      case 'select_activity_category':
        await this.handleActivityCategorySelection(phone, messageText, interactiveData);
        break;
        
      case 'select_activity_subtype':
        await this.handleActivitySubtypeSelection(phone, messageText, interactiveData);
        break;
        
      case 'enter_custom_description':
        await this.handleCustomDescriptionEntry(phone, messageText);
        break;
        
      case 'enter_hours':
        await this.handleHoursEntry(phone, messageText);
        break;
        
      case 'enter_comments':
        await this.handleCommentsEntry(phone, messageText);
        break;
        
      case 'upload_image':
        await this.handleImageUpload(phone, messageText, imageData);
        break;
        
      default:
        console.log('📝 [ACTIVITY-LOGGING] Unknown step:', session.step);
        await this.startFlow(phone);
        break;
    }
  }

  /**
   * Show main activity categories
   */
  private async showActivityCategories(phone: string): Promise<void> {
    const message = `📝 *બાંધકામ પ્રવૃત્તિ લોગ કરો*

તમે કયા પ્રકારની કામની પ્રવૃત્તિ કરી છે?`;

    const categories = Object.values(this.ACTIVITY_TYPES).map(type => ({
      id: type.id,
      title: type.short,
      description: type.long
    }));

    await whatsappService.sendListMessage(
      phone,
      message,
      "પ્રવૃત્તિ પસંદ કરો",
      [{
        title: "કામના પ્રકારો",
        rows: categories
      }]
    );
  }

  /**
   * Handle activity category selection
   */
  private async handleActivityCategorySelection(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    let activityCategory: string;
    
    // Handle interactive data
    if (interactiveData && interactiveData.type === 'list_reply' && interactiveData.list_reply) {
      activityCategory = interactiveData.list_reply.id;
    } else {
      activityCategory = messageText.toLowerCase().trim();
    }

    console.log('📝 [ACTIVITY-LOGGING] DEBUG - Selected category:', activityCategory);

    const validCategories = Object.keys(this.ACTIVITY_TYPES);
    console.log('📝 [ACTIVITY-LOGGING] DEBUG - Valid categories:', validCategories);
    
    if (!validCategories.includes(activityCategory)) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય પ્રવૃત્તિનો પ્રકાર પસંદ કરો:"
      );
      await this.showActivityCategories(phone);
      return;
    }

    const selectedType = this.ACTIVITY_TYPES[activityCategory];
    
    // Get current session data to preserve existing context
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};
    
    console.log('📝 [ACTIVITY-LOGGING] DEBUG - Current session data before update:', JSON.stringify(sessionData, null, 2));
    
    // If category has subtypes, show them
    if (selectedType.subtypes && Object.keys(selectedType.subtypes).length > 0) {
      const newSessionData = {
        ...sessionData,
        activity_category: activityCategory
      };
      
      console.log('📝 [ACTIVITY-LOGGING] DEBUG - New session data to save:', JSON.stringify(newSessionData, null, 2));
      
      await this.sessionManager.updateSession(phone, {
        step: 'select_activity_subtype',
        data: newSessionData
      });
      
      console.log('📝 [ACTIVITY-LOGGING] DEBUG - Session updated successfully');
      
      // Add a small delay to ensure database commit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify the session was saved correctly
      const verifySession = await this.sessionManager.getSession(phone);
      console.log('📝 [ACTIVITY-LOGGING] DEBUG - Verification - session after update:', JSON.stringify(verifySession, null, 2));
      
      await this.showActivitySubtypes(phone, selectedType);
    } else {
      // No subtypes, proceed to hours
      await this.sessionManager.updateSession(phone, {
        step: 'enter_hours',
        data: { 
          ...sessionData,
          activity_category: activityCategory,
          activity_subtype: null,
          predefined_description: selectedType.long
        }
      });
      
      await this.askForHours(phone, selectedType.short);
    }
  }

  /**
   * Show activity subtypes
   */
  private async showActivitySubtypes(phone: string, categoryConfig: ActivityConfig): Promise<void> {
    const message = `✅ પ્રવૃત્તિ: ${categoryConfig.short}

હવે ચોક્કસ કામનો પ્રકાર પસંદ કરો:`;

    const subtypes = Object.entries(categoryConfig.subtypes!).map(([key, config]) => ({
      id: key,
      title: config.short,
      description: config.long
    }));

    // Add "other" option
    subtypes.push({
      id: 'other',
      title: '📝 અન્ય',
      description: 'અન્ય પ્રકારની પ્રવૃત્તિ'
    });

    await whatsappService.sendListMessage(
      phone,
      message,
      "પ્રકાર પસંદ કરો",
      [{
        title: "કામની વિગતો",
        rows: subtypes
      }]
    );
  }

  /**
   * Handle activity subtype selection
   */
  private async handleActivitySubtypeSelection(phone: string, messageText: string, interactiveData?: any): Promise<void> {
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};
    
    console.log('📝 [ACTIVITY-LOGGING] DEBUG - Session data received:', JSON.stringify(sessionData, null, 2));
    console.log('📝 [ACTIVITY-LOGGING] DEBUG - Session intent:', session?.intent);
    console.log('📝 [ACTIVITY-LOGGING] DEBUG - Session step:', session?.step);
    
    // Get the category from session data and reconstruct the config
    const activityCategory = sessionData.activity_category;
    if (!activityCategory) {
      console.error('📝 [ACTIVITY-LOGGING] No activity category found in session data');
      console.error('📝 [ACTIVITY-LOGGING] DEBUG - Full session object:', JSON.stringify(session, null, 2));
      
      await whatsappService.sendTextMessage(phone, 
        "❌ સેશન ડેટા ખોવાઈ ગયો છે. કૃપા કરીને ફરીથી શરૂ કરો."
      );
      await this.startFlow(phone);
      return;
    }
    
    console.log('📝 [ACTIVITY-LOGGING] DEBUG - Found activity category:', activityCategory);
    
    const categoryConfig = this.ACTIVITY_TYPES[activityCategory];
    if (!categoryConfig) {
      console.error('📝 [ACTIVITY-LOGGING] Invalid activity category:', activityCategory);
      await whatsappService.sendTextMessage(phone, 
        "❌ અયોગ્ય પ્રવૃત્તિ પ્રકાર. કૃપા કરીને ફરીથી શરૂ કરો."
      );
      await this.startFlow(phone);
      return;
    }
    
    let activitySubtype: string;
    
    // Handle interactive data
    if (interactiveData && interactiveData.type === 'list_reply' && interactiveData.list_reply) {
      activitySubtype = interactiveData.list_reply.id;
    } else {
      activitySubtype = messageText.toLowerCase().trim();
    }

    console.log('📝 [ACTIVITY-LOGGING] DEBUG - Selected subtype:', activitySubtype);

    if (activitySubtype === 'other') {
      // Ask for custom description
      await this.sessionManager.updateSession(phone, {
        step: 'enter_custom_description',
        data: { 
          ...sessionData,
          activity_subtype: 'other'
        }
      });
      
      await whatsappService.sendTextMessage(phone, 
        `કૃપા કરીને તમારી પ્રવૃત્તિનું વર્ણન કરો:

📝 વિસ્તૃત વર્ણન લખો (ઓછામાં ઓછા 10 અક્ષરો):`
      );
      return;
    }

    const validSubtypes = Object.keys(categoryConfig.subtypes || {});
    console.log('📝 [ACTIVITY-LOGGING] DEBUG - Valid subtypes:', validSubtypes);
    
    if (!validSubtypes.includes(activitySubtype)) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય પ્રવૃત્તિનો પ્રકાર પસંદ કરો:"
      );
      await this.showActivitySubtypes(phone, categoryConfig);
      return;
    }

    const subtypeConfig = categoryConfig.subtypes![activitySubtype];
    console.log('📝 [ACTIVITY-LOGGING] DEBUG - Subtype config:', subtypeConfig);
    
    await this.sessionManager.updateSession(phone, {
      step: 'enter_hours',
      data: { 
        ...sessionData,
        activity_subtype: activitySubtype,
        predefined_description: subtypeConfig.long
      }
    });

    await this.askForHours(phone, subtypeConfig.short);
  }

  /**
   * Handle custom description entry
   */
  private async handleCustomDescriptionEntry(phone: string, messageText: string): Promise<void> {
    if (messageText.trim().length < 10) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને વધુ વિસ્તૃત વર્ણન આપો (ઓછામાં ઓછા 10 અક્ષરો):"
      );
      return;
    }

    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};
    
    await this.sessionManager.updateSession(phone, {
      step: 'enter_hours',
      data: { 
        ...sessionData,
        predefined_description: messageText.trim()
      }
    });

    await this.askForHours(phone, '📝 તમારી પ્રવૃત્તિ');
  }

  /**
   * Ask for work hours
   */
  private async askForHours(phone: string, activityName: string): Promise<void> {
    await whatsappService.sendTextMessage(phone, 
      `✅ પ્રવૃત્તિ: ${activityName}

⏰ તમે કેટલા કલાક કામ કર્યું? 

📝 કૃપા કરીને કલાકોની સંખ્યા દાખલ કરો:
• પૂરા કલાક માટે: 8, 6, 4
• અડધા કલાક માટે: 4.5, 6.5, 8.5
• મિનિટ માટે: 1.5, 2.5 (1-24 કલાક વચ્ચે)`
    );
  }

  /**
   * Handle hours entry
   */
  private async handleHoursEntry(phone: string, messageText: string): Promise<void> {
    const hours = parseFloat(messageText.trim());
    
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને યોગ્ય કલાકોની સંખ્યા દાખલ કરો (0.5-24 વચ્ચે):\n\n" +
        "ઉદાહરણ:\n• 8 (આખો દિવસ)\n• 4.5 (અડધો દિવસ)\n• 2.5 (બે અડધા કલાક)"
      );
      return;
    }

    // Get current session data to preserve existing context
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};

    await this.sessionManager.updateSession(phone, {
      step: 'enter_comments',
      data: { 
        ...sessionData,
        hours: hours 
      }
    });

    await whatsappService.sendTextMessage(phone, 
      `✅ કામના કલાકો: ${hours}

💬 *વધારાની ટિપ્પણી:*

કૃપા કરીને કામ વિશે કોઈ વિશેષ ટિપ્પણી, સમસ્યા અથવા સૂચનો લખો.

📝 ટિપ્પણી લખો અથવા 'skip' ટાઈપ કરો છોડવા માટે:`
    );
  }

  /**
   * Handle comments entry
   */
  private async handleCommentsEntry(phone: string, messageText: string): Promise<void> {
    const comments = messageText.toLowerCase().trim() === 'skip' ? '' : messageText.trim();
    
    // Get current session data to preserve existing context
    const session = await this.sessionManager.getSession(phone);
    const sessionData = session?.data || {};
    
    await this.sessionManager.updateSession(phone, {
      step: 'upload_image',
      data: { 
        ...sessionData,
        user_comments: comments,
        upload_retry_count: 0
      }
    });

    const commentsText = comments ? `✅ ટિપ્પણી: ${comments}` : '📝 કોઈ ટિપ્પણી નથી';

    await whatsappService.sendTextMessage(phone, 
      `${commentsText}

📸 *કામનો ફોટો અપલોડ કરો (ફરજિયાત):*

🚨 **મહત્વપૂર્ણ**: કામનો ફોટો અપલોડ કરવો ફરજિયાત છે.

કૃપા કરીને નીચેમાંથી કોઈ એક અપલોડ કરો:
• કામની સાઈટનો ફોટો
• પૂર્ણ થયેલા કામનો ફોટો  
• પ્રગતિ દર્શાવતો ફોટો
• સાધનો અને સામગ્રીનો ફોટો
• સેફ્ટી અને ગુણવત્તા દર્શાવતો ફોટો

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

    // Skip is not allowed - photo is mandatory
    if (messageText.toLowerCase().trim() === 'skip') {
      await whatsappService.sendTextMessage(phone, 
        "🚨 **ફોટો અપલોડ કરવો ફરજિયાત છે!**\n\n" +
        "કૃપા કરીને કામનો ફોટો અપલોડ કરો. આ પ્રવૃત્તિ લોગ કરવા માટે જરૂરી છે."
      );
      return;
    }

    if (!imageData) {
      await whatsappService.sendTextMessage(phone, 
        "❌ કૃપા કરીને ફોટો અપલોડ કરો.\n\n" +
        "📱 તમારા ફોનમાંથી ગેલેરી અથવા કેમેરાનો ઉપયોગ કરીને કામનો ફોટો મોકલો."
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

    await whatsappService.sendTextMessage(phone, "📤 કામનો ફોટો અપલોડ કરી રહ્યા છીએ...");
    
    try {
      // Upload with timeout
      const uploadPromise = r2Service.uploadFromWhatsAppMedia(
        imageData.id,
        process.env.META_WHATSAPP_TOKEN!,
        'activities'
      );
      
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Upload timeout')), this.UPLOAD_TIMEOUT_MS)
      );
      
      const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
      
      if (uploadResult.success) {
        const imageInfo = {
          url: uploadResult.url,
          key: uploadResult.key,
          caption: imageData.caption || 'કામનો ફોટો',
          whatsapp_media_id: imageData.id,
          mime_type: imageData.mime_type,
          sha256: imageData.sha256
        };
        
        await whatsappService.sendTextMessage(phone, "✅ ફોટો સફળતાપૂર્વક અપલોડ થયો!");
        await this.completeActivityLog(phone, { ...sessionData, image_info: imageInfo });
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
   * Complete activity logging
   */
  private async completeActivityLog(phone: string, activityData: EmployeeSessionData): Promise<void> {
    try {
      const user = await this.userService.getUserByPhone(phone);
      const siteContext = await this.siteService.getCurrentSiteContext(phone);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      if (!siteContext) {
        throw new Error('Site context not found');
      }

      console.log('📝 [ACTIVITY-LOGGING] Completing activity log:', {
        activityCategory: activityData.activity_category,
        activitySubtype: activityData.activity_subtype,
        hours: activityData.hours,
        siteId: siteContext.siteId,
        hasImage: !!activityData.image_info
      });

      // Build comprehensive description
      let finalDescription = activityData.predefined_description || '';
      if (activityData.user_comments) {
        finalDescription += `\n\nટિપ્પણી: ${activityData.user_comments}`;
      }

      // Prepare activity details for jsonb field
      const activityDetails: any = { 
        logged_via: 'whatsapp',
        language: 'gujarati',
        site_name: siteContext.siteName,
        activity_category: activityData.activity_category,
        activity_subtype: activityData.activity_subtype,
        predefined_description: activityData.predefined_description,
        user_comments: activityData.user_comments || null,
        short_description: this.getShortDescription(activityData.activity_category!, activityData.activity_subtype),
        work_photo: activityData.image_info
      };

      // Create activity in database
      const activity = await getDb().insert(activities).values({
        user_id: user.id,
        site_id: siteContext.siteId,
        activity_type: activityData.activity_category!,
        hours: activityData.hours!,
        description: finalDescription,
        image_url: activityData.image_info!.url, // Required field
        image_key: activityData.image_info!.key, // Required field
        details: activityDetails
      }).returning();

      // Clear flow data but keep site context
      await this.sessionManager.clearFlowData(phone, true);

      // Send comprehensive confirmation
      const shortDesc = this.getShortDescription(activityData.activity_category!, activityData.activity_subtype);
      const confirmationMessage = `✅ *પ્રવૃત્તિ સફળતાપૂર્વક નોંધાઈ!*

📋 *વિગતો:*
• સાઈટ: ${siteContext.siteName}
• પ્રવૃત્તિ: ${shortDesc}
• કલાકો: ${activityData.hours}
• વર્ણન: ${activityData.predefined_description}
${activityData.user_comments ? `• ટિપ્પણી: ${activityData.user_comments}` : ''}
• 📸 કામનો ફોટો સેવ થયો

*પ્રવૃત્તિ ID:* ${activity[0].id.slice(0, 8)}
🕒 સમય: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

તમારી પ્રવૃત્તિ સિસ્ટમમાં સેવ થઈ ગઈ છે!

મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.`;

      await whatsappService.sendTextMessage(phone, confirmationMessage);

    } catch (error) {
      console.error('Error completing activity log:', error);
      
      let errorMessage = "❌ માફ કરશો, તમારી પ્રવૃત્તિ નોંધવામાં ભૂલ થઈ.";
      
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
   * Get short description for display
   */
  private getShortDescription(category: string, subtype?: string | null): string {
    const categoryConfig = this.ACTIVITY_TYPES[category];
    if (!categoryConfig) return category;
    
    if (subtype && subtype !== 'other' && categoryConfig.subtypes && categoryConfig.subtypes[subtype]) {
      return categoryConfig.subtypes[subtype].short;
    }
    
    return categoryConfig.short;
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