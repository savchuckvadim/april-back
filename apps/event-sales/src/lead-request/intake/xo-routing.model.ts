import {
    PbxEntityType,
    PortalModel,
} from '@lib/portal-lib/portal/services/portal.model';
import { XO_ROUTING_FIELD_CODES } from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-xo-event.enum';
import { bxFieldId, bxFieldText } from '@lib/shared/lib/utils';

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
    /** Постановщик ХО; null — автором станет ответственный. */
    created: number | null;
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
            responsible: bxFieldId(
                this.valueOf(row, XO_ROUTING_FIELD_CODES.responsible),
            ),
            department: bxFieldText(
                this.valueOf(row, XO_ROUTING_FIELD_CODES.department),
            ),
            name: bxFieldText(this.valueOf(row, XO_ROUTING_FIELD_CODES.name)),
            deadline: bxFieldText(
                this.valueOf(row, XO_ROUTING_FIELD_CODES.date),
            ),
            created: bxFieldId(
                this.valueOf(row, XO_ROUTING_FIELD_CODES.created),
            ),
        };
    }

    /** Есть кому назначать: сотрудник ИЛИ отдел для round-robin. */
    isReady(routing: XoRouting): boolean {
        return routing.responsible !== null || routing.department !== null;
    }

    /**
     * Коды полей «кому» (`xo_responsible` / `department_string`), которых НЕТ
     * в слепке портала.
     *
     * Разделяет две очень разные беды, снаружи выглядящие одинаково — «лид
     * висит в очереди»: робот не заполнил маршрутизацию (чинить робота) либо
     * бэкенд физически не видит поле, потому что оно не установлено или не
     * доехало в слепок портала (чинить установку полей). Во втором случае
     * очередь не разберётся НИКОГДА, сколько карточку ни заполняй.
     */
    missingRoutingFields(): string[] {
        return [
            XO_ROUTING_FIELD_CODES.responsible,
            XO_ROUTING_FIELD_CODES.department,
        ].filter(code => this.fieldName(code) === null);
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
}
