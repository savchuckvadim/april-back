/**
 * Витрина слепой проверки «три звонка недели» (план Фазы 2, поток 15):
 * чистые функции — кандидаты из строк звонков и сборка ответа ручки.
 *
 * ⚠ Здесь и живёт слепой режим: колонки оценки AI (`aiCallType`,
 * `aiScore`) кладутся в ответ ТОЛЬКО у звонков с сохранённой меткой.
 * Гарантия действует на этой ручке — карточку разбора в Битрикс
 * руководитель может открыть и увидеть оценку (AI_ROP_MARK_BLIND_NOTE).
 */
import type {
    RopMarkCandidate,
    RopMarkPick,
} from '@lib/sales-ai-analytics/model/rop-mark';
import {
    AI_ROP_MARK_BLIND_NOTE,
    AI_ROP_MARK_REASON_TITLES,
} from '../../constants/ai-rop-mark.const';
import type {
    AiRopMarkCallDto,
    AiRopMarkWeekDto,
} from '../../dto/ai-rop-mark.dto';
import type { AiRopMarkRecord } from '../../store/ai-analytics-rop-mark.store';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import {
    isManagerVisible,
    type RequesterAccess,
} from '../access/perimeter.util';

/** Строка звонка → кандидат подбора; без менеджера кандидатов нет. */
export function toRopMarkCandidate(row: DatedLiteRow): RopMarkCandidate[] {
    if (!row.managerId) return [];
    return [
        {
            transcriptionId: row.transcriptionId,
            managerId: String(row.managerId),
            callType: row.callType,
            score: row.score,
        },
    ];
}

/** Метки недели по id транскрипции (последняя запись на звонок). */
export function marksByCall(
    marks: readonly AiRopMarkRecord[],
): Map<string, AiRopMarkRecord> {
    const byCall = new Map<string, AiRopMarkRecord>();
    for (const mark of marks) {
        const previous = byCall.get(mark.transcriptionId);
        if (!previous || previous.createdAt <= mark.createdAt) {
            byCall.set(mark.transcriptionId, mark);
        }
    }
    return byCall;
}

/** Один звонок подбора: слепой до метки, с оценкой AI — после. */
function toCallDto(
    pick: RopMarkPick,
    mark: AiRopMarkRecord | undefined,
): AiRopMarkCallDto {
    const call: AiRopMarkCallDto = {
        transcriptionId: pick.transcriptionId,
        managerId: pick.managerId,
        reason: pick.reason,
        reasonTitle: AI_ROP_MARK_REASON_TITLES[pick.reason],
        marked: mark !== undefined,
    };
    if (!mark) return call;
    return {
        ...call,
        aiCallType: pick.callType,
        aiScore: pick.score,
        mark: {
            agree: mark.agree,
            ropScore: mark.ropScore,
            sections: mark.sections,
            why: mark.why,
            howTo: mark.howTo,
            blind: mark.blind,
            markedAt: mark.createdAt.toISOString(),
        },
    };
}

export interface RopMarkWeekView {
    weekKey: string;
    /** Понедельник и воскресенье недели в TZ портала. */
    from: string;
    to: string;
    generatedAt: string;
    calls: readonly RopMarkPick[];
    marks: readonly AiRopMarkRecord[];
    /** Периметр запрашивающего: чужие строки в ответ не попадают. */
    access: RequesterAccess;
}

/** Ответ ручки: подбор недели, метки и оговорка о слепом режиме. */
export function presentRopMarkWeek(view: RopMarkWeekView): AiRopMarkWeekDto {
    const byCall = marksByCall(view.marks);
    return {
        weekKey: view.weekKey,
        from: view.from,
        to: view.to,
        generatedAt: view.generatedAt,
        calls: view.calls
            .filter(pick => isManagerVisible(view.access, pick.managerId))
            .map(pick => toCallDto(pick, byCall.get(pick.transcriptionId))),
        blindNote: AI_ROP_MARK_BLIND_NOTE,
    };
}
