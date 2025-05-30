"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeFlow = void 0;
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const whatsapp_1 = require("../whatsapp");
const userService_1 = require("../userService");
const cloudflareR2_1 = require("../cloudflareR2");
const process_1 = __importDefault(require("process"));
class EmployeeFlow {
    constructor() {
        this.userService = new userService_1.UserService();
    }
    async handleMessage(user, session, messageText, interactiveData, imageData) {
        const phone = user.phone;
        // Check if employee needs to be verified
        if (!user.is_verified) {
            await this.handleEmployeeVerification(user, messageText);
            return;
        }
        // Check if we're in the middle of a flow
        if (session.intent) {
            await this.handleFlowStep(user, session, messageText, interactiveData, imageData);
        }
        else {
            await this.handleMainMenu(user, messageText);
        }
    }
    // Add session management methods to this class
    async updateSession(phone, updates) {
        await (0, db_1.getDb)()
            .update(schema_1.sessions)
            .set({ ...updates, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.sessions.phone, phone));
    }
    async clearSession(phone) {
        await (0, db_1.getDb)()
            .update(schema_1.sessions)
            .set({
            intent: null,
            step: null,
            data: {},
            updated_at: new Date()
        })
            .where((0, drizzle_orm_1.eq)(schema_1.sessions.phone, phone));
    }
    async handleEmployeeVerification(user, messageText) {
        const phone = user.phone;
        const text = messageText.trim();
        // Check if user is trying to send OTP
        if (/^\d{6}$/.test(text)) {
            const result = await this.userService.verifyOTPCode(phone, text);
            await whatsapp_1.whatsappService.sendTextMessage(phone, result.message);
            if (result.success) {
                // Show welcome message and main menu
                setTimeout(async () => {
                    await this.showWelcomeMessage(phone);
                }, 1000);
            }
            return;
        }
        // Handle OTP requests
        if (text.toLowerCase().includes('otp') || text.toLowerCase().includes('resend') || text.toLowerCase().includes('code')) {
            const sent = await this.userService.generateAndSendOTP(phone);
            if (sent) {
                await whatsapp_1.whatsappService.sendTextMessage(phone, "📲 નવો OTP મોકલ્યો છે! કૃપા કરીને 6-અંકનો કોડ દાખલ કરો:");
            }
            else {
                await whatsapp_1.whatsappService.sendTextMessage(phone, "❌ OTP મોકલવામાં નિષ્ફળ. કૃપા કરીને પછીથી પ્રયાસ કરો.");
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
                await whatsapp_1.whatsappService.sendTextMessage(phone, message);
            }
        }
        else {
            await whatsapp_1.whatsappService.sendTextMessage(phone, "🔐 કૃપા કરીને તમારો 6-અંકનો વેરિફિકેશન કોડ દાખલ કરો:\n\nનવો કોડ જોઈએ તો 'resend' ટાઈપ કરો.");
        }
    }
    async showWelcomeMessage(phone) {
        const welcomeMessage = `🎉 *કર્મચારી પોર્ટલમાં આપનું સ્વાગત છે!*

તમે હવે વેરિફાઈ થઈ ગયા છો અને અમારી કર્મચારી સેવાઓનો ઉપયોગ કરવા તૈયાર છો.

આજે તમે શું કરવા માંગો છો?`;
        await whatsapp_1.whatsappService.sendTextMessage(phone, welcomeMessage);
        await this.showMainMenu(phone);
    }
    async handleMainMenu(user, messageText) {
        const phone = user.phone;
        const text = messageText.toLowerCase().trim();
        // Handle common commands
        if (text === 'menu' || text === 'main' || text === 'start' || text === 'મેનુ') {
            await this.showMainMenu(phone);
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
                await this.startActivityLogging(phone);
                break;
            case 'request_materials':
            case '2':
                await this.startMaterialRequest(phone);
                break;
            case 'view_dashboard':
            case '3':
                await this.showDashboard(phone);
                break;
            case 'help':
            case '4':
                await this.showHelp(phone);
                break;
            default:
                await this.showMainMenu(phone);
                break;
        }
    }
    async showMainMenu(phone) {
        const message = `👷‍♂️ *કર્મચારી પોર્ટલ*

આજે હું તમારી કેવી મદદ કરી શકું?`;
        const buttons = [
            { id: 'log_activity', title: '📝 કામની નોંધ કરો' },
            { id: 'request_materials', title: '📦 સામગ્રીની માંગ' },
            { id: 'view_dashboard', title: '📊 ડેશબોર્ડ જુઓ' }
        ];
        await whatsapp_1.whatsappService.sendButtonMessage(phone, message, buttons);
        // Also send a list for more options
        setTimeout(async () => {
            await whatsapp_1.whatsappService.sendListMessage(phone, "વધારાના વિકલ્પો:", "વધુ વિકલ્પો", [{
                    title: "સહાય",
                    rows: [
                        { id: 'help', title: '❓ મદદ', description: 'મદદ અને સહાય મેળવો' },
                        { id: 'contact_admin', title: '📞 એડમિનનો સંપર્ક', description: 'વહીવટીતંત્રનો સંપર્ક કરો' }
                    ]
                }]);
        }, 1000);
    }
    async showHelp(phone) {
        const helpText = `🤝 *કર્મચારી મદદ અને સહાય*

*ઉપલબ્ધ કમાન્ડ્સ:*
• *મેનુ* ટાઈપ કરો - મુખ્ય મેનુ પર જાઓ
• *લોગ* ટાઈપ કરો - ઝડપથી પ્રવૃત્તિ નોંધવો
• *સામગ્રી* ટાઈપ કરો - સામગ્રીની માંગ
• *ડેશબોર્ડ* ટાઈપ કરો - તમારું ડેશબોર્ડ જુઓ

*મદદ જોઈએ?*
• *એડમિન* ટાઈપ કરો વહીવટીતંત્રનો સંપર્ક કરવા
• ફોન: +91-XXXXXXXXXX (એડમિન)

*કામના કલાકો:*
સોમવાર - શનિવાર: સવારે 8:00 - સાંજે 6:00`;
        await whatsapp_1.whatsappService.sendTextMessage(phone, helpText);
    }
    async startActivityLogging(phone) {
        // Initialize activity logging session
        await this.updateSession(phone, {
            intent: 'log_activity',
            step: 'select_site',
            data: {}
        });
        await this.showSiteSelection(phone);
    }
    async showSiteSelection(phone) {
        // For now, we'll use mock data. In real implementation, fetch from sites table
        const sites = [
            { id: 'site_1', title: '🏗️ સાઈટ A - રહેઠાણ', description: 'મુખ્ય રહેઠાણ પ્રોજેક્ટ' },
            { id: 'site_2', title: '🏢 સાઈટ B - વાણિજ્યિક', description: 'ઓફિસ કોમ્પ્લેક્સ પ્રોજેક્ટ' },
            { id: 'site_3', title: '🏬 સાઈટ C - રિટેલ', description: 'શોપિંગ સેન્ટર પ્રોજેક્ટ' }
        ];
        await whatsapp_1.whatsappService.sendListMessage(phone, "તમે જ્યાં કામ કર્યું છે તે સાઈટ પસંદ કરો:", "સાઈટ પસંદ કરો", [{
                title: "સક્રિય સાઈટ્સ",
                rows: sites
            }]);
    }
    async handleFlowStep(user, session, messageText, interactiveData, imageData) {
        const phone = user.phone;
        if (session.intent === 'log_activity') {
            await this.handleActivityLogging(phone, session, messageText, imageData);
        }
        else if (session.intent === 'request_materials') {
            await this.handleMaterialRequest(phone, session, messageText, imageData);
        }
    }
    async handleActivityLogging(phone, session, messageText, imageData) {
        const currentData = session.data || {};
        switch (session.step) {
            case 'select_site':
                if (!messageText.startsWith('site_')) {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "કૃપા કરીને યાદીમાંથી યોગ્ય સાઈટ પસંદ કરો:");
                    await this.showSiteSelection(phone);
                    return;
                }
                await this.updateSession(phone, {
                    step: 'select_activity_type',
                    data: { ...currentData, site_id: messageText }
                });
                await this.showActivityTypes(phone);
                break;
            case 'select_activity_type':
                const validTypes = ['construction', 'inspection', 'maintenance', 'planning', 'other'];
                if (!validTypes.includes(messageText)) {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય પ્રવૃત્તિનો પ્રકાર પસંદ કરો:");
                    await this.showActivityTypes(phone);
                    return;
                }
                await this.updateSession(phone, {
                    step: 'enter_hours',
                    data: { ...currentData, activity_type: messageText }
                });
                await whatsapp_1.whatsappService.sendTextMessage(phone, "તમે કેટલા કલાક કામ કર્યું? (નંબર દાખલ કરો):");
                break;
            case 'enter_hours':
                const hours = parseInt(messageText);
                if (isNaN(hours) || hours <= 0 || hours > 24) {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય કલાકોની સંખ્યા દાખલ કરો (1-24):");
                    return;
                }
                await this.updateSession(phone, {
                    step: 'enter_description',
                    data: { ...currentData, hours }
                });
                await whatsapp_1.whatsappService.sendTextMessage(phone, "તમે શું કામ કર્યું તેનું વર્ણન કરો (વૈકલ્પિક - 'skip' ટાઈપ કરો છોડવા માટે):");
                break;
            case 'enter_description':
                const description = messageText.toLowerCase() === 'skip' ? '' : messageText;
                await this.updateSession(phone, {
                    step: 'upload_image',
                    data: { ...currentData, description }
                });
                await whatsapp_1.whatsappService.sendTextMessage(phone, "📸 કૃપા કરીને કામનો ફોટો અપલોડ કરો:\n\n• કામની સાઈટનો ફોટો\n• પૂર્ણ થયેલા કામનો ફોટો\n• કોઈ ફોટો ન હોય તો 'skip' ટાઈપ કરો");
                break;
            case 'upload_image':
                let imageInfo = null;
                if (imageData) {
                    // Process the uploaded image and store in Cloudflare R2
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "📤 રસિદ અપલોડ કરી રહ્યા છીએ...");
                    const uploadResult = await cloudflareR2_1.r2Service.uploadFromWhatsAppMedia(imageData.id, process_1.default.env.META_WHATSAPP_TOKEN, 'activities');
                    if (uploadResult.success) {
                        imageInfo = {
                            url: uploadResult.url,
                            key: uploadResult.key,
                            caption: imageData.caption || 'કામનો ફોટો',
                            whatsapp_media_id: imageData.id
                        };
                        await whatsapp_1.whatsappService.sendTextMessage(phone, "✅ ફોટો સફળતાપૂર્વક અપલોડ થયો!");
                    }
                    else {
                        console.error('Failed to upload image to R2:', uploadResult.error);
                        await whatsapp_1.whatsappService.sendTextMessage(phone, "❌ ફોટો અપલોડ કરવામાં નિષ્ફળ. કૃપા કરીને ફરીથી પ્રયાસ કરો અથવા 'skip' ટાઈપ કરો.");
                        return;
                    }
                }
                else if (messageText.toLowerCase() !== 'skip') {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "કૃપા કરીને ફોટો અપલોડ કરો અથવા 'skip' ટાઈપ કરો:");
                    return;
                }
                await this.completeActivityLog(phone, {
                    ...currentData,
                    image_info: imageInfo
                });
                break;
        }
    }
    async showActivityTypes(phone) {
        const activityTypes = [
            { id: 'construction', title: '🔨 બાંધકામ કાર્ય', description: 'બિલ્ડિંગ અને બાંધકામના કાર્યો' },
            { id: 'inspection', title: '🔍 તપાસ', description: 'ગુણવત્તા તપાસ અને નિરીક્ષણ' },
            { id: 'maintenance', title: '🔧 જાળવણી', description: 'સાધનો અને સાઈટની જાળવણી' },
            { id: 'planning', title: '📋 આયોજન', description: 'પ્રોજેક્ટ આયોજન અને સંકલન' },
            { id: 'other', title: '📝 અન્ય', description: 'અન્ય કામની પ્રવૃત્તિઓ' }
        ];
        await whatsapp_1.whatsappService.sendListMessage(phone, "તમે કયા પ્રકારની પ્રવૃત્તિ કરી?", "પ્રવૃત્તિ પસંદ કરો", [{
                title: "પ્રવૃત્તિના પ્રકારો",
                rows: activityTypes
            }]);
    }
    async completeActivityLog(phone, activityData) {
        try {
            // Get user to link activity
            const user = await this.userService.getUserByPhone(phone);
            // Prepare activity details
            const activityDetails = {
                logged_via: 'whatsapp',
                language: 'gujarati'
            };
            // Add image information if available
            if (activityData.image_info) {
                activityDetails.work_photo = activityData.image_info;
            }
            // Create activity in database
            const activity = await (0, db_1.getDb)().insert(schema_1.activities).values({
                user_id: user.id,
                site_id: this.getSiteUUID(activityData.site_id),
                activity_type: activityData.activity_type,
                hours: activityData.hours,
                description: activityData.description,
                image_url: activityData.image_info?.url || null,
                image_key: activityData.image_info?.key || null,
                details: activityDetails
            }).returning();
            // Clear session
            await this.clearSession(phone);
            // Send confirmation
            const imageStatus = activityData.image_info ? '📸 ફોટો સહિત' : '📝 ફોટો વગર';
            const confirmationMessage = `✅ *પ્રવૃત્તિ સફળતાપૂર્વક નોંધાઈ!*

📋 *વિગતો:*
• સાઈટ: ${this.getSiteName(activityData.site_id)}
• પ્રવૃત્તિ: ${this.formatActivityType(activityData.activity_type)}
• કલાકો: ${activityData.hours}
• વર્ણન: ${activityData.description || 'કોઈ વર્ણન નથી'}
• ${imageStatus}

*પ્રવૃત્તિ ID:* ${activity[0].id.slice(0, 8)}

મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.`;
            await whatsapp_1.whatsappService.sendTextMessage(phone, confirmationMessage);
        }
        catch (error) {
            console.error('Error logging activity:', error);
            await whatsapp_1.whatsappService.sendTextMessage(phone, "માફ કરશો, તમારી પ્રવૃત્તિ નોંધવામાં ભૂલ થઈ. કૃપા કરીને ફરીથી પ્રયાસ કરો.");
            await this.clearSession(phone);
        }
    }
    async startMaterialRequest(phone) {
        await this.updateSession(phone, {
            intent: 'request_materials',
            step: 'select_site',
            data: {}
        });
        await this.showSiteSelection(phone);
    }
    async handleMaterialRequest(phone, session, messageText, imageData) {
        const currentData = session.data || {};
        switch (session.step) {
            case 'select_site':
                if (!messageText.startsWith('site_')) {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય સાઈટ પસંદ કરો:");
                    await this.showSiteSelection(phone);
                    return;
                }
                await this.updateSession(phone, {
                    step: 'enter_material',
                    data: { ...currentData, site_id: messageText }
                });
                await whatsapp_1.whatsappService.sendTextMessage(phone, "તમને કઈ સામગ્રીની જરૂર છે? (જેમ કે, સિમેન્ટ, સ્ટીલ, રેતી વગેરે):");
                break;
            case 'enter_material':
                if (messageText.length < 2) {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય સામગ્રીનું નામ દાખલ કરો:");
                    return;
                }
                await this.updateSession(phone, {
                    step: 'enter_quantity',
                    data: { ...currentData, material_name: messageText }
                });
                await whatsapp_1.whatsappService.sendTextMessage(phone, "કેટલી માત્રામાં જોઈએ છે? (જેમ કે, 10 બેગ, 5 ટન, 100 પીસ):");
                break;
            case 'enter_quantity':
                const quantityMatch = messageText.match(/(\d+)\s*(.+)/);
                if (!quantityMatch) {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "કૃપા કરીને આ ફોર્મેટમાં માત્રા દાખલ કરો: '10 બેગ' અથવા '5 ટન':");
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
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "કૃપા કરીને યોગ્ય તાત્કાલિકતાનું સ્તર પસંદ કરો:");
                    await this.showUrgencyOptions(phone);
                    return;
                }
                await this.updateSession(phone, {
                    step: 'upload_material_image',
                    data: { ...currentData, urgency: messageText }
                });
                await whatsapp_1.whatsappService.sendTextMessage(phone, "📸 કૃપા કરીને સામગ્રીનો ફોટો અપલોડ કરો:\n\n• જરૂરી સામગ્રીનો ફોટો\n• હાલની સામગ્રીની સ્થિતિનો ફોટો\n• કોઈ ફોટો ન હોય તો 'skip' ટાઈપ કરો");
                break;
            case 'upload_material_image':
                let materialImageInfo = null;
                if (imageData) {
                    // Process the uploaded image and store in Cloudflare R2
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "📤 ફોટો અપલોડ કરી રહ્યા છીએ...");
                    const uploadResult = await cloudflareR2_1.r2Service.uploadFromWhatsAppMedia(imageData.id, process_1.default.env.META_WHATSAPP_TOKEN, 'material-requests');
                    if (uploadResult.success) {
                        materialImageInfo = {
                            url: uploadResult.url,
                            key: uploadResult.key,
                            caption: imageData.caption || 'સામગ્રીનો ફોટો',
                            whatsapp_media_id: imageData.id
                        };
                        await whatsapp_1.whatsappService.sendTextMessage(phone, "✅ ફોટો સફળતાપૂર્વક અપલોડ થયો!");
                    }
                    else {
                        console.error('Failed to upload material image to R2:', uploadResult.error);
                        await whatsapp_1.whatsappService.sendTextMessage(phone, "❌ ફોટો અપલોડ કરવામાં નિષ્ફળ. કૃપા કરીને ફરીથી પ્રયાસ કરો અથવા 'skip' ટાઈપ કરો.");
                        return;
                    }
                }
                else if (messageText.toLowerCase() !== 'skip') {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "કૃપા કરીને ફોટો અપલોડ કરો અથવા 'skip' ટાઈપ કરો:");
                    return;
                }
                await this.completeMaterialRequest(phone, {
                    ...currentData,
                    image_info: materialImageInfo
                });
                break;
        }
    }
    async showUrgencyOptions(phone) {
        const urgencyLevels = [
            { id: 'low', title: '🟢 ઓછી પ્રાથમિકતા', description: 'એક અઠવાડિયામાં જોઈએ છે' },
            { id: 'medium', title: '🟡 મધ્યમ પ્રાથમિકતા', description: '2-3 દિવસમાં જોઈએ છે' },
            { id: 'high', title: '🔴 ઉચ્ચ પ્રાથમિકતા', description: 'તાત્કાલિક જોઈએ છે (આજ/આવતીકાલે)' }
        ];
        await whatsapp_1.whatsappService.sendListMessage(phone, "આ વિનંતી કેટલી તાત્કાલિક છે?", "તાત્કાલિકતા પસંદ કરો", [{
                title: "તાત્કાલિકતાના સ્તરો",
                rows: urgencyLevels
            }]);
    }
    async completeMaterialRequest(phone, requestData) {
        try {
            const user = await this.userService.getUserByPhone(phone);
            const request = await (0, db_1.getDb)().insert(schema_1.material_requests).values({
                user_id: user.id,
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
            await this.clearSession(phone);
            const imageStatus = requestData.image_info ? '📸 ફોટો સહિત' : '📝 ફોટો વગર';
            const confirmationMessage = `✅ *સામગ્રીની વિનંતી મોકલાઈ ગઈ!*

📦 *વિનંતીની વિગતો:*
• સામગ્રી: ${requestData.material_name}
• માત્રા: ${requestData.quantity} ${requestData.unit}
• સાઈટ: ${this.getSiteName(requestData.site_id)}
• તાત્કાલિકતા: ${this.formatUrgency(requestData.urgency)}
• ${imageStatus}

*વિનંતી ID:* ${request[0].id.slice(0, 8)}

તમારી વિનંતી ખરીદી ટીમને મોકલી દેવામાં આવી છે. સ્ટેટસ વિશે તમને જાણ કરવામાં આવશે.

મુખ્ય મેનુ પર જવા માટે *મેનુ* ટાઈપ કરો.`;
            await whatsapp_1.whatsappService.sendTextMessage(phone, confirmationMessage);
        }
        catch (error) {
            console.error('Error submitting material request:', error);
            await whatsapp_1.whatsappService.sendTextMessage(phone, "માફ કરશો, તમારી વિનંતી મોકલવામાં ભૂલ થઈ. કૃપા કરીને ફરીથી પ્રયાસ કરો.");
            await this.clearSession(phone);
        }
    }
    async showDashboard(phone) {
        try {
            const user = await this.userService.getUserByPhone(phone);
            // Get recent activities (last 7 days)
            const recentActivities = await (0, db_1.getDb)()
                .select()
                .from(schema_1.activities)
                .where((0, drizzle_orm_1.eq)(schema_1.activities.user_id, user.id))
                .limit(5);
            // Get pending material requests
            const pendingRequests = await (0, db_1.getDb)()
                .select()
                .from(schema_1.material_requests)
                .where((0, drizzle_orm_1.eq)(schema_1.material_requests.user_id, user.id))
                .limit(3);
            const totalHours = recentActivities.reduce((sum, activity) => sum + (activity.hours || 0), 0);
            const dashboardMessage = `📊 *તમારું ડેશબોર્ડ*

📅 *આ અઠવાડિયે:*
• કુલ નોંધાયેલા કલાકો: ${totalHours}
• નોંધાયેલી પ્રવૃત્તિઓ: ${recentActivities.length}
• બાકી વિનંતીઓ: ${pendingRequests.length}

📝 *તાજેતરની પ્રવૃત્તિઓ:*
${recentActivities.map(activity => `• ${this.formatActivityType(activity.activity_type || '')} - ${activity.hours}કલ`).join('\n') || 'કોઈ તાજેતરની પ્રવૃત્તિઓ નથી'}

📦 *બાકી સામગ્રીની વિનંતીઓ:*
${pendingRequests.map(request => `• ${request.material_name} (${request.status})`).join('\n') || 'કોઈ બાકી વિનંતીઓ નથી'}

વધુ વિકલ્પો માટે *મેનુ* ટાઈપ કરો.`;
            await whatsapp_1.whatsappService.sendTextMessage(phone, dashboardMessage);
        }
        catch (error) {
            console.error('Error fetching dashboard:', error);
            await whatsapp_1.whatsappService.sendTextMessage(phone, "માફ કરશો, તમારું ડેશબોર્ડ લોડ કરવામાં ભૂલ થઈ. કૃપા કરીને ફરીથી પ્રયાસ કરો.");
        }
    }
    // Helper methods
    getSiteName(siteId) {
        const siteNames = {
            'site_1': 'સાઈટ A - રહેઠાણ',
            'site_2': 'સાઈટ B - વાણિજ્યિક',
            'site_3': 'સાઈટ C - રિટેલ'
        };
        return siteNames[siteId] || 'અજ્ઞાત સાઈટ';
    }
    getSiteUUID(displayId) {
        const siteMapping = {
            'site_1': '11111111-1111-1111-1111-111111111111',
            'site_2': '22222222-2222-2222-2222-222222222222',
            'site_3': '33333333-3333-3333-3333-333333333333'
        };
        return siteMapping[displayId] || displayId;
    }
    formatActivityType(type) {
        const types = {
            'construction': '🔨 બાંધકામ',
            'inspection': '🔍 તપાસ',
            'maintenance': '🔧 જાળવણી',
            'planning': '📋 આયોજન',
            'other': '📝 અન્ય'
        };
        return types[type] || type;
    }
    formatUrgency(urgency) {
        const urgencyMap = {
            'low': '🟢 ઓછી પ્રાથમિકતા',
            'medium': '🟡 મધ્યમ પ્રાથમિકતા',
            'high': '🔴 ઉચ્ચ પ્રાથમિકતા'
        };
        return urgencyMap[urgency] || urgency;
    }
}
exports.EmployeeFlow = EmployeeFlow;
//# sourceMappingURL=employeeFlow.js.map