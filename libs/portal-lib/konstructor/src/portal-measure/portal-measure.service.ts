import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { portal_measure } from 'generated/prisma';
import {
    PortalMeasureBackfillResult,
    PortalMeasureRepository,
} from './portal-measure.repository';

/**
 * Доменный сервис портальных единиц измерения (`portal_measure`).
 *
 * CRUD по портальным measure. Логика синхронизации с глобальным справочником
 * вынесена в {@link PortalMeasureSyncService}.
 */
@Injectable()
export class PortalMeasureService {
    constructor(private readonly repository: PortalMeasureRepository) {}

    async create(data: Partial<portal_measure>): Promise<portal_measure> {
        const portalMeasure = await this.repository.create(data);
        if (!portalMeasure) {
            throw new BadRequestException('Failed to create portal measure');
        }
        return portalMeasure;
    }

    async findById(id: number): Promise<portal_measure> {
        const portalMeasure = await this.repository.findById(id);
        if (!portalMeasure) {
            throw new NotFoundException(
                `Portal measure with id ${id} not found`,
            );
        }
        return portalMeasure;
    }

    async findMany(): Promise<portal_measure[]> {
        const portalMeasures = await this.repository.findMany();
        return portalMeasures ?? [];
    }

    async findByPortalId(portalId: number): Promise<portal_measure[]> {
        const portalMeasures = await this.repository.findByPortalId(portalId);
        return portalMeasures ?? [];
    }

    async findByMeasureId(measureId: number): Promise<portal_measure[]> {
        const portalMeasures = await this.repository.findByMeasureId(measureId);
        return portalMeasures ?? [];
    }

    async update(
        id: number,
        data: Partial<portal_measure>,
    ): Promise<portal_measure> {
        await this.findById(id);
        const updated = await this.repository.update(id, data);
        if (!updated) {
            throw new BadRequestException('Failed to update portal measure');
        }
        return updated;
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.repository.delete(id);
    }

    /**
     * Ремонт существующих строк: заполняет `NULL` таймстампы. Нужен для записей,
     * созданных до подключения авто-таймстампов. Идемпотентно.
     */
    async backfillTimestamps(): Promise<PortalMeasureBackfillResult> {
        return this.repository.backfillNullTimestamps();
    }
}
