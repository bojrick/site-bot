import { getDb } from '../../db';
import { bookings, sessions, customer_inquiries } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { whatsappService } from '../whatsapp';
import { zohoEmailService } from '../zohoEmail';

export class CustomerFlow {
  protected isTestMode: boolean = false;

  constructor() {
    // No dependencies needed
  }

  // Method to enable test mode (to be called by admin flow)
  setTestMode(enabled: boolean) {
    this.isTestMode = enabled;
  }

  // Add session management methods to this class
  async updateSession(phone: string, updates: Partial<typeof sessions.$inferInsert>) {
    try {
      await getDb()
        .update(sessions)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(sessions.phone, phone));
      console.log(`Session updated for ${phone}:`, updates);
    } catch (error) {
      console.error('Error updating session:', error);
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
      console.log(`Session cleared for ${phone}`);
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  }

  async handleMessage(
    user: any,
    session: any,
    messageText: string,
    interactiveData?: any
  ) {
    const phone = user.phone;
    console.log(`Handling message for ${phone}:`, { messageText, intent: session?.intent, step: session?.step });

    // Safety check: Allow users to restart with "menu" at any time
    const text = messageText.toLowerCase().trim();
    if (text === 'menu' || text === 'restart' || text === 'start' || text === 'main') {
      console.log(`User ${phone} requested menu/restart, clearing session and showing project details`);
      await this.clearSession(phone);
      await this.showSuvasamProjectDetails(phone);
      return;
    }

    // Check if we're in the middle of a flow
    if (session.intent) {
      // Safety check: Ensure session has valid data
      if (!session.step) {
        console.log(`Session for ${phone} has intent but no step, clearing and restarting`);
        await this.clearSession(phone);
        await this.handleInitialMessage(user, messageText);
        return;
      }
      
      await this.handleFlowStep(user, session, messageText, interactiveData);
    } else {
      await this.handleInitialMessage(user, messageText);
    }
  }

  private async handleInitialMessage(user: any, messageText: string) {
    const phone = user.phone;
    const text = messageText.toLowerCase().trim();

    // Handle menu/restart commands
    if (text === 'menu' || 
        text === 'main' || 
        text === 'start' || 
        text === 'hi' || 
        text === 'hello' || 
        text === 'help' ||
        text === 'restart' ||
        text === 'begin') {
      await this.showSuvasamProjectDetails(phone);
      return;
    }

    // Handle positive responses to start inquiry
    if (text === 'interested' || 
        text === 'yes' || 
        text === 'book_visit' || 
        text === 'book visit' ||
        text === 'book site visit' ||
        text === '1') {
      await this.startInquiryFlow(phone);
      return;
    }

    // Handle negative responses
    if (text === 'no' || 
        text === 'not interested' || 
        text === 'not now' ||
        text === '0') {
      try {
        await whatsappService.sendTextMessage(phone, `No problem! Feel free to reach out anytime if you're interested in learning more about our Suvasam Gota Commercial Hub.

📞 For any questions, call: +91 84870 51252

Have a great day! 😊`);
        await this.clearSession(phone);
        return;
      } catch (error) {
        console.error('Error sending negative response message:', error);
        await this.clearSession(phone);
        return;
      }
    }

    // Default: show project details for any other input
    await this.showSuvasamProjectDetails(phone);
  }

  private async showSuvasamProjectDetails(phone: string) {
    const projectMessage = `🏢 *Suvasam Group – Upcoming Gota Commercial Hub*
📍 Nr. Vishwakarma Temple, Gota Road, Chandlodiya, Gota, Ahmedabad – 382481
🔗 Google Maps location: [Click here](https://maps.app.goo.gl/hsBg4wq4JdRs3SUSA?g_st=com.google.maps.preview.copy)

🏗️ *Upcoming Project Highlights:*
• Total 74 units (600–2,000 sq ft): 21 shops + 53 office suites
• Ideal mix for retail outlets, cafés, services, SMEs, consultancies, and start-ups
• Prime access to SG Highway, public transport & residential clusters
• Amenities include well-planned common areas, parking provisions & utility-ready setups
• Developer: Suvasam Group – focused on quality & timely delivery


Would you like to know more and book a site visit? Please reply with *"yes"* to continue.`;

    await whatsappService.sendTextMessage(phone, projectMessage);
  }

  private async startInquiryFlow(phone: string) {
    // Initialize inquiry session
    await this.updateSession(phone, {
      intent: 'inquiry',
      step: 'collect_name',
      data: {}
    });

    const message = `Great! I'd like to understand your requirements better to provide you with the most suitable options.
Please share your *full name*:`;

    await whatsappService.sendTextMessage(phone, message);
  }

  private async handleFlowStep(
    user: any,
    session: any,
    messageText: string,
    interactiveData?: any
  ) {
    const phone = user.phone;

    if (session.intent === 'inquiry') {
      await this.handleInquiryFlow(phone, session, messageText);
    } else if (session.intent === 'booking') {
      await this.handleBookingFlow(phone, session, messageText, interactiveData);
    } else if (session.intent === 'post_inquiry') {
      await this.handlePostInquiryResponse(phone, messageText, interactiveData);
    }
  }

  private async handleInquiryFlow(phone: string, session: any, messageText: string) {
    const currentData = session.data || {};

    switch (session.step) {
      case 'collect_name':
        if (messageText.length < 2) {
          await whatsappService.sendTextMessage(phone, "Please enter a valid name (at least 2 characters):");
          return;
        }

        await this.updateSession(phone, {
          step: 'collect_email',
          data: { ...currentData, full_name: messageText }
        });

        await whatsappService.sendTextMessage(phone, `Thank you ${messageText}! 
Please share your *email address*:`);
        break;

      case 'collect_email':
        if (!this.isValidEmail(messageText)) {
          await whatsappService.sendTextMessage(phone, "Please enter a valid email address:");
          return;
        }

        await this.updateSession(phone, {
          step: 'collect_occupation',
          data: { ...currentData, email: messageText }
        });

        await whatsappService.sendTextMessage(phone, `Great! 
What is your *occupation/profession*?`);
        break;

      case 'collect_occupation':
        if (messageText.length < 2) {
          await whatsappService.sendTextMessage(phone, "Please enter a valid occupation:");
          return;
        }

        await this.updateSession(phone, {
          step: 'collect_space_requirement',
          data: { ...currentData, occupation: messageText }
        });

        await whatsappService.sendTextMessage(phone, `Thanks! 
What is your *office space requirement*? (e.g., 600 sq ft, 1000 sq ft, etc.)`);
        break;

      case 'collect_space_requirement':
        if (messageText.length < 2) {
          await whatsappService.sendTextMessage(phone, "Please enter your space requirement:");
          return;
        }

        await this.updateSession(phone, {
          step: 'collect_space_use',
          data: { ...currentData, office_space_requirement: messageText }
        });

        await whatsappService.sendTextMessage(phone, `Perfect! 
What will be the *primary use* of this office space? (e.g., consultancy, retail, café, startup office, etc.)`);
        break;

      case 'collect_space_use':
        if (messageText.length < 2) {
          await whatsappService.sendTextMessage(phone, "Please describe how you plan to use the office space:");
          return;
        }

        await this.updateSession(phone, {
          step: 'collect_price_range',
          data: { ...currentData, office_space_use: messageText }
        });

        await whatsappService.sendTextMessage(phone, `Excellent! 
What is your *expected price range/budget*? (e.g., ₹50-75 Lakhs, ₹1-2 Crores, etc.)`);
        break;

      case 'collect_price_range':
        if (messageText.length < 2) {
          await whatsappService.sendTextMessage(phone, "Please enter your expected price range:");
          return;
        }

        // Complete inquiry and offer site visit
        await this.completeInquiry(phone, {
          ...currentData,
          expected_price_range: messageText
        });
        break;
    }
  }

