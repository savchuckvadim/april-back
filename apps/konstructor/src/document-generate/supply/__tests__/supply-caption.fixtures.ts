import { SupplyEntity, SupplyService, SupplyTextService } from '@lib/garant';
import { SupplyRepository } from '@lib/garant/supply/supply.repository';
import { SupplyDto } from '../../../dto/supply.dto';
import {
    ProductRowDto,
    ProductRowSupplyDto,
} from '../../dto/product-row/product-row.dto';
import {
    ProductRowSetDto,
    ProductRowSetItemDto,
} from '../../dto/product-row-set/product-row-set.dto';
import { ProductDto } from '../../dto/product/product.dto';

/** Подписи КП, которые шаблон справочника даёт для 5 и 7 ОД. */
export const INTERNET_5_CAPTION =
    'Интернет версия на 5 одновременных доступов к системе';
export const INTERNET_7_CAPTION =
    'Интернет версия на 7 одновременных доступов к системе';
export const INTERNET_10_CAPTION =
    'Интернет версия на 10 одновременных доступов к системе';

const INTERNET_TEMPLATES: Partial<SupplyEntity> = {
    contractName: 'Многопользовательская Интернет-версия {n}',
    quantityForKp:
        'Интернет версия на {n} {plural:одновременный доступ|одновременных доступа|одновременных доступов} к системе',
};

const supplyEntity = (
    code: string,
    usersQuantity: number,
    templates: Partial<SupplyEntity>,
): SupplyEntity =>
    Object.assign(new SupplyEntity(), {
        id: BigInt(usersQuantity),
        code,
        type: 'internet',
        usersQuantity,
        name: `Интернет ${usersQuantity} ОД`,
        fullName: '',
        shortName: '',
        coefficient: 1,
        saleName_1: null,
        saleName_2: null,
        saleName_3: null,
        description: null,
        color: null,
        contractName: null,
        contractProp1: null,
        contractProp2: null,
        contractPropSuppliesQuantity: null,
        contractPropLoginsQuantity: null,
        contractPropComment: null,
        contractPropEmail: null,
        quantityForKp: null,
        lcontractName: null,
        lcontractProp2: null,
        lcontractPropComment: null,
        lcontractPropEmail: null,
        acontractName: null,
        acontractPropComment: null,
        created_at: null,
        updated_at: null,
        ...templates,
    });

/**
 * Справочник поставок в памяти со счётчиками обращений: сколько раз читали
 * и сколько чтений шло одновременно.
 */
export class StubSupplyRepository extends SupplyRepository {
    byCodeCalls = 0;
    manyCalls = 0;
    maxInFlight = 0;
    private inFlight = 0;

    constructor(private readonly items: SupplyEntity[]) {
        super();
    }

    /** Все чтения. */
    get totalCalls(): number {
        return this.byCodeCalls + this.manyCalls;
    }

    create(): Promise<SupplyEntity | null> {
        return Promise.resolve(null);
    }

    update(): Promise<SupplyEntity | null> {
        return Promise.resolve(null);
    }

    findById(): Promise<SupplyEntity | null> {
        return Promise.resolve(null);
    }

    updateAll(): Promise<SupplyEntity[] | null> {
        return Promise.resolve([]);
    }

    async findByCode(code: string): Promise<SupplyEntity | null> {
        this.byCodeCalls += 1;
        await this.occupy();
        return this.items.find(item => item.code === code) ?? null;
    }

    async findMany(): Promise<SupplyEntity[] | null> {
        this.manyCalls += 1;
        await this.occupy();
        return this.items;
    }

    /** Чтение занимает такт: параллельные обращения успели бы пересечься. */
    private async occupy(): Promise<void> {
        this.inFlight += 1;
        this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
        await new Promise<void>(resolve => setImmediate(resolve));
        this.inFlight -= 1;
    }
}

export const createSupplyKit = (): {
    repository: StubSupplyRepository;
    supplyTexts: SupplyTextService;
} => {
    const repository = new StubSupplyRepository([
        supplyEntity('internet_5', 5, INTERNET_TEMPLATES),
        supplyEntity('internet_10', 10, INTERNET_TEMPLATES),
    ]);
    return {
        repository,
        supplyTexts: new SupplyTextService(new SupplyService(repository)),
    };
};

/** Поставка, как её шлёт новый фронт: только код и число ОД, без текстов. */
export const supplyDto = (code: string, usersQuantity: number): SupplyDto =>
    Object.assign(new SupplyDto(), { code, usersQuantity });

export interface RowCaptions {
    quantityForKp?: string;
    forkp?: string;
}

/**
 * Строка таблицы КП. Подписи по умолчанию пустые: их дополняют из
 * справочника по коду поставки строки.
 */
export const captionRow = (
    name: string,
    supply: SupplyDto,
    captions: RowCaptions = {},
): ProductRowDto =>
    Object.assign(new ProductRowDto(), {
        name,
        currentSupply: supply,
        supply: Object.assign(new ProductRowSupplyDto(), {
            forkp: captions.forkp ?? '',
        }),
        product: Object.assign(new ProductDto(), {
            quantityForKp: captions.quantityForKp ?? '',
        }),
    });

/** Набор со строкой в каждом из шести типов продукта и со строкой итога. */
export const fullSet = (
    id: number,
    supply: SupplyDto,
    captions: RowCaptions = {},
): ProductRowSetDto =>
    Object.assign(new ProductRowSetDto(), {
        id,
        show: true,
        rows: Object.assign(new ProductRowSetItemDto(), {
            garant: [captionRow(`Гарант ${id}`, supply, captions)],
            lt: [captionRow(`LT ${id}`, supply, captions)],
            lt_other: [captionRow(`LT прочее ${id}`, supply, captions)],
            consalting: [captionRow(`Консалтинг ${id}`, supply, captions)],
            star: [captionRow(`СТАР ${id}`, supply, captions)],
            academy: [captionRow(`Академия ${id}`, supply, captions)],
        }),
        total: [captionRow(`Итого ${id}`, supply, captions)],
    });
