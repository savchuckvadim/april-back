import { Injectable } from '@nestjs/common';
import { CallPageLinkService, TranscriptionStoreService } from '@lib/call-lib';
import {
    isManagerVisible,
    type RequesterAccess,
} from '../domain/access/perimeter.util';
import { CALL_PAGE_LINKS_MAX } from './call-page.const';

/** Ссылка на страницу разбора одного звонка. */
export interface CallPageLinkItem {
    transcriptionId: string;
    url: string;
}

/**
 * Ссылки на страницы разбора для списка звонков в приложении «Отчёт».
 * Ссылка-пропуск открывает звонок без входа, поэтому выдаётся только на
 * звонки своего портала и только тех менеджеров, которых пользователь
 * вправе видеть на витрине. Остальные номера молча пропускаются: по ответу
 * нельзя понять, существует ли чужой звонок.
 *
 * Только чтение базы; к Битриксу не обращается. `@Injectable` без состояния.
 */
@Injectable()
export class CallPageLinksUseCase {
    constructor(
        private readonly transcriptions: TranscriptionStoreService,
        private readonly links: CallPageLinkService,
    ) {}

    async execute(
        domain: string,
        transcriptionIds: readonly string[],
        access: RequesterAccess,
    ): Promise<CallPageLinkItem[]> {
        const ids = [...new Set(transcriptionIds)].slice(
            0,
            CALL_PAGE_LINKS_MAX,
        );
        if (ids.length === 0) return [];
        const rows = await this.transcriptions.findLiteByIds(domain, ids);
        const allowed = rows
            .filter(row => isManagerVisible(access, row.userId))
            .map(row => row.id);
        if (allowed.length === 0) return [];
        const urls = await this.links.urlsFor(domain, allowed);
        // Порядок — как в запросе: фронту удобнее сопоставлять.
        return ids.flatMap(transcriptionId => {
            const url = urls.get(transcriptionId);
            return url ? [{ transcriptionId, url }] : [];
        });
    }
}
