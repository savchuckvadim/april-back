import { Injectable } from '@nestjs/common';
import { IBXDeal } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx/pbx.service';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import {
    TakeoverPreviewDealDto,
    TakeoverPreviewDealKind,
    TakeoverPreviewDto,
} from '../../dto/response/takeover-preview.dto';
import { EventReportContext } from '../context/event-report.context';
import { dealUserName, positiveId } from '../deal/deal-notice.util';
import { EventReportInitService } from '../init/event-report-init.service';
import { EventReportSettingsResolver } from '../settings/event-report-settings.resolver';
import { ClientTakeoverFlowService } from './client-takeover.flow';
import { TakeoverSmartsResolver } from './takeover-smarts.resolver';
import { takeoverOptionsFor } from './takeover.settings';

const NO_PREVIEW: TakeoverPreviewDto = {
    ask: false,
    takenDeal: null,
    closeDeals: [],
    movedTasks: 0,
    closedTasks: 0,
    closedPresentations: 0,
    closedZpr: 0,
    protectedDeals: [],
};

/**
 * Предпросмотр перехвата клиента для вопроса «Забрать работу коллег себе?».
 *
 * Тот же расчёт, что при отправке (init отчёта + сборщик чужой работы),
 * как будто менеджер уже ответил «Забрать себе», — но без единой записи в
 * Битрикс. Спрашивать нужно, только если на портале включены перехват и
 * подтверждение и у клиента действительно есть чужая работа.
 *
 * Bitrix-инстанс домена живёт внутри вызова — в полях сервиса его нет.
 */
@Injectable()
export class EventReportTakeoverPreviewService {
    constructor(
        private readonly pbx: PBXService,
        private readonly initService: EventReportInitService,
        private readonly settings: EventReportSettingsResolver,
        private readonly smarts: TakeoverSmartsResolver,
    ) {}

    async preview(dto: EventSalesFlowDto): Promise<TakeoverPreviewDto> {
        const settings = await this.settings.takeoverSettings(dto.domain);
        if (!settings.force || !settings.confirm) return NO_PREVIEW;

        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);
        const init = await this.initService.loadContext(
            dto,
            bitrix,
            portal,
            takeoverOptionsFor(settings, true),
        );
        const ctx = new EventReportContext(dto, portal, init);
        const takeover = ctx.takeover;
        if (!takeover || takeover.mode !== 'force') return NO_PREVIEW;

        const flow = new ClientTakeoverFlowService(
            bitrix,
            portal,
            await this.smarts.resolve(dto.domain),
            false,
        );
        await flow.read(ctx);
        const plan = flow.getPlan();

        const names = new Map<number, string>();
        const view = async (
            deal: IBXDeal,
            kind: TakeoverPreviewDealKind,
        ): Promise<TakeoverPreviewDealDto> => {
            const ownerId = positiveId(deal.ASSIGNED_BY_ID);
            if (ownerId && !names.has(ownerId)) {
                names.set(ownerId, await dealUserName(bitrix, ownerId));
            }
            return {
                id: positiveId(deal.ID) ?? 0,
                title:
                    String(deal.TITLE ?? '').trim() ||
                    `Сделка #${String(deal.ID)}`,
                ownerName: ownerId
                    ? (names.get(ownerId) ?? `сотрудник #${ownerId}`)
                    : 'без ответственного',
                kind,
            };
        };

        const preview: TakeoverPreviewDto = {
            ask: false,
            takenDeal: takeover.takenDeal
                ? await view(takeover.takenDeal, 'base')
                : null,
            closeDeals: await Promise.all(
                plan.closeDeals.map(({ deal, role }) => view(deal, role)),
            ),
            movedTasks: plan.reassignTaskIds.length,
            closedTasks: plan.completeTaskIds.length,
            closedPresentations: plan.closePresIds.length,
            closedZpr: plan.closeZprIds.length,
            protectedDeals: await Promise.all(
                takeover.protectedDeals.map(deal => view(deal, 'base')),
            ),
        };
        preview.ask = Boolean(
            preview.takenDeal ||
                preview.closeDeals.length ||
                preview.closedTasks ||
                preview.closedPresentations ||
                preview.closedZpr ||
                preview.protectedDeals.length,
        );
        return preview;
    }
}
