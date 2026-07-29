import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealRepository } from '../repositories/inner-deal.repository';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InnerDealUpsertDto } from '../dto/inner-deal.dto';

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

    /**
     * Upsert по ключу (domain, dealId, serviceSmartId) — семантика Laravel DealController::addDeal:
     * найдено → update, нет → create с portalId по домену.
     */
    async upsertSnapshot(dto: InnerDealUpsertDto): Promise<BxDocumentDeal> {
        const serviceSmartId = dto.serviceSmartId ?? null;
        const data: Partial<BxDocumentDeal> = {
            dealId: dto.dealId,
            domain: dto.domain,
            serviceSmartId,
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
        const existing = await this.innerDealRepository.findSnapshot(
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
        serviceSmartId: number,
    ): Promise<BxDocumentDeal | null> {
        return await this.innerDealRepository.findByServiceSmartId(
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
