import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PbxRegistryService } from './pbx-registry.service';
import { SALES_EVENT_GROUP } from '../definitions';

@Injectable()
export class PbxRegistryBootstrapService implements OnModuleInit {
    private readonly logger = new Logger(PbxRegistryBootstrapService.name);

    constructor(private readonly registry: PbxRegistryService) {}

    onModuleInit(): void {
        this.registry.registerGroup(SALES_EVENT_GROUP);

        this.logger.log(
            `Registered ${this.registry.getAllGroups().length} group(s), ` +
                `${this.registry.getAllFields().length} field(s), ` +
                `${this.registry.getAllCategories().length} category(ies)`,
        );
    }
}
