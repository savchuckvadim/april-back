import { BitrixApiFactoryService } from "src/modules/bitrix/core/queue/bitrix-api.factory.service";
import { PortalModel } from "src/modules/portal/services/portal.model";
import { QueuePingDto } from "../dto/queue.dto";

import { HttpException, HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";
import { BitrixApiQueueApiService } from "src/modules/bitrix/core/queue/bitrix-queue-api.service";
import { PortalService } from "src/modules/portal/portal.service";

@Injectable()
export class QueuePingUseCase {

    private portalModel: PortalModel;
    private bitrixApi: BitrixApiQueueApiService;
    constructor(
    
        private readonly portalService: PortalService, //for queue standalone
        /// NO!! scope: REQUEST
        private readonly bxFactory: BitrixApiFactoryService // scope: QUEUE
    ) {


    }

    async init(domain: string) {

        try {

            const provider = this.portalService

            Logger.log('[queuePbxInit] called with domain: ' + domain);

            Logger.log('[queuePbxInit] called with provider: ' + this.portalService);


            this.portalModel = await provider.getModelByDomain(domain);



            const portal = this.portalModel.getPortal();
            Logger.log('[queuePbxInit] called with portal: ' + portal?.id || portal);
            if (!portal) throw new HttpException('Portal not found queue init pbx', HttpStatus.BAD_REQUEST);
            Logger.log('[queuePbxInit] called with domain: ' + portal.id);
            //for queue
            this.bitrixApi = this.bxFactory.create(portal)
            Logger.log('[queuePbxInit] called with bitrixApi: ' + this.bitrixApi.getCmdBatch());
        } catch (e) {
            Logger.log('[ini] queue error: ');
            Logger.log(e);
        }
    }

    async case(dto: QueuePingDto) {
        // await this.init(dto.domain)
        try {
            Logger.log('PING QUEUE USE')
            Logger.log(dto)
            const portal = this.portalModel.getPortal()
            const domainFromPortal = portal.domain
            const portalId = portal.id
            const bxResponse = await this.bitrixApi.call<IBXUser[]>('user.get', { ID: dto.userId })
            const user = bxResponse?.result[0]?.NAME || 'user not found'
            const result = {
                user,
                domain: domainFromPortal,
                portalId
            }
            return result
        } catch {

            throw new HttpException('ping queue crush', HttpStatus.BAD_REQUEST)
            // return null
        }
    }
}