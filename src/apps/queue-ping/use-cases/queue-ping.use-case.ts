import { QueuePingDto } from '../dto/queue.dto';

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';

@Injectable()
export class QueuePingUseCase {
    // private portalModel: PortalModel;
    // private bitrixApi: BitrixBaseApi;
    constructor(
        // private readonly portalService: PortalService, //for queue standalone
        // /// NO!! scope: REQUEST
        // private readonly bxFactory: BitrixApiFactoryService, // scope: QUEUE
        private readonly pbx: PBXService,
    ) {}

    async case(dto: QueuePingDto) {
        // await this.init(dto.domain)
        try {
            const { portal, bitrix } = await this.pbx.init(dto.domain);

            Logger.log('PING QUEUE USE');
            Logger.log(dto);

            const domainFromPortal = portal.domain;
            const portalId = portal.id;
            const bxResponse = await bitrix.user.get({
                ID: dto.userId,
            });
            const user = bxResponse?.result[0]?.NAME || 'user not found';
            const result = {
                user,
                domain: domainFromPortal,
                portalId,
            };
            return result;
        } catch {
            throw new HttpException('ping queue crush', HttpStatus.BAD_REQUEST);
            // return null
        }
    }

    // onModuleInit() {
    //     console.log('[QueuePingUseCase] initialized');
    // }
}
