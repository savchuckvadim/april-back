import {
    PbxEntityType,
    PortalModel,
} from '@lib/portal-lib/portal/services/portal.model';
import { XO_ROUTING_FIELD_CODES } from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-xo-event.enum';

type BxRow = Record<string, unknown>;

/** Маршрутизация ХО, вычитанная из полей сущности. */
export interface XoRouting {
    /** Явный ответственный; null — выбирать round-robin по отделу. */
    responsible: number | null;
    /** Подсказка отдела строкой; null — подсказки нет. */
    department: string | null;
    /** Название события ХО; null — хук возьмёт название сущности. */
    name: string | null;
    /** Плановая дата обзвона (как её отдал Битрикс); null — без дедлайна. */
    deadline: string | null;
}

/**
 * Чтение маршрутизации ХО, которую робот Битрикса пишет в карточку ПЕРЕД
 * постановкой в очередь (см. {@link XO_ROUTING_FIELD_CODES}).
 *
 * Зачем отдельная модель: одни и те же поля читают очередь ХО из лидов и
 * реанимация отказников из сделок — отличается только сущность. Поэтому
 * `entityType` параметр, а не константа.
 *
 * ГОТОВНОСТЬ элемента ({@link isReady}) определяется ТОЛЬКО парой «кому»:
 * ответственный ИЛИ отдел. Требовать заодно `xo_name`/`xo_date` нельзя —
 * у них есть штатные дефолты в хуке (название сущности / задача без
 * дедлайна), и элемент завис бы в очереди навсегда из-за необязательного
 * поля. Без «кому» назначать буквально некому: такой элемент оставляем в
 * очереди на ручной разбор.
 *
 * НЕ @Injectable: чистая модель, создаётся `new` рядом с PortalModel
 * (иначе PortalModel пришлось бы держать в поле сервиса — race condition
 * между доменами).
 */
export class XoRoutingModel {
    constructor(
        private readonly portal: PortalModel,
        private readonly entityType: PbxEntityType,
    ) {}

    /** Маршрутизация из строки Битрикса; отсутствующие поля → null. */
    read(row: BxRow): XoRouting {
        return {
            responsible: this.numberOf(
                this.valueOf(row, XO_ROUTING_FIELD_CODES.responsible),
            ),
            department: this.textOf(
                this.valueOf(row, XO_ROUTING_FIELD_CODES.department),
            ),
            name: this.textOf(this.valueOf(row, XO_ROUTING_FIELD_CODES.name)),
            deadline: this.textOf(
                this.valueOf(row, XO_ROUTING_FIELD_CODES.date),
            ),
        };
    }

    /** Есть кому назначать: сотрудник ИЛИ отдел для round-robin. */
    isReady(routing: XoRouting): boolean {
        return routing.responsible !== null || routing.department !== null;
    }

    /** Значение поля по pbx-коду; поле не установлено на портале → undefined. */
    private valueOf(row: BxRow, code: string): unknown {
        const name = this.fieldName(code);
        return name ? row[name] : undefined;
    }

    /** UF-имя поля портала по коду; null — поле не установлено. */
    private fieldName(code: string): string | null {
        const field = this.portal.getEntityFieldByCode(this.entityType, code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    /**
     * Непустой текст либо null. Битрикс отдаёт незаполненные поля и как
     * `''`, и как `false`, и как `'0'` (employee), и как пустой массив —
     * все они означают «не заполнено».
     */
    private textOf(raw: unknown): string | null {
        // Array.isArray сужает unknown до any[] — возвращаем в unknown,
        // иначе значение элемента растекается по коду как any.
        const value: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
        // Скалярами Битрикс отдаёт эти поля всегда; объект здесь означал бы
        // не «значение», а другую форму ответа — трактуем как «не заполнено»,
        // а не превращаем в '[object Object]'.
        if (typeof value !== 'string' && typeof value !== 'number') return null;
        const text = String(value).trim();
        return text === '' || text === '0' ? null : text;
    }

    /** Положительный id сотрудника либо null. */
    private numberOf(raw: unknown): number | null {
        const text = this.textOf(raw);
        if (text === null) return null;
        const id = Number(text);
        return Number.isFinite(id) && id > 0 ? id : null;
    }
}
