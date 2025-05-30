"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeService = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
class EmployeeService {
    /**
     * Add a single employee by phone number
     */
    async addEmployee({ phone, name, email }) {
        try {
            // Validate phone number format
            const cleanPhone = this.normalizePhoneNumber(phone);
            // Check if user already exists
            const existingUser = await (0, db_1.getDb)()
                .select()
                .from(schema_1.users)
                .where((0, drizzle_orm_1.eq)(schema_1.users.phone, cleanPhone))
                .limit(1);
            if (existingUser.length > 0) {
                const user = existingUser[0];
                if (user.role === 'employee') {
                    return { success: false, message: 'Employee already exists', user };
                }
                else {
                    // Convert customer to employee
                    await (0, db_1.getDb)()
                        .update(schema_1.users)
                        .set({
                        role: 'employee',
                        name: name || user.name,
                        email: email || user.email,
                        is_verified: false, // Employees need OTP verification
                        verified_at: null,
                        updated_at: new Date()
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.users.phone, cleanPhone));
                    const updatedUser = await (0, db_1.getDb)()
                        .select()
                        .from(schema_1.users)
                        .where((0, drizzle_orm_1.eq)(schema_1.users.phone, cleanPhone))
                        .limit(1);
                    return {
                        success: true,
                        message: 'User converted to employee',
                        user: updatedUser[0]
                    };
                }
            }
            // Create new employee
            const newEmployee = await (0, db_1.getDb)()
                .insert(schema_1.users)
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
            return {
                success: true,
                message: 'Employee added successfully',
                user: newEmployee[0]
            };
        }
        catch (error) {
            console.error('Error adding employee:', error);
            return {
                success: false,
                message: 'Failed to add employee',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Add multiple employees from a list
     */
    async addMultipleEmployees(employees) {
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
        const employees = await (0, db_1.getDb)()
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.role, 'employee'));
        return employees;
    }
    /**
     * Update employee information
     */
    async updateEmployee(phone, updates) {
        try {
            const cleanPhone = this.normalizePhoneNumber(phone);
            await (0, db_1.getDb)()
                .update(schema_1.users)
                .set({
                ...updates,
                updated_at: new Date()
            })
                .where((0, drizzle_orm_1.eq)(schema_1.users.phone, cleanPhone));
            return { success: true, message: 'Employee updated successfully' };
        }
        catch (error) {
            console.error('Error updating employee:', error);
            return { success: false, message: 'Failed to update employee' };
        }
    }
    /**
     * Remove employee (soft delete by changing role)
     */
    async removeEmployee(phone) {
        try {
            const cleanPhone = this.normalizePhoneNumber(phone);
            // Change role to customer instead of deleting
            await (0, db_1.getDb)()
                .update(schema_1.users)
                .set({
                role: 'customer',
                is_verified: true, // Customers are auto-verified
                verified_at: new Date(),
                updated_at: new Date()
            })
                .where((0, drizzle_orm_1.eq)(schema_1.users.phone, cleanPhone));
            return { success: true, message: 'Employee removed successfully' };
        }
        catch (error) {
            console.error('Error removing employee:', error);
            return { success: false, message: 'Failed to remove employee' };
        }
    }
    /**
     * Normalize phone number format
     */
    normalizePhoneNumber(phone) {
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
    isValidPhoneNumber(phone) {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length === 10 || cleaned.length === 12;
    }
}
exports.EmployeeService = EmployeeService;
//# sourceMappingURL=employeeService.js.map