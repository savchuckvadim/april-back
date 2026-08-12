import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PortalDeadline } from '@lib/shared/lib/date';
import { LeadUfDefinitions } from '../../../../shared/portal-fields';
import {
    IXoEventContext,
    XoEventEntityModel,
} from '../models/xo-event-entity.model';

/** Сырая строка сущности Битрикса. */
export type BxRow = Record<string, unknown>;

/** Префиксы задач; проверка идемпотентна — «Звонок Звонок…» не бывает. */
export const CALL_TASK_PREFIX = 'Звонок';
export const XO_TASK_PREFIX = 'Холодный обзвон';

/**
 * Общее для всех flow-сервисов хука «лид → работа»: per-domain инстансы
 * Битрикса и портала, определения UF-полей и мелкие разборы значений.
 *
 * Зачем база, а не утилиты: у всех наследников одинаковый набор
 * зависимостей (bitrix + portal + ufDefinitions) и одинаковые операции над
 * сырыми строками Битрикса. Наследники отвечают КАЖДЫЙ ЗА СВОЮ сущность
 * (компания, сделки, лид, задачи) — оркестрацию делает LeadToWorkFlowService.
 *
 * НЕ @Injectable: создаются `new` с инстансом Битрикса конкретного портала.
 */
export abstract class LeadToWorkFlowBase {
    protected readonly logger = new Logger(this.constructor.name);

    constructor(
        protected readonly bitrix: BitrixService,
        protected readonly portal: PortalModel,
        /**
         * Фактические определения UF-полей лида с портала (привязки crm).
         * От них зависит ФОРМАТ значения связей; пусто — дефолт с префиксом.
         */
        protected readonly ufDefinitions: LeadUfDefinitions = {},
    ) {}

    /**
     * Событийные поля ХО для сущности (общая модель). Контекста нет (не
     * ХО-ветка / нет дедлайна) — пустой объект.
     */
    protected eventFields(
        eventCtx: IXoEventContext | null,
        entityType: 'company' | 'deal',
        row: BxRow | null,
    ): BxRow {
        if (!eventCtx) return {};
        return new XoEventEntityModel(
            this.portal,
            entityType,
            row,
            eventCtx,
        ).getFields();
    }

    /** UF-имя поля лида по pbx-коду; поле не установлено → null. */
    protected leadFieldName(code: string): string | null {
        const field = this.portal.getEntityFieldByCode('lead', code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    /** UF-имя поля сделки по pbx-коду; поле не установлено → null. */
    protected dealFieldName(code: string): string | null {
        const field = this.portal.getEntityFieldByCode('deal', code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    /** Дедлайн хука в объект-значение; строка-мусор → null (graceful). */
    protected parseDeadline(raw: string | undefined): PortalDeadline | null {
        if (!raw) return null;
        try {
            return PortalDeadline.fromPortalInput(
                raw,
                this.portal.getTimezone(),
            );
        } catch {
            this.logger.warn(`дедлайн «${raw}» не распознан — пропущен`);
            return null;
        }
    }

    /** Список ссылок (`L_1`, `D_2`) из сырого значения поля. */
    protected refList(raw: unknown): string[] {
        if (raw == null) return [];
        const items = Array.isArray(raw) ? raw : [raw];
        return items
            .map(value =>
                typeof value === 'string' || typeof value === 'number'
                    ? String(value).trim()
                    : '',
            )
            .filter(Boolean);
    }

    /** Скаляр → непустая строка; объекты/пустое → null. */
    protected text(raw: unknown): string | null {
        if (typeof raw === 'string') {
            const value = raw.trim();
            return value || null;
        }
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return null;
    }
}