  private async completeInquiry(phone: string, inquiryData: any) {
    try {
      let inquiryId = 'test-inquiry-id';
      
      // Only save to database if not in test mode
      if (!this.isTestMode) {
        // Save inquiry to database
        const inquiry = await getDb().insert(customer_inquiries).values({
          phone: phone,
          full_name: inquiryData.full_name,
          email: inquiryData.email,
          occupation: inquiryData.occupation,
          office_space_requirement: inquiryData.office_space_requirement,
          office_space_use: inquiryData.office_space_use,
          expected_price_range: inquiryData.expected_price_range,
          status: 'inquiry'
        }).returning();

        console.log('Inquiry saved:', inquiry[0]);
        inquiryId = inquiry[0].id;

        // Send email notification (only in production mode) - with proper error handling
        try {
          await zohoEmailService.sendCustomerInquiryEmail({
            customerName: inquiryData.full_name,
            phone: phone,
            email: inquiryData.email,
            occupation: inquiryData.occupation,
            spaceRequirement: inquiryData.office_space_requirement,
            spaceUse: inquiryData.office_space_use,
            priceRange: inquiryData.expected_price_range
          });
          console.log('Email notification sent for inquiry:', inquiryId);
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
          console.log('📧 [INFO] Continuing flow without email notification');
          // Continue with flow even if email fails
        }
      } else {
        console.log('🧪 [TEST MODE] Skipping database save and email for inquiry');
        console.log('📧 [INFO] Bypassing Zoho email service in test mode');
      }

      // Show summary and offer site visit
      const summaryMessage = `✅ *Thank you for your details!*

📋 *Your Requirements Summary:*
• Name: ${inquiryData.full_name}
• Email: ${inquiryData.email}
• Occupation: ${inquiryData.occupation}
• Space Requirement: ${inquiryData.office_space_requirement}
• Intended Use: ${inquiryData.office_space_use}
• Budget Range: ${inquiryData.expected_price_range}

Our team will review your requirements and get back to you with suitable options.

Would you like to book a site visit to see the project in person?`;

      // Fixed button titles to be within 20-character limit
      const buttons = [
        { id: 'book_visit', title: '📅 Book Visit' },
        { id: 'talk_later', title: '💬 Call Later' }
      ];

      try {
        await whatsappService.sendButtonMessage(phone, summaryMessage, buttons);
        
        // Update session to handle next step
        await this.updateSession(phone, {
          intent: 'post_inquiry',
          step: 'awaiting_response',
          data: { inquiry_id: inquiryId, ...inquiryData }
        });
      } catch (buttonError) {
        console.error('Button message failed, sending text fallback:', buttonError);
        
        // Fallback to text message with clear instructions
        const fallbackMessage = `${summaryMessage}

Reply with:
• *"book"* or *"1"* to book a site visit
• *"later"* or *"2"* if you'd like us to call you later`;

        await whatsappService.sendTextMessage(phone, fallbackMessage);
        
        // Update session to handle next step
        await this.updateSession(phone, {
          intent: 'post_inquiry',
          step: 'awaiting_response',
          data: { inquiry_id: inquiryId, ...inquiryData }
        });
      }

    } catch (error) {
      console.error('Error saving inquiry:', error);
      await whatsappService.sendTextMessage(phone, "Sorry, there was an error saving your details. Please try again or contact us directly at +91 84870 51252");
      await this.clearSession(phone);
    }
  }

  private async handleBookingFlow(phone: string, session: any, messageText: string, interactiveData?: any) {
    const currentData = session.data || {};

    switch (session.step) {
      case 'select_date':
        let selectedDate = messageText;
        
        // Handle interactive selection
        if (interactiveData?.list_reply?.id) {
          selectedDate = interactiveData.list_reply.id;
        }
        
        if (!this.isValidDate(selectedDate)) {
          await whatsappService.sendTextMessage(phone, "Please select a valid date from the options or enter in DD/MM/YYYY format:");
          await this.showDateOptions(phone);
          return;
        }

        await this.updateSession(phone, {
          step: 'select_time',
          data: { ...currentData, date: selectedDate }
        });

        await this.showTimeOptions(phone);
        break;

      case 'select_time':
        let selectedTime = messageText;
        
        // Handle interactive selection
        if (interactiveData?.list_reply?.id) {
          selectedTime = interactiveData.list_reply.id;
        }
        
        if (!this.isValidTime(selectedTime)) {
          await whatsappService.sendTextMessage(phone, "Please select a valid time slot:");
          await this.showTimeOptions(phone);
          return;
        }

        // Complete booking
        await this.completeBooking(phone, {
          ...currentData,
          time: selectedTime
        });
        break;
    }
  }

  // Handle post-inquiry responses
  private async handlePostInquiryResponse(phone: string, messageText: string, interactiveData?: any) {
    const text = messageText.toLowerCase().trim();
    const responseId = interactiveData?.button_reply?.id || text;

    console.log(`Post-inquiry response from ${phone}:`, { text, responseId, interactiveData });

    // Handle booking site visit responses
    if (responseId === 'book_visit' || 
        text === 'book' || 
        text === 'book visit' ||
        text === 'book site visit' ||
        text === 'yes' || 
        text === '1') {
      await this.startBookingFlow(phone);
      return;
    }

    // Handle "call later" responses
    if (responseId === 'talk_later' || 
        responseId === 'call_later' ||
        text === 'later' || 
        text === 'call me' || 
        text === 'call later' ||
        text === '2') {
      try {
        await whatsappService.sendTextMessage(phone, `Thank you! Our sales team will contact you within 24 hours.

📞 For immediate assistance, call:
+91 84870 51252 / +91 95103 56093 / +91 94281 02172

Have a great day! 😊`);
        await this.clearSession(phone);
        return;
      } catch (error) {
        console.error('Error sending completion message:', error);
        // Still clear session even if message fails
        await this.clearSession(phone);
        return;
      }
    }

    // If user sends something unexpected, provide helpful guidance
    try {
      const helpMessage = `I didn't understand that response. Please reply with:

• *"book"* or *"1"* - to book a site visit
• *"later"* or *"2"* - if you'd like us to call you

Or reply *"menu"* to see our project details again.`;

      await whatsappService.sendTextMessage(phone, helpMessage);
      
      // Keep the session active for one more attempt
      // Don't clear session immediately to give user another chance
      
    } catch (error) {
      console.error('Error sending help message:', error);
      // If we can't even send a help message, clear session and start over
      await this.clearSession(phone);
      await this.showSuvasamProjectDetails(phone);
    }
  }

