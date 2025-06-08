// infrastructure/services/activity-create.service.ts
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BitrixActivityEntity } from 'src/modules/bitrix/domain/activity/entities/activity.entity';
import { PBXService } from 'src/modules/pbx/pbx.servise';

@Injectable()
export class AlfaBxActivityCreateService {
    private readonly logger = new Logger(AlfaBxActivityCreateService.name);

    constructor(

        private readonly pbx: PBXService
    ) {
        this.logger.log('AlfaBxActivityCreateService initialized');
    }

    async createActivities(domain: string, rawActivities: Record<string, any>) {
        if (!rawActivities || Object.keys(rawActivities).length === 0) {
            this.logger.log('No activities to create');
            return;
        }
        const {bitrix, portal} = await this.pbx.init(domain);
        this.logger.log(`Creating activities for domain: ${domain}`);

        if (portal) {
            // const bitrixApi = this.bitrixApiFactory.create(portal);
            const bitrixApi = bitrix.api;
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
            const result = await bitrixApi.callBatchWithConcurrency(2);
            // this.logger.log(`Batch result: ${JSON.stringify(result)}`);
            return result;
        }
        throw new HttpException('BitrixActivityCreateService portal notfound for domain: ' + domain, HttpStatus.BAD_REQUEST)

    }
}
