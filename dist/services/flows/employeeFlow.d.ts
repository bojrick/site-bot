import { sessions } from '../../db/schema';
import { ImageMessage } from '../whatsapp';
export declare class EmployeeFlow {
    private userService;
    constructor();
    handleMessage(user: any, session: any, messageText: string, interactiveData?: any, imageData?: ImageMessage): Promise<void>;
    updateSession(phone: string, updates: Partial<typeof sessions.$inferInsert>): Promise<void>;
    clearSession(phone: string): Promise<void>;
    private handleEmployeeVerification;
    private showWelcomeMessage;
    private handleMainMenu;
    private showMainMenu;
    private showHelp;
    private startActivityLogging;
    private showSiteSelection;
    private handleFlowStep;
    private handleActivityLogging;
    private showActivityTypes;
    private completeActivityLog;
    private startMaterialRequest;
    private handleMaterialRequest;
    private showUrgencyOptions;
    private completeMaterialRequest;
    private showDashboard;
    private getSiteName;
    private getSiteUUID;
    private formatActivityType;
    private formatUrgency;
}
//# sourceMappingURL=employeeFlow.d.ts.map