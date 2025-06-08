import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SilentJobHandlerId } from "src/core/silence/constants/silent-job-handlers.enum";
import { SilentJobHandlersRegistry } from "src/core/silence/silent-job-handlers.registry";
// import { BitrixActivityCreateService } from "src/modules/bitrix/domain/activity/services/activity-create.service";
// import { AlfaActivityModule } from "../alfa-activity.module";
import { SilentJobManagerService } from "src/core/silence/silent-job-manager.service";
import { AlfaBxActivityCreateService } from "./activity-create.service";

@Injectable()
export class AlfaActivityHookService implements OnModuleInit {
    private readonly logger = new Logger(AlfaActivityHookService.name);

    constructor(
        private readonly registry: SilentJobHandlersRegistry,
        private readonly bitrixService: AlfaBxActivityCreateService,
        private readonly silentManager: SilentJobManagerService
    ) {
        this.logger.log('AlfaActivityHookService constructor ✅');
    }

    onModuleInit() {
        this.logger.log('AlfaActivityHookService onModuleInit ✅');
        this.logger.log(`Registry available: ${!!this.registry}`);
        this.logger.log(`BitrixService available: ${!!this.bitrixService}`);
        // this.logger.log(`PortalProviderService available: ${!!this.portalProvider}`);

        this.logger.log('Registering handler CREATE_ACTIVITY');
        this.registry.register(
            SilentJobHandlerId.CREATE_ACTIVITY, 
            async (collected, payload) => {
            this.logger.log('HANDLER CALLED create-activity');
            this.logger.log(`Payload: ${JSON.stringify(payload)}`);
            this.logger.log(`Collected: ${JSON.stringify(collected)}`);

            await this.bitrixService.createActivities(
                payload.domain,
                collected
            );
        });
        this.logger.log('Handler registration completed');
    }

    async createActivityHook(
        domain: string,
        companyId: string,
        title: string,
        date: string,
        responsible: string
    ) {
        this.logger.log('createActivityHook called');
        const data = {
            companyId: Number(companyId),
            title: title,
            date: date,
            responsible: responsible,
        };
        // this.logger.log(`Activity data: ${JSON.stringify(data)}`);
        this.logger.log(`createActivityHook Domain: ${domain}`);
        const domainKey = domain.replace(/\./g, '_'); // чтобы точки не мешались в ключе
        await this.silentManager.handle(
            `GO_alfa_${domainKey}_${data.responsible}`,
            1500,
            data,
            SilentJobHandlerId.CREATE_ACTIVITY,
            { domain },
        );
    }
}
