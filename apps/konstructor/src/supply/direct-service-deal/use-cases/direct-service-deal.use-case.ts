import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { BitrixService, IBXCompany, IBXDeal } from '@lib/bitrix';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { DealFieldResolverService } from '../../../modules/deal-send/services/deal-field-resolver.service';
import { InnerDealService } from '../../../modules/inner-deal/services/inner-deal.service';
import { SupplyDealFlowService } from '../../init-deal/services/supply-deal-flow.service';
import { CopyComplectVariantsService } from '../../init-deal/services/copy-complect-variants.service';
import { CopyProductRowsService } from '../../init-deal/services/copy-product-rows.service';
import {
    DirectServiceDealDto,
    DirectServiceDealPrepareResponseDto,
    DirectServiceDealResponseDto,
} from '../dto/direct-service-deal.dto';

/**
 * Облегчённая поставка: сервисная сделка создаётся прямо из конструктора,
 * минуя заявку RPA.
 *
 * От robot-пути отличается только источником данных: там всё берётся из
 * карточки RPA, здесь — из формы конструктора и из сделки-источника. Сборка
 * полей, стадия по остатку срока договора, перевод ответственных, перенос
 * товарных строк, слепка и вариантов комплекта — тот же код, что у
 * `InitDealUseCase`.
 *
 * ЧЕГО ЗДЕСЬ НЕТ: задач ОРК. Они ставятся джобой по элементу RPA
 * (`SERVICE_ORK_SUPPLY_TASKS` ждёт `rpaTypeId`/`rpaId`), а в облегчённом пути
 * заявки не существует. Если задачи нужны и здесь — это отдельная работа.
 */
@Injectable()
export class DirectServiceDealUseCase {
    private readonly logger = new Logger(DirectServiceDealUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly innerDealService: InnerDealService,
    ) {}

    /** Что показать в форме: текущий рег-лист, компания, контакты, варианты. */
    async prepare(
        domain: string,
        sourceDealId: number,
    ): Promise<DirectServiceDealPrepareResponseDto> {
        const { bitrix } = await this.pbx.init(domain);

        const deal = await this.readDeal(bitrix, sourceDealId);
        const companyId = Number(deal?.COMPANY_ID) || null;

        let companyTitle: string | null = null;
        let currentRegistrationList: string | null = null;
        if (companyId) {
            const response = await bitrix.company.get(companyId);
            const company = response?.result as IBXCompany | undefined;
            companyTitle = company?.TITLE ?? null;
            currentRegistrationList = company?.UF_CRM_USER_CARDNUM ?? null;
        }

        const variants = await this.innerDealService.listVariants(
            domain,
            sourceDealId,
        );

        return {
            companyId,
            companyTitle,
            currentRegistrationList,
            contactIds: await this.readContactIds(bitrix, sourceDealId),
            variantsCount: variants.length,
        };
    }

    async execute(
        dto: DirectServiceDealDto,
    ): Promise<DirectServiceDealResponseDto> {
        const { bitrix, PortalModel } = await this.pbx.init(dto.domain);

        const category = PortalModel.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.service_base,
        );
        if (!category) {
            throw new BadRequestException(
                `На портале ${dto.domain} нет сервисной воронки сделок`,
            );
        }

        const sourceDeal = await this.readDeal(bitrix, dto.sourceDealId);
        if (!sourceDeal) {
            throw new BadRequestException(
                `Сделка ${dto.sourceDealId} не найдена на ${dto.domain}`,
            );
        }

        const supplyFlow = new SupplyDealFlowService(bitrix, PortalModel);
        const resolver = new DealFieldResolverService(PortalModel);
        const { fields, skipped } = resolver.resolve(dto.fields);

        let dealValues: Partial<IBXDeal> = { ...fields };
        // значения базовой сделки — только те, которых не задал менеджер
        dealValues = {
            ...dealValues,
            ...(await supplyFlow.buildBaseDealValues(
                dto.sourceDealId,
                dealValues,
            )),
        };
        // текущие документы у сервисной сделки свои
        dealValues = {
            ...dealValues,
            ...supplyFlow.buildClearedDocumentValues(),
        };

        dealValues.TITLE = sourceDeal.TITLE ?? '';
        dealValues.CATEGORY_ID = category.bitrixId;
        dealValues.COMPANY_ID = sourceDeal.COMPANY_ID ?? '';
        dealValues.ASSIGNED_BY_ID = String(dto.managerOsId);

        const stageId = supplyFlow.resolveStageIdByContractEnd(
            dto.contractEnd ?? null,
        );
        if (stageId) {
            dealValues.STAGE_ID = stageId;
        }

        const created = await bitrix.deal.set(dealValues);
        const newDealId = Number(created?.result);
        if (!Number.isFinite(newDealId) || newDealId <= 0) {
            throw new BadRequestException(
                `Bitrix не создал сервисную сделку на ${dto.domain}`,
            );
        }

        await new CopyProductRowsService(
            dto.sourceDealId,
            newDealId,
            bitrix,
        ).copyProductFromDealToDeal();

        const snapshot = await this.innerDealService.copySnapshot({
            domain: dto.domain,
            source: {
                kind: 'deal',
                dealId: dto.sourceDealId,
                serviceSmartId: null,
            },
            targetDealId: newDealId,
            userId: dto.managerOsId,
            department: 'service',
            force: true,
        });

        const variants = await new CopyComplectVariantsService(
            bitrix,
            PortalModel,
            this.innerDealService,
        ).copy(dto.domain, dto.sourceDealId, newDealId, dto.managerOsId);

        const contactIds =
            dto.contactIds ??
            (await this.readContactIds(bitrix, dto.sourceDealId));
        await supplyFlow.assignToServiceManager({
            managerOsId: dto.managerOsId,
            companyId: Number(sourceDeal.COMPANY_ID) || 0,
            registrationList: dto.companyRegistrationList,
            contactIds,
        });

        this.logger.log(
            `${dto.domain}: облегчённая поставка ${dto.sourceDealId} → ${newDealId}, вариантов ${variants.copied}`,
        );

        return {
            dealId: newDealId,
            snapshotCopied: snapshot.copied,
            variantsCopied: variants.copied,
            skippedFieldCodes: skipped.map(item => item.code),
        };
    }

    private async readDeal(
        bitrix: BitrixService,
        dealId: number,
    ): Promise<IBXDeal | null> {
        const response = await bitrix.deal.get(dealId);
        return (response?.result as IBXDeal | undefined) ?? null;
    }

    /** Контакты сделки: их ответственный тоже переходит на менеджера ОРК. */
    private async readContactIds(
        bitrix: BitrixService,
        dealId: number,
    ): Promise<number[]> {
        const response = await bitrix.deal.contactItemsGet(dealId);
        const items = (response?.result ?? []) as { CONTACT_ID?: number }[];
        return items
            .map(item => Number(item.CONTACT_ID))
            .filter(contactId => Number.isFinite(contactId) && contactId > 0);
    }
}
