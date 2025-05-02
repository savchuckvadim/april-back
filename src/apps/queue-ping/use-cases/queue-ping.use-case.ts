import { BitrixApiService } from "src/modules/bitrix/core/http/bitrix-api.service";
import { BitrixApiFactoryService } from "src/modules/bitrix/core/queue/bitrix-api.factory.service";
import { PortalProviderService } from "src/modules/portal/services/portal-provider.service";
import { PortalModel } from "src/modules/portal/services/portal.model";
import { QueuePingDto } from "../dto/queue.dto";
import { queuePbxInit } from "../lib/queuePbxInit.util";
import { HttpException, HttpStatus, Inject, Logger } from "@nestjs/common";
import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";

export class QueuePingUseCase {

    private portalModel: PortalModel;
    private bitrixApi: BitrixApiService;
    constructor(
        @Inject(PortalProviderService)
        private readonly portalProvider: PortalProviderService,
        /// NO!! scope: REQUEST
        private readonly bxFactory: BitrixApiFactoryService // scope: QUEUE
    ) {


    }

    async init(domain: string) {

        try {

            const provider = this.portalProvider

            Logger.log('[queuePbxInit] called with domain: ' + domain);

            Logger.log('[queuePbxInit] called with provider: ' + provider);


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