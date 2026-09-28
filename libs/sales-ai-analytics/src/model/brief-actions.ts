/**
 * Действия недели AI-резюме (версия 2 «что делать»): выводятся правилами
 * из пакета фактов — одинаково для шаблонного резюме и для резюме
 * нейросети. Своих действий модель не пишет, поэтому ни одно действие не
 * появляется без факта за ним.
 *
 * Числа берутся из фактов теми же функциями форматирования, что и в
 * пакете, поэтому действия проходят факт-чек (`factCheckBullets`).
 * Чистые функции: без DI, времени и случайности.
 */
import {
    AI_BRIEF_LIMITS,
    type AiBriefBullet,
    type AiBriefFact,
    type AiEvidencePack,
} from '../contracts/ai-brief.contract';
import {
    AI_BRIEF_ACTION_CODES,
    AI_BRIEF_ACTION_TEXTS,
    AI_BRIEF_ACTION_THRESHOLDS,
    AI_BRIEF_DATA_QUALITY_SIGNALS,
    AI_BRIEF_NO_ACTIONS_TEXT,
} from '../contracts/ai-brief.rules';
import { bulletOf } from './brief-bullet.util';
import { describeDelta, isCompared } from './brief-delta';
import { formatFactValue } from './brief-numbers';
import { findFact } from './brief-pack';
import { ruCount, type RuPluralForms } from './ru-text.util';

/** Факты, по которым правила решают, нужно ли действие. */
const ACTION_INPUT_CODES: readonly string[] = [
    AI_BRIEF_ACTION_CODES.alertsUnhandled,
    AI_BRIEF_ACTION_CODES.agenda,
    AI_BRIEF_ACTION_CODES.disciplineNextStep,
    AI_BRIEF_ACTION_CODES.funnelGap,
    AI_BRIEF_ACTION_CODES.dataQuality,
];

const ALERT_FORMS: RuPluralForms = [
    'сигнал риска',
    'сигнала риска',
    'сигналов риска',
];
const REMARK_FORMS: RuPluralForms = ['замечание', 'замечания', 'замечаний'];

/** Факт с положительным значением; иначе undefined. */
function positiveFact(
    pack: AiEvidencePack,
    code: string,
): (AiBriefFact & { value: number }) | undefined {
    const fact = findFact(pack, code);

    return fact && fact.value !== null && fact.value > 0
        ? { ...fact, value: fact.value }
        : undefined;
}

/** Шаг воронки из подписи факта («…на шаге «звонок → презентация»»). */
function funnelStepOf(fact: AiBriefFact): string {
    const quoted = /«[^»]+»/.exec(fact.title);

    return quoted === null ? 'воронки' : quoted[0];
}

/** Действие по неотработанным сигналам риска пульса; их нет — null. */
function unhandledAction(pack: AiEvidencePack): AiBriefBullet | null {
    const fact = positiveFact(pack, AI_BRIEF_ACTION_CODES.alertsUnhandled);
    if (fact === undefined) return null;
    const count = ruCount(Math.round(fact.value), ALERT_FORMS);

    return bulletOf(fact, 'action', `Отработать ${count} в пульсе`);
}

/** Действие по звонкам повестки планёрки; повестка пуста — null. */
function agendaAction(pack: AiEvidencePack): AiBriefBullet | null {
    const fact = positiveFact(pack, AI_BRIEF_ACTION_CODES.agenda);
    if (fact === undefined) return null;

    return bulletOf(
        fact,
        'action',
        `${AI_BRIEF_ACTION_TEXTS.agenda} (${formatFactValue(fact.value, fact.unit)})`,
    );
}

/** Действие по просевшей доле «шаг с датой»; нет падения — null. */
function disciplineAction(pack: AiEvidencePack): AiBriefBullet | null {
    const fact = findFact(pack, AI_BRIEF_ACTION_CODES.disciplineNextStep);
    if (
        fact === undefined ||
        !isCompared(pack, fact) ||
        typeof fact.delta !== 'number' ||
        fact.delta > -AI_BRIEF_ACTION_THRESHOLDS.disciplineDrop
    ) {
        return null;
    }
    const share = formatFactValue(fact.value, fact.unit);

    return bulletOf(
        fact,
        'action',
        `${AI_BRIEF_ACTION_TEXTS.discipline}: ${share} звонков — ${describeDelta(fact)}`,
    );
}

/** Действие по разрыву к норме на шаге воронки; разрыв мал — null. */
function funnelGapAction(pack: AiEvidencePack): AiBriefBullet | null {
    const gap = findFact(pack, AI_BRIEF_ACTION_CODES.funnelGap);
    if (
        gap === undefined ||
        gap.value === null ||
        gap.value > -AI_BRIEF_ACTION_THRESHOLDS.funnelGap
    ) {
        return null;
    }
    const behind = formatFactValue(Math.abs(gap.value), gap.unit);

    return bulletOf(
        gap,
        'action',
        `${AI_BRIEF_ACTION_TEXTS.funnelGap} ${funnelStepOf(gap)}: отстаём от нормы на ${behind}`,
    );
}

/** Действие по замечаниям к данным: про даты — своё, остальные — с числом. */
function dataQualityAction(pack: AiEvidencePack): AiBriefBullet | null {
    const quality = positiveFact(pack, AI_BRIEF_ACTION_CODES.dataQuality);
    if (quality === undefined) return null;
    const text =
        quality.signal === AI_BRIEF_DATA_QUALITY_SIGNALS.dates
            ? AI_BRIEF_ACTION_TEXTS.dataDates
            : `${AI_BRIEF_ACTION_TEXTS.dataOther}: ${ruCount(Math.round(quality.value), REMARK_FORMS)}`;

    return bulletOf(quality, 'action', text);
}

/** Правила действий в порядке приоритета. */
const ACTION_RULES: readonly ((
    pack: AiEvidencePack,
) => AiBriefBullet | null)[] = [
    unhandledAction,
    agendaAction,
    disciplineAction,
    funnelGapAction,
    dataQualityAction,
];

/**
 * Действия недели в порядке приоритета: неотработанные сигналы → повестка
 * → просевшая дисциплина → разрыв к норме → качество данных. Каждое
 * действие стоит на факте пакета. Ни одно правило не сработало —
 * «Отдельных действий не требуется» (без чисел и ссылок на факты); если
 * же в пакете нет ни одного факта, по которому правила решают, действий
 * нет вовсе — утверждать «не требуется» не по чему.
 */
export function actionBullets(pack: AiEvidencePack): AiBriefBullet[] {
    const bullets = ACTION_RULES.map(rule => rule(pack)).filter(
        (bullet): bullet is AiBriefBullet => bullet !== null,
    );
    if (bullets.length > 0) {
        return bullets.slice(0, AI_BRIEF_LIMITS.groups.action);
    }
    const hasInputs = ACTION_INPUT_CODES.some(
        code => findFact(pack, code) !== undefined,
    );

    return hasInputs
        ? [{ text: AI_BRIEF_NO_ACTIONS_TEXT, group: 'action', factRefs: [] }]
        : [];
}
