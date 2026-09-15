import { Injectable, Logger } from '@nestjs/common';
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
 * Что здесь МОЖЕТ отвергнуть отправку: только рассинхрон самого DTO
 * (assertEventFlowDtoValid). Правило продажи с 15.09 предупреждающее —
 * см. комментарий в теле: отчёт о продаже дороже любой недостающей ячейки.
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
        if (hasOpportunity && sale?.firstPayDate) return;

        /*
         * ПРОДАЖУ НЕ БЛОКИРУЕМ — предупреждаем.
         *
         * Раньше здесь стоял 400 на весь отчёт, и он терял готовую работу
         * менеджера: фрейм закрывал эти же вопросы значением, уже стоящим в
         * карточке (сумма в сделке есть → вопрос выглядит заполненным →
         * ответа нет → в payload пусто), и отправка продажи падала при
         * полностью заполненной сделке.
         *
         * Защищать было нечего: писатель полей и так graceful
         * (`sales-base-deal.service`) — суммы нет, значит `OPPORTUNITY` не
         * трогаем и в сделке остаётся прежнее значение; поля
         * `first_pay_date` нет на портале — значение молча пропускается.
         * То есть гард не берёг данные, он только отменял отчёт.
         *
         * Собирает эти данные там, где это видно менеджеру, — модалка
         * продажи во фрейме: пустую сумму она не пропускает. Здесь остаётся
         * след для нас: по нему видно порталы и сделки, где продажа ушла без
         * суммы или без даты.
         */
        this.logger.warn(
            `flow-guard: продажа без ${
                hasOpportunity ? 'даты первой оплаты' : 'суммы сделки'
            } — ${dto.domain}, сделка ${dto.context?.dealId ?? '—'}, ` +
                `компания ${dto.context?.companyId ?? '—'}: отчёт отправлен как есть`,
        );
    }
}
