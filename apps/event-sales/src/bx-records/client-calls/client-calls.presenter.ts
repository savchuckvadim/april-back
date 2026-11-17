/**
 * Сборка списка звонков клиента: дело Битрикса + состояние в конвейере +
 * действующий разбор + адрес страницы разбора. Чистые функции.
 */
import type { TranscriptionPipelineStateView } from '@lib/call-lib';
import type { ClientCallDto, ClientCallsDto } from '../dto/client-calls.dto';
import { readClientCallBrief } from './client-call-brief.reader';
import { clientCallStateOf } from './client-call-state.util';
import {
    CLIENT_CALL_STATE_TITLES,
    CLIENT_CALLS_LIMIT,
} from './client-calls.const';
import type { ClientCallActivity } from './client-calls.types';

export interface ClientCallsSource {
    /** Звонки страницы, свежие первыми. */
    calls: readonly ClientCallActivity[];
    /** Сколько звонков с записью у клиента всего. */
    total: number;
    /** Состояние в конвейере по номеру дела звонка. */
    states: ReadonlyMap<string, TranscriptionPipelineStateView>;
    /** Нагрузка действующего разбора по номеру расшифровки. */
    analyses: ReadonlyMap<string, unknown>;
    /** Адрес страницы разбора по номеру расшифровки. */
    pageUrls: ReadonlyMap<string, string>;
    now: Date;
}

/** Длительность из строки расшифровки: положительное число секунд. */
const durationOf = (value: string | null | undefined): number | null => {
    const seconds = Number(value);
    return value != null && Number.isFinite(seconds) && seconds > 0
        ? Math.round(seconds)
        : null;
};

function presentCall(
    call: ClientCallActivity,
    source: ClientCallsSource,
): ClientCallDto {
    const row = source.states.get(String(call.activityId));
    const brief =
        row === undefined
            ? null
            : readClientCallBrief(source.analyses.get(row.id));
    const state = clientCallStateOf({
        status: row?.status,
        hasAnalysis: brief !== null,
        updatedAt: row?.updatedAt ?? null,
        now: source.now,
    });
    return {
        activityId: call.activityId,
        // Время из телефонии точнее времени дела — берём его, когда есть.
        startedAt: row?.callStartedAt?.toISOString() ?? call.startedAt,
        durationSec: durationOf(row?.durationSec),
        direction: call.direction,
        responsibleId: call.responsibleId,
        owner: call.owner,
        subject: call.subject,
        state,
        stateTitle: CLIENT_CALL_STATE_TITLES[state],
        transcriptionId: row?.id ?? null,
        pageUrl:
            row !== undefined && brief !== null
                ? (source.pageUrls.get(row.id) ?? null)
                : null,
        brief,
    };
}

export function presentClientCalls(source: ClientCallsSource): ClientCallsDto {
    return {
        calls: source.calls.map(call => presentCall(call, source)),
        total: source.total,
        limit: CLIENT_CALLS_LIMIT,
    };
}
