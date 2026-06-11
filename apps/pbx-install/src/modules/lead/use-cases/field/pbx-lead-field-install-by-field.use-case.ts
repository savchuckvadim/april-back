import { Injectable } from '@nestjs/common';

import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalLeadService } from '@lib/portal-lib/pbx-domain';

import { PbxEntityType } from '@/shared';
import { PBXService } from '@/modules/pbx';
import { InstallLeadFieldDto } from '../../dto/install-lead-field.dto';
import {
    BxEntityFieldsInstallService,
    IEntityFieldsInstallResult,
    IPbxFieldInstallData,
    PortalEntityFieldInstallService,
} from '../../../shared';

/**
 * Установка полей для лида в Bitrix
 * 1. Получаем поля для установки из dto
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
export class PbxLeadFieldInstallByFieldUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalLeadService: PortalLeadService,
        private readonly portalFieldEntityInstallService: PortalEntityFieldInstallService,
    ) {}

    async installLeadFields(
        dto: InstallLeadFieldDto,
    ): Promise<IEntityFieldsInstallResult> {
        const { domain, fields } = dto;
        // получаем предварительные данные чтобы получить теккущую сущность - lead
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) throw new Error('Portal not found');
        const portalId = Number(portal.id);
        // получаем текущую сущность - lead
        let lead = await this.portalLeadService.findByPortalId(portalId);
        if (!lead) {
            // если лида нет - создаем его
            lead = await this.portalLeadService.create({
                code: `'lead_'${domain}`,
                name: 'lead',
                title: 'lead',
                portalId,
            });
        }
        // получаем id лида
        const leadId = lead.id;

        // устанавливаем или обновляем поля в битрикс
        // и получаем специальную предподготовленную смердженную Data
        const bxFieldService = new BxEntityFieldsInstallService(
            domain,
            this.pbxService,
            'lead',
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
                PbxEntityType.LEAD,
                leadId,
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
