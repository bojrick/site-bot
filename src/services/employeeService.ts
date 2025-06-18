import { getDb } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { introductionService } from './introductionService';

export interface AddEmployeeRequest {
  phone: string;
  name?: string;
  email?: string;
}

export class EmployeeService {
  
  /**
   * Add a single employee by phone number
   */
  async addEmployee({ phone, name, email }: AddEmployeeRequest) {
    try {
      // Validate phone number format
      const cleanPhone = this.normalizePhoneNumber(phone);
      
      // Check if user already exists
      const existingUser = await getDb()
        .select()
        .from(users)
        .where(eq(users.phone, cleanPhone))
        .limit(1);

      let isNewEmployee = false;

      if (existingUser.length > 0) {
        const user = existingUser[0];
        if (user.role === 'employee') {
          return { success: false, message: 'Employee already exists', user };
        } else {
          // Convert customer to employee
          await getDb()
            .update(users)
            .set({ 
              role: 'employee',
              name: name || user.name,
              email: email || user.email,
              is_verified: false, // Employees need OTP verification
              verified_at: null,
              updated_at: new Date()
            })
            .where(eq(users.phone, cleanPhone));
          
          const updatedUser = await getDb()
            .select()
            .from(users)
            .where(eq(users.phone, cleanPhone))
            .limit(1);

          isNewEmployee = true; // User converted to employee, so should get introduction

          // Send introduction message asynchronously (don't wait for it)
          this.sendIntroductionAsync(cleanPhone);

          return { 
            success: true, 
            message: 'User converted to employee and introduction message sent',
            user: updatedUser[0]
          };
        }
      }

      // Create new employee
      const newEmployee = await getDb()
        .insert(users)
        .values({
          phone: cleanPhone,
          role: 'employee',
          name: name || null,
          email: email || null,
          is_verified: false, // Employees need OTP verification
          verified_at: null,
        })
        .returning();

      console.log(`✅ Added new employee: ${cleanPhone}`);
      
      // Send introduction message asynchronously (don't wait for it)
      this.sendIntroductionAsync(cleanPhone);

      return { 
        success: true, 
        message: 'Employee added successfully and introduction message sent',
        user: newEmployee[0]
      };

    } catch (error) {
      console.error('Error adding employee:', error);
      return { 
        success: false, 
        message: 'Failed to add employee',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send introduction message asynchronously
   */
  private async sendIntroductionAsync(phone: string) {
    try {
      // Add a small delay to ensure database transaction is committed
      setTimeout(async () => {
        const success = await introductionService.sendIntroductionMessage(phone);
        if (success) {
          console.log(`📨 Introduction message sent to new employee: ${phone}`);
        } else {
          console.log(`⚠️ Failed to send introduction message to: ${phone}`);
        }
      }, 2000); // 2 second delay
    } catch (error) {
      console.error('Error in sendIntroductionAsync:', error);
    }
  }

  /**
   * Add multiple employees from a list
   */
  async addMultipleEmployees(employees: AddEmployeeRequest[]) {
    const results = [];
    
    for (const employee of employees) {
      const result = await this.addEmployee(employee);
      results.push({
        phone: employee.phone,
        name: employee.name,
        ...result
      });
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      summary: {
        total: employees.length,
        successful,
        failed
      },
      results
    };
  }

  /**
   * Get all employees
   */
  async getAllEmployees() {
    const employees = await getDb()
      .select()
      .from(users)
      .where(eq(users.role, 'employee'));

    return employees;
  }

  /**
   * Update employee information
   */
  async updateEmployee(phone: string, updates: { name?: string; email?: string }) {
    try {
      const cleanPhone = this.normalizePhoneNumber(phone);
      
      await getDb()
        .update(users)
        .set({ 
          ...updates,
          updated_at: new Date()
        })
        .where(eq(users.phone, cleanPhone));

      return { success: true, message: 'Employee updated successfully' };
    } catch (error) {
      console.error('Error updating employee:', error);
      return { success: false, message: 'Failed to update employee' };
    }
  }

  /**
   * Remove employee (soft delete by changing role)
   */
  async removeEmployee(phone: string) {
    try {
      const cleanPhone = this.normalizePhoneNumber(phone);
      
      // Change role to customer instead of deleting
      await getDb()
        .update(users)
        .set({ 
          role: 'customer',
          is_verified: true, // Customers are auto-verified
          verified_at: new Date(),
          updated_at: new Date()
        })
        .where(eq(users.phone, cleanPhone));

      return { success: true, message: 'Employee removed successfully' };
    } catch (error) {
      console.error('Error removing employee:', error);
      return { success: false, message: 'Failed to remove employee' };
    }
  }

  /**
   * Normalize phone number format
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing (assuming +91 for India)
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    
    // Ensure it starts with country code
    if (!cleaned.startsWith('91') && cleaned.length === 12) {
      cleaned = '91' + cleaned.slice(2);
    }
    
    return cleaned;
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length === 10 || cleaned.length === 12;
  }
} 