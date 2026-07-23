import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/services/ai.service';
import { AiEntityDto } from '../../ai/dto/ai-entity.dto';
import { TranscriptionStoreService } from '../../transcription/services/transcription.store.service';
import { CallReportAnalyticsQueryDto } from '../dto/call-report-analytics-query.dto';

/** Типы ais-записей конвейера, используемые отчётами. */
const AGENT_ANALYSIS_TYPE = 'agent-analysis';
const CALL_CLASSIFY_TYPE = 'call-classify';

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

/**
 * Выборка сырья для отчётов: transcriptions за период (по call_started_at)
 * + связанные ais-записи (агент/классификатор), затем фильтры запроса
 * (менеджер, длительность, тип звонка). Только чтение, без Bitrix-вызовов —
 * отчёты строятся из накопленных данных.
 */
@Injectable()
export class CallReportAnalyticsDataService {
    private readonly logger = new Logger(CallReportAnalyticsDataService.name);

    constructor(
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
    ) {}

    async load(query: CallReportAnalyticsQueryDto): Promise<AnalyticsDataset> {
        const from = new Date(query.from);
        const to = new Date(query.to);
        const started = Date.now();

        const transcriptions = await this.transcriptionStore.findDoneInPeriod(
            query.domain,
            from,
            to,
        );
        const totalCalls = transcriptions.length;

        const aiByTranscription = await this.loadAiRecords(
            transcriptions.map(row => row.id),
        );

        let skippedNoManager = 0;
        const rows: AnalyticsCallRow[] = [];
        for (const row of transcriptions) {
            const records = aiByTranscription.get(row.id) ?? [];
            const analysis = this.pickUserResult(records, AGENT_ANALYSIS_TYPE);
            const classification = this.pickUserResult(
                records,
                CALL_CLASSIFY_TYPE,
            );
            const callType =
                this.asString(analysis?.callType) ??
                this.asString(classification?.callType) ??
                records.find(
                    record =>
                        record.type === CALL_CLASSIFY_TYPE && record.result,
                )?.result ??
                null;

            const flat: AnalyticsCallRow = {
                transcriptionId: row.id,
                callStartedAt: row.callStartedAt,
                durationSec: row.durationSec ? Number(row.durationSec) : null,
                managerId: row.userId,
                callType,
                analysis,
                classification,
            };

            if (!this.passesFilters(flat, query)) {
                if (query.managerId !== undefined && flat.managerId === null) {
                    skippedNoManager++;
                }
                continue;
            }
            rows.push(flat);
        }

        this.logger.log(
            `Выборка отчёта (${query.domain}, ${query.from}..${query.to}): ` +
                `всего ${totalCalls}, после фильтров ${rows.length}, ` +
                `без менеджера отброшено ${skippedNoManager}, ` +
                `${Date.now() - started}мс`,
        );
        return { rows, totalCalls, skippedNoManager };
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
        const raw: unknown = record?.user_result;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            return raw as Record<string, unknown>;
        }
        return null;
    }

    private passesFilters(
        row: AnalyticsCallRow,
        query: CallReportAnalyticsQueryDto,
    ): boolean {
        if (
            query.managerId !== undefined &&
            row.managerId !== query.managerId
        ) {
            return false;
        }
        if (
            query.minDurationSec !== undefined &&
            (row.durationSec === null || row.durationSec < query.minDurationSec)
        ) {
            return false;
        }
        if (
            query.maxDurationSec !== undefined &&
            (row.durationSec === null || row.durationSec > query.maxDurationSec)
        ) {
            return false;
        }
        if (query.callType !== undefined && row.callType !== query.callType) {
            return false;
        }
        return true;
    }

    private asString(value: unknown): string | null {
        return typeof value === 'string' && value ? value : null;
    }
}
