import { Injectable } from '@nestjs/common';

import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { PortalDealService } from '@/modules/pbx-domain';

import { PbxEntityType } from '@/shared';
import { PBXService } from '@/modules/pbx';
import { InstallDealFieldDto } from '../../dto/install-deal-field.dto';
import { BxEntityFieldsInstallService, IPbxFieldInstallData, PortalEntityFieldInstallService } from '../../../shared';

/**
 * Установка полей для сделки в Bitrix
 * 1. Получаем поля для установки из dto
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
export class PbxDealFieldInstallByFieldUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalDealService: PortalDealService,
        private readonly portalFieldEntityInstallService: PortalEntityFieldInstallService,
    ) { }

    async installDealFields(dto: InstallDealFieldDto): Promise<any> {
        const { domain, fields } = dto;
        // получаем предварительные данные чтобы получить теккущую сущность - deal
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) throw new Error('Portal not found');
        const portalId = Number(portal.id);
        // получаем текущую сущность - deal
        let deal = await this.portalDealService.findByPortalId(portalId);
        console.log('deal', deal);
        if (!deal) {
            // если сделки нет - создаем ее
            deal = await this.portalDealService.create({
                code: `'deal_'${domain}`,
                name: 'deal',
                title: 'deal',
                portalId: portalId,
            });
            console.log('deal created', deal);
        }
        // получаем id сделки
        const dealId = deal.id;

        // получаем поля для установки из excel

        // устанавливаем или обновляем поля в битрикс
        // и получаем специальную предподготовленную смердженную Data
        const bxFieldService = new BxEntityFieldsInstallService(
            domain,
            this.pbxService,
            'deal',
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
                PbxEntityType.DEAL,
                dealId,
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
