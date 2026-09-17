import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { BitrixDateTime } from '@lib/shared/lib/date';
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

    /**
     * Ответственный и «Менеджер по продажам Гарант» (`manager_op`) — вместе.
     *
     * Решение владельца 17.09.2026: при ХО и принятии заявки поле меняется
     * сразу на того же сотрудника. Раньше его писала только событийная
     * модель ХО — и только когда у обзвона есть срок, так что без срока
     * поле оставалось на прежнем менеджере. Поле не установлено — только
     * ответственный.
     */
    protected responsibleFields(
        entity: 'lead' | 'company' | 'deal',
        responsible: number,
    ): BxRow {
        const fields: BxRow = { ASSIGNED_BY_ID: String(responsible) };
        const field = this.portal.getEntityFieldByCode(
            entity,
            PBX_SALES_EVENT_FIELD_CODES.manager_op,
        );
        if (field) {
            fields[this.portal.getFieldBitrixId(field)] = String(responsible);
        }
        return fields;
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

    /**
     * Дедлайн в объект-значение; пусто и мусор → null (graceful).
     *
     * `fromBitrixField`, а не `fromPortalInput`: значение приходит либо из
     * запроса (локаль портала), либо из поля карточки, где Битрикс отдаёт
     * ISO со смещением — на нём `fromPortalInput` бросает. Обе формы
     * различает `fromBitrixField`, и он же возвращает null вместо
     * исключения, так что try здесь больше не нужен.
     */
    protected parseDeadline(raw: string | undefined): BitrixDateTime | null {
        // Ранний выход: без дедлайна портал дёргать незачем.
        if (!raw) return null;
        const deadline = BitrixDateTime.fromBitrixField(
            raw,
            this.portal.getTimezone(),
        );
        if (!deadline) {
            this.logger.warn(`дедлайн «${raw}» не распознан — пропущен`);
        }
        return deadline;
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
