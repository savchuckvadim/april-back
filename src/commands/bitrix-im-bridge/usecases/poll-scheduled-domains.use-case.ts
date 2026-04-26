import { Injectable } from '@nestjs/common';
import { BridgeOrchestratorService } from '../services/bridge-orchestrator.service';

@Injectable()
export class PollScheduledDomainsUseCase {
    constructor(private readonly orchestrator: BridgeOrchestratorService) {}

    async execute(): Promise<void> {
        await this.orchestrator.pollScheduledDomains();
    }
}
