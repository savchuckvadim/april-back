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
    asString,
    asStringArray,
} from '@lib/call-lib/call-report-analytics/lib/json-value.util';
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

/** Непустой текст без пробелов по краям. */
const text = (value: unknown): string | null => {
    const trimmed = asString(value)?.trim();
    return trimmed ? trimmed : null;
};

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
        alternatives: asStringArray(item.alternatives),
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
        : { code, quote: text(item.quote), note: text(item.note) };
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
        scriptCompliance: asNumber(source.scriptCompliance),
        scoreExplanation: text(source.scoreExplanation),
        coachingPriority: text(source.coachingPriority),
        recommendations: asStringArray(source.recommendations),
        employeeRecommendations: text(source.employeeRecommendations),
        sentiment: text(source.sentiment),
        interlocutorRole: text(source.interlocutorRole),
        specialist: text(source.specialist),
        outcome: text(source.outcome),
        needsFound: asBoolean(source.needsFound),
        needs: asStringArray(source.needs),
        presentationDone: asBoolean(source.presentationDone),
        productsOffered: asStringArray(source.productsOffered),
        priceDiscussed: asBoolean(source.priceDiscussed),
        competitors: asStringArray(source.competitors),
        riskFlags: asStringArray(source.riskFlags),
        refusalCategory: text(source.refusalCategory),
        refusalReason: text(source.refusalReason),
        talkRatioPct: asNumber(source.talkRatioPct),
        questionsCount: asNumber(source.questionsCount),
        hvostDone: asBoolean(source.hvostDone),
        hvostAnalysis: text(source.hvostAnalysis),
        fiveKDone: asBoolean(source.fiveKDone),
        fiveKAnalysis: text(source.fiveKAnalysis),
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
        incompleteParts: asStringArray(source.incompleteParts),
    };
}
