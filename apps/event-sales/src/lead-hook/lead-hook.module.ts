import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { ColdHookModule } from '../cold-hook/hook.module';
import { EventSalesLeadHookController } from './controllers/lead-hook.controller';
import { LeadColdEndpointService } from './services/lead-cold-endpoint.service';

@Module({
    imports: [PBXModule, ColdHookModule],
    controllers: [EventSalesLeadHookController],
    providers: [LeadColdEndpointService],
})
export class LeadHookModule {}
