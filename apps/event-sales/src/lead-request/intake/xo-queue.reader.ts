import { PBXService } from '@/modules/pbx';

type BxRow = Record<string, unknown>;
type BitrixInstance = Awaited<ReturnType<PBXService['init']>>['bitrix'];

/**
 * Сколько страниц максимум читаем за проход. Битрикс отдаёт не больше 50
 * элементов за запрос, так что это потолок в 2000 лидов — защита от
 * бесконечного цикла на аномально распухшей очереди, а не бизнес-лимит
 * (бизнес-лимит — `maxPerRun` у вызывающего).
 */
const MAX_PAGES = 40;

/**
 * Постраничное чтение стадии-очереди ХО.
 *
 * Очередь — это ВСЯ стадия целиком, без окон по датам: элемент попал сюда
 * роботом и ждёт разбора сколько угодно. Поэтому пагинация keyset по `>ID`
 * с сортировкой по ID — единственный способ дочитать очередь длиннее
 * пятидесяти элементов (штатный потолок одного ответа Битрикса).
 *
 * Фильтра по нашим UF-полям на стороне Битрикса НЕТ намеренно: фильтр по
 * пустому UF работает не на всех порталах, а здесь его сбой означал бы
 * тихо непереразбираемую очередь. Отсев — в коде у вызывающего.
 *
 * НЕ @Injectable: живёт один проход и держит инстанс Битрикса конкретного
 * домена (в поле @Injectable-сервиса это дало бы race condition).
 */
export class XoQueueReader {
    constructor(
        private readonly bitrix: BitrixInstance,
        private readonly statusId: string,
        private readonly select: string[],
    ) {}

    /**
     * Страницы очереди по возрастанию ID. Останавливается сама, когда
     * Битрикс отдал пустую страницу либо кончился потолок страниц;
     * вызывающий выходит раньше, набрав свою порцию.
     *
     * Ошибка запроса не глушится молча: страница отдаётся как `error`,
     * чтобы проход завершился с предупреждением, а не «пустой очередью».
     */
    async *pages(): AsyncGenerator<
        { rows: BxRow[]; error: null } | { rows: never[]; error: Error }
    > {
        let afterId = 0;
        for (let page = 0; page < MAX_PAGES; page += 1) {
            let rows: BxRow[];
            try {
                rows = await this.readPage(afterId);
            } catch (error) {
                yield { rows: [], error: error as Error };
                return;
            }
            if (!rows.length) return;

            yield { rows, error: null };

            const lastId = Number(rows[rows.length - 1]?.ID);
            if (!Number.isFinite(lastId) || lastId <= afterId) return;
            afterId = lastId;
        }
    }

    private async readPage(afterId: number): Promise<BxRow[]> {
        const { result } = await this.bitrix.lead.getList(
            { STATUS_ID: this.statusId, '>ID': afterId } as never,
            this.select,
            { ID: 'ASC' },
        );
        return ((result ?? []) as unknown as BxRow[]).filter(Boolean);
    }
}