  private async startBookingFlow(phone: string) {
    // Get customer name from session data if available
    const sessionData = await this.getSessionData(phone);
    const customerName = sessionData?.full_name || "Customer";

    // Initialize booking session
    await this.updateSession(phone, {
      intent: 'booking',
      step: 'select_date',
      data: { customer_name: customerName }
    });

    const message = `📅 *Book Your Site Visit*

Great! Let's schedule your site visit to see the Suvasam Gota Commercial Hub.

Please select your preferred date:`;

    await whatsappService.sendTextMessage(phone, message);
    await this.showDateOptions(phone);
  }

  private async getSessionData(phone: string): Promise<any> {
    // In test mode, return empty data since session is managed differently
    if (this.isTestMode) {
      console.log('🧪 [TEST MODE] Returning empty session data');
      return {};
    }
    
    try {
      const session = await getDb()
        .select()
        .from(sessions)
        .where(eq(sessions.phone, phone))
        .limit(1);
      
      return session[0]?.data || {};
    } catch (error) {
      console.error('Error getting session data:', error);
      return {};
    }
  }

  private async showDateOptions(phone: string) {
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

    await whatsappService.sendListMessage(
      phone,
      "Select your preferred date:",
      "Choose Date",
      [{
        title: "Available Dates",
        rows: dates.slice(0, 10) // WhatsApp limit
      }]
    );
  }

  private async showTimeOptions(phone: string) {
    const timeSlots = [
      { id: '10:00', title: '10:00 AM', description: 'Morning slot' },
      { id: '12:00', title: '12:00 PM', description: 'Noon slot' },
      { id: '15:00', title: '3:00 PM', description: 'Afternoon' },
      { id: '17:00', title: '5:00 PM', description: 'Evening' }
    ];

    await whatsappService.sendListMessage(
      phone,
      "Select your preferred time:",
      "Choose Time",
      [{
        title: "Available Time Slots",
        rows: timeSlots
      }]
    );
  }

  private async completeBooking(phone: string, bookingData: any) {
    try {
      // Get customer name from booking data
      const customerName = bookingData.customer_name || "Customer";
      let bookingId = 'test-booking-id';

      // Only save to database if not in test mode
      if (!this.isTestMode) {
        // Create booking in database
        const booking = await getDb().insert(bookings).values({
          customer_phone: phone,
          customer_name: customerName,
          slot_time: new Date(`${bookingData.date}T${bookingData.time}:00`),
          status: 'pending',
          notes: 'Site visit for Suvasam Gota Commercial Hub'
        }).returning();

        console.log('Booking created:', booking[0]);
        bookingId = booking[0].id;

        // Update inquiry status if exists
        try {
          await getDb()
            .update(customer_inquiries)
            .set({ 
              status: 'site_visit_booked',
              updated_at: new Date()
            })
            .where(eq(customer_inquiries.phone, phone));
        } catch (error) {
          console.log('No inquiry found to update, continuing...');
        }
      } else {
        console.log('🧪 [TEST MODE] Skipping database save for booking');
      }

      // Clear session
      await this.clearSession(phone);

      // Send confirmation
      const confirmationMessage = `✅ *Site Visit Confirmed!*

📋 *Visit Details:*
• Date: ${new Date(bookingData.date).toLocaleDateString('en-IN', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}
• Time: ${this.formatTime(bookingData.time)}
• Location: Suvasam Gota Commercial Hub, Gota Road, Ahmedabad

📍 *Exact Address:*
Nr. Vishwakarma Temple, Gota Road, Chandlodiya, Gota, Ahmedabad – 382481

🔗 *Google Maps:* https://maps.app.goo.gl/hsBg4wq4JdRs3SUSA?g_st=com.google.maps.preview.copy

📞 Our team will call you 1 day before your visit to confirm and provide additional details.

*Booking ID:* ${bookingId.slice(0, 8)}

Thank you for choosing Suvasam Group! 🏢`;

      await whatsappService.sendTextMessage(phone, confirmationMessage);

    } catch (error) {
      console.error('Error completing booking:', error);
      await whatsappService.sendTextMessage(phone, "Sorry, there was an error completing your booking. Please try again or contact us directly at +91 84870 51252");
      await this.clearSession(phone);
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidDate(dateString: string): boolean {
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

  private isValidTime(timeString: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(timeString);
  }

  private formatTime(time: string): string {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }
} 