import { EmployeeFlowOrchestrator } from './employee/EmployeeFlowOrchestrator';
import { ImageMessage } from '../whatsapp';

/**
 * @deprecated This is a compatibility wrapper. Use EmployeeFlowOrchestrator directly.
 * 
 * Legacy EmployeeFlow class that now delegates to the new modular architecture.
 * This maintains backward compatibility while using the new clean services.
 */
export class EmployeeFlow {
  private orchestrator: EmployeeFlowOrchestrator;

  constructor() {
    console.log('🔄 [LEGACY-EMPLOYEE-FLOW] Using new modular architecture via compatibility wrapper');
    this.orchestrator = new EmployeeFlowOrchestrator();
  }

  /**
   * Main entry point for all employee messages - delegates to new orchestrator
   */
  async handleMessage(
    user: any,
    session: any,
    messageText: string,
    interactiveData?: any,
    imageData?: ImageMessage
  ): Promise<void> {
    console.log('🔄 [LEGACY-EMPLOYEE-FLOW] Delegating to EmployeeFlowOrchestrator');
    
    // Delegate to the new orchestrator
    await this.orchestrator.handleMessage(user, session, messageText, interactiveData, imageData);
  }
}

// Also export the new orchestrator for direct use
export { EmployeeFlowOrchestrator } from './employee/EmployeeFlowOrchestrator';