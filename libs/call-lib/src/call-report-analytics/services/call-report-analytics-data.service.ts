import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/services/ai.service';
import { AiEntityDto } from '../../ai/dto/ai-entity.dto';
import {
    AGENT_ANALYSIS_TYPE,
    CALL_CLASSIFY_TYPE,
} from '../../ai/ai-record-types.const';
import { TranscriptionStoreService } from '../../transcription/services/transcription.store.service';
import { asRecord, asString } from '../lib/json-value.util';
import { mapLiteAnalysis } from '../lib/analytics-lite.mapper';
import {
    AnalyticsFilterResult,
    filterAnalyticsRows,
} from '../lib/analytics-query-filter';
import { CallReportAnalyticsQueryDto } from '../dto/call-report-analytics-query.dto';
import {
    AnalyticsCallLiteRow,
    AnalyticsLiteDataset,
} from '../types/analytics-lite.types';

/** Размер порции id для выборки ais (ограничение SQL IN). */
const AI_BATCH_SIZE = 500;

/**
 * Один звонок в «плоском» виде для агрегаторов отчётов:
 * строка транскрипции + распакованные результаты анализа/классификации.
 */
export interface AnalyticsCallRow {
    transcriptionId: string;
    callStartedAt: Date | null;
    durationSec: number | null;
    /** Bitrix-id менеджера (null — звонок обработан до сохранения менеджера). */
    managerId: string | null;
    /**
     * Итоговый тип звонка: из анализа агента (видел полный контекст),
     * иначе — из дешёвого классификатора; null — не определён.
     */
    callType: string | null;
    /** user_result глубокого анализа агента (null — агент ещё не разобрал). */
    analysis: Record<string, unknown> | null;
    /** user_result дешёвого классификатора (confidence, роль и т.п.). */
    classification: Record<string, unknown> | null;
}

/** Результат выборки: строки-кандидаты и статистика фильтрации для meta. */
export interface AnalyticsDataset {
    rows: AnalyticsCallRow[];
    totalCalls: number;
    skippedNoManager: number;
}

/** Поля строки, общие для полной и лёгкой выборок. */
type AnalyticsRowBase = Pick<
    AnalyticsCallRow,
    | 'transcriptionId'
    | 'callStartedAt'
    | 'durationSec'
    | 'managerId'
    | 'callType'
>;

/** Минимум транскрипции для базовых полей (есть и в полном, и в lite-view). */
interface TranscriptionSource {
    id: string;
    callStartedAt: Date | null;
    durationSec: string | null;
    userId: string | null;
}

/** Распакованные ais-записи одного звонка. */
interface CallAiRecords {
    records: AiEntityDto[];
    analysis: Record<string, unknown> | null;
    classification: Record<string, unknown> | null;
}

/**
 * Выборка сырья для отчётов: transcriptions за период (по call_started_at)
 * + связанные ais-записи (агент/классификатор), затем фильтры запроса
 * (менеджер(ы), длительность, тип звонка). Только чтение, без
 * Bitrix-вызовов — отчёты строятся из накопленных данных.
 *
 * load — полные user_result для агрегаторов отчётов; loadLite — без
 * текста транскрипта и с проекцией разбора (AI-аналитика ОП).
 */
@Injectable()
export class CallReportAnalyticsDataService {
    private readonly logger = new Logger(CallReportAnalyticsDataService.name);

    constructor(
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
    ) {}

    async load(query: CallReportAnalyticsQueryDto): Promise<AnalyticsDataset> {
        const started = Date.now();
        const transcriptions = await this.transcriptionStore.findDoneInPeriod(
            query.domain,
            new Date(query.from),
            new Date(query.to),
        );
        const aiByTranscription = await this.loadAiRecords(
            transcriptions.map(row => row.id),
        );
        const candidates = transcriptions.map((row): AnalyticsCallRow => {
            const ai = this.unpackAi(aiByTranscription.get(row.id) ?? []);
            return {
                ...this.baseRow(row, ai),
                analysis: ai.analysis,
                classification: ai.classification,
            };
        });
        const result = filterAnalyticsRows(candidates, query);
        this.logOutcome(
            'Выборка отчёта',
            query,
            transcriptions.length,
            result,
            started,
        );
        return { ...result, totalCalls: transcriptions.length };
    }

