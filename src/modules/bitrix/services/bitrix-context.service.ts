import { Injectable, Logger } from '@nestjs/common';
import { BitrixApiService } from '../api/bitrix-api.service';
import { PortalContextService } from '../../portal/services/portal-context.service';
import { PortalService } from 'src/modules/portal/portal.service';
import { PortalProviderService } from 'src/modules/portal/services/portal-provider.service';
import { PortalModel } from 'src/modules/portal/services/portal.model';
import { PortalModelFactory } from 'src/modules/portal/factory/potal-model.factory';
// @Injectable({ scope: Scope.REQUEST })
@Injectable()
export class BitrixContextService {
    private readonly logger = new Logger(BitrixContextService.name);
    private static instance: BitrixContextService;
    private readonly portalModel: PortalModel;
    constructor(
        // private readonly portalService: PortalService, //для очередей
        // private readonly portalContext: PortalContextService, //для контекста request запроса
        private readonly bitrixApi: BitrixApiService,
        private readonly portalModelProvider: PortalProviderService,
        private readonly portalModelFactory: PortalModelFactory,
        private readonly portalContext: PortalContextService
    ) {
        this.logger.log('BitrixContextService initialized');
        if (!BitrixContextService.instance) {
            BitrixContextService.instance = this;
        }
        return BitrixContextService.instance;
    }

    async initFromDomain(domain: string) { //для очередей
        this.logger.log(`Initializing BitrixApi from domain: ${domain}`);
        const portal = await this.portalModelProvider.getPortal(domain);
        const portalModel = this.portalModelFactory.create(portal);
        this.logger.log(`Portal domain: ${portal?.domain}`);
        this.logger.log(`Portal webhook: ${portal?.C_REST_WEB_HOOK_URL}`);
        this.bitrixApi.initFromPortal(portal);
        this.portalContext.setPortal(portal);
        return this.bitrixApi;
    }

    initFromRequestContext(): BitrixApiService {  //для контекста request запроса
        this.logger.log('Initializing BitrixApi from request context');
        const portal = this.portalContext.getPortal();
        if (!portal) {
            this.logger.error('Portal not found in request context');
            throw new Error('Portal not found in request context');
        }
        this.logger.log(`Portal found in request context: ${portal.domain}`);
        this.bitrixApi.initFromPortal(portal);
        return this.bitrixApi;
    }

    getApi(): BitrixApiService { //для контекста request запроса
        return this.bitrixApi;
    }
} 