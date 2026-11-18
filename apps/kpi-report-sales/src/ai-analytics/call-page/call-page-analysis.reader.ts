/**
 * Чтение разбора звонка из `ais.user_result` для страницы звонка. Нагрузка —
 * произвольный JSON (разборы разных версий промпта): поле не того типа
 * читается как отсутствующее, исключений нет. Чистые функции.
 */
import {
    asBoolean,
    asNumber,
    asRecord,
    asRecordArray,
} from '@lib/call-lib/call-report-analytics/lib/json-value.util';
import {
    callTypeHasChecklists,
    trustedScriptCompliance,
} from '@lib/call-lib/call-report/analysis-display';
import {
    normalizeFiveKAnalysisText,
    normalizeHvostAnalysisText,
} from '@lib/call-lib/call-report/checklist-text';
import {
    readChecklistPlaces,
    readNeedItems,
    readText,
    readTexts,
} from './call-page-evidence.reader';
import type {
    CallPageAnalysisView,
    CallPageCheckpointView,
    CallPageDealProgressView,
    CallPageDialogTurnView,
    CallPageIssueView,
    CallPageMethodologyView,
    CallPageNextStepView,
    CallPageObjectionView,
    CallPagePriceView,
    CallPageRiskEvidenceView,
    CallPageSectionView,
    CallPageUpsellView,
} from './call-page.types';

type Json = Record<string, unknown>;

/** Непустой текст без пробелов по краям; «null» словом — пусто. */
const text = readText;

/** Секунды записи: неотрицательное число, иначе null. */
const seconds = (value: unknown): number | null => {
    const number = asNumber(value);
    return number !== null && number >= 0 ? number : null;
};

function sectionOf(item: Json): CallPageSectionView | null {
    const section = text(item.section);
    if (section === null) return null;
    return {
        section,
        relevance: asNumber(item.relevance) ?? 0,
        score: asNumber(item.score),
        analysis: text(item.analysis),
        advice: text(item.advice),
        asWas: text(item.asWas),
        weaknesses: text(item.weaknesses),
        alternatives: readTexts(item.alternatives),
        // Цитата-доказательство и секунда (focus-v3.4); прежний разбор — null.
        quote: text(item.quote),
        startSec: seconds(item.startSec),
    };
}

function objectionOf(item: Json): CallPageObjectionView | null {
    const objection = text(item.objection) ?? text(item.quote);
    if (objection === null) return null;
    return {
        objection,
        handling: text(item.handling),
        handled: asBoolean(item.handled),
        category: text(item.category),
        quote: text(item.quote),
        outcome: text(item.outcome),
        reaction: text(item.reaction),
        startSec: seconds(item.startSec),
        endSec: seconds(item.endSec),
    };
}

function riskEvidenceOf(item: Json): CallPageRiskEvidenceView | null {
    const flag = text(item.flag);
    const quote = text(item.quote);
    if (flag === null || quote === null) return null;
    return {
        flag,
        quote,
        speaker: text(item.speaker),
        startSec: seconds(item.startSec),
        endSec: seconds(item.endSec),
    };
}

function checkpointOf(item: Json): CallPageCheckpointView | null {
    const title = text(item.title);
    const status = text(item.status);
    if (title === null || status === null) return null;
    return {
        title,
        status,
        mandatory: asBoolean(item.mandatory) ?? false,
        quote: text(item.quote),
        startSec: seconds(item.startSec),
        endSec: seconds(item.endSec),
    };
}

function methodologyOf(value: unknown): CallPageMethodologyView | null {
    const record = asRecord(value);
    const title = text(record?.title);
    if (record === null || title === null) return null;
    return {
        code: text(record.code),
        title,
        checkpoints: asRecordArray(record.checkpoints)
            .map(checkpointOf)
            .filter((item): item is CallPageCheckpointView => item !== null),
        checkpointsDone: asNumber(record.checkpointsDone),
        checkpointsTotal: asNumber(record.checkpointsTotal),
        spiralsFull: asNumber(record.spiralsFull),
        spiralsMinFull: asNumber(record.spiralsMinFull),
    };
}

function issueOf(item: Json): CallPageIssueView | null {
    const code = text(item.code);
    return code === null
        ? null
        : {
              code,
              quote: text(item.quote),
              note: text(item.note),
              startSec: asNumber(item.startSec),
              endSec: asNumber(item.endSec),
          };
}

function priceOf(item: Json): CallPagePriceView | null {
    const amount = asNumber(item.amount);
    if (amount === null || amount <= 0) return null;
    return {
        amount,
        periodMonths: asNumber(item.periodMonths),
        product: text(item.product),
        kind: text(item.kind),
        quote: text(item.quote),
        startSec: asNumber(item.startSec),
    };
}

function nextStepOf(value: unknown): CallPageNextStepView | null {
    const record = asRecord(value);
    const set = asBoolean(record?.set);
    if (record === null || set === null) return null;
    return {
        set,
        description: text(record.description),
        date: text(record.date),
        time: text(record.time),
        goal: text(record.goal),
        kind: text(record.kind),
        startSec: asNumber(record.startSec),
    };
}

function upsellOf(value: unknown): CallPageUpsellView | null {
    const record = asRecord(value);
    const attempted = asBoolean(record?.attempted);
    if (record === null || attempted === null) return null;
    return { attempted, kind: text(record.kind), what: text(record.what) };
}

function dealProgressOf(value: unknown): CallPageDealProgressView | null {
    const record = asRecord(value);
    const score = asNumber(record?.score);
    if (record === null || score === null) return null;
    return {
        score,
        before: text(record.before),
        after: text(record.after),
        why: text(record.why),
        whyNotHigher: text(record.whyNotHigher),
    };
}

function dialogTurnOf(item: Json): CallPageDialogTurnView | null {
    const role = text(item.role);
    const turn = text(item.text);
    return role === null || turn === null ? null : { role, text: turn };
}

const present = <T>(items: (T | null)[]): T[] =>
    items.filter((item): item is T => item !== null);

type CallPageChecklists = Pick<
    CallPageAnalysisView,
    | 'hvostDone'
    | 'hvostAnalysis'
    | 'fiveKDone'
    | 'fiveKAnalysis'
    | 'hvostEvidence'
    | 'fiveKEvidence'
>;

/**
 * Чек-листы «Хвост» и 5К — только у презентации (решение владельца
 * 18.11.2026); у других типов, в том числе в старых разборах, строк нет.
 */
function checklistsOf(source: Json): CallPageChecklists {
    if (!callTypeHasChecklists(source.callType)) {
        return {
            hvostDone: null,
            hvostAnalysis: null,
            fiveKDone: null,
            fiveKAnalysis: null,
            hvostEvidence: [],
            fiveKEvidence: [],
        };
    }
    return {
        hvostDone: asBoolean(source.hvostDone),
        // Старые разборы бывают с записью словаря вместо строк — читаемыми
        // строками по блокам анкеты (17.11.2026).
        hvostAnalysis: text(normalizeHvostAnalysisText(source.hvostAnalysis)),
        fiveKDone: asBoolean(source.fiveKDone),
        fiveKAnalysis: text(normalizeFiveKAnalysisText(source.fiveKAnalysis)),
        // Места пунктов в разговоре (focus-v3.4); прежний разбор — пусто.
        hvostEvidence: readChecklistPlaces(source.hvostEvidence),
        fiveKEvidence: readChecklistPlaces(source.fiveKEvidence),
    };
}

/** Разбор для страницы; нагрузка не объект — null (разбора нет). */
export function readCallPageAnalysis(
    userResult: unknown,
): CallPageAnalysisView | null {
    const source = asRecord(userResult);
    if (source === null) return null;
    return {
        callType: text(source.callType),
        callTypeRefined: text(source.callTypeRefined),
        callTypeReason: text(source.callTypeReason),
        summary: text(source.summary),
        score: asNumber(source.score),
        weightedScore: asNumber(source.weightedScore),
        // Процент — только если скрипт разговора был в разборе
        // (решение владельца 18.11.2026); у старых разборов признака нет.
        scriptCompliance: trustedScriptCompliance(source),
        scoreExplanation: text(source.scoreExplanation),
        coachingPriority: text(source.coachingPriority),
        recommendations: readTexts(source.recommendations),
        employeeRecommendations: text(source.employeeRecommendations),
        sentiment: text(source.sentiment),
        interlocutorRole: text(source.interlocutorRole),
        specialist: text(source.specialist),
        outcome: text(source.outcome),
        needsFound: asBoolean(source.needsFound),
        needs: readTexts(source.needs),
        needItems: readNeedItems(source.needItems),
        needsStartSec: asNumber(source.needsStartSec),
        presentationDone: asBoolean(source.presentationDone),
        presentationStartSec: asNumber(source.presentationStartSec),
        productsOffered: readTexts(source.productsOffered),
        priceDiscussed: asBoolean(source.priceDiscussed),
        competitors: readTexts(source.competitors),
        riskFlags: readTexts(source.riskFlags),
        refusalCategory: text(source.refusalCategory),
        refusalReason: text(source.refusalReason),
        talkRatioPct: asNumber(source.talkRatioPct),
        questionsCount: asNumber(source.questionsCount),
        ...checklistsOf(source),
        reportComparison: text(source.reportComparison),
        speechAnalysis: text(source.speechAnalysis),
        nextStep: nextStepOf(source.nextStep),
        upsell: upsellOf(source.upsell),
        dealProgress: dealProgressOf(source.dealProgress),
        sections: present(asRecordArray(source.sections).map(sectionOf)),
        objections: present(asRecordArray(source.objections).map(objectionOf)),
        riskEvidence: present(
            asRecordArray(source.riskEvidence).map(riskEvidenceOf),
        ),
        issues: present(asRecordArray(source.issues).map(issueOf)),
        prices: present(asRecordArray(source.prices).map(priceOf)),
        methodology: methodologyOf(source.methodology),
        dialog: present(asRecordArray(source.dialog).map(dialogTurnOf)),
        incompleteParts: readTexts(source.incompleteParts),
    };
}
