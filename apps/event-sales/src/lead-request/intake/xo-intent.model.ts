import {
    PbxEntityType,
    PortalModel,
} from '@lib/portal-lib/portal/services/portal.model';
import {
    toXoStageMode,
    XO_INTENT_FIELD_CODES,
    XoStageMode,
} from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-xo-event.enum';
import { bxFieldBool, bxFieldText } from '@lib/shared/lib/utils';

type BxRow = Record<string, unknown>;

/**
 * Намерение хука, вычитанное из карточки: «КАК обрабатывать».
 *
 * Здесь ТОЛЬКО прочитанное, без дефолтов: `null` везде означает «поле не
 * заполнено» и отличается от `false` («заполнено и снято»). Разница
 * принципиальная — по null вызывающий применяет свою политику, по false
 * выключает сценарий. Подставь модель дефолт сама — отличить эти два
 * случая стало бы нечем.
 */
export interface XoIntent {
    /**
     * Режим стадии из поля; null — робот не указал (или указал мусор).
     * Решение принимает `resolveXoStageMode`: `new` требует подтверждения,
     * что это заявка с сайта, и молча его подставить нельзя.
     */
    stageMode: XoStageMode | null;
    /** Ставить ХО-сделку; null — поле не заполнено. */
    isXo: boolean | null;
    /** Забрать клиента у другого сотрудника; null — поле не заполнено. */
    isForce: boolean | null;
}

/**
 * Чтение полей НАМЕРЕНИЯ ХУКА (см. {@link XO_INTENT_FIELD_CODES}).
 *
 * Отделено от `XoRoutingModel` по ответственности: та отвечает на «КОМУ и
 * КОГДА» и решает готовность элемента к разбору, эта — на «КАК», и на
 * готовность не влияет вовсе (у каждого флага есть дефолт).
 *
 * НЕ @Injectable: чистая модель, создаётся `new` рядом с PortalModel —
 * иначе PortalModel пришлось бы держать в поле сервиса, а это race
 * condition между доменами (правило из CLAUDE.md).
 */
export class XoIntentModel {
    constructor(
        private readonly portal: PortalModel,
        private readonly entityType: PbxEntityType,
    ) {}

    /** Намерение из строки Битрикса; незаполненные поля → null. */
    read(row: BxRow): XoIntent {
        return {
            stageMode: toXoStageMode(
                bxFieldText(this.valueOf(row, XO_INTENT_FIELD_CODES.stageMode)),
            ),
            isXo: bxFieldBool(this.valueOf(row, XO_INTENT_FIELD_CODES.isXo)),
            isForce: bxFieldBool(
                this.valueOf(row, XO_INTENT_FIELD_CODES.isForce),
            ),
        };
    }

    /**
     * Коды полей намерения, которых НЕТ в слепке портала.
     *
     * В отличие от маршрутизации это НЕ блокер: хук отработает на дефолтах.
     * Но знать полезно — «робот пишет new, а сделка уезжает в Холодную»
     * выглядит как баг обработки, хотя на деле поле просто не установлено.
     */
    missingIntentFields(): string[] {
        return Object.values(XO_INTENT_FIELD_CODES).filter(
            code => this.fieldName(code) === null,
        );
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
