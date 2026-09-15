import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { toTimelineComment } from '@lib/bitrix/consts/timeline.consts';
import { SalesBatchGroupBuffer as ColdHookBatchGroupBuffer } from '../../../shared/batch';
import { TimelineEntry } from './cold-start-timeline.formatter';

/**
 * Записи таймлайна холодного старта — в общий буфер группы хука: уезжают
 * тем же батчем, что и создание (`proceed`), либо своей группой (`yield`).
 * Поля команды плоские — репозиторий сам оборачивает их в `{ fields }`.
 *
 * Ключ команды — с порядковым номером записи: одна сущность получает и
 * итог старта, и «забрали» (чужая основная = сохранённая), а batch-карта
 * Bitrix при одинаковом ключе молча оставляет первую команду (ревью 02.09).
 *
 * ЭКРАНИРОВАНИЕ ЖИВЁТ ЗДЕСЬ, а не в форматтере: комментарий вклеивается в
 * query-строку `cmd` сырым, и его `#`, `&`, `+`, `%` и переносы обязан
 * подготовить транспорт — ровно один раз (`toTimelineComment`). Форматтер
 * отдаёт человекочитаемый текст с обычными `\n`.
 */
export class ColdStartTimelineV2Service {
    private readonly logger = new Logger(ColdStartTimelineV2Service.name);

    constructor(private readonly bitrix: BitrixService) {}

    queue(
        hookKey: string,
        entries: TimelineEntry[],
        buffer: ColdHookBatchGroupBuffer,
    ): void {
        entries.forEach((entry, index) => {
            const cmd = `xo2_tl_${hookKey}_${index}_${entry.entityType}_${entry.entityId}`;
            this.logger.log(
                `[timeline] ${cmd}: ${entry.comment.split('\n').join(' / ')}`,
            );
            buffer.queue(() =>
                this.bitrix.batch.timeline.addTimelineComment(cmd, {
                    ENTITY_TYPE: entry.entityType,
                    ENTITY_ID: entry.entityId,
                    COMMENT: toTimelineComment([entry.comment]),
                }),
            );
        });
    }
}
