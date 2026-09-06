import { Injectable, Logger } from '@nestjs/common';
import { AGENT_ANALYSIS_TYPE, AiService } from '@lib/call-lib';
import { PbxAicallSmartService } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { buildSmartItemLink } from '../presenter/smart-link.util';

/**
 * Ссылки на карточки разборов для звонков повестки: entityTypeId смарта
 * «AI-анализ звонков» (PbxAicallSmartService, как в weekly-report) +
 * report_item_id ais-записи agent-analysis по transcription_id — элемент
 * смарта, созданный конвейером по этому звонку.
 *
 * Fail-open: смарт не установлен / ais не читается → link = null у всех.
 */
@Injectable()
export class SmartLinkLoader {
    private readonly logger = new Logger(SmartLinkLoader.name);

    constructor(
        private readonly aicallSmart: PbxAicallSmartService,
        private readonly aiService: AiService,
    ) {}

    async resolveLinks(
        domain: string,
        transcriptionIds: readonly string[],
    ): Promise<Map<string, string | null>> {
        const links = new Map<string, string | null>(
            transcriptionIds.map(id => [id, null]),
        );
        if (!transcriptionIds.length) return links;
        try {
            const entityTypeId = await this.resolveEntityTypeId(domain);
            if (!entityTypeId) return links;
            const records = await this.aiService.findByTranscriptionIds([
                ...transcriptionIds,
            ]);
            for (const record of records) {
                if (record.type !== AGENT_ANALYSIS_TYPE) continue;
                const itemId = Number(record.report_item_id);
                if (!Number.isInteger(itemId) || itemId <= 0) continue;
                links.set(
                    record.transcription_id,
                    buildSmartItemLink(domain, entityTypeId, itemId),
                );
            }
        } catch (error) {
            this.logger.warn(
                `Ссылки на разборы (${domain}) не построены: ${(error as Error).message}`,
            );
        }
        return links;
    }

    private async resolveEntityTypeId(domain: string): Promise<number | null> {
        const info = await this.aicallSmart.resolveInfo(domain);
        return info?.entityTypeId ?? null;
    }
}
