import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiService } from '../../ai/services/ai.service';
import {
    CallReportAnalyticsKind,
    CallReportAnalyticsQueryDto,
} from '../dto/call-report-analytics-query.dto';

/** app-метка записей истории отчётов в ais. */
const HISTORY_APP = 'call-report-analytics';

/**
 * История построенных отчётов — снапшоты в таблице ais (без миграций):
 * type = report-<вид>, user_result = полный JSON отчёта, result — короткая
 * сводка для списков. По этим снапшотам строится динамика «куда движемся»
 * (тренды за большие периоды, см. раздел 5.6 плана оптимизации).
 */
@Injectable()
export class CallReportAnalyticsHistoryService {
    private readonly logger = new Logger(
        CallReportAnalyticsHistoryService.name,
    );

    constructor(private readonly aiService: AiService) {}

    /**
     * Сохраняет снапшот отчёта; ошибка сохранения НЕ роняет ответ
     * (отчёт уже построен — история вторична). Возвращает id записи
     * или null.
     */
    async save(
        kind: CallReportAnalyticsKind,
        query: CallReportAnalyticsQueryDto,
        report: Record<string, unknown>,
    ): Promise<string | null> {
        try {
            const record = await this.aiService.create({
                provider: HISTORY_APP,
                model: 'code-aggregator',
                type: `report-${kind}`,
                status: 'done',
                result: `Отчёт ${kind} за ${query.from}..${query.to}`,
                user_result: JSON.parse(
                    JSON.stringify(report),
                ) as Prisma.JsonValue,
                domain: query.domain,
                app: HISTORY_APP,
            });
            const historyId = String(record.id);
            this.logger.log(
                `История отчёта сохранена: ${kind} (${query.domain}) → ais ${historyId}`,
            );
            return historyId;
        } catch (error) {
            this.logger.warn(
                `История отчёта ${kind} не сохранена: ${(error as Error).message}`,
            );
            return null;
        }
    }
}
