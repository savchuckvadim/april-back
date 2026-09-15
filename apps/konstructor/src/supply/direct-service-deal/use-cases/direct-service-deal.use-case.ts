import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { BitrixService, IBXCompany, IBXDeal } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { getErrorString } from '@lib/shared';
import { DealFieldResolverService } from '../../../modules/deal-send/services/deal-field-resolver.service';
import { InnerDealService } from '../../../modules/inner-deal/services/inner-deal.service';
import { SupplyDealFlowService } from '../../init-deal/services/supply-deal-flow.service';
import { CopyComplectVariantsService } from '../../init-deal/services/copy-complect-variants.service';
import { CopyProductRowsService } from '../../init-deal/services/copy-product-rows.service';
import {
    DirectServiceDealDto,
    DirectServiceDealPrepareResponseDto,
    DirectServiceDealResponseDto,
    ExistingServiceDealDto,
} from '../dto/direct-service-deal.dto';
import {
    buildBaseDealLinkFilterValues,
    buildBaseDealLinkValues,
    SERVICE_DEAL_BASE_DEAL_FIELD_CODE,
} from '../lib/service-deal-link';

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
 * ПЕРЕОТПРАВКА. Менеджер может отправить поставку повторно. Чтобы он не плодил
 * дубли вслепую, `prepare` ищет уже созданную сервисную сделку по этой базовой
 * и возвращает её; конструктор спрашивает — обновить или создать новую, и шлёт
 * `mode`. При `update` новая сделка НЕ создаётся: обновляются поля
 * существующей, товарные строки переписываются целиком, слепок копируется с
 * force.
 *
 * ЧЕГО ЗДЕСЬ НЕТ: задач ОРК. Они ставятся джобой по элементу RPA
 * (`SERVICE_ORK_SUPPLY_TASKS` ждёт `rpaTypeId`/`rpaId`), а в облегчённом пути
 * заявки не существует — поэтому и дублей задач при переотправке быть не может.
 */
@Injectable()
export class DirectServiceDealUseCase {
    private readonly logger = new Logger(DirectServiceDealUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly innerDealService: InnerDealService,
    ) {}

    /** Что показать в форме: рег-лист, компания, контакты, варианты, дубль. */
    async prepare(
        domain: string,
        sourceDealId: number,
    ): Promise<DirectServiceDealPrepareResponseDto> {
        const { bitrix, PortalModel } = await this.pbx.init(domain);

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
            existingServiceDeal: await this.findExistingServiceDeal(
                bitrix,
                PortalModel,
                sourceDealId,
                companyId,
            ),
        };
    }

    async execute(
        dto: DirectServiceDealDto,
    ): Promise<DirectServiceDealResponseDto> {
        const mode = dto.mode ?? 'create';
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

        // связь с базовой сделкой — по ней потом находится дубль при
        // переотправке. Нет поля на портале — молча не пишем
        dealValues = {
            ...dealValues,
            ...buildBaseDealLinkValues(PortalModel, dto.sourceDealId),
        };

        const stageId = supplyFlow.resolveStageIdByContractEnd(
            dto.contractEnd ?? null,
        );
        if (stageId) {
            dealValues.STAGE_ID = stageId;
        }

        const targetDealId =
            mode === 'update'
                ? await this.updateServiceDeal(bitrix, dto, dealValues)
                : await this.createServiceDeal(bitrix, dto, dealValues);

        // productrows.set переписывает строки целиком — дублей при повторе нет
        await new CopyProductRowsService(
            dto.sourceDealId,
            targetDealId,
            bitrix,
        ).copyProductFromDealToDeal();

        const snapshot = await this.innerDealService.copySnapshot({
            domain: dto.domain,
            source: {
                kind: 'deal',
                dealId: dto.sourceDealId,
                serviceSmartId: null,
            },
            targetDealId,
            userId: dto.managerOsId,
            department: 'service',
            force: true,
        });

        const variantsCopied = await this.copyVariants(
            bitrix,
            PortalModel,
            dto,
            targetDealId,
            mode,
        );

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
            `${dto.domain}: облегчённая поставка ${dto.sourceDealId} → ${targetDealId} (${mode}), вариантов ${variantsCopied}`,
        );

        return {
            dealId: targetDealId,
            action: mode === 'update' ? 'updated' : 'created',
            snapshotCopied: snapshot.copied,
            variantsCopied,
            skippedFieldCodes: skipped.map(item => item.code),
        };
    }

    /** Создание новой сервисной сделки. */
    private async createServiceDeal(
        bitrix: BitrixService,
        dto: DirectServiceDealDto,
        dealValues: Partial<IBXDeal>,
    ): Promise<number> {
        const created = await bitrix.deal.set(dealValues);
        const newDealId = Number(created?.result);
        if (!Number.isFinite(newDealId) || newDealId <= 0) {
            throw new BadRequestException(
                `Bitrix не создал сервисную сделку на ${dto.domain}`,
            );
        }
        return newDealId;
    }

    /**
     * Обновление уже созданной сервисной сделки.
     *
     * Вторая сделка здесь не создаётся ни при каких условиях: если указанной
     * сделки нет — это ошибка формы, а не повод завести дубль.
     */
    private async updateServiceDeal(
        bitrix: BitrixService,
        dto: DirectServiceDealDto,
        dealValues: Partial<IBXDeal>,
    ): Promise<number> {
        const targetDealId = Number(dto.targetDealId);
        if (!Number.isFinite(targetDealId) || targetDealId <= 0) {
            throw new BadRequestException(
                'Для режима update нужен targetDealId — id сервисной сделки, которую обновляем',
            );
        }

        const target = await this.readDeal(bitrix, targetDealId);
        if (!target) {
            throw new BadRequestException(
                `Сервисная сделка ${targetDealId} не найдена на ${dto.domain}`,
            );
        }

        await bitrix.deal.update(targetDealId, dealValues);
        return targetDealId;
    }

    /**
     * Перенос вариантов комплекта.
     *
     * При обновлении варианты не переносим повторно: у сделки они уже есть, а
     * копия создала бы вторые элементы смарта с теми же наборами. Считаем по
     * слепкам вариантов целевой сделки.
     */
    private async copyVariants(
        bitrix: BitrixService,
        portalModel: PortalModel,
        dto: DirectServiceDealDto,
        targetDealId: number,
        mode: 'create' | 'update',
    ): Promise<number> {
        if (mode === 'update') {
            const existing = await this.innerDealService.listVariants(
                dto.domain,
                targetDealId,
            );
            if (existing.length > 0) {
                this.logger.log(
                    `${dto.domain}: у сделки ${targetDealId} уже ${existing.length} вариантов — повторно не переносим`,
                );
                return 0;
            }
        }

        const result = await new CopyComplectVariantsService(
            bitrix,
            portalModel,
            this.innerDealService,
        ).copy(dto.domain, dto.sourceDealId, targetDealId, dto.managerOsId);

        return result.copied;
    }

    /**
     * Сервисная сделка, уже созданная по этой базовой.
     *
     * Сначала ищем по полю-связи (`to_sale_deal`) — это точное совпадение.
     * Если поля на портале нет или по нему ничего не нашлось, откатываемся на
     * поиск по компании в сервисной воронке: связь вероятная, поэтому
     * помечаем её `matchedBy: 'company'` — менеджеру нужно показать иначе.
     */
    private async findExistingServiceDeal(
        bitrix: BitrixService,
        portalModel: PortalModel,
        sourceDealId: number,
        companyId: number | null,
    ): Promise<ExistingServiceDealDto | null> {
        const category = portalModel.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.service_base,
        );
        if (!category) {
            return null;
        }

        const select = ['ID', 'TITLE', 'STAGE_ID', 'DATE_CREATE'];

        try {
            const linkFieldId = portalModel.getDealFieldBitrixIdByCode(
                SERVICE_DEAL_BASE_DEAL_FIELD_CODE,
            );
            if (linkFieldId) {
                const byLink = await this.findLastDeal(
                    bitrix,
                    {
                        CATEGORY_ID: category.bitrixId,
                        [linkFieldId]:
                            buildBaseDealLinkFilterValues(sourceDealId),
                    },
                    select,
                );
                if (byLink) {
                    return this.toExistingServiceDeal(byLink, 'link');
                }
            }

            if (!companyId) {
                return null;
            }

            const byCompany = await this.findLastDeal(
                bitrix,
                {
                    CATEGORY_ID: category.bitrixId,
                    COMPANY_ID: String(companyId),
                },
                select,
            );
            return byCompany
                ? this.toExistingServiceDeal(byCompany, 'company')
                : null;
        } catch (error) {
            // поиск дубля — подсказка менеджеру, а не условие работы формы
            this.logger.warn(
                `Поиск существующей сервисной сделки по ${sourceDealId} не удался: ${getErrorString(error)}`,
            );
            return null;
        }
    }

    /** Самая свежая сделка по фильтру. */
    private async findLastDeal(
        bitrix: BitrixService,
        filter: Record<string, unknown>,
        select: string[],
    ): Promise<IBXDeal | null> {
        const response = await bitrix.deal.getList(
            filter as Partial<IBXDeal>,
            select,
            { ID: 'DESC' },
        );
        const items = response?.result ?? [];
        return items[0] ?? null;
    }

    private toExistingServiceDeal(
        deal: IBXDeal,
        matchedBy: 'link' | 'company',
    ): ExistingServiceDealDto {
        return {
            id: Number(deal.ID),
            title: (deal.TITLE as string | undefined) ?? null,
            stageId: (deal.STAGE_ID as string | undefined) ?? null,
            createdAt: (deal.DATE_CREATE as string | undefined) ?? null,
            matchedBy,
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
