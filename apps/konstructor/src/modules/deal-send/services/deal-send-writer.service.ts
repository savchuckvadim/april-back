import { Logger } from '@nestjs/common';
import { BitrixService, IBXItem } from '@lib/bitrix';
import { BitrixOwnerType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { DealSendJobDto, DealSendSmartTarget } from '../dto/deal-send-job.dto';
import { describeDealSendError } from '../lib/deal-send-job.options';

/** Что записано: число полей и строк (null — строки не трогали). */
export interface DealSendWriteResult {
    fields: number;
    rows: number | null;
    /** Не писали: у сделки есть более позднее сохранение — оно и запишет. */
    superseded?: boolean;
}

/**
 * Пишет в Bitrix то, что собрал конструктор: поля сделки и товарные строки.
 *
 * Поля и строки — независимые шаги, как у легаси (Laravel писал строки после
 * batch с halt 0): сбой обновления полей не отменяет запись строк. Если упал
 * хоть один шаг, бросаем общую ошибку — Bull повторит задание целиком, оба
 * шага идемпотентны.
 *
 * Не @Injectable: внутри per-domain инстанс Bitrix, держать его в синглтоне
 * нельзя (CLAUDE.md — race condition).
 */
export class DealSendWriterService {
    private readonly logger = new Logger(DealSendWriterService.name);

    constructor(private readonly bitrix: BitrixService) {}

    async write(job: DealSendJobDto): Promise<DealSendWriteResult> {
        const target = job.target;
        const label =
            target?.kind === 'smart'
                ? `${job.domain} смарт ${target.entityTypeId}/${target.smartId}`
                : `${job.domain} сделка ${job.dealId}`;
        const errors: string[] = [];

        const fieldCount = Object.keys(job.fields).length;
        if (fieldCount) {
            await this.step('поля', errors, () =>
                target?.kind === 'smart'
                    ? this.updateSmart(target, job)
                    : this.bitrix.deal.update(job.dealId, job.fields),
            );
        }

        let rows: number | null = null;
        if (job.productRows) {
            const written = await this.step('строки', errors, () =>
                this.bitrix.productRow.set({
                    ownerType:
                        target?.kind === 'smart'
                            ? (target.ownerType as BitrixOwnerType)
                            : BitrixOwnerType.DEAL,
                    ownerId:
                        target?.kind === 'smart' ? target.smartId : job.dealId,
                    productRows: job.productRows ?? [],
                }),
            );
            rows = written ? job.productRows.length : null;
        }

        if (errors.length) {
            throw new Error(`${label}: ${errors.join('; ')}`);
        }
        this.logger.log(
            `${label}: полей ${fieldCount}, ${rows === null ? 'товарные строки не переданы' : `строк ${rows}`}`,
        );
        return { fields: fieldCount, rows };
    }

    /** Шаг записи: ошибку запоминаем, следующий шаг всё равно выполняем. */
    private async step(
        name: string,
        errors: string[],
        work: () => Promise<unknown>,
    ): Promise<boolean> {
        try {
            await work();
            return true;
        } catch (error) {
            errors.push(`${name} — ${describeDealSendError(error)}`);
            return false;
        }
    }

    /**
     * Элемент смарта (сервисный отдел, «предложение на будущий период»):
     * поля — crm.item.update, строки — crm.item.productrow.set с ownerType
     * динамического типа. Легаси делал это с фронта тремя вызовами.
     */
    private updateSmart(
        target: DealSendSmartTarget,
        job: DealSendJobDto,
    ): Promise<unknown> {
        return this.bitrix.item.update(
            target.smartId,
            // библиотека типизирует entityTypeId константой сделки; у смарта он свой
            target.entityTypeId as never,
            job.fields as Partial<IBXItem>,
        );
    }
}
