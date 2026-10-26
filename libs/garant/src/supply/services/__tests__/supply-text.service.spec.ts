import { SupplyTextService } from '../supply-text.service';
import { SupplyEntity } from '../../supply.entity';
import type { SupplyService } from '../api/supply.service';

const supply = (
    code: string,
    type: 'internet' | 'proxima',
    usersQuantity: number,
    templates: Partial<SupplyEntity> = {},
): SupplyEntity =>
    Object.assign(new SupplyEntity(), {
        id: BigInt(usersQuantity),
        code,
        type,
        usersQuantity,
        name: `${type === 'internet' ? 'Интернет' : 'Проксима'} ${usersQuantity} ОД`,
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

const INTERNET_TEMPLATES: Partial<SupplyEntity> = {
    contractName: 'Многопользовательская Интернет-версия {n}',
    contractPropSuppliesQuantity: '{n}',
    quantityForKp:
        'Интернет версия на {n} {plural:одновременный доступ|одновременных доступа|одновременных доступов} к системе',
    contractPropLoginsQuantity:
        'Неограниченно с возможностью одновременной работы {words:gen} Пользователей',
};

const SUPPLIES: SupplyEntity[] = [
    supply('internet_std', 'internet', 1, {
        contractName: 'Стандартная Интернет-версия*',
        quantityForKp: 'Интернет версия на 1 доступ к системе',
    }),
    supply('internet_1', 'internet', 1, INTERNET_TEMPLATES),
    supply('internet_5', 'internet', 5, INTERNET_TEMPLATES),
    supply('internet_10', 'internet', 10, INTERNET_TEMPLATES),
    supply('proxima_flash', 'proxima', 1, {
        contractName: 'Проксима мобильная онлайн с РРД**',
    }),
    supply('proxima_1', 'proxima', 1, {
        contractName: 'на одном сервере … {words:gen} пользователей*',
    }),
];

const fakeSupplyService = {
    findByCode: (code: string) =>
        Promise.resolve(SUPPLIES.find(s => s.code === code) ?? null),
    findMany: () => Promise.resolve(SUPPLIES),
} as unknown as SupplyService;

describe('SupplyTextService', () => {
    const service = new SupplyTextService(fakeSupplyService);

    it('справочная поставка: тексты под её число ОД', async () => {
        const texts = await service.resolve('internet_5');
        expect(texts?.contractName).toBe(
            'Многопользовательская Интернет-версия 5',
        );
        expect(texts?.quantityForKp).toBe(
            'Интернет версия на 5 одновременных доступов к системе',
        );
        expect(texts?.contractPropSuppliesQuantity).toBe('5');
        expect(texts?.sourceCode).toBe('internet_5');
    });

    it('X-ОД: шаблон ближайшей снизу справочной поставки того же типа', async () => {
        const texts = await service.resolve('x_internet_7');
        expect(texts?.sourceCode).toBe('internet_5');
        expect(texts?.usersQuantity).toBe(7);
        expect(texts?.name).toBe('Интернет 7 ОД');
        expect(texts?.contractName).toBe(
            'Многопользовательская Интернет-версия 7',
        );
        expect(texts?.contractPropLoginsQuantity).toBe(
            'Неограниченно с возможностью одновременной работы семи Пользователей',
        );
    });

    it('X-ОД меньше минимальной справочной — берётся минимальная; особые (std/flash) не участвуют', async () => {
        const internet = await service.resolve('x_internet_1');
        expect(internet?.sourceCode).toBe('internet_1');
        const proxima = await service.resolve('x_proxima_3');
        expect(proxima?.sourceCode).toBe('proxima_1');
        expect(proxima?.contractName).toBe(
            'на одном сервере … трёх пользователей*',
        );
    });

    it('неизвестный код — null', async () => {
        expect(await service.resolve('nope')).toBeNull();
        expect(await service.resolve('x_internet_0')).toBeNull();
    });

    it('enrich: пустые поля заполняются, пришедшие с фронта — сильнее', async () => {
        const enriched = await service.enrich({
            code: 'internet_10',
            contractName: 'Свой текст договора',
            quantityForKp: '',
            contractPropComment: false,
        });
        expect(enriched.contractName).toBe('Свой текст договора');
        expect(enriched.quantityForKp).toBe(
            'Интернет версия на 10 одновременных доступов к системе',
        );
        // в шаблонах поля нет — остаётся как пришло
        expect(enriched.contractPropComment).toBe(false);
    });

    it('enrich без code — payload не трогаем', async () => {
        const payload = { name: 'Интернет 2 ОД', quantityForKp: '' };
        expect(await service.enrich(payload)).toBe(payload);
    });
});
