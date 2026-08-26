import { BitrixService } from '@/modules/bitrix';
import { IBXListItem } from '@/modules/bitrix/domain/list-item/interface/bx-list-item.interface';
import { IPBXList } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { Logger } from '@nestjs/common';
import { IBatchGroupBuffer } from '../../batch/batch-group-buffer.interface';
import { KpiEventItemModel } from '../models/kpi-event-item.model';
import { KpiEventPayload } from '../type/kpi-event-payload.type';

/**
 * Создаёт элементы в списках `sales_kpi` и `sales_history` для одного
 * KPI-события (план/отчёт/перенос/...).
 *
 * Бизнес-нюансы (event_type, перспективность, текст комментария) сюда не
 * протекают: сервис принимает уже подготовленный {@link KpiEventPayload}
 * и просто превращает его в команды Bitrix через
 * {@link KpiEventItemModel}.
 *
 * NOTE: класс намеренно НЕ `@Injectable`. Создаётся через `new` рядом с
 * `BitrixService`, чтобы избежать race condition c заинъекченным
 * `this.bitrix` (см. CLAUDE.md).
 */
export class KpiListFlowService {
    private readonly logger = new Logger(KpiListFlowService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /**
     * Ставит в очередь `buffer` команды добавления элемента в KPI и
     * History списки портала. Если один из списков не настроен — он
     * пропускается; ошибки портала не валят весь батч.
     *
     * @param payload  логические значения события (см. {@link KpiEventPayload})
     * @param entityId  ID сущности-владельца — company/lead/deal (для
     *                  уникальности кода элемента; формат кода исторический,
     *                  менять нельзя — сломается идемпотентность элементов)
     * @param buffer  групповой batch-буфер (структурный контракт; подходит
     *                и ColdHookBatchGroupBuffer, и любой его аналог)
     */
    flow(
        payload: KpiEventPayload,
        entityId: string | number,
        buffer: IBatchGroupBuffer,
    ): void {
        const lists = this.collectLists();
        if (lists.length === 0) {
            this.logger.warn('Списки sales_kpi/sales_history не настроены');
            return;
        }

        const uniqueSuffix = this.generateUniqueSuffix();

        lists.forEach(list => {
            const fields = new KpiEventItemModel(
                list,
                this.payloadForList(payload, list),
            ).toFields();
            const cmdCode = `add_list_item_${list.type}_${entityId}_${uniqueSuffix}`;
            const elementCode = `${list.type}_${entityId}_${uniqueSuffix}`;

            buffer.queue(() =>
                this.bitrix.batch.listItem.add(cmdCode, {
                    IBLOCK_ID: String(list.bitrixId),
                    ELEMENT_CODE: elementCode,
                    FIELDS: fields,
                }),
            );
        });
    }

    /**
     * Payload для КОНКРЕТНОГО списка: history получает поверх `items` мерж
     * `historyItems` (типы, которые в сводке KPI считаются общим кодом, а в
     * ленте истории видны своим — refine). KPI-список берёт payload как есть.
     */
    private payloadForList(
        payload: KpiEventPayload,
        list: IPBXList,
    ): KpiEventPayload {
        if (list.type !== 'history' || !payload.historyItems) return payload;
        return {
            ...payload,
            items: { ...payload.items, ...payload.historyItems },
        };
    }

    /**
     * Дедуплицированная запись (финалы и уникальные события): код элемента
     * ДЕТЕРМИНИРОВАН — это `payload.dedup.key` КАК ЕСТЬ, без префикса типа
     * списка. Формат унаследован от легаси-PHP
     * (hook/app/Services/HookFlow/BitrixListFlowService.php:825-905):
     * элементы с такими кодами уже лежат на порталах, и наш код обязан
     * попадать в те же коды, иначе рядом с легаси-уникальными выросли бы
     * дубли. Kpi и history — разные инфоблоки, одинаковый код в обоих
     * допустим.
     *
     * По наличию кода решается судьба записи:
     *  - элемента нет → `lists.element.add` с этим кодом;
     *  - есть, mode `upsert` → `lists.element.update` (crm-привязки, даты,
     *    причина обновляются: одна продажа/один отказ на владельца);
     *  - есть, mode `insert-once` → пропуск (уникальное событие уже
     *    зафиксировано, исходная дата не переписывается). Легаси добивался
     *    того же отказом Битрикса создать дубль кода — мы просто не шлём.
     *
     * Существование проверяется ПРЯМЫМ `lists.element.get` (не батч):
     * event-report копит в batch-аккумуляторе команды с `$result[...]`
     * ссылками, и любой преждевременный flush их разорвал бы. Прямой вызов
     * аккумулятор не трогает.
     */
    async flowDedup(
        payload: KpiEventPayload,
        buffer: IBatchGroupBuffer,
    ): Promise<void> {
        const dedup = payload.dedup;
        if (!dedup) {
            // Контрактная ошибка вызывающего: без правила дедупликации
            // событие обязано идти через flow() с entityId владельца.
            this.logger.warn(
                `flowDedup вызван без payload.dedup («${payload.name}») — запись пропущена`,
            );
            return;
        }

        const lists = this.collectLists().filter(
            list => dedup.scope === 'both' || list.type === 'kpi',
        );
        if (lists.length === 0) {
            this.logger.warn('Списки sales_kpi/sales_history не настроены');
            return;
        }

        for (const list of lists) {
            /*
             * Уникальная запись обязана нести свой event_type: если item
             * (presentation_uniq / ev_success / …) ещё не установлен на
             * портале, элемент без типа — мусор, который отчёт не сможет
             * классифицировать. Мягкая деградация: warning + пропуск ЭТОЙ
             * записи, остальные не страдают.
             */
            if (
                dedup.requireEventTypeItem &&
                !this.eventTypeItemInstalled(list, payload)
            ) {
                this.logger.warn(
                    `item event_type="${payload.items.event_type ?? '—'}" не установлен ` +
                        `в списке ${list.type} — запись «${payload.name}» пропущена ` +
                        `(нужен install items KPI-списка)`,
                );
                continue;
            }

            // Легаси-формат: код БЕЗ префикса типа списка — совместимость с
            // элементами, уже созданными PHP-хуком на порталах.
            const elementCode = dedup.key;
            const existingId = await this.findExistingId(list, elementCode);

            if (existingId && dedup.mode === 'insert-once') {
                this.logger.log(
                    `уникальная запись ${elementCode} уже существует (ID ${existingId}) — пропуск`,
                );
                continue;
            }

            const fields = new KpiEventItemModel(
                list,
                this.payloadForList(payload, list),
            ).toFields();
            // list.type в КОМАНДЕ (не в коде): команды батча должны быть
            // уникальны, а код элемента в kpi и history одинаков.
            if (existingId) {
                const cmdCode = `upd_list_item_${list.type}_${elementCode}`;
                buffer.queue(() =>
                    this.bitrix.batch.listItem.update(cmdCode, {
                        IBLOCK_ID: String(list.bitrixId),
                        ELEMENT_ID: existingId,
                        FIELDS: fields,
                    }),
                );
            } else {
                const cmdCode = `add_list_item_${list.type}_${elementCode}`;
                buffer.queue(() =>
                    this.bitrix.batch.listItem.add(cmdCode, {
                        IBLOCK_ID: String(list.bitrixId),
                        ELEMENT_CODE: elementCode,
                        FIELDS: fields,
                    }),
                );
            }
        }
    }

    /**
     * ID существующего элемента с этим кодом; null — не найден/ошибка.
     *
     * Адресация — ТОЛЬКО через штатный параметр `ELEMENT_CODE`
     * (первоклассный параметр lists.element.get), а не через
     * `filter { '=CODE': … }`: фильтр по CODE у списков ненадёжен — REST
     * молча выбрасывает неподдержанный ключ и отдаёт ПЕРВУЮ СТРАНИЦУ всех
     * элементов. На боевом портале (тысячи записей KPI) существующий финал в
     * страницу не попадал → false negative → `lists.element.add` с занятым
     * кодом падал в result_error, и повторный финал (отказ/продажа) МОЛЧА
     * терялся — владелец видел только отчётную запись (todo2508-02 №8).
     * `ELEMENT_CODE` возвращает ровно этот элемент независимо от размера
     * списка; отсутствие элемента приходит пустым результатом либо ошибкой —
     * оба случая корректно дают null (ветка add).
     */
    private async findExistingId(
        list: IPBXList,
        elementCode: string,
    ): Promise<number | null> {
        try {
            const response = (await this.bitrix.listItem.get({
                IBLOCK_ID: String(list.bitrixId),
                ELEMENT_CODE: elementCode,
                select: ['ID', 'CODE'],
            })) as { result?: IBXListItem[] };
            const found = (response?.result ?? []).find(
                item => String(item.CODE) === elementCode,
            );
            const id = Number(found?.ID);
            return Number.isFinite(id) && id > 0 ? id : null;
        } catch (error) {
            /*
             * «Элемента нет» у Битрикса — тоже ошибка чтения, поэтому любой
             * сбой (не найден/сеть/права) ведёт в add: Битрикс сам отклонит
             * дубликат кода, а потерять продажу из-за сбоя проверки нельзя.
             * Лог — debug, не warn: штатный первый финал проходит эту ветку.
             */
            this.logger.debug(
                `элемент ${elementCode} не прочитан (считаем отсутствующим): ${String(error)}`,
            );
            return null;
        }
    }

    /** Установлен ли на портале item event_type, который несёт payload. */
    private eventTypeItemInstalled(
        list: IPBXList,
        payload: KpiEventPayload,
    ): boolean {
        const itemCode = payload.items.event_type;
        if (!itemCode) return false;
        const field = list.bitrixfields?.find(
            f => f.code === `${list.group}_${list.type}_event_type`,
        );
        return !!field?.items?.some(item => item.code === itemCode);
    }

    private collectLists(): IPBXList[] {
        const lists: IPBXList[] = [];
        const kpi = this.portal.getListByCode('sales_kpi');
        const history = this.portal.getListByCode('sales_history');

        if (kpi) lists.push(kpi);
        if (history) lists.push(history);
        return lists;
    }

    private generateUniqueSuffix(): string {
        return `${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 10)}`;
    }
}
