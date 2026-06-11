import { Injectable } from '@nestjs/common';

import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalLeadService } from '@lib/portal-lib/pbx-domain';
import { PbxEntityType } from '@/shared';
import { PBXService } from '@/modules/pbx';
import { Field } from '../../../shared/parse-field-excel/type/parse-field.type';
import {
    BxEntityFieldsInstallService,
    IEntityFieldsInstallResult,
    IPbxFieldInstallData,
    PortalEntityFieldInstallService,
} from '../../../shared';
import {
    ParseEntityFieldsAppName,
    ParseEntityFieldsService,
    PbxEntityGroupEnum,
} from '../../../shared/entity/field/parse-entity-field.service';
/**
 * Установка полей для лида в Bitrix
 * 1. Получаем поля для установки из excel - parsed по group и app
 * 2. Получаем все поля сущности из битрикс
 * 3. Добавляем или обновляем в битриксе каждое поле из parsed
 * 4. Отдельно собираем ошибки тех полей с которыми не получилось что-то сделать - чтобы позже по ним сделать retry
 * 4. Получаем Lead из db по portalId
 * 5. если лида нет - создаем его
 * 6. Получаем fields из db по Lead
 * 7. Обновляем или добавляем поля в db по результатам битрикса
 * 8. Если есть поля с ошибками - делаем retry
 * 9. Если retry опять с ошибками - отправляем ошибку
 *
 */

@Injectable()
export class PbxLeadFieldInstallByParseUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseLeadService: ParseEntityFieldsService,
        private readonly portalService: PortalStoreService,
        private readonly portalLeadService: PortalLeadService,
        private readonly portalFieldEntityInstallService: PortalEntityFieldInstallService,
    ) {}

    async installLeadFields(
        domain: string,
        group: PbxEntityGroupEnum,
        appName: ParseEntityFieldsAppName,
        codes?: string[],
    ): Promise<IEntityFieldsInstallResult> {
        // получаем предварительные данные чтобы получить теккущую сущность - lead
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) throw new Error('Portal not found');
        const portalId = Number(portal.id);
        // получаем текущую сущность - lead
        let lead = await this.portalLeadService.findByPortalId(portalId);

        if (!lead) {
            // если лида нет - создаем его
            lead = await this.portalLeadService.create({
                code: `lead_${domain}`,
                name: 'lead',
                title: 'lead',
                portalId,
            });
        }
        // получаем id лида
        const leadId = lead.id;

        // получаем поля для установки из excel
        const { fields: parseFields } =
            await this.parseLeadService.getParsedData(
                PbxEntityType.LEAD,
                appName,
                group,
            );
        // По умолчанию ставим поля, помеченные в Excel флагом isNeedUpdate.
        // Опциональный `codes` дополнительно сужает выборку (точечная переустановка/тест).
        let localParseFields: Field[] = parseFields.filter(
            field => field.isNeedUpdate,
        );
        if (codes && codes.length > 0) {
            localParseFields = localParseFields.filter(field =>
                codes.includes(field.code),
            );
        }
        // устанавливаем или обновляем поля в битрикс
        // и получаем специальную предподготовленную смердженную Data
        const bxFieldService = new BxEntityFieldsInstallService(
            domain,
            this.pbxService,
            'lead',
            localParseFields,
        );
        // устанавливаем или обновляем поля в битрикс
        const bxResult = await bxFieldService.installBxFields();
        // если не удалось изменить ни одного поля - выбрасываем ошибку
        if (bxResult.countSuccess === 0) {
            throw new Error('В битриксе не удалось изменить ни одного поля');
        }
        // фильтруем поля с undefined bxField
        const clearFields = bxResult.results.filter(
            field => field.bxField !== undefined,
        ) as IPbxFieldInstallData[];

        const portalFieldEntityInstallResult =
            await this.portalFieldEntityInstallService.syncWithDb(
                PbxEntityType.LEAD,
                leadId,
                clearFields,
            );
        return {
            bxResult,
            portalFieldEntityInstallResult,
        };
    }
}
