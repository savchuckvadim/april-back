import { Injectable, NotFoundException } from '@nestjs/common';
import { pickActiveAnalysis } from '@lib/call-lib';
import { PbxAicallSmartService } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { toCallEntityType } from '../domain/loaders/call-entity.loader';
import { buildSmartItemLink } from '../domain/presenter/smart-link.util';
import { readCallPageAnalysis } from './call-page-analysis.reader';
import {
    CallPageCallResolver,
    type CallPageCall,
} from './call-page-call.resolver';
import { CallPageManagerNameService } from './call-page-manager-name.service';
import { CALL_PAGE_MESSAGES } from './call-page.const';
import { presentCallPage } from './call-page.presenter';
import type { CallPageDto } from './dto/call-page.dto';

/** Карточка сделки, лида, компании или контакта звонка в Битрикс24. */
export function crmEntityUrl(
    domain: string,
    entityType: string | null,
    entityId: string | null,
): string | null {
    const type = toCallEntityType(entityType ?? '');
    const id = Number(entityId);
    if (type === null || !Number.isInteger(id) || id <= 0) return null;
    return `https://${domain}/crm/${type}/details/${id}/`;
}

/**
 * Страница разбора звонка по ссылке-пропуску: строка расшифровки, действующий
 * разбор, имя менеджера и ссылки в Битрикс — в готовую карточку.
 */
@Injectable()
export class CallPageUseCase {
    constructor(
        private readonly calls: CallPageCallResolver,
        private readonly managers: CallPageManagerNameService,
        private readonly aicallSmart: PbxAicallSmartService,
    ) {}

    async load(token: string): Promise<CallPageDto> {
        const call = await this.calls.resolve(token);
        const analysis = pickActiveAnalysis(call.records);
        const view = analysis
            ? readCallPageAnalysis(analysis.user_result as unknown)
            : null;
        if (analysis === null || view === null) {
            throw new NotFoundException(CALL_PAGE_MESSAGES.noAnalysis);
        }
        const [managerName, smartUrl] = await Promise.all([
            this.managers.nameOf(call.domain, call.row.userId),
            this.smartUrl(call, analysis.report_item_id),
        ]);
        return presentCallPage({
            call: {
                startedAt: call.row.callStartedAt,
                durationSec: call.row.durationSec,
                segments: call.row.segments,
                text: call.row.text,
                hasAudio: Number(call.row.activityId) > 0,
            },
            view,
            managerName,
            smartUrl,
            crmUrl: crmEntityUrl(
                call.domain,
                call.row.entityType,
                call.row.entityId,
            ),
        });
    }

    /** Карточка разбора в Битриксе; смарт не установлен или элемента нет — null. */
    private async smartUrl(
        call: CallPageCall,
        reportItemId: string | null | undefined,
    ): Promise<string | null> {
        const itemId = Number(reportItemId);
        if (!Number.isInteger(itemId) || itemId <= 0) return null;
        const info = await this.aicallSmart
            .resolveInfo(call.domain)
            .catch(() => null);
        return buildSmartItemLink(
            call.domain,
            info?.entityTypeId ?? null,
            itemId,
        );
    }
}