    /**
     * Лёгкая выборка для AI-аналитики ОП (пульс / повестка / дайджест):
     * транскрипции БЕЗ текста (select нужных колонок) + только нужные поля
     * разбора (см. AnalyticsCallLiteRow). Фильтры — те же, что у load.
     */
    async loadLite(
        query: CallReportAnalyticsQueryDto,
    ): Promise<AnalyticsLiteDataset> {
        const started = Date.now();
        const transcriptions =
            await this.transcriptionStore.findDoneInPeriodLite(
                query.domain,
                new Date(query.from),
                new Date(query.to),
            );
        const aiByTranscription = await this.loadAiRecords(
            transcriptions.map(row => row.id),
        );
        const candidates = transcriptions.map((row): AnalyticsCallLiteRow => {
            const ai = this.unpackAi(aiByTranscription.get(row.id) ?? []);
            return {
                ...this.baseRow(row, ai),
                ...mapLiteAnalysis(ai.analysis),
            };
        });
        const result = filterAnalyticsRows(candidates, query);
        this.logOutcome(
            'Лёгкая выборка',
            query,
            transcriptions.length,
            result,
            started,
        );
        return { ...result, totalCalls: transcriptions.length };
    }

    /** Идентификаторы, время, менеджер и итоговый тип звонка. */
    private baseRow(
        row: TranscriptionSource,
        ai: CallAiRecords,
    ): AnalyticsRowBase {
        return {
            transcriptionId: row.id,
            callStartedAt: row.callStartedAt,
            durationSec: row.durationSec ? Number(row.durationSec) : null,
            managerId: row.userId,
            callType: this.resolveCallType(ai),
        };
    }

    /**
     * Тип звонка: анализ агента (видел полный контекст) → user_result
     * классификатора → его result (код типа).
     */
    private resolveCallType(ai: CallAiRecords): string | null {
        return (
            asString(ai.analysis?.callType) ??
            asString(ai.classification?.callType) ??
            ai.records.find(
                record => record.type === CALL_CLASSIFY_TYPE && record.result,
            )?.result ??
            null
        );
    }

    private unpackAi(records: AiEntityDto[]): CallAiRecords {
        return {
            records,
            analysis: this.pickUserResult(records, AGENT_ANALYSIS_TYPE),
            classification: this.pickUserResult(records, CALL_CLASSIFY_TYPE),
        };
    }

    /** ais-записи порциями (IN по transcription_id ограничен). */
    private async loadAiRecords(
        transcriptionIds: string[],
    ): Promise<Map<string, AiEntityDto[]>> {
        const byTranscription = new Map<string, AiEntityDto[]>();
        for (let i = 0; i < transcriptionIds.length; i += AI_BATCH_SIZE) {
            const batch = transcriptionIds.slice(i, i + AI_BATCH_SIZE);
            const records = await this.aiService.findByTranscriptionIds(batch);
            for (const record of records) {
                const key = String(record.transcription_id);
                const list = byTranscription.get(key) ?? [];
                list.push(record);
                byTranscription.set(key, list);
            }
        }
        return byTranscription;
    }

    /** user_result первой записи типа (объект или null). */
    private pickUserResult(
        records: AiEntityDto[],
        type: string,
    ): Record<string, unknown> | null {
        const record = records.find(item => item.type === type);
        return asRecord(record?.user_result);
    }

    private logOutcome(
        label: string,
        query: CallReportAnalyticsQueryDto,
        totalCalls: number,
        result: AnalyticsFilterResult<unknown>,
        started: number,
    ): void {
        this.logger.log(
            `${label} (${query.domain}, ${query.from}..${query.to}): ` +
                `всего ${totalCalls}, после фильтров ${result.rows.length}, ` +
                `без менеджера отброшено ${result.skippedNoManager}, ` +
                `${Date.now() - started}мс`,
        );
        if (totalCalls === 0) {
            // Диагностика пустого отчёта: чаще всего это не баг, а отсутствие
            // обработанных звонков домена в БД этого окружения.
            this.logger.warn(
                `Период пуст: нет done-строк автоконвейера для ${query.domain}. ` +
                    `Проверьте, что конвейер работал в этом окружении ` +
                    `(POST /call-report/analyze или cron-скан) и период верный.`,
            );
        } else if (result.rows.length === 0) {
            this.logger.warn(
                `Все ${totalCalls} звонков отсеяны фильтрами ` +
                    `(managerId=${query.managerId ?? '—'}, ` +
                    `managerIds=${query.managerIds?.join(',') ?? '—'}, ` +
                    `callType=${query.callType ?? '—'}, ` +
                    `duration=${query.minDurationSec ?? 0}..${query.maxDurationSec ?? '∞'}). ` +
                    `Попробуйте без фильтров, чтобы увидеть распределение.`,
            );
        }
    }
}
