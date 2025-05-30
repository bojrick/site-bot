export interface AddEmployeeRequest {
    phone: string;
    name?: string;
    email?: string;
}
export declare class EmployeeService {
    /**
     * Add a single employee by phone number
     */
    addEmployee({ phone, name, email }: AddEmployeeRequest): Promise<{
        success: boolean;
        message: string;
        user: {
            id: string;
            name: string | null;
            phone: string;
            role: "employee" | "customer";
            email: string | null;
            is_verified: boolean | null;
            verified_at: Date | null;
            created_at: Date | null;
            updated_at: Date | null;
        };
        error?: undefined;
    } | {
        success: boolean;
        message: string;
        error: string;
        user?: undefined;
    }>;
    /**
     * Add multiple employees from a list
     */
    addMultipleEmployees(employees: AddEmployeeRequest[]): Promise<{
        summary: {
            total: number;
            successful: number;
            failed: number;
        };
        results: ({
            success: boolean;
            message: string;
            user: {
                id: string;
                name: string | null;
                phone: string;
                role: "employee" | "customer";
                email: string | null;
                is_verified: boolean | null;
                verified_at: Date | null;
                created_at: Date | null;
                updated_at: Date | null;
            };
            error?: undefined;
            phone: string;
            name: string | undefined;
        } | {
            success: boolean;
            message: string;
            error: string;
            user?: undefined;
            phone: string;
            name: string | undefined;
        })[];
    }>;
    /**
     * Get all employees
     */
    getAllEmployees(): Promise<{
        id: string;
        name: string | null;
        phone: string;
        role: "employee" | "customer";
        email: string | null;
        is_verified: boolean | null;
        verified_at: Date | null;
        created_at: Date | null;
        updated_at: Date | null;
    }[]>;
    /**
     * Update employee information
     */
    updateEmployee(phone: string, updates: {
        name?: string;
        email?: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Remove employee (soft delete by changing role)
     */
    removeEmployee(phone: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Normalize phone number format
     */
    private normalizePhoneNumber;
    /**
     * Validate phone number format
     */
    private isValidPhoneNumber;
}
//# sourceMappingURL=employeeService.d.ts.map