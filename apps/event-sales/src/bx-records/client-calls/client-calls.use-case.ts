import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    activeAnalysisByTranscription,
    AiService,
    CallPageLinkService,
    TranscriptionCallStateService,
} from '@lib/call-lib';
import { BxRecordsByCompanyRequestDto } from '../dto/bx-records.dto';
import { ClientCallsDto } from '../dto/client-calls.dto';
import { ActivitiesService } from '../services/activities.service';
import { CompanyRelationsService } from '../services/company-relations.service';
import { recordedCallsOf } from './client-call-activity.util';
import { CLIENT_CALLS_LIMIT } from './client-calls.const';
import { presentClientCalls } from './client-calls.presenter';
import type { ClientCallActivity } from './client-calls.types';

/**
 * Звонки клиента для формы отчёта: записи собираются по всем связям клиента
 * (компания, её контакты, сделки и лиды), к каждой добавляется состояние
 * разбора и его короткий итог. Адреса файлов в Битриксе не отдаются.
 *
 * Инстанс Битрикса берётся на запрос и в сервисе не хранится.
 */
@Injectable()
export class ClientCallsUseCase {
    private readonly logger = new Logger(ClientCallsUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly callStates: TranscriptionCallStateService,
        private readonly aiService: AiService,
        private readonly pageLinks: CallPageLinkService,
    ) {}

    async list(dto: BxRecordsByCompanyRequestDto): Promise<ClientCallsDto> {
        const recorded = await this.recordedCalls(dto);
        const calls = recorded.slice(0, CLIENT_CALLS_LIMIT);
        const states = await this.callStates.byActivity(
            dto.domain,
            calls.map(call => call.activityId),
        );
        const doneIds = [...states.values()]
            .filter(state => state.status === 'done')
            .map(state => state.id);
        const analyses = await this.analysesOf(doneIds);
        return presentClientCalls({
            calls,
            total: recorded.length,
            states,
            analyses,
            pageUrls: await this.pageUrlsOf(dto.domain, [...analyses.keys()]),
            now: new Date(),
        });
    }

    /** Звонки клиента с записью по всем его связям, свежие первыми. */
    private async recordedCalls(
        dto: BxRecordsByCompanyRequestDto,
    ): Promise<ClientCallActivity[]> {
        const { bitrix } = await this.pbx.init(dto.domain);
        const relations = await new CompanyRelationsService(
            bitrix,
        ).getRelationsIds(dto.companyId, dto.contactIds);
        const activities = await new ActivitiesService(bitrix).getActivities(
            dto.companyId,
            relations.contactsIds,
            relations.leadsIds,
            relations.dealsIds,
        );
        return recordedCallsOf(activities);
    }

    /** Нагрузка действующего разбора по номеру расшифровки. */
    private async analysesOf(
        transcriptionIds: string[],
    ): Promise<Map<string, unknown>> {
        const analyses = new Map<string, unknown>();
        if (transcriptionIds.length === 0) return analyses;
        const records =
            await this.aiService.findByTranscriptionIds(transcriptionIds);
        for (const [id, record] of activeAnalysisByTranscription(records)) {
            analyses.set(id, record.user_result as unknown);
        }
        return analyses;
    }

    /** Адреса страниц разбора; не получены — список отдаётся без них. */
    private async pageUrlsOf(
        domain: string,
        transcriptionIds: string[],
    ): Promise<Map<string, string>> {
        try {
            return await this.pageLinks.urlsFor(domain, transcriptionIds);
        } catch (error) {
            this.logger.warn(
                `Адреса страниц разбора не получены (${domain}): ${(error as Error).message}`,
            );
            return new Map();
        }
    }
}
