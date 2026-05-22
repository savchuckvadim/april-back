import { Injectable } from '@nestjs/common';
import { StartBridgeDto } from '../dto/bitrix-im-bridge.dto';
import { BridgeOrchestratorService } from '../services/bridge-orchestrator.service';

@Injectable()
export class StartBridgeUseCase {
    constructor(private readonly orchestrator: BridgeOrchestratorService) {}

    async execute(dto: StartBridgeDto) {
        return await this.orchestrator.startDomainPolling(dto);
    }
}
