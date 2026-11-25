import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { hidesEveryCommonReportTab } from '@lib/portal-lib/store/app-settings';
import { CallListPointsProvider } from '../ai-analytics/calls/calls-list-points.provider';
import { RequesterAccessService } from '../ai-analytics/domain/access/requester-access.service';
import type { AiRequestBaseDto } from '../ai-analytics/dto/ai-request-base.dto';
import type { PortalViewSaveRequestDto } from './dto/portal-view-request.dto';
import type { PortalViewResponseDto } from './dto/portal-view.dto';
import { PORTAL_VIEW_MESSAGES } from './portal-view.const';
import { PortalViewAuthorReader } from './portal-view.author.reader';
import { buildViewOptions } from './portal-view.options.util';
import { PortalViewReader } from './portal-view.reader';
import { PortalViewSupportUrlReader } from './portal-view.support-url.reader';
import type { PortalViewChanges, PortalViewState } from './portal-view.types';
import {
    changeFields,
    hasChanges,
    mayEditView,
    normalizeTabsHidden,
    toSettingsPatch,
    uniqueList,
    unknownGeneralBadgeIds,
} from './portal-view.util';
import { PortalViewWriter } from './portal-view.writer';

/**
 * Запрос сохранения → изменения без повторов. Неизвестный общий бейдж —
 * 400: так опечатка во фронте не уходит в настройку молча. Пункты методики
 * («m:…») остаются как есть — методика портала может смениться. Скрыть
 * сразу все вкладки, которые видят все сотрудники, нельзя — тоже 400: у
 * сотрудника без прав на остальные вкладки не осталось бы ни одной.
 */
function toChanges(request: PortalViewSaveRequestDto): PortalViewChanges {
    const badgesMain =
        request.badgesMain === undefined
            ? undefined
            : uniqueList(request.badgesMain);
    if (badgesMain && unknownGeneralBadgeIds(badgesMain).length > 0) {
        throw new BadRequestException(PORTAL_VIEW_MESSAGES.unknownBadge);
    }
    const tabsHidden =
        request.tabsHidden === undefined
            ? undefined
            : normalizeTabsHidden(request.tabsHidden);
    if (tabsHidden && hidesEveryCommonReportTab(tabsHidden)) {
        throw new BadRequestException(PORTAL_VIEW_MESSAGES.noCommonTab);
    }
    return {
        ...(tabsHidden === undefined ? {} : { tabsHidden }),
        ...(request.chartsEnabled === undefined
            ? {}
            : { chartsEnabled: request.chartsEnabled }),
        ...(badgesMain === undefined ? {} : { badgesMain }),
    };
}

/**
 * «Настройки отчёта» портала: чтение (любой пользователь) и сохранение
 * (руководитель группы и выше, суперпользователь). Настройки общие на
 * портал и управляют всем отчётом KPI, не только вкладкой AI, поэтому
 * права берутся из структуры продаж, а не из включённости AI-аналитики.
 */
@Injectable()
export class PortalViewUseCase {
    private readonly logger = new Logger(PortalViewUseCase.name);

    constructor(
        private readonly access: RequesterAccessService,
        private readonly reader: PortalViewReader,
        private readonly writer: PortalViewWriter,
        private readonly author: PortalViewAuthorReader,
        private readonly supportUrl: PortalViewSupportUrlReader,
        private readonly points: CallListPointsProvider,
    ) {}

    async get(request: AiRequestBaseDto): Promise<PortalViewResponseDto> {
        const [access, view] = await Promise.all([
            this.access.resolve(request.domain, request.requesterUserId),
            this.reader.read(request.domain),
        ]);
        return this.present(request.domain, view, mayEditView(access));
    }

    async save(
        request: PortalViewSaveRequestDto,
    ): Promise<PortalViewResponseDto> {
        const { domain, requesterUserId } = request;
        const access = await this.access.resolve(domain, requesterUserId);
        if (!mayEditView(access)) {
            throw new ForbiddenException(PORTAL_VIEW_MESSAGES.forbidden);
        }
        const changes = toChanges(request);
        // Пустой запрос ничего не меняет и не должен ставить подпись «менял».
        if (!hasChanges(changes)) {
            return this.present(domain, await this.reader.read(domain), true);
        }

        const updatedBy = await this.author.nameOf(domain, requesterUserId);
        const view = await this.writer.write(
            domain,
            toSettingsPatch(changes, {
                updatedBy,
                updatedAt: new Date().toISOString(),
            }),
        );
        this.logger.log(
            `Вид отчёта портала ${domain} изменён: ${updatedBy} (id ${requesterUserId}), ` +
                `поля: ${changeFields(changes).join(', ')}`,
        );
        return this.present(domain, view, true);
    }

    private async present(
        domain: string,
        view: PortalViewState,
        canEdit: boolean,
    ): Promise<PortalViewResponseDto> {
        const [supportUrl, points] = await Promise.all([
            this.supportUrl.read(),
            this.points.forDomain(domain),
        ]);
        return {
            view,
            canEdit,
            supportUrl,
            options: buildViewOptions(points),
        };
    }
}
