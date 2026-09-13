import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BitrixDateTime } from '@lib/shared/lib/date';
import { bxFieldFlag } from '@lib/shared/lib/utils';
import { XoIntentModel } from '../../../lead-request/intake/xo-intent.model';
import { XoRoutingModel } from '../../../lead-request/intake/xo-routing.model';
import {
    ILeadToWorkItem,
    LeadToWorkIntent,
    LeadToWorkStageMode,
} from '../dto/lead-to-work.dto';

type BxRow = Record<string, unknown>;

/**
 * Режим стадии, когда о нём НЕ СКАЗАЛ никто: ни запрос, ни поле карточки,
 * ни признаки заявки.
 *
 * Именно `from_lead` (зеркало стадии лида), а НЕ `cold`: это исторический
 * дефолт хука, и роботы, которые параметр не шлют, обязаны продолжить
 * работать ровно как раньше. `cold` — дефолт КРОНА
 * (`XO_STAGE_MODE_DEFAULT`): там работа заводится с нуля и зеркалить
 * нечего, а хук может переносить уже идущую работу, и обнулить ей стадию
 * было бы регрессом.
 */
const HOOK_STAGE_MODE_FALLBACK: LeadToWorkStageMode = 'from_lead';

/** Результат слияния «запрос + карточка». */
export interface LeadToWorkIntentResolution {
    /** Элемент с дозаполненной из карточки маршрутизацией. */
    item: ILeadToWorkItem;
    /** Намерение с применёнными дефолтами — флоу работают только с ним. */
    intent: LeadToWorkIntent;
    /** Откуда что взято — в warnings операции и логи. */
    signals: string[];
}

/**
 * Слияние «ЗАПРОС + КАРТОЧКА»: запрос ПЕРЕБИВАЕТ карточку.
 *
 * Приоритет одинаков у каждого параметра:
 *   1. значение из запроса (query вебхука / тело кнопки) — если передано;
 *   2. поле карточки, которое робот заполнил ПЕРЕД вызовом хука;
 *   3. дефолт.
 *
 * ЗАЧЕМ ВТОРОЙ ПУНКТ — две причины, обе практические.
 *
 * Первая: query живёт ровно один вызов. Подстраховка, которая досылает
 * «недоехавший» элемент по маркерам, восстановить по нему сценарий не
 * может и слала бы дефолты вместо задуманного роботом — то есть тихо
 * меняла бы поведение.
 *
 * Вторая: query-строку роботов ломали кириллица и `#` в шаблонах
 * (`name={{Лид #346955}}` обрезал URL по решётке, и ВСЕ параметры после
 * неё терялись). Из карточки читается ровно то же самое, но транспорт
 * испортить нечему.
 *
 * СОВМЕСТИМОСТЬ. Робот, который шлёт параметры как раньше, ничего не
 * замечает: его значения выигрывают на шаге 1, поля даже не читаются.
 *
 * `createCompany` и `taskMode` полей не имеют (решение владельца
 * 12.09.2026 — крон-автоподъём задаёт их сам: 'N' и 'close'), поэтому у
 * них только запрос и дефолт.
 */
export function resolveLeadToWorkIntent(params: {
    item: ILeadToWorkItem;
    leadRow: BxRow;
    portal: PortalModel;
    /**
     * Подтверждена ли ЗАЯВКА С САЙТА по данным лида (детектор вида работы).
     * Только она открывает дорогу в `new` — начало воронки продаж, куда
     * лишние лететь не должны. Входящее обращение (звонок/письмо/чат)
     * подтверждением НЕ считается: клиент обратился сам, но заявки не
     * оставлял.
     */
    isSiteRequest: boolean;
}): LeadToWorkIntentResolution {
    const { item, leadRow, portal, isSiteRequest } = params;
    const signals: string[] = [];

    const card = new XoIntentModel(portal, 'lead').read(leadRow);
    const routing = new XoRoutingModel(portal, 'lead').read(leadRow);

    // ── Маршрутизация: дозаполняем то, чего не было в запросе ────────────
    const merged: ILeadToWorkItem = { ...item };

    if (merged.responsible === undefined && routing.responsible !== null) {
        merged.responsible = routing.responsible;
        signals.push(
            `responsible=${routing.responsible} из поля xo_responsible`,
        );
    }
    if (merged.department === undefined && routing.department !== null) {
        merged.department = routing.department;
        signals.push(`department из поля department_string`);
    }
    if (merged.name === undefined && routing.name !== null) {
        merged.name = routing.name;
        signals.push(`name из поля xo_name`);
    }
    if (merged.deadline === undefined && routing.deadline !== null) {
        /*
         * Дату из КАРТОЧКИ нормализуем в формат, который ждут все
         * потребители ниже (CRM datetime в локали портала). Битрикс
         * отдаёт datetime-поля и как `13.09.2026 16:16:12`, и как
         * `2026-09-13T16:16:12+03:00`, а на втором `fromPortalInput`
         * БРОСАЕТ — strict-парсер dayjs не понимает токен `Z`. Поэтому
         * приводим здесь, на границе, а не чиним каждого потребителя.
         */
        const parsed = BitrixDateTime.fromBitrixField(
            routing.deadline,
            portal.getTimezone(),
        );
        if (parsed) {
            merged.deadline = parsed.toCrmDateTime();
            signals.push(`deadline из поля xo_date`);
        } else {
            signals.push(
                `поле xo_date («${routing.deadline}») не распознано — задача без дедлайна`,
            );
        }
    }

    // ── Режим стадии ─────────────────────────────────────────────────────
    let stageMode: LeadToWorkStageMode;
    if (item.stageMode) {
        stageMode = item.stageMode;
        signals.push(`stageMode=${stageMode} из запроса`);
    } else if (card.stageMode) {
        stageMode = card.stageMode;
        signals.push(`stageMode=${stageMode} из поля op_xo_lead_stage_mode`);
    } else if (isSiteRequest) {
        stageMode = 'new';
        signals.push('stageMode=new — подтверждена заявка с сайта');
    } else {
        stageMode = HOOK_STAGE_MODE_FALLBACK;
        signals.push(`stageMode=${stageMode} — дефолт хука`);
    }

    // ── Признак ХО ───────────────────────────────────────────────────────
    let isXo: LeadToWorkIntent['isXo'];
    if (item.isXo) {
        isXo = item.isXo;
        signals.push(`isXo=${isXo} из запроса`);
    } else {
        const fromCard = bxFieldFlag(card.isXo);
        isXo = fromCard ?? 'N';
        signals.push(
            fromCard
                ? `isXo=${isXo} из поля op_xo_is_xo`
                : 'isXo=N — дефолт хука',
        );
    }

    return {
        item: merged,
        intent: {
            stageMode,
            isXo,
            // Полей нет — только запрос и дефолт.
            createCompany: item.createCompany ?? 'N',
            taskMode: item.taskMode ?? 'move',
        },
        signals,
    };
}
