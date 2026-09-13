import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealRepository } from '../repositories/inner-deal.repository';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InnerDealUpsertDto } from '../dto/inner-deal.dto';
import { ComplectCompositionDto } from '../dto/complect-composition.dto';
import {
    buildInnerDealCopyData,
    InnerDealCopyParams,
    InnerDealCopyResult,
    InnerDealCopySource,
} from '../lib/inner-deal-copy';
import { serializeComplectComposition } from '../type/complect-composition.type';

@Injectable()
export class InnerDealService {
    constructor(private readonly innerDealRepository: InnerDealRepository) {}

    /**
     * Слепок сделки. Без serviceSmartId ищем обычную запись (serviceSmartId IS NULL),
     * с fallback на любую запись сделки — как Laravel getDeal (без фильтра по смарту).
     */
    async findSnapshot(
        domain: string,
        dealId: number,
        serviceSmartId: number | null,
    ): Promise<BxDocumentDeal | null> {
        const exact = await this.innerDealRepository.findSnapshot(
            domain,
            dealId,
            serviceSmartId,
        );
        if (exact || serviceSmartId !== null) return exact;
        return await this.innerDealRepository.findByDomainAndDealId(
            domain,
            dealId,
        );
    }

    async listByDealId(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal[]> {
        return await this.innerDealRepository.listByDealId(domain, dealId);
    }

    /** Все варианты комплекта сделки. */
    async listVariants(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal[]> {
        return await this.innerDealRepository.listVariantsByDealId(
            domain,
            dealId,
        );
    }

    /** Слепок конкретного варианта комплекта. */
    async findVariantSnapshot(
        domain: string,
        dealId: number,
        variantSmartId: number,
    ): Promise<BxDocumentDeal | null> {
        return await this.innerDealRepository.findVariantSnapshot(
            domain,
            dealId,
            variantSmartId,
        );
    }

    /**
     * Настройки сборки комплекта: трогаем только колонку `settings` у строки
     * самой сделки.
     *
     * Строки слепка может ещё не быть — менеджер открыл конструктор, выбрал
     * режим и ничего не собрал; тогда заводим строку с одними настройками,
     * дальнейшее сохранение слепка её же и дополнит.
     */
    async updateSettings(
        domain: string,
        dealId: number,
        settings: ComplectCompositionDto | null,
    ): Promise<BxDocumentDeal> {
        const data: Partial<BxDocumentDeal> = {
            settings: serializeComplectComposition(settings),
        };

        const existing = await this.innerDealRepository.findSnapshot(
            domain,
            dealId,
            null,
        );
        if (existing) {
            return await this.innerDealRepository.update(existing.id, data);
        }

        const portalId =
            await this.innerDealRepository.findPortalIdByDomain(domain);
        return await this.innerDealRepository.create({
            ...data,
            domain,
            dealId,
            serviceSmartId: null,
            smartId: null,
            portalId,
        });
    }

    /**
     * Upsert по ключу (domain, dealId, serviceSmartId | variantSmartId) —
     * семантика Laravel DealController::addDeal: найдено → update, нет →
     * create с portalId по домену.
     *
     * Вариант комплекта различается колонкой `smartId`: у сделки их может быть
     * несколько, и каждый — самостоятельный слепок конструктора.
     */
    async upsertSnapshot(dto: InnerDealUpsertDto): Promise<BxDocumentDeal> {
        const serviceSmartId = dto.serviceSmartId ?? null;
        const variantSmartId = dto.variantSmartId ?? null;
        const data: Partial<BxDocumentDeal> = {
            dealId: dto.dealId,
            domain: dto.domain,
            serviceSmartId,
            smartId: variantSmartId,
            userId: dto.userId ?? null,
            templateId:
                dto.templateId === null || dto.templateId === undefined
                    ? null
                    : BigInt(dto.templateId),
            isFavorite: dto.isFavorite ?? null,
            dealName: dto.dealName ?? null,
            app: dto.app ?? null,
            global: dto.global ?? null,
            currentComplect: dto.currentComplect ?? null,
            od: dto.od ?? null,
            result: dto.result ?? null,
            contract: dto.contract ?? null,
            product: dto.product ?? null,
            rows: dto.rows ?? null,
            regions: dto.regions ?? null,
            iskraConfig: dto.iskraConfig ?? null,
            ltOther: dto.ltOther ?? null,
        };

        // Настройки сборки комплекта трогаем, только если их прислали: слепок
        // сохраняется при каждом чихе конструктора, и молчаливое `null` стирало
        // бы выбранный режим по десять раз за сеанс. Явный `null` — очистка.
        if (dto.settings !== undefined) {
            data.settings = serializeComplectComposition(dto.settings);
        }

        const existing = variantSmartId
            ? await this.innerDealRepository.findVariantSnapshot(
                  dto.domain,
                  dto.dealId,
                  variantSmartId,
              )
            : await this.innerDealRepository.findSnapshot(
                  dto.domain,
                  dto.dealId,
                  serviceSmartId,
              );
        if (existing) {
            return await this.innerDealRepository.update(existing.id, data);
        }
        const portalId = await this.innerDealRepository.findPortalIdByDomain(
            dto.domain,
        );
        return await this.innerDealRepository.create({
            ...data,
            portalId,
        });
    }

    /**
     * Копирует слепок конструктора из одной сделки в другую.
     *
     * Штатные отказы (нет источника, у цели уже есть слепок) возвращаются телом
     * ответа, а не исключением: глобальный фильтр на каждую ошибку шлёт алерт в
     * Telegram, а «нечего копировать» — обычный случай.
     */
    async copySnapshot(
        params: InnerDealCopyParams,
    ): Promise<InnerDealCopyResult> {
        const source = await this.findCopySource(params.domain, params.source);
        if (!source) {
            return { copied: false, reason: 'source_not_found', deal: null };
        }

        // цель — обычный слепок сделки либо конкретный вариант, если указан
        const target = params.variantSmartId
            ? await this.innerDealRepository.findVariantSnapshot(
                  params.domain,
                  params.targetDealId,
                  params.variantSmartId,
              )
            : await this.innerDealRepository.findSnapshot(
                  params.domain,
                  params.targetDealId,
                  null,
                  'newest',
              );
        if (target && params.force !== true) {
            return { copied: false, reason: 'target_exists', deal: null };
        }

        const data = buildInnerDealCopyData(source, params.targetDealId, {
            userId: params.userId,
            department: params.department,
            variantSmartId: params.variantSmartId,
        });
        if (target) {
            const updated = await this.innerDealRepository.update(
                target.id,
                data,
            );
            return { copied: true, reason: null, deal: updated };
        }

        const portalId =
            source.portalId ??
            (await this.innerDealRepository.findPortalIdByDomain(
                params.domain,
            ));
        const created = await this.innerDealRepository.create({
            ...data,
            portalId,
        });
        return { copied: true, reason: null, deal: created };
    }

    /** Источник копирования — всегда самый свежий слепок по ключу. */
    private async findCopySource(
        domain: string,
        source: InnerDealCopySource,
    ): Promise<BxDocumentDeal | null> {
        if (source.kind === 'serviceSmart') {
            return await this.innerDealRepository.findByServiceSmartId(
                domain,
                source.serviceSmartId,
                'newest',
            );
        }

        if (source.kind === 'variant') {
            return await this.innerDealRepository.findVariantSnapshot(
                domain,
                source.dealId,
                source.variantSmartId,
                'newest',
            );
        }

        const exact = await this.innerDealRepository.findSnapshot(
            domain,
            source.dealId,
            source.serviceSmartId,
            'newest',
        );
        if (exact || source.serviceSmartId !== null) {
            return exact;
        }
        // как в findSnapshot: без смарта допускаем любую запись сделки
        return await this.innerDealRepository.findByDomainAndDealId(
            domain,
            source.dealId,
        );
    }

    async findById(id: bigint): Promise<BxDocumentDeal | null> {
        return await this.innerDealRepository.findById(BigInt(id));
    }
    async findByDomainAndDealId(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal | null> {
        return await this.innerDealRepository.findByDomainAndDealId(
            domain,
            dealId,
        );
    }
    async findByDomain(domain: string): Promise<BxDocumentDeal[] | null> {
        return await this.innerDealRepository.findByDomain(domain);
    }
    async findByServiceSmartId(
        domain: string,
        serviceSmartId: number,
    ): Promise<BxDocumentDeal | null> {
        return await this.innerDealRepository.findByServiceSmartId(
            domain,
            serviceSmartId,
        );
    }
    async setOfferTemplate(
        id: bigint,
        offerTemplateId: bigint,
    ): Promise<BxDocumentDeal> {
        return await this.innerDealRepository.setOfferTemplate(
            id,
            offerTemplateId,
        );
    }
    async setOfferTemplateByDomainAndDealId(
        domain: string,
        dealId: number,
        offerTemplateId: bigint,
    ): Promise<BxDocumentDeal> {
        const innerDeal = await this.innerDealRepository.findByDomainAndDealId(
            domain,
            dealId,
        );
        if (!innerDeal) {
            throw new NotFoundException(
                `Inner deal with domain ${domain} and dealId ${dealId} not found`,
            );
        }
        return await this.innerDealRepository.setOfferTemplate(
            innerDeal.id,
            offerTemplateId,
        );
    }
    async create(innerDeal: Partial<BxDocumentDeal>): Promise<BxDocumentDeal> {
        return await this.innerDealRepository.create(innerDeal);
    }
    async update(
        id: bigint,
        innerDeal: Partial<BxDocumentDeal>,
    ): Promise<BxDocumentDeal> {
        return await this.innerDealRepository.update(id, innerDeal);
    }
    async delete(id: bigint): Promise<boolean> {
        return await this.innerDealRepository.delete(id);
    }
}
