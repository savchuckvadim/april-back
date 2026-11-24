/**
 * Буфер пачки и фейковый Битрикс, который записывает вызовы, а не выполняет их.
 */
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';

// === Буфер пачки ===
/** Буфер, который сразу исполняет поставленные команды и считает их. */
export const makeFakeBuffer = (): IBatchGroupBuffer => {
    let queued = 0;
    return {
        queue: enqueue => {
            queued += 1;
            enqueue();
        },
        endGroup: () => Promise.resolve(),
        flush: () => Promise.resolve(),
        getResults: () => [],
        getCurrentGroupSize: () => queued,
        getBufferSize: () => queued,
    };
};

// === Фейковый Битрикс ===
export interface RecordedGet {
    cmd: string;
    id: number;
}

export interface RecordedList {
    cmd: string;
    filter: Record<string, unknown>;
    select: readonly string[];
}

export interface RecordedUpdate {
    cmd: string;
    id: number;
    fields: Record<string, string | number>;
}

export interface ProductRowSetDto {
    ownerType: string;
    ownerId: number;
    productRows: readonly Record<string, unknown>[];
}

export interface RecordedProductRowSet {
    cmd: string;
    dto: ProductRowSetDto;
}

export interface ListItemAddDto {
    IBLOCK_ID: string;
    ELEMENT_CODE: string;
    FIELDS: Record<string, unknown>;
}

export interface ListItemUpdateDto {
    IBLOCK_ID: string;
    ELEMENT_ID: number;
    FIELDS: Record<string, unknown>;
}

export interface ListItemGetDto {
    IBLOCK_ID: string;
    ELEMENT_CODE: string;
    select?: readonly string[];
}

export interface RecordedListAdd {
    cmd: string;
    dto: ListItemAddDto;
}

export interface RecordedListUpdate {
    cmd: string;
    dto: ListItemUpdateDto;
}

/** Строка списка в виде ответа `lists.element.get`. */
export interface FakeListItem {
    ID: number | string;
    CODE: string;
    NAME?: string;
    [property: string]: unknown;
}

/** Строка, которая уже лежит в списке портала. */
export interface StoredListItem {
    iblockId: number;
    item: FakeListItem;
}

export interface FakeBitrixOptions {
    /** Строки списков, которые уже есть на портале. */
    listItems?: readonly StoredListItem[];
    /** Что отвечает `listItem.get`, когда строки нет: пусто или ошибка. */
    listGetMissing?: 'empty' | 'throw';
}

interface BatchCallOptions {
    strict?: boolean;
}

export interface BatchChunk {
    result: Record<string, unknown>;
}

/**
 * Битрикс, который записывает вызовы пачек. `batchChunks` — то, что вернёт
 * `callBatchWithConcurrency` (по одному элементу на отправленную пачку);
 * `callBatchWithConcurrency` — `jest.fn`, ответ на отдельный вызов можно
 * подменить через `mockResolvedValueOnce` / `mockRejectedValueOnce`.
 */
export const makeFakeBitrix = (
    batchChunks: readonly Record<string, unknown>[] = [],
    options: FakeBitrixOptions = {},
) => {
    /** Все команды чтения в порядке постановки. */
    const commands: string[] = [];
    const companyGets: RecordedGet[] = [];
    const dealGets: RecordedGet[] = [];
    const dealLists: RecordedList[] = [];
    const companyUpdates: RecordedUpdate[] = [];
    const dealUpdates: RecordedUpdate[] = [];
    const productRowSets: RecordedProductRowSet[] = [];
    const listAdds: RecordedListAdd[] = [];
    const listUpdates: RecordedListUpdate[] = [];
    /** Прямые чтения строк списков (`lists.element.get`, не в пачке). */
    const listGets: ListItemGetDto[] = [];
    const callBatchWithConcurrency = jest.fn<
        Promise<BatchChunk[]>,
        [number, BatchCallOptions?]
    >(() => Promise.resolve(batchChunks.map(result => ({ result }))));

    const getListItem = (dto: ListItemGetDto) => {
        listGets.push(dto);
        const found = (options.listItems ?? [])
            .filter(
                stored =>
                    String(stored.iblockId) === dto.IBLOCK_ID &&
                    stored.item.CODE === dto.ELEMENT_CODE,
            )
            .map(stored => stored.item);
        if (!found.length && options.listGetMissing === 'throw') {
            return Promise.reject(new Error('Element not found'));
        }
        return Promise.resolve({ result: found });
    };

    const bitrix = {
        batch: {
            company: {
                get: (cmd: string, id: number) => {
                    commands.push(cmd);
                    companyGets.push({ cmd, id });
                },
                update: (
                    cmd: string,
                    id: number,
                    fields: Record<string, string | number>,
                ) => {
                    companyUpdates.push({ cmd, id, fields });
                },
            },
            deal: {
                get: (cmd: string, id: number) => {
                    commands.push(cmd);
                    dealGets.push({ cmd, id });
                },
                getList: (
                    cmd: string,
                    filter: Record<string, unknown>,
                    select: readonly string[],
                ) => {
                    commands.push(cmd);
                    dealLists.push({ cmd, filter, select });
                },
                update: (
                    cmd: string,
                    id: number,
                    fields: Record<string, string | number>,
                ) => {
                    dealUpdates.push({ cmd, id, fields });
                },
            },
            productRow: {
                set: (cmd: string, dto: ProductRowSetDto) => {
                    productRowSets.push({ cmd, dto });
                },
            },
            listItem: {
                add: (cmd: string, dto: ListItemAddDto) => {
                    listAdds.push({ cmd, dto });
                },
                update: (cmd: string, dto: ListItemUpdateDto) => {
                    listUpdates.push({ cmd, dto });
                },
            },
        },
        listItem: { get: getListItem },
        api: { callBatchWithConcurrency },
    };
    return {
        bitrix,
        commands,
        companyGets,
        dealGets,
        dealLists,
        companyUpdates,
        dealUpdates,
        productRowSets,
        listAdds,
        listUpdates,
        listGets,
        callBatchWithConcurrency,
    };
};
