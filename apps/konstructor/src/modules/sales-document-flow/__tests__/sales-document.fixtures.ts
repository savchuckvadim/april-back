import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { ProductRowSetDto } from '@app/konstructor/document-generate/dto/product-row-set/product-row-set.dto';
import type { QueueNames } from '@lib/queue/constants/queue-names.enum';
import type { JobNames } from '@lib/queue/constants/job-names.enum';
import type { SalesDocumentEventJobData } from '@lib/queue/constants/sales-document-event-job';
import type { SalesDocumentSource } from '../lib/sales-document-source';

/** Аргументы `QueueDispatcherService.dispatch`, которые смотрят тесты потока продаж. */
export type SalesDispatchArgs = [
    QueueNames,
    JobNames,
    SalesDocumentEventJobData,
    string,
    { attempts: number },
];

/** Подмена `dispatch` с типизированными вызовами. */
export type DispatchMock = jest.Mock<Promise<unknown>, SalesDispatchArgs>;

/** Очередь принимает событие. */
export const okDispatch = (): DispatchMock =>
    jest.fn<Promise<unknown>, SalesDispatchArgs>().mockResolvedValue({});

/** Очередь недоступна: постановка падает с этим текстом. */
export const failingDispatch = (message: string): DispatchMock =>
    jest
        .fn<Promise<unknown>, SalesDispatchArgs>()
        .mockRejectedValue(new Error(message));

/** Событие из N-го вызова `dispatch`. */
export const eventOfCall = (
    dispatch: DispatchMock,
    call = 0,
): SalesDocumentEventJobData => dispatch.mock.calls[call][2];

/** Поля строки таблицы цен, которые читает поток продаж. */
export interface RowOptions {
    name?: string;
    shortName?: string;
    alternativeName?: string;
    /** general (по умолчанию) или alternative. */
    type?: string;
    /** Цена за единицу по прайсу. */
    list?: number;
    /** Цена за единицу со скидкой. */
    current?: number;
    quantity?: number;
    /** Сумма строки; по умолчанию current × quantity. */
    sum?: number;
    measureCode?: number;
    supplyName?: string;
}

/** Строка таблицы цен: только то, что нужно потоку продаж. */
export const priceRow = (options: RowOptions = {}): ProductRowDto => {
    const current = options.current ?? 1000;
    const quantity = options.quantity ?? 12;
    return {
        name: options.name ?? 'Гарант-Максимум',
        shortName: options.shortName ?? '',
        ...(options.alternativeName
            ? { alternativeName: options.alternativeName }
            : {}),
        type: options.type ?? 'general',
        setId: 0,
        ...(options.supplyName
            ? { supply: { name: options.supplyName, forkp: '' } }
            : {}),
        price: {
            default: options.list ?? current,
            current,
            quantity,
            sum: options.sum ?? current * quantity,
            measure: {
                id: options.measureCode ?? 0,
                code: options.measureCode ?? 0,
                type: 1,
                name: 'мес.',
                contractNumber: 1,
            },
            month: current,
            discount: { precent: 1, amount: 0, current: 'percent' },
        },
    } as unknown as ProductRowDto;
};

/** Набор из строк Гаранта. */
export const garantSet = (...rows: ProductRowDto[]): ProductRowSetDto =>
    ({
        id: 0,
        show: true,
        rows: { garant: rows },
        total: [],
    }) as unknown as ProductRowSetDto;

/** Документ из одной строки: общий набор, итог и поставка. */
export const offerSource = (
    options: RowOptions & { totalSum?: number; supply?: string } = {},
): SalesDocumentSource => {
    const main = priceRow({
        supplyName: options.supply ?? 'Интернет 5 ОД',
        ...options,
    });
    const quantity = options.quantity ?? 12;
    const current = options.current ?? 1000;
    return {
        supply: { name: options.supply ?? 'Интернет 5 ОД' },
        rows: [main],
        sets: { general: [garantSet(main)] },
        total: priceRow({
            name: 'Итого',
            current,
            quantity,
            sum: options.totalSum ?? current * quantity,
        }),
    };
};
