import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { RpaGroupEnum, RpaNameEnum } from '../../dto/install-rpa.dto';
import { ParseRpaService } from '../../services/parse/parse-rpa.service';
import {
    InstallRpaCategoriesResult,
    InstallRpaCategoriesService,
} from '../../services/rpa-categories/install-rpa-categories.service';
import { RpaContextResolver } from '../../services/rpa-context.resolver';

/**
 * Установка воронки и стадий RPA из Excel-шаблона.
 *
 * Аналог `PbxSmartCategoryInstallByParseUseCase`, но Bitrix-сторона через `rpa.stage.*`
 * (а не `crm.category.*`/`crm.status.*`). RPA должен уже существовать в PortalDB (`btx_rpas`).
 */
@Injectable()
export class PbxRpaCategoryInstallByParseUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseRpaService: ParseRpaService,
        private readonly installService: InstallRpaCategoriesService,
        private readonly contextResolver: RpaContextResolver,
    ) {}

    async installRpaCategories(
        domain: string,
        rpaName: RpaNameEnum,
        group: RpaGroupEnum,
    ): Promise<InstallRpaCategoriesResult | { message: string }> {
        const { bitrix } = await this.pbxService.init(domain);
        const parsed = await this.parseRpaService.getParsedData(rpaName, group);
        const rpa = parsed[0];
        const category = rpa?.categories[0];
        if (!category) {
            throw new NotFoundException(
                `No RPA category parsed for rpaName=${rpaName} group=${group}`,
            );
        }
        const ctx = await this.contextResolver.resolve({ domain, rpaName });
        return this.installService.installCategory({
            bitrix,
            rpaTypeId: ctx.rpaTypeId,
            rpaDbId: ctx.rpaDbId,
            category,
        });
    }
}
