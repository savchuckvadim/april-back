import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { IBXDeal } from '@/modules/bitrix';
import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
} from '../../types/report-types';
import { normalizeEventReportEventType } from '../../types/event-report.event-codes';
import {
    composeStageId,
    detectEventFromBaseStage,
    getSalesBaseTargetStageCode,
} from '../deal/deal-target-stage.calculator';
import {
    StagePredictRequestDto,
    StagePredictResponseDto,
} from '../../dto/stage-predict/stage-predict.dto';

/**
 * Предикт стадии основной воронки — ДО отправки отчёта.
 *
 * Переиспользует РОВНО те же кирпичи, что реальный flow:
 * `getSalesBaseTargetStageCode` (лестница), `detectEventFromBaseStage`
 * (текущая ступень), `normalizeEventReportEventType` (алфавит кодов) и тот
 * же приоритет сделки плейсмента при выборе базовой (init). Дублей логики
 * нет — предикт не может разъехаться с прогоном.
 *
 * Это UX-хинт для чек-листов, не гарантия: сделку мог двинуть другой
 * процесс между предиктом и отправкой — flow пересчитает сам.
 */
@Injectable()
export class StagePredictService {
    private readonly logger = new Logger(StagePredictService.name);

    constructor(
        private readonly pbx: PBXService,
        // Правило «Доработка всегда» живёт в настройках портала: предикт
        // обязан читать ту же настройку, что и прогон, иначе модалки и
        // `willChange` врали бы ровно на этом исключении. Redis-кэш сервиса
        // настроек держит чтение дешёвым — предикт зовётся на каждую смену
        // плана.
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    async predict(
        dto: StagePredictRequestDto,
    ): Promise<StagePredictResponseDto> {
        const empty: StagePredictResponseDto = {
            baseDealId: null,
            currentStageCode: null,
            targetStageCode: null,
            targetStageBitrixId: null,
            willChange: false,
        };

        // Чистый лид: сделки не создаются и не двигаются (LEAD_ONLY).
        if (!dto.context.companyId && !dto.context.dealId) return empty;

        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);
        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) return empty;

        const [baseDeal, refineStageOnPlan] = await Promise.all([
            this.findCurrentBaseDeal(bitrix, category, dto.context),
            this.resolveRefineStageOnPlan(dto.domain),
        ]);

        const currentStage = this.stageByStageId(category, baseDeal?.STAGE_ID);
        const targetStageBitrixId = getSalesBaseTargetStageCode({
            category,
            currentStageEvent: detectEventFromBaseStage(
                category,
                baseDeal?.STAGE_ID,
            ),
            planEventType: dto.planEventType
                ? normalizeEventReportEventType(dto.planEventType)
                : null,
            reportEventType: dto.reportEventType
                ? normalizeEventReportEventType(dto.reportEventType)
                : null,
            isResult: dto.resultStatus === EnumEventItemResultType.RESULT,
            isUnplanned: Boolean(dto.isUnplannedPresentation),
            isSuccess: dto.workStatusCode === EnumWorkStatusCode.success,
            isFail: dto.workStatusCode === EnumWorkStatusCode.fail,
            isNoResult: dto.resultStatus === EnumEventItemResultType.NORESULT,
            isNotCa: Boolean(dto.isNotCa),
            refineStageOnPlan,
        });

        const targetStage = targetStageBitrixId
            ? (category.stages.find(
                  stage => stage.bitrixId === targetStageBitrixId,
              ) ?? null)
            : null;

