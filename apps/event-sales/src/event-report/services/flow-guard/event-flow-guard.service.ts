import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import { EnumWorkStatusCode } from '../../types/report-types';
import { assertEventFlowDtoValid } from './event-flow-guard';

/**
 * Гард POST /flow, зависящий от настроек портала.
 *
 * Всё, что проверяется по одному DTO, живёт в чистой
 * {@link assertEventFlowDtoValid}; здесь — правила, включаемые настройками
 * (Redis-кэш 300 с, лишних запросов при отправке нет).
 *
 * Тексты по-русски: 400 из POST фронт показывает менеджеру баннером
 * (flowStatus.setError); 400 из очереди не увидел бы никто.
 */
@Injectable()
export class EventFlowGuardService {
    private readonly logger = new Logger(EventFlowGuardService.name);

    constructor(private readonly appSettings: PortalAppSettingsService) {}

    async assertValid(dto: EventSalesFlowDto): Promise<void> {
        assertEventFlowDtoValid(dto);

        const workStatusCode = dto.report?.workStatus?.current?.code;
        if (workStatusCode !== EnumWorkStatusCode.success) return;

        // Lead-only контекст: сделка продажи не создаётся — sale-блок
        // требовать не с чего (иначе продажа по чистому лиду заблокирована).
        if (!dto.context?.companyId && !dto.context?.dealId) return;

        let settings: Record<string, unknown>;
        try {
            settings = (await this.appSettings.resolve(
                dto.domain,
                EnumPortalAppCode.eventSales,
            )) as Record<string, unknown>;
        } catch (error) {
            // Настройки недоступны — отправку не блокируем: наказывать
            // менеджера за упавший сервис настроек нельзя.
            this.logger.warn(
                `flow-guard: настройки ${dto.domain} недоступны — ` +
                    `проверка продажи пропущена (${String(error)})`,
            );
            return;
        }
        if (!settings['withChecklistSale']) return;

        const sale = dto.sale;
        const hasOpportunity =
            typeof sale?.opportunity === 'number' && sale.opportunity > 0;
        if (!hasOpportunity || !sale?.firstPayDate) {
            throw new BadRequestException(
                'Продажа: заполните сумму сделки и дату первой оплаты',
            );
        }
    }
}
