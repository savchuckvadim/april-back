import { Injectable } from '@nestjs/common';
import { MeasureRepository } from '../measure/measure.repository';
import { PortalMeasureRepository } from './portal-measure.repository';

/** Сводка результата синхронизации портальных единиц измерения. */
export interface PortalMeasureSyncResult {
    /** Сколько portal_measure создано в этом прогоне. */
    created: number;
    /** Сколько уже существовало (обновлены значениями из глобальной measure). */
    updated: number;
    /** Итоговое число portal_measure у портала после синхронизации. */
    total: number;
}

/**
 * Синхронизация глобальных единиц измерения (`measures`) с портальными
 * (`portal_measure`) для конкретного портала.
 *
 * Источник — таблица `measures` (мастер-список). Для каждой глобальной measure
 * у портала должна быть строка `portal_measure`. Операция идемпотентна:
 * - связки нет → создаём (копируем `name/shortName/fullName`, `bitrixId` оставляем пустым —
 *   его проставляют при привязке к единице измерения Bitrix вручную/отдельным шагом);
 * - связка есть → обновляем человекочитаемые поля из глобальной measure, не трогая `bitrixId`.
 *
 * Логика чисто на PortalDB, без обращения к Bitrix.
 */
@Injectable()
export class PortalMeasureSyncService {
    constructor(
        private readonly measureRepository: MeasureRepository,
        private readonly portalMeasureRepository: PortalMeasureRepository,
    ) {}

    async syncFromGlobal(portalId: number): Promise<PortalMeasureSyncResult> {
        const measures = (await this.measureRepository.findMany()) ?? [];

        let created = 0;
        let updated = 0;

        for (const measure of measures) {
            const measureId = Number(measure.id);
            const existing =
                await this.portalMeasureRepository.findByPortalAndMeasure(
                    portalId,
                    measureId,
                );

            if (existing) {
                await this.portalMeasureRepository.update(Number(existing.id), {
                    name: measure.name,
                    shortName: measure.shortName,
                    fullName: measure.fullName,
                });
                updated += 1;
            } else {
                await this.portalMeasureRepository.create({
                    portal_id: BigInt(portalId),
                    measure_id: measure.id,
                    name: measure.name,
                    shortName: measure.shortName,
                    fullName: measure.fullName,
                });
                created += 1;
            }
        }

        const portalMeasures =
            (await this.portalMeasureRepository.findByPortalId(portalId)) ?? [];

        return { created, updated, total: portalMeasures.length };
    }
}
