import { Injectable, NotFoundException } from '@nestjs/common';
import {
    AiEntityDto,
    CallPageLinkService,
    TranscriptionStoreService,
    type TranscriptionPipelineView,
} from '@lib/call-lib';
import { CALL_PAGE_MESSAGES } from './call-page.const';

/** Звонок, на который ведёт проверенная ссылка. */
export interface CallPageCall {
    row: TranscriptionPipelineView;
    domain: string;
    /** Все записи `ais` звонка (разбор, метка ссылки и прочие). */
    records: AiEntityDto[];
}

/**
 * Звонок по ссылке-пропуску. Любая причина отказа — подпись не сошлась,
 * ссылка отозвана, строки расшифровки нет — отвечает одинаково: «ссылка
 * недействительна», чтобы по ответу нельзя было перебирать звонки.
 */
@Injectable()
export class CallPageCallResolver {
    constructor(
        private readonly links: CallPageLinkService,
        private readonly transcriptions: TranscriptionStoreService,
    ) {}

    async resolve(token: string): Promise<CallPageCall> {
        const link = await this.links.resolve(token);
        const row = link
            ? await this.transcriptions
                  .findPipelineById(link.transcriptionId)
                  .catch(() => null)
            : null;
        if (!link || !row?.domain) {
            throw new NotFoundException(CALL_PAGE_MESSAGES.invalidLink);
        }
        return { row, domain: row.domain, records: link.records };
    }
}
