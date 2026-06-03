import { Injectable } from '@nestjs/common';
import { BridgeOrchestratorService } from '../services/bridge-orchestrator.service';

@Injectable()
export class PollDomainUseCase {
    constructor(private readonly orchestrator: BridgeOrchestratorService) {}

    async execute(domain: string) {
        return await this.orchestrator.pollDomainNow(domain);
    }
}
