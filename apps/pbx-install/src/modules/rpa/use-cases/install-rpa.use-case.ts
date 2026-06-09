import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { IBxRpaType } from '@/modules/bitrix';
import { PortalRpaService } from '@lib/portal-lib/pbx-domain/portal-rpa';
import { ParseRpaService } from '../services/parse/parse-rpa.service';
import { InstallRpaDto } from '../dto/install-rpa.dto';
import { InstallRpaCategoriesService } from '../services/rpa-categories/install-rpa-categories.service';
import { PbxRpaFieldInstallByParseUseCase } from './field/pbx-rpa-field-install-by-parse.use-case';

/**
 * Полный сценарий установки RPA-процесса: шаблон → Bitrix → PortalDB → стадии.
 *
 * Толстый оркестратор (аналог `InstallSmartUseCase`), потому что RPA нельзя установить
 * по кускам без RPA-only шага (`rpa.type.add` + upsert в `btx_rpas`):
 * 1. Bitrix-клиент по домену (`PBXService.init`).
 * 2. Описание RPA из Excel (`ParseRpaService`): категория, стадии, поля.
 * 3. Создание/поиск типа RPA в Bitrix (`rpa.type.*`).
 * 4. Upsert строки `btx_rpas` (нужно для резолва полей и зеркала категории).
 * 5. Поля RPA (`userfieldconfig` с `moduleId: 'rpa'`).
 * 6. Единственная воронка и её стадии (`rpa.stage.*` + зеркало `btx_categories`/`btx_stages`).
 */
@Injectable()
export class InstallRpaUseCase {
    constructor(
        private readonly parseRpaService: ParseRpaService,
        private readonly portalRpaService: PortalRpaService,
        private readonly pbxService: PBXService,
        private readonly installRpaCategoriesService: InstallRpaCategoriesService,
        private readonly fieldInstallByParse: PbxRpaFieldInstallByParseUseCase,
    ) {}

    async execute(dto: InstallRpaDto) {
        const { bitrix } = await this.pbxService.init(dto.domain);
        const parsed = await this.parseRpaService.getParsedData(
            dto.rpaName,
            dto.group,
        );
        const rpa = parsed[0];
        if (!rpa) {
            throw new NotFoundException(
                `No RPA parsed for rpaName=${dto.rpaName} group=${dto.group}`,
            );
        }

        const bxResults: unknown[] = [];

        // Шаг 3: тип RPA в Bitrix (по названию — у rpa.type нет `code`).
        const listResponse = await bitrix.rpaType.getList();
        const existingType = (listResponse.result?.types ?? []).find(
            t => t.title === rpa.title || t.name === rpa.name,
        );

        let rpaType: IBxRpaType | null = existingType ?? null;
        if (!rpaType) {
            const addResponse = await bitrix.rpaType.add({
                title: rpa.title,
                name: rpa.name,
                image: rpa.image || undefined,
            });
            bxResults.push(addResponse);
            rpaType = addResponse.result?.type ?? null;
        } else {
            bxResults.push(existingType);
        }

        if (!rpaType?.id) {
            return { error: 'RPA type not created', bxResults };
        }

        // Шаг 4: строка `btx_rpas` ДО установки полей и стадий.
        const rpaRow = await this.portalRpaService.upsertFromBitrix(
            dto.domain,
            rpaType,
            dto.rpaName,
            dto.group,
        );

        // Шаг 5: поля RPA.
        const fieldsResult = await this.fieldInstallByParse.installRpaFields(
            dto.domain,
            dto.rpaName,
            dto.group,
        );

        // Шаг 6: единственная воронка + стадии.
        const category = rpa.categories[0];
        const categoriesResult = category
            ? await this.installRpaCategoriesService.installCategory({
                  bitrix,
                  rpaTypeId: Number(rpaType.id),
                  rpaDbId: rpaRow.id,
                  category,
              })
            : null;

        // Шаг 7: актуальное состояние RPA портала.
        const portalRpas = await this.portalRpaService.getRpasByPortalDomain(
            dto.domain,
        );
        return {
            categoriesResult,
            fieldsResult,
            portalRpas,
            bxResults,
        };
    }
}
