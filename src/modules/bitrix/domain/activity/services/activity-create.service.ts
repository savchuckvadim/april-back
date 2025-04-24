// infrastructure/services/activity-create.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { BitrixActivityEntity } from '../entities/activity.entity';
import { BitrixContextService } from 'src/modules/bitrix/services/bitrix-context.service';

@Injectable()
export class BitrixActivityCreateService {
    private readonly logger = new Logger(BitrixActivityCreateService.name);

    constructor(private readonly bitrixContext: BitrixContextService) {
        this.logger.log('BitrixActivityCreateService initialized');
    }

    async createActivities(domain: string, rawActivities: Record<string, any>) {
        if (!rawActivities || Object.keys(rawActivities).length === 0) {
            this.logger.log('No activities to create');
            return;
        }

        // this.logger.log(`Creating activities for domain: ${domain}`);
        // this.logger.log(`Raw activities: ${JSON.stringify(rawActivities)}`);

        if (!domain) {
            this.logger.error('Domain is not provided');
            throw new Error('Domain is required to create activities');
        }

        const bitrixApi = await this.bitrixContext.initFromDomain(domain);

        this.logger.log('BitrixApi initialized');
        this.logger.log('bitrixApi.domain');
        this.logger.log(bitrixApi.domain);
        this.logger.log(domain)



        for (const [_, raw] of Object.entries(rawActivities)) {
            const fields = BitrixActivityEntity.fromDto(raw);
            // this.logger.log(`Adding activity for company ${raw.companyId}`);
            // this.logger.log(`Activity fields: ${JSON.stringify(fields)}`);
            bitrixApi.addCmdBatch(`add_activity_${raw.companyId}`, 'crm.activity.add', { fields });
        }

        // this.logger.log('Calling batch');
        const result = await bitrixApi.callBatchAsync();
        // this.logger.log(`Batch result: ${JSON.stringify(result)}`);
        return result;
    }
}
