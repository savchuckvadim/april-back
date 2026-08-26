import { BadRequestException } from '@nestjs/common';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import { EnumWorkStatusCode } from '../../types/report-types';

/**
 * Согласованность DTO отправки — проверки ДО постановки в очередь.
 *
 * Flow выполняется воркером: 400 из очереди пользователь никогда не увидит,
 * а вот 400 из POST /flow фронт показывает баннером (flowStatus.setError).
 * Поэтому всё, что можно отвергнуть по самому DTO, отвергается здесь.
 *
 * Тексты — по-русски: они попадают менеджеру на экран как есть.
 */
export function assertEventFlowDtoValid(dto: EventSalesFlowDto): void {
    const workStatusCode = dto.report?.workStatus?.current?.code;

    /*
     * «Не ЦА» едет по проводам отказом (fail) + notCaTypeCode в leadSync.
     * Тип при ЛЮБОМ другом статусе — рассинхрон фронта: флаг увёл бы
     * сделку в стадию «не ЦА» из статуса, который менеджер не выбирал.
     */
    if (
        dto.leadSync?.notCaTypeCode &&
        workStatusCode !== EnumWorkStatusCode.fail
    ) {
        throw new BadRequestException(
            'Тип «не ЦА» указан, но статус работы не «Не ЦА» — ' +
                'обновите фрейм и отправьте отчёт заново',
        );
    }
}
