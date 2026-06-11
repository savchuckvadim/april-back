import { Injectable } from '@nestjs/common';

import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalCompanyService } from '@lib/portal-lib/pbx-domain';

import { PbxEntityType } from '@/shared';
import { PBXService } from '@/modules/pbx';
import { InstallCompanyFieldDto } from '../dto/install-company-field.dto';
import {
    BxEntityFieldsInstallService,
    IEntityFieldsInstallResult,
    IPbxFieldInstallData,
    PortalEntityFieldInstallService,
} from '../../shared';

/**
 * Установка полей для компании в Bitrix
 * 1. Получаем поля для установки из dto
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
export class PbxCompanyInstallFieldUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalCompanyService: PortalCompanyService,
        private readonly portalFieldEntityInstallService: PortalEntityFieldInstallService,
    ) {}

    async installCompanyFields(
        dto: InstallCompanyFieldDto,
    ): Promise<IEntityFieldsInstallResult> {
        const { domain, fields } = dto;
        // получаем предварительные данные чтобы получить теккущую сущность - company
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) throw new Error('Portal not found');
        const portalId = Number(portal.id);
        // получаем текущую сущность - company
        let company = await this.portalCompanyService.findByPortalId(portalId);
        if (!company) {
            // если компании нет - создаем ее
            company = await this.portalCompanyService.create({
                code: `'company_'${domain}`,
                name: 'company',
                title: 'company',
                portalId: portalId,
            });
        }
        // получаем id компании
        const companyId = company.id;

        // получаем поля для установки из excel

        // устанавливаем или обновляем поля в битрикс
        // и получаем специальную предподготовленную смердженную Data
        const bxFieldService = new BxEntityFieldsInstallService(
            domain,
            this.pbxService,
            'company',
            fields,
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