        const response: StagePredictResponseDto = {
            baseDealId: baseDeal ? Number(baseDeal.ID) : null,
            currentStageCode: currentStage?.code ?? null,
            targetStageCode: targetStage?.code ?? null,
            targetStageBitrixId: targetStageBitrixId
                ? composeStageId(category.bitrixId, targetStageBitrixId)
                : null,
            willChange: Boolean(
                targetStage && targetStage.code !== currentStage?.code,
            ),
        };
        this.logger.log(
            `stage-predict: ${dto.domain} co=${dto.context.companyId ?? '-'} ` +
                `deal=${dto.context.dealId ?? '-'} → base=${response.baseDealId} ` +
                `${response.currentStageCode ?? '∅'} → ${response.targetStageCode ?? '∅'}`,
        );
        return response;
    }

    /**
     * `refine_stage_on_plan_enabled` портала; настройки недоступны — false,
     * то есть дефолт схемы: лестница как всегда, без исключения.
     */
    private async resolveRefineStageOnPlan(domain: string): Promise<boolean> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return Boolean(settings.withRefineStageOnPlan);
        } catch (error) {
            this.logger.warn(
                `stage-predict: настройки ${domain} недоступны — правило ` +
                    `«Доработка всегда» выключено (${(error as Error).message})`,
            );
            return false;
        }
    }

    /**
     * Текущая базовая сделка: открытые сделки категории по компании,
     * сделка плейсмента в приоритете над первой по списку — тот же порядок,
     * что в EventReportInitService (инцидент «отказ закрыл чужую сделку»).
     *
     * Правило владельца (25.08), зеркально init: при переданном
     * `context.responsibleId` автоподбор идёт только среди сделок ЭТОГО
     * сотрудника (`ASSIGNED_BY_ID` числом — REST отдаёт строки); чужая
     * открытая молча не подхватывается. Сделка плейсмента — явный контекст,
     * она вне фильтра. Без responsibleId (легаси-фронт) — как раньше.
     */
    private async findCurrentBaseDeal(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        category: IPCategory,
        context: StagePredictRequestDto['context'],
    ): Promise<IBXDeal | null> {
        const select = [
            'ID',
            'STAGE_ID',
            'CATEGORY_ID',
            'CLOSED',
            'ASSIGNED_BY_ID',
        ];
        let companyId = context.companyId ?? null;

        // Сделка без компании в контексте: смотрим на неё саму; заодно
        // добираем компанию из её COMPANY_ID (менеджер мог привязать её
        // после открытия фрейма).
        let placementDeal: IBXDeal | null = null;
        if (context.dealId) {
            const response = await bitrix.deal.get(context.dealId, [
                ...select,
                'COMPANY_ID',
            ]);
            placementDeal = (response?.result as IBXDeal | undefined) ?? null;
            const dealCompanyId = Number(
                (placementDeal as Record<string, unknown> | null)?.[
                    'COMPANY_ID'
                ] ?? 0,
            );
            if (!companyId && dealCompanyId > 0) companyId = dealCompanyId;
        }

        const isActiveBase = (deal: IBXDeal | null): deal is IBXDeal =>
            Boolean(
                deal &&
                    (deal as Record<string, unknown>)['CLOSED'] !== 'Y' &&
                    String(deal.CATEGORY_ID) === String(category.bitrixId),
            );

        if (!companyId)
            return isActiveBase(placementDeal) ? placementDeal : null;

        const listResponse = await bitrix.deal.getList(
            {
                COMPANY_ID: String(companyId),
                CATEGORY_ID: String(category.bitrixId),
                CLOSED: 'N',
            } as Partial<IBXDeal>,
            select,
        );
        const deals = (listResponse?.result ?? []).filter(
            deal => (deal as Record<string, unknown>)['CLOSED'] !== 'Y',
        );

        const preferred = context.dealId
            ? deals.find(deal => String(deal.ID) === String(context.dealId))
            : undefined;
        if (preferred) return preferred;

        // Автоподбор — только «свои» сделки (правило владельца 25.08).
        const responsibleId = Number(context.responsibleId ?? 0);
        const candidates =
            responsibleId > 0
                ? deals.filter(
                      deal =>
                          Number(
                              (deal as Record<string, unknown>)[
                                  'ASSIGNED_BY_ID'
                              ],
                          ) === responsibleId,
                  )
                : deals;
        return candidates[0] ?? null;
    }

    private stageByStageId(
        category: IPCategory,
        stageId: string | null | undefined,
    ) {
        if (!stageId) return null;
        const bitrixId = stageId.includes(':')
            ? stageId.split(':')[1]
            : stageId;
        return (
            category.stages.find(stage => stage.bitrixId === bitrixId) ?? null
        );
    }
}
