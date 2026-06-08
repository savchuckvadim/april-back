import { Injectable } from '@nestjs/common';

import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalDealService } from '@lib/portal-lib/pbx-domain';
import { PbxEntityType } from '@/shared';
import { PBXService } from '@/modules/pbx';
import { Field } from '../../../shared/parse-field-excel/type/parse-field.type';
import {
    BxEntityFieldsInstallService,
    IPbxFieldInstallData,
    PortalEntityFieldInstallService,
} from '../../../shared';
import {
    ParseEntityFieldsAppName,
    ParseEntityFieldsService,
    PbxEntityGroupEnum,
} from '../../../shared/entity/field/parse-entity-field.service';
/**
 * Установка полей для сделки в Bitrix
 * 1. Получаем поля для установки из excel - parsed по group и app
 * 2. Получаем все поля сущности из битрикс
 * 3. Добавляем или обновляем в битриксе каждое поле из parsed
 * 4. Отдельно собираем ошибки тех полей с которыми не получилось что-то сделать - чтобы позже по ним сделать retry
 * 4. Получаем Deal из db по portalId
 * 5. если сделки нет - создаем ее
 * 6. Получаем fields из db по Deal
 * 7. Обновляем или добавляем поля в db по результатам битрикса
 * 8. Если есть поля с ошибками - делаем retry
 * 9. Если retry опять с ошибками - отправляем ошибку
 *
 */

@Injectable()
export class PbxDealFieldInstallByParseUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseDealService: ParseEntityFieldsService,
        private readonly portalService: PortalStoreService,
        private readonly portalDealService: PortalDealService,
        private readonly portalFieldEntityInstallService: PortalEntityFieldInstallService,
    ) {}

    async installDealFields(
        domain: string,
        group: PbxEntityGroupEnum,
        appName: ParseEntityFieldsAppName,
        codes?: string[],
    ): Promise<any> {
        // получаем предварительные данные чтобы получить теккущую сущность - deal
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) throw new Error('Portal not found');
        const portalId = Number(portal.id);
        // получаем текущую сущность - deal
        let deal = await this.portalDealService.findByPortalId(portalId);

        if (!deal) {
            // если сделки нет - создаем ее
            deal = await this.portalDealService.create({
                code: `deal_${domain}`,
                name: 'deal',
                title: 'deal',
                portalId: portalId,
            });
        }
        // получаем id сделки
        const dealId = deal.id;

        // получаем поля для установки из excel
        const { fields: parseFields } =
            await this.parseDealService.getParsedData(
                PbxEntityType.DEAL,
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
            'deal',
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
                PbxEntityType.DEAL,
                dealId,
                clearFields,
            );
        return {
            bxResult,
            portalFieldEntityInstallResult,
        };
    }
}
