import {
    PbxEntityType,
    PortalModel,
} from '@lib/portal-lib/portal/services/portal.model';
import { BATCH_LINE_BREAK_SYMBOL } from '@lib/bitrix/consts/batch.consts';
import { BitrixDateTime } from '@lib/shared/lib/date';
import { bxFieldBool } from '@lib/shared/lib/utils';
import { XoIntentModel } from '../../lead-request/intake/xo-intent.model';
import { XoRoutingModel } from '../../lead-request/intake/xo-routing.model';
import { COLD_CALL_FORCE_DEFAULT, EnumColdCallForce } from '../dto/cold.dto';
import {
    IColdCallData,
    IResolvedColdCallData,
} from '../type/cold-hook-silence.interface';

type BxRow = Record<string, unknown>;

/**
 * Чего не хватило для постановки звонка — пара «человеку» и «роботу».
 * Первое идёт в таймлайн сущности, второе — код поля, которое надо
 * заполнить, чтобы повторить.
 */
export interface ColdCallMissingField {
    /** Как назвать нехватку человеку («ответственный за звонок»). */
    label: string;
    /** Код поля карточки, заполнение которого чинит ситуацию. */
    fieldCode: string;
    /** Имя query-параметра — альтернативный способ передать то же самое. */
    queryParam: string;
}

export interface ColdCallResolution {
    /** Данные готовы к работе; null — не хватает обязательного. */
    data: IResolvedColdCallData | null;
    /** Что именно не заполнено (пусто, когда data !== null). */
    missing: ColdCallMissingField[];
    /** Откуда что взято — в логи. */
    signals: string[];
}

/**
 * Слияние «ЗАПРОС + КАРТОЧКА» для холодного звонка: запрос ПЕРЕБИВАЕТ
 * карточку, как и в хуке «лид → работа».
 *
 * ЧЕМ ОТЛИЧАЕТСЯ ОТ lead-to-work. Там у ответственного есть фолбэк —
 * round-robin по отделу продаж, поэтому отсутствие «кому» не блокирует
 * работу. Здесь round-robin'а нет, и придумывать его молча нельзя:
 * холодный звонок уехал бы случайному человеку. Поэтому нехватка данных
 * — это ОСТАНОВКА с объяснением в таймлайне, а не тихий дефолт
 * (решение владельца 13.09.2026).
 *
 * `isTmc` и `entityType` полей не имеют: первый пока живёт только в query
 * (дефолт крона — 'N'), второй выводится из сущности, по которой ищут.
 */
export function resolveColdCallData(params: {
    hook: IColdCallData;
    entityRow: BxRow | null;
    entityType: PbxEntityType;
    portal: PortalModel;
}): ColdCallResolution {
    const { hook, entityRow, entityType, portal } = params;
    const signals: string[] = [];

    const routing = entityRow
        ? new XoRoutingModel(portal, entityType).read(entityRow)
        : null;
    const intent = entityRow
        ? new XoIntentModel(portal, entityType).read(entityRow)
        : null;

    /** Значение из запроса, иначе из карточки, иначе null. */
    const pick = (
        fromQuery: string | undefined,
        fromCard: string | number | null | undefined,
        what: string,
        fieldCode: string,
    ): string | null => {
        if (fromQuery) {
            signals.push(`${what} из запроса`);
            return fromQuery;
        }
        if (fromCard !== null && fromCard !== undefined) {
            signals.push(`${what} из поля ${fieldCode}`);
            return String(fromCard);
        }
        return null;
    };

    const responsible = pick(
        hook.responsible,
        routing?.responsible,
        'responsible',
        'xo_responsible',
    );
    const created = pick(
        hook.created,
        routing?.created,
        'created',
        'xo_created',
    );
    const name = pick(hook.name, routing?.name, 'name', 'xo_name');

    let deadline = hook.deadline ?? null;
    if (deadline) {
        signals.push('deadline из запроса');
    } else if (routing?.deadline) {
        /*
         * Дату из карточки нормализуем здесь, на границе: Битрикс отдаёт
         * datetime-поля и как `13.09.2026 16:16:12`, и как ISO со
         * смещением, а ниже по потоку её ждут в формате CRM-локали.
         */
        const parsed = BitrixDateTime.fromBitrixField(
            routing.deadline,
            portal.getTimezone(),
        );
        if (parsed) {
            deadline = parsed.toCrmDateTime();
            signals.push('deadline из поля xo_date');
        } else {
            signals.push(`поле xo_date («${routing.deadline}») не распознано`);
        }
    }

    // Флаг «забрать клиента»: запрос главнее, иначе поле, иначе дефолт.
    let force: EnumColdCallForce;
    if (hook.force) {
        force = hook.force;
        signals.push(`force=${force} из запроса`);
    } else {
        const fromCard = bxFieldBool(intent?.isForce);
        if (fromCard === null || fromCard === undefined) {
            force = COLD_CALL_FORCE_DEFAULT;
            signals.push(`force=${force} — дефолт хука`);
        } else {
            force = fromCard ? EnumColdCallForce.Y : EnumColdCallForce.N;
            signals.push(`force=${force} из поля op_xo_is_force`);
        }
    }

    const missing: ColdCallMissingField[] = [];
    if (!responsible) {
        missing.push({
            label: 'ответственный за звонок',
            fieldCode: 'xo_responsible',
            queryParam: 'responsible',
        });
    }
    if (!deadline) {
        missing.push({
            label: 'дата звонка',
            fieldCode: 'xo_date',
            queryParam: 'deadline',
        });
    }
    if (missing.length) return { data: null, missing, signals };

    return {
        data: {
            ...hook,
            force,
            responsible: responsible as string,
            deadline: deadline as string,
            // Постановщик необязателен: без него автором события становится
            // сам ответственный — так же, как в lead-to-work.
            created: created ?? (responsible as string),
            // Название необязательно: без него берётся название сущности.
            name: name ?? '',
        },
        missing: [],
        signals,
    };
}

/**
 * Текст в таймлайн сущности: чего не хватило и что заполнить, чтобы
 * повторить. Пишется человеку, который смотрит карточку и не знает ни про
 * query-параметры, ни про коды полей — поэтому и то, и другое названо.
 */
export function buildColdCallMissingNote(
    missing: ColdCallMissingField[],
): string {
    const lines = missing.map(
        item =>
            `• ${item.label} — поле «${item.fieldCode}» ` +
            `(либо параметр «${item.queryParam}» в хуке)`,
    );
    return [
        'Холодный звонок НЕ поставлен: не хватает данных.',
        '',
        ...lines,
        '',
        'Заполните перечисленное в карточке и запустите постановку снова.',
        // Перенос строки в комментарии таймлайна — batch-символ:
        // комментарий уезжает в URL batch-команды.
    ].join(BATCH_LINE_BREAK_SYMBOL);
}
