import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    LeadUfDefinitions,
    LeadUfDefinitionsService,
} from '../../shared/portal-fields';
import { EventSalesFlowDto } from '../../event-report/dto/event-sale-flow/event-sales-flow.dto';
import { EventReportInitService } from '../../event-report/services/init/event-report-init.service';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import {
    DEFAULT_FIELD_POLICY_SETTINGS,
    EventFieldPolicySettings,
} from '../../event-report/services/entity/field-policy';

/** Всё, что нужно шагам досылки: инстанс портала и контекст отчёта. */
export interface DeferredFlowContext {
    bitrix: BitrixService;
    portal: PortalModel;
    ctx: EventReportContext;
}

/**
 * Сборка контекста отчёта для ДОСЫЛКИ хвоста.
 *
 * Ровно те же три шага, что и в начале обычного flow: `PBXService.init` →
 * `EventReportInitService.loadContext` (ОДИН ЧИТАЮЩИЙ батч, ни одной
 * пишущей команды) → `EventReportContext` с классами поведения полей.
 * Переиспользуются те же сервисы; здесь нет ни одной строки доменной
 * логики отчёта.
 *
 * Почему резолв настроек живёт тут, а не берётся у `EventReportUseCase`:
 * там он приватный, а трогать существующий flow нельзя ни строкой (план
 * А5). Поведение при недоступных настройках повторено ОСОЗНАННО — дефолты
 * СХЕМЫ, а не выключение расчёта: упавший Redis не повод писать в карточку
 * заведомо врущие даты.
 *
 * Инстанса bitrix у сервиса нет (CLAUDE.md) — он рождается в методе и
 * уезжает наружу возвращаемым значением.
 */
@Injectable()
export class DeferredFlowContextFactory {
    private readonly logger = new Logger(DeferredFlowContextFactory.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly initService: EventReportInitService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly ufDefinitions: LeadUfDefinitionsService,
    ) {}

    async build(
        domain: string,
        payload: EventSalesFlowDto,
    ): Promise<DeferredFlowContext> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);

        // Читающий батч: досылке нужен тот же снимок сущностей, что и flow.
        // Пишущих команд здесь нет — ядро отчёта уже исполнил браузер.
        const init = await this.initService.loadContext(
            payload,
            bitrix,
            portal,
        );
        const ctx = new EventReportContext(payload, portal, init);
        ctx.setFieldPolicySettings(
            await this.resolveFieldPolicySettings(domain),
        );

        return { bitrix, portal, ctx };
    }

    /**
     * Определения полей-связей лида: формат crm-значения зависит от числа
     * разрешённых типов (один → голый id, несколько → `D_123`). Нужны шагу
     * `lead-request-sync` — без них связь продажи молча не сохранится.
     * Поле не установлено — не запрашиваем.
     */
    async leadLinkDefinitions(
        domain: string,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<LeadUfDefinitions> {
        const names = [PBX_SALES_EVENT_FIELD_CODES.to_sale_deal]
            .map(code => {
                const field = portal.getEntityFieldByCode('lead', code);
                return field ? portal.getFieldBitrixId(field) : null;
            })
            .filter((name): name is string => !!name);
        return this.ufDefinitions.resolve(domain, bitrix, names);
    }

    /**
     * Классы поведения полей карточки — одним чтением настроек: модель
     * полей собирается заново в каждой роли сделки (pres/xo/база/ТМЦ).
     */
    private async resolveFieldPolicySettings(
        domain: string,
    ): Promise<EventFieldPolicySettings> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return {
                calculatedNextEvent: Boolean(settings.withCalculatedNextEvent),
                resetOnFinal: Boolean(settings.withFinalFieldsReset),
            };
        } catch (error) {
            this.logger.warn(
                `[deferred] настройки ${domain} недоступны — политики полей ` +
                    `на дефолтах схемы (${(error as Error).message})`,
            );
            return DEFAULT_FIELD_POLICY_SETTINGS;
        }
    }
}
