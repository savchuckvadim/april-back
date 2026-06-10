import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    BxFieldDeleteResult,
    BxTaskFieldManageService,
    DeleteEntityFieldsDto,
    MANAGE_DOMAIN_ALL,
} from '../../shared';
import { PbxTaskParseService } from '../services/pbx-task-parse.service';

interface PerPortalTaskDeleteResult {
    domain: string;
    bx: BxFieldDeleteResult[];
    notFoundCodes: string[];
}

/**
 * Manage-операции над полями задачи (только Bitrix).
 *
 * `deleteFields` — удаляет указанные поля задачи в Bitrix. `bxFieldName`
 * для каждого code берётся из констант; неизвестные codes собираются в `notFoundCodes`.
 * Поддерживает `domain: "all"` (чтение списка порталов — без записи в БД).
 *
 * Item-операции (delete/edit enumeration item) не реализованы: у task-полей нет списков.
 */
@Injectable()
export class PbxTaskFieldManageUseCase {
    private readonly logger = new Logger(PbxTaskFieldManageUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly parseService: PbxTaskParseService,
    ) {}

    async deleteFields(
        dto: DeleteEntityFieldsDto,
    ): Promise<PerPortalTaskDeleteResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalTaskDeleteResult[] = [];

        const bxFieldNames: { code: string; bxFieldName: string }[] = [];
        const notFoundCodes: string[] = [];
        for (const code of dto.codes) {
            const field = this.parseService.findByCode(code);
            if (!field) {
                notFoundCodes.push(code);
                continue;
            }
            bxFieldNames.push({ code, bxFieldName: field.bxFieldName });
        }

        for (const domain of domains) {
            const manage = new BxTaskFieldManageService(
                domain,
                this.pbxService,
            );
            const bx =
                bxFieldNames.length > 0
                    ? await manage.deleteFields(bxFieldNames)
                    : [];
            results.push({ domain, bx, notFoundCodes });
        }
        return results;
    }

    private async resolveDomains(domain: string): Promise<string[]> {
        if (domain !== MANAGE_DOMAIN_ALL) {
            return [domain];
        }
        const portals = await this.portalService.getPortals();
        if (!portals) return [];
        return portals
            .map(p => p.domain)
            .filter((d): d is string => typeof d === 'string' && d.length > 0);
    }
}
