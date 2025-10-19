
import { QueuePingDto } from '../dto/queue.dto';

import {
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
    Logger,
} from '@nestjs/common';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
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

    async init(domain: string) {
        try {
            // const { portal, PortalModel, bitrix } = await this.pbx.init(domain);
            // // const provider = this.portalService;

            Logger.log('[queuePbxInit] called with domain: ' + domain);



            // this.portalModel = PortalModel;

            // // const portal = this.portalModel.getPortal();
            // Logger.log(
            //     '[queuePbxInit] called with portal: ' + portal?.id || portal,
            // );
            // if (!portal)
            //     throw new HttpException(
            //         'Portal not found queue init pbx',
            //         HttpStatus.BAD_REQUEST,
            //     );
            // Logger.log('[queuePbxInit] called with domain: ' + portal.id);
            // //for queue
            // // this.bitrixApi = await this.bxFactory.create(portal);
            // // Logger.log(
            // //     '[queuePbxInit] called with bitrixApi: ' +
            // //         this.bitrixApi.getCmdBatch(),
            // // );
        } catch (e) {
            Logger.log('[ini] queue error: ');
            Logger.log(e);
        }
    }

    async case(dto: QueuePingDto) {
        // await this.init(dto.domain)
        try {
            const { portal, PortalModel, bitrix } = await this.pbx.init(dto.domain);
            Logger.log('PING QUEUE USE');
            Logger.log(dto);

            const domainFromPortal = portal.domain;
            const portalId = portal.id;
            const bxResponse = await bitrix.api.call<IBXUser[]>(
                'user.get',
                {
                    ID: dto.userId,
                },
            );
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
