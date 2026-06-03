import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { StorageService } from '@/core/storage';
import { PbxRegistryService } from './pbx-registry.service';
import { buildSalesGroup } from '../definitions/sales';
import { buildTmcGroup } from '../definitions/tmc';
import { buildGeneralGroup } from '../definitions/general';
import { buildServiceGroup } from '../definitions/service';

@Injectable()
export class PbxRegistryBootstrapService implements OnModuleInit {
    private readonly logger = new Logger(PbxRegistryBootstrapService.name);

    constructor(
        private readonly registry: PbxRegistryService,
        private readonly storage: StorageService,
    ) {}

    async onModuleInit(): Promise<void> {
        const groups = await Promise.all([
            buildSalesGroup(this.storage),
            buildTmcGroup(this.storage),
            buildGeneralGroup(this.storage),
            buildServiceGroup(this.storage),
        ]);

        for (const group of groups) {
            this.registry.registerGroup(group);
        }

        this.logger.log(
            `Registered ${this.registry.getAllGroups().length} group(s), ` +
                `${this.registry.getAllFields().length} field(s), ` +
                `${this.registry.getAllCategories().length} category(ies), ` +
                `${this.registry.getAllSmarts().length} smart(s), ` +
                `${this.registry.getAllRpas().length} rpa(s)`,
        );
    }
}
