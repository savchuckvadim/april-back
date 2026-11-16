import { Injectable } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { CALL_REPORT_SMART_CODE } from '../config/call-report-smart.config';
import {
    checkCallReportSmartFields,
    type CallReportSmartFieldsCheck,
} from './check-call-report-smart.util';

export interface CallReportSmartCheckResult extends CallReportSmartFieldsCheck {
    domain: string;
    /** Смарт «AI-анализ звонков» есть на портале. */
    installed: boolean;
    /** entityTypeId смарта; null — смарт не установлен. */
    entityTypeId: number | null;
}

/**
 * Проверка полей смарта «AI-анализ звонков» на портале: каких полей конфига
 * нет, в каких списках не хватает значений и какие поля лишние. Только
 * чтение (crm.type.list и userfieldconfig.list) — в отличие от установки
 * ничего не создаёт, поэтому безопасна на портале с исчерпанным лимитом
 * полей.
 *
 * `@Injectable` без bitrix-состояния: клиент портала берётся на вызов.
 */
@Injectable()
export class CheckCallReportSmartUseCase {
    constructor(private readonly pbxService: PBXService) {}

    async execute(domain: string): Promise<CallReportSmartCheckResult> {
        const { bitrix } = await this.pbxService.init(domain);
        const types = await bitrix.smartType.getListFull({
            filter: { code: CALL_REPORT_SMART_CODE },
            start: -1,
            order: { id: 'asc' },
        });
        const smartType = types.find(
            type => type.code === CALL_REPORT_SMART_CODE,
        );
        if (!smartType) {
            return {
                domain,
                installed: false,
                entityTypeId: null,
                // Имена полей зависят от id типа — без смарта сравнивать не с чем.
                ...checkCallReportSmartFields(0, []),
                missing: [],
            };
        }
        // entityId полей — CRM_{id типа из crm.type.list}, НЕ entityTypeId.
        const typeId = Number(smartType.id);
        const existing = await bitrix.userFieldConfig.getAllWithItems('crm', {
            entityId: `CRM_${typeId}`,
        });
        return {
            domain,
            installed: true,
            entityTypeId: Number(smartType.entityTypeId),
            ...checkCallReportSmartFields(typeId, existing),
        };
    }
}
