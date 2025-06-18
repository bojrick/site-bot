import express from 'express';
import { EmployeeService } from '../services/employeeService';
import { introductionService } from '../services/introductionService';

const router = express.Router();
const employeeService = new EmployeeService();

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

export default router; 