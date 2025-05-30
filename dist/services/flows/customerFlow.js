"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerFlow = void 0;
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const whatsapp_1 = require("../whatsapp");
class CustomerFlow {
    constructor() {
        // No dependencies needed
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
    async handleMessage(user, session, messageText, interactiveData) {
        const phone = user.phone;
        // Check if we're in the middle of a flow
        if (session.intent) {
            await this.handleFlowStep(user, session, messageText, interactiveData);
        }
        else {
            await this.handleMainMenu(user, messageText);
        }
    }
    async handleMainMenu(user, messageText) {
        const phone = user.phone;
        const text = messageText.toLowerCase().trim();
        // Handle common commands
        if (text === 'menu' || text === 'main' || text === 'start' || text === 'hi' || text === 'hello') {
            await this.showMainMenu(phone);
            return;
        }
        if (text === 'help') {
            await this.showHelp(phone);
            return;
        }
        // Handle main menu selections
        switch (text) {
            case 'book_visit':
            case '1':
                await this.startBookingFlow(phone);
                break;
            case 'check_availability':
            case '2':
                await this.checkAvailability(phone);
                break;
            case 'pricing':
            case '3':
                await this.showPricing(phone);
                break;
            case 'talk_to_sales':
            case '4':
                await this.connectToSales(phone);
                break;
            default:
                await this.showMainMenu(phone);
                break;
        }
    }
    async showMainMenu(phone) {
        const message = `🏗️ Welcome to our Site Management Service!

How can I help you today?`;
        const buttons = [
            { id: 'book_visit', title: '📅 Book Site Visit' },
            { id: 'check_availability', title: '🕐 Check Availability' },
            { id: 'pricing', title: '💰 Pricing & Plans' }
        ];
        await whatsapp_1.whatsappService.sendButtonMessage(phone, message, buttons);
        // Also send a list for more options
        setTimeout(async () => {
            await whatsapp_1.whatsappService.sendListMessage(phone, "Or choose from more options:", "Select Option", [{
                    title: "Services",
                    rows: [
                        { id: 'talk_to_sales', title: '📞 Talk to Sales', description: 'Connect with our sales team' },
                        { id: 'help', title: '❓ Help', description: 'Get help and support' }
                    ]
                }]);
        }, 1000);
    }
    async showHelp(phone) {
        const helpText = `🤝 *Help & Support*

*Available Commands:*
• Type *menu* - Go to main menu
• Type *help* - Show this help
• Type *book* - Quick book a visit
• Type *availability* - Check available slots

*Need Human Help?*
Type *agent* or *human* to connect with our support team.

*Business Hours:*
Monday - Friday: 9:00 AM - 6:00 PM
Saturday: 10:00 AM - 4:00 PM

📞 Call us: +91-XXXXXXXXXX
📧 Email: support@yourcompany.com`;
        await whatsapp_1.whatsappService.sendTextMessage(phone, helpText);
    }
    async startBookingFlow(phone) {
        // Initialize booking session
        await this.updateSession(phone, {
            intent: 'booking',
            step: 'collect_name',
            data: {}
        });
        const message = `📅 *Book a Site Visit*

Let's schedule your site visit! 

Please share your full name:`;
        await whatsapp_1.whatsappService.sendTextMessage(phone, message);
    }
    async handleFlowStep(user, session, messageText, interactiveData) {
        const phone = user.phone;
        if (session.intent === 'booking') {
            await this.handleBookingFlow(phone, session, messageText);
        }
    }
    async handleBookingFlow(phone, session, messageText) {
        const currentData = session.data || {};
        switch (session.step) {
            case 'collect_name':
                if (messageText.length < 2) {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "Please enter a valid name (at least 2 characters):");
                    return;
                }
                await this.updateSession(phone, {
                    step: 'collect_date',
                    data: { ...currentData, name: messageText }
                });
                await this.showDateOptions(phone);
                break;
            case 'collect_date':
                if (!this.isValidDate(messageText)) {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "Please select a valid date from the options or enter in DD/MM/YYYY format:");
                    await this.showDateOptions(phone);
                    return;
                }
                await this.updateSession(phone, {
                    step: 'collect_time',
                    data: { ...currentData, date: messageText }
                });
                await this.showTimeOptions(phone);
                break;
            case 'collect_time':
                if (!this.isValidTime(messageText)) {
                    await whatsapp_1.whatsappService.sendTextMessage(phone, "Please select a valid time slot:");
                    await this.showTimeOptions(phone);
                    return;
                }
                // Complete booking
                await this.completeBooking(phone, {
                    ...currentData,
                    time: messageText
                });
                break;
        }
    }
    async showDateOptions(phone) {
        const today = new Date();
        const dates = [];
        for (let i = 1; i <= 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const formatted = date.toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
            dates.push({
                id: date.toISOString().split('T')[0],
                title: formatted,
                description: i === 1 ? 'Tomorrow' : ''
            });
        }
        await whatsapp_1.whatsappService.sendListMessage(phone, "Select your preferred date:", "Choose Date", [{
                title: "Available Dates",
                rows: dates.slice(0, 10) // WhatsApp limit
            }]);
    }
    async showTimeOptions(phone) {
        const timeSlots = [
            { id: '09:00', title: '9:00 AM', description: 'Morning slot' },
            { id: '11:00', title: '11:00 AM', description: 'Late morning' },
            { id: '14:00', title: '2:00 PM', description: 'Afternoon' },
            { id: '16:00', title: '4:00 PM', description: 'Evening' }
        ];
        await whatsapp_1.whatsappService.sendListMessage(phone, "Select your preferred time:", "Choose Time", [{
                title: "Available Time Slots",
                rows: timeSlots
            }]);
    }
    async completeBooking(phone, bookingData) {
        try {
            // Create booking in database
            const booking = await (0, db_1.getDb)().insert(schema_1.bookings).values({
                customer_phone: phone,
                customer_name: bookingData.name,
                slot_time: new Date(`${bookingData.date}T${bookingData.time}:00`),
                status: 'pending',
                notes: 'Booked via WhatsApp'
            }).returning();
            // Clear session
            await this.clearSession(phone);
            // Send confirmation
            const confirmationMessage = `✅ *Booking Confirmed!*

📋 *Details:*
• Name: ${bookingData.name}
• Date: ${new Date(bookingData.date).toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}
• Time: ${this.formatTime(bookingData.time)}

📍 Our team will contact you 1 day before your visit with location details.

*Booking ID:* ${booking[0].id.slice(0, 8)}

Type *menu* to go back to main menu.`;
            await whatsapp_1.whatsappService.sendTextMessage(phone, confirmationMessage);
        }
        catch (error) {
            console.error('Error completing booking:', error);
            await whatsapp_1.whatsappService.sendTextMessage(phone, "Sorry, there was an error completing your booking. Please try again or contact support.");
            await this.clearSession(phone);
        }
    }
    async checkAvailability(phone) {
        const availabilityMessage = `📅 *Site Visit Availability*

*This Week:*
• Monday - Friday: 9:00 AM - 5:00 PM
• Saturday: 10:00 AM - 4:00 PM
• Sunday: Closed

*Next Available Slots:*
• Tomorrow: 11:00 AM, 2:00 PM, 4:00 PM
• Day after: 9:00 AM, 11:00 AM, 2:00 PM

Each visit takes approximately 1-2 hours.

Would you like to book a slot? Type *book* to start booking process.`;
        await whatsapp_1.whatsappService.sendTextMessage(phone, availabilityMessage);
    }
    async showPricing(phone) {
        const pricingMessage = `💰 *Our Pricing & Plans*

🏠 *Residential Projects:*
• Studio Apartments: ₹25-35 Lakhs
• 1 BHK: ₹35-50 Lakhs  
• 2 BHK: ₹50-75 Lakhs
• 3 BHK: ₹75 Lakhs+

🏢 *Commercial Projects:*
• Office Spaces: ₹8,000-12,000/sq ft
• Retail Spaces: ₹10,000-15,000/sq ft

📋 *What's Included:*
• Premium location
• Modern amenities
• 24/7 security
• Power backup
• Parking facilities

*🎯 Special Offers:*
• Early bird discount: 5%
• Referral bonus: ₹50,000

Want to know more? Type *talk_to_sales* to connect with our sales team!`;
        await whatsapp_1.whatsappService.sendTextMessage(phone, pricingMessage);
    }
    async connectToSales(phone) {
        const salesMessage = `📞 *Connect with Sales Team*

Our sales experts are ready to help you!

*Contact Options:*
🕐 *Immediate Callback:* Type *callback* and we'll call you within 5 minutes
💬 *WhatsApp Chat:* Continue chatting here, our sales team will join shortly
📞 *Direct Call:* +91-XXXXXXXXXX
📧 *Email:* sales@yourcompany.com

*Business Hours:*
Monday - Saturday: 9:00 AM - 7:00 PM

What would you prefer?`;
        const buttons = [
            { id: 'callback', title: '📞 Request Callback' },
            { id: 'continue_chat', title: '💬 Continue Here' }
        ];
        await whatsapp_1.whatsappService.sendButtonMessage(phone, salesMessage, buttons);
    }
    isValidDate(dateString) {
        // Accept YYYY-MM-DD format or DD/MM/YYYY
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const ddmmyyyyRegex = /^\d{2}\/\d{2}\/\d{4}$/;
        if (isoDateRegex.test(dateString)) {
            const date = new Date(dateString);
            return date > new Date();
        }
        if (ddmmyyyyRegex.test(dateString)) {
            const [day, month, year] = dateString.split('/');
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            return date > new Date();
        }
        return false;
    }
    isValidTime(timeString) {
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        return timeRegex.test(timeString);
    }
    formatTime(time) {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    }
}
exports.CustomerFlow = CustomerFlow;
//# sourceMappingURL=customerFlow.js.map