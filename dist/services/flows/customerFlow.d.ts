import { sessions } from '../../db/schema';
export declare class CustomerFlow {
    constructor();
    updateSession(phone: string, updates: Partial<typeof sessions.$inferInsert>): Promise<void>;
    clearSession(phone: string): Promise<void>;
    handleMessage(user: any, session: any, messageText: string, interactiveData?: any): Promise<void>;
    private handleMainMenu;
    private showMainMenu;
    private showHelp;
    private startBookingFlow;
    private handleFlowStep;
    private handleBookingFlow;
    private showDateOptions;
    private showTimeOptions;
    private completeBooking;
    private checkAvailability;
    private showPricing;
    private connectToSales;
    private isValidDate;
    private isValidTime;
    private formatTime;
}
//# sourceMappingURL=customerFlow.d.ts.map