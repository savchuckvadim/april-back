import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { BitrixService, IBXDeal } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    DealSendDto,
    DealSendFieldDto,
    DealSendTargetDto,
    DealSendResponseDto,
} from '../dto/deal-send.dto';
import { DealFieldResolverService } from '../services/deal-field-resolver.service';
import { DealSendJobDto } from '../dto/deal-send-job.dto';
import { DealSendSupplyTextsService } from '../services/deal-send-supply-texts.service';

/**
 * Отправка сделки из конструктора.
 *
 * Разделение как в легаси: сделка создаётся синхронно (фронту немедленно нужен
 * её id, чтобы сохранить слепок и увести менеджера в карточку), а запись полей
 * и товарных строк уходит в очередь — это десятки значений и отдельный вызов
 * productrow.set.
 */
@Injectable()
export class DealSendUseCase {
    private readonly logger = new Logger(DealSendUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly dispatcher: QueueDispatcherService,
        private readonly supplyTexts: DealSendSupplyTextsService,
    ) {}

    async execute(dto: DealSendDto): Promise<DealSendResponseDto> {
        const { bitrix, PortalModel } = await this.pbx.init(dto.domain);

        // тексты поставки — с бэка по supplyCode (новый фронт); присланные поля сильнее
        const enrichedFields = await this.supplyTexts.enrich(
            dto.fields,
            dto.supplyCode,
            dto.contractKind,
        );
        const resolver = new DealFieldResolverService(PortalModel);
        if (dto.target?.kind === 'smart') {
            return this.executeSmart(
                dto,
                enrichedFields,
                resolver,
                bitrix,
                PortalModel,
            );
        }
        const { fields, skipped } = resolver.resolve(enrichedFields);

        if (skipped.length) {
            const details = skipped
                .map(item => `${item.code} (${item.reason})`)
                .join(', ');
            this.logger.warn(`${dto.domain}: не записаны поля — ${details}`);
        }

        let dealId = dto.dealId ?? null;
        let created = false;

        if (!dealId) {
            const categoryCode =
                dto.categoryCode ?? PbxDealCategoryCodeEnum.sales_base;
            const category = PortalModel.getDealCategoryByCode(categoryCode);
            if (!category) {
                throw new BadRequestException(
                    `На портале ${dto.domain} нет воронки сделок "${categoryCode}"`,
                );
            }

            const createFields: Partial<IBXDeal> = {
                TITLE: dto.dealName ?? '',
                CATEGORY_ID: category.bitrixId,
                OPENED: dto.opened === false ? 'N' : 'Y',
            };
            if (dto.userId) {
                createFields.ASSIGNED_BY_ID = String(dto.userId);
            }
            if (dto.companyId) {
                createFields.COMPANY_ID = String(dto.companyId);
            }

            const response = await bitrix.deal.set(createFields);
            dealId = Number(response.result);
            created = true;

            if (!dealId) {
                throw new BadRequestException(
                    `Bitrix не создал сделку на портале ${dto.domain}`,
                );
            }
        }

        const job: DealSendJobDto = {
            domain: dto.domain,
            dealId,
            fields,
            productRows: dto.productRows
                ? resolver.resolveProductRows(dto.productRows)
                : undefined,
        };

        await this.dispatcher.dispatch(
            QueueNames.KONSTRUCTOR,
            JobNames.KONSTRUCTOR_DEAL_SEND,
            job,
        );

        return { dealId, created, skipped, smartId: null };
    }

    /**
     * Сервисный отдел, «предложение на будущий период»: поля и строки идут в
     * элемент смарта (service_offer), привязанный к сделке. Элемента нет —
     * создаём (title, parentId2 = сделка, компания, ответственный).
     */
    private async executeSmart(
        dto: DealSendDto,
        fields: DealSendFieldDto[],
        resolver: DealFieldResolverService,
        bitrix: BitrixService,
        PortalModel: PortalModel,
    ): Promise<DealSendResponseDto> {
        const target = dto.target as DealSendTargetDto;
        const smartType = target.smartType ?? 'service_offer';
        const smart = PortalModel.getSmartByType(smartType as never);
        if (!smart?.entityTypeId) {
            throw new BadRequestException(
                `На портале ${dto.domain} не установлен смарт "${smartType}"`,
            );
        }
        if (!dto.dealId) {
            throw new BadRequestException(
                'Элемент смарта привязывается к сделке — сначала сохраните сделку',
            );
        }
        const entityTypeId = Number(smart.entityTypeId);
        let smartId = target.smartId ?? null;
        if (!smartId) {
            const created = (await bitrix.item.add(String(entityTypeId), {
                title: target.title || smart.title || smart.name,
                parentId2: dto.dealId,
                ...(dto.companyId ? { companyId: dto.companyId } : {}),
                ...(dto.userId ? { assignedById: dto.userId } : {}),
            })) as {
                result?: { item?: { id?: number } };
                item?: { id?: number };
            } | null;
            smartId =
                Number(created?.result?.item?.id ?? created?.item?.id) || null;
            if (!smartId) {
                throw new BadRequestException(
                    `Bitrix не создал элемент смарта "${smartType}" на портале ${dto.domain}`,
                );
            }
        }
        const { fields: smartFields, skipped } = resolver.resolveSmartFields(
            fields,
            smart,
        );
        if (skipped.length) {
            this.logger.warn(
                `${dto.domain}: не записаны поля смарта — ${skipped.map(item => `${item.code} (${item.reason})`).join(', ')}`,
            );
        }
        const job: DealSendJobDto = {
            domain: dto.domain,
            dealId: dto.dealId,
            fields: {
                ...(target.title ? { title: target.title } : {}),
                ...smartFields,
            } as DealSendJobDto['fields'],
            productRows: dto.productRows
                ? resolver.resolveProductRows(dto.productRows)
                : undefined,
            target: {
                kind: 'smart',
                entityTypeId,
                smartId,
                ownerType: smartOwnerType(smart.crm, entityTypeId),
            },
        };
        await this.dispatcher.dispatch(
            QueueNames.KONSTRUCTOR,
            JobNames.KONSTRUCTOR_DEAL_SEND,
            job,
        );
        return { dealId: dto.dealId, created: false, skipped, smartId };
    }
}

/**
 * ownerType товарных строк динамического типа: `T{hex(entityTypeId)}`; в
 * портальной схеме он лежит в smarts.crm с хвостовым подчёркиванием.
 */
export const smartOwnerType = (
    crm: string | null | undefined,
    entityTypeId: number,
): string => (crm ? crm.replace(/_$/, '') : `T${entityTypeId.toString(16)}`);
