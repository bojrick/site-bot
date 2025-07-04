import express from 'express';
import { EmployeeService } from '../services/employeeService';
import { introductionService } from '../services/introductionService';
import { WhatsAppService } from '../services/whatsapp';
import { getDb } from '../db';
import { message_logs } from '../db/schema';
import { desc } from 'drizzle-orm';

const router = express.Router();
const employeeService = new EmployeeService();
const whatsappService = new WhatsAppService();

// Add single employee
router.post('/employees', async (req, res) => {
  try {
    const { phone, name, email } = req.body;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    const result = await employeeService.addEmployee({ phone, name, email });
    
    return res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    console.error('Error in add employee route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Add multiple employees
router.post('/employees/bulk', async (req, res) => {
  try {
    const { employees } = req.body;
    
    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Employees array is required and cannot be empty' 
      });
    }

    // Validate each employee has at least a phone number
    const invalidEmployees = employees.filter(emp => !emp.phone);
    if (invalidEmployees.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'All employees must have a phone number' 
      });
    }

    const result = await employeeService.addMultipleEmployees(employees);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in bulk add employees route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get all employees
router.get('/employees', async (req, res) => {
  try {
    const employees = await employeeService.getAllEmployees();
    
    return res.json({ 
      success: true, 
      employees: employees.map(emp => ({
        id: emp.id,
        phone: emp.phone,
        name: emp.name,
        email: emp.email,
        is_verified: emp.is_verified,
        verified_at: emp.verified_at,
        introduction_sent: emp.introduction_sent,
        introduction_sent_at: emp.introduction_sent_at,
        created_at: emp.created_at,
        updated_at: emp.updated_at
      }))
    });
  } catch (error) {
    console.error('Error in get employees route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Update employee
router.put('/employees/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const { name, email } = req.body;
    
    if (!name && !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one field (name or email) is required' 
      });
    }

    const result = await employeeService.updateEmployee(phone, { name, email });
    
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Error in update employee route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Remove employee
router.delete('/employees/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const result = await employeeService.removeEmployee(phone);
    
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Error in remove employee route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Send introduction message to specific employee
router.post('/employees/:phone/introduction', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const success = await introductionService.sendIntroductionMessage(phone);
    
    return res.json({
      success,
      message: success 
        ? 'Introduction message sent successfully' 
        : 'Failed to send introduction message'
    });
  } catch (error) {
    console.error('Error in send introduction route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Send introduction messages to all pending employees
router.post('/employees/introduction/send-pending', async (req, res) => {
  try {
    const result = await introductionService.sendPendingIntroductionMessages();
    
    return res.json({
      success: true,
      message: `Introduction messages processed: ${result.sent} sent, ${result.failed} failed`,
      ...result
    });
  } catch (error) {
    console.error('Error in send pending introductions route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Check introduction status for specific employee
router.get('/employees/:phone/introduction', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const sent = await introductionService.isIntroductionSent(phone);
    
    return res.json({
      success: true,
      phone,
      introduction_sent: sent
    });
  } catch (error) {
    console.error('Error in get introduction status route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Reset introduction status for specific employee (for testing)
router.delete('/employees/:phone/introduction', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const success = await introductionService.resetIntroductionStatus(phone);
    
    return res.json({
      success,
      message: success 
        ? 'Introduction status reset successfully' 
        : 'Failed to reset introduction status'
    });
  } catch (error) {
    console.error('Error in reset introduction status route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Send custom message to specific phone number
router.post('/messages/send', async (req, res) => {
  try {
    const { phone, message, messageType = 'text' } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number and message are required' 
      });
    }

    // Send the WhatsApp message
    const messageSent = await whatsappService.sendTextMessage(phone, message);
    
    if (messageSent) {
      // Log the outbound message
      try {
        await getDb().insert(message_logs).values({
          phone,
          direction: 'outbound',
          message_type: messageType,
          content: message,
          metadata: {
            sent_via: 'admin_panel',
            timestamp: new Date().toISOString()
          }
        });
      } catch (dbError) {
        console.error('Error logging message to database:', dbError);
        // Continue even if logging fails
      }
      
      return res.json({
        success: true,
        message: 'Message sent successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to send message'
      });
    }
  } catch (error) {
    console.error('Error in send custom message route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get message logs grouped by phone number
router.get('/messages/conversations', async (req, res) => {
  try {
    const data = await getDb()
      .select()
      .from(message_logs)
      .orderBy(desc(message_logs.created_at));

    // Group messages by phone number
    const conversations = (data || []).reduce((acc: any, message: any) => {
      if (!acc[message.phone]) {
        acc[message.phone] = {
          phone: message.phone,
          messages: [],
          lastMessage: null,
          totalMessages: 0
        };
      }
      
      acc[message.phone].messages.push(message);
      acc[message.phone].totalMessages++;
      
      // Update last message (most recent due to desc order)
      if (!acc[message.phone].lastMessage || 
          new Date(message.created_at) > new Date(acc[message.phone].lastMessage.created_at)) {
        acc[message.phone].lastMessage = message;
      }
      
      return acc;
    }, {});

    // Convert to array and sort by last message time
    const conversationList = Object.values(conversations).sort((a: any, b: any) => {
      return new Date(b.lastMessage?.created_at || 0).getTime() - 
             new Date(a.lastMessage?.created_at || 0).getTime();
    });

    return res.json({
      success: true,
      conversations: conversationList
    });
  } catch (error) {
    console.error('Error in get conversations route:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

export default router; 