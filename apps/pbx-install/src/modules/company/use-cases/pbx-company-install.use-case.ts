import { Injectable } from '@nestjs/common';

import { PortalStoreService } from '@lib/portal-konstructor/portal/portal-store.service';
import { PortalCompanyService } from '@/modules/pbx-domain';
import { PbxEntityType } from '@/shared';
import { PBXService } from '@/modules/pbx';
import { Field } from '../../shared/parse-field-excel/type/parse-field.type';
import {
    BxEntityFieldsInstallService,
    IPbxFieldInstallData,
    PortalEntityFieldInstallService,
} from '../../shared';
import {
    ParseEntityFieldsAppName,
    ParseEntityFieldsService,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';
/**
 * Установка полей для компании в Bitrix
 * 1. Получаем поля для установки из excel - parsed по group и app
 * 2. Получаем все поля сущности из битрикс
 * 3. Добавляем или обновляем в битриксе каждое поле из parsed
 * 4. Отдельно собираем ошибки тех полей с которыми не получилось что-то сделать - чтобы позже по ним сделать retry
 * 4. Получаем Company из db по portalId
 * 5. если компании нет - создаем ее
 * 6. Получаем fields из db по Company
 * 7. Обновляем или добавляем поля в db по результатам битрикса
 * 8. Если есть поля с ошибками - делаем retry
 * 9. Если retry опять с ошибками - отправляем ошибку
 *
 */

@Injectable()
export class PbxCompanyInstallUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseCompanyService: ParseEntityFieldsService,
        private readonly portalService: PortalStoreService,
        private readonly portalCompanyService: PortalCompanyService,
        private readonly portalFieldEntityInstallService: PortalEntityFieldInstallService,
    ) {}

    async installCompanyFields(
        domain: string,
        group: PbxEntityGroupEnum,
        appName: ParseEntityFieldsAppName,
    ): Promise<any> {
        // получаем предварительные данные чтобы получить теккущую сущность - company
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) throw new Error('Portal not found');
        const portalId = Number(portal.id);
        // получаем текущую сущность - company
        let company = await this.portalCompanyService.findByPortalId(portalId);
        if (!company) {
            // если компании нет - создаем ее
            company = await this.portalCompanyService.create({
                code: `company_${domain}`,
                name: 'company',
                title: 'company',
                portalId: portalId,
            });
        }
        // получаем id компании
        const companyId = company.id;

        // получаем поля для установки из excel
        const { fields: parseFields } =
            await this.parseCompanyService.getParsedData(
                PbxEntityType.BTX_COMPANY,
                appName,
                group,
            );
        // устанавливаем только поля, помеченные в Excel флагом isNeedUpdate.
        const localParseFields: Field[] = parseFields.filter(
            field => field.isNeedUpdate,
        );
        // устанавливаем или обновляем поля в битрикс
        // и получаем специальную предподготовленную смердженную Data
        const bxFieldService = new BxEntityFieldsInstallService(
            domain,
            this.pbxService,
            'company',
            localParseFields,
        );
        // устанавливаем или обновляем поля в битрикс
        const bxResult = await bxFieldService.installBxFields();

        console.log('bxResult', bxResult);
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
                PbxEntityType.BTX_COMPANY,
                companyId,
                clearFields,
            );
        console.log(
            'portalFieldEntityInstallResult',
            portalFieldEntityInstallResult,
        );
        return {
            bxResult,
            portalFieldEntityInstallResult,
        };
    }
}
