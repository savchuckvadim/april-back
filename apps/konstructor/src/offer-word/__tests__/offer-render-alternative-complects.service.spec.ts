import { InfoblockEntity } from '@lib/garant/infoblock';
import {
    ComplectDto,
    OfferAlternativeSetComplectsDto,
    OfferComplectSectionDto,
    OfferComplectsModeEnum,
} from '@app/konstructor/document-generate';
import { INFOBLOCK_GROUP_TYPE } from '@app/konstructor/document-generate/dto/complect/complect.type';
import { InfoblocksRenderDataService } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferRenderInfoblocksService } from '../services/render-data-services/offer-render-infoblocks.service';

/**
 * Данные наполнения наборов для сравнения для шаблонов: AlternativeComplectSections —
 * по элементу на набор из `alternativeComplects`, внутри разделы его комплектов
 * (`ComplectSections`), посчитанные тем же сервисом, что и комплекты общего набора.
 */
const infoblock = (code: string): InfoblockEntity =>
    Object.assign(new InfoblockEntity(), {
        code,
        name: `Блок ${code}`,
        shortDescription: `Кратко ${code}`,
        descriptionForSale: `Средне ${code}`,
        description: `Много ${code}`,
    });

const group = (
    groupsName: string,
    type: INFOBLOCK_GROUP_TYPE,
    codes: string[],
): ComplectDto => ({
    groupsName,
    type,
    value: codes.map(code => ({
        code,
        name: code,
        checked: true,
        weight: 1,
    })),
});

const section = (
    title: string,
    complect: ComplectDto[],
    supplyName?: string,
): OfferComplectSectionDto =>
    Object.assign(new OfferComplectSectionDto(), {
        title,
        complect,
        ...(supplyName === undefined ? {} : { supplyName }),
    });

const alternativeSet = (
    setNumber: number,
    complects: OfferComplectSectionDto[],
    title = `Набор ${setNumber}`,
): OfferAlternativeSetComplectsDto =>
    Object.assign(new OfferAlternativeSetComplectsDto(), {
        setNumber,
        title,
        complects,
    });

const accountantGroups = [
    group('Нормативно-правовые акты', INFOBLOCK_GROUP_TYPE.NPA, [
        'npa1',
        'npa2',
    ]),
    group('Комментарии', INFOBLOCK_GROUP_TYPE.CONS, ['cons1']),
];
const lawyerGroups = [
    group('Судебная практика', INFOBLOCK_GROUP_TYPE.LA, ['la1', 'la2']),
    group('Консалтинг', INFOBLOCK_GROUP_TYPE.CONSULTING, ['cs1']),
];
const unionGroups = [...accountantGroups, ...lawyerGroups];

const createService = () => {
    const infoblocks = {
        getInfoblocksByCodse: jest.fn((codes: string[]) =>
            Promise.resolve(codes.map(infoblock)),
        ),
    };
    const service = new OfferRenderInfoblocksService(
        new InfoblocksRenderDataService(infoblocks as never),
    );
    return { service, infoblocks };
};

const input = (
    over: Pick<OfferWordByTemplateGenerateDto, 'complect'> &
        Partial<
            Pick<
                OfferWordByTemplateGenerateDto,
                'complects' | 'complectsMode' | 'alternativeComplects'
            >
        >,
): OfferWordByTemplateGenerateDto =>
    Object.assign(new OfferWordByTemplateGenerateDto(), over);

const names = (items: Array<{ name: string }>): string[] =>
    items.map(item => item.name);

describe('OfferRenderInfoblocksService: наполнение наборов для сравнения', () => {
    it('запрос без alternativeComplects даёт прежние данные: без AlternativeComplectSections и флага', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({ complect: unionGroups }),
        );

        expect(data).not.toHaveProperty('AlternativeComplectSections');
        expect(data).not.toHaveProperty('IsAlternativeComplects');
        expect(data.infoblocksByGroups).toHaveLength(4);
        expect(data.simpleInfoblocks).toHaveLength(6);
    });

    it('данные без поля равны данным с пустым списком наборов', async () => {
        const { service } = createService();
        const without = await service.renderInfoblocks(
            input({ complect: unionGroups }),
        );
        const empty = await service.renderInfoblocks(
            input({ complect: unionGroups, alternativeComplects: [] }),
        );

        expect(empty).toEqual(without);
        expect(Object.keys(empty).sort()).toEqual(Object.keys(without).sort());
    });

    it('наборы без комплектов в данные не попадают: полей нет, как без запроса', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                alternativeComplects: [alternativeSet(1, [])],
            }),
        );

        expect(data).not.toHaveProperty('AlternativeComplectSections');
        expect(data).not.toHaveProperty('IsAlternativeComplects');
    });

    it('набор: номер и заголовок из запроса, внутри разделы его комплектов', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                alternativeComplects: [
                    alternativeSet(1, [
                        section('Юрист', lawyerGroups, 'Интернет 5 ОД'),
                    ]),
                    alternativeSet(2, [
                        section('Бухгалтерия', accountantGroups),
                        section('Юрист', lawyerGroups, 'Интернет 1 ОД'),
                    ]),
                ],
            }),
        );

        expect(data.IsAlternativeComplects).toBe(true);
        expect(data.AlternativeComplectSections).toHaveLength(2);
        const [first, second] = data.AlternativeComplectSections ?? [];
        expect(first.AlternativeSetNumber).toBe(1);
        expect(first.AlternativeSetTitle).toBe('Набор 1');
        expect(first.ComplectSections).toHaveLength(1);
        expect(first.ComplectSections[0].ComplectTitle).toBe('Юрист');
        expect(first.ComplectSections[0].ComplectSupplyName).toBe(
            'Интернет 5 ОД',
        );
        expect(second.AlternativeSetNumber).toBe(2);
        expect(second.AlternativeSetTitle).toBe('Набор 2');
        expect(second.ComplectSections.map(item => item.ComplectTitle)).toEqual(
            ['Бухгалтерия', 'Юрист'],
        );
        // подписи нет — пустая строка: плейсхолдер Word-шаблона не падает
        expect(second.ComplectSections[0].ComplectSupplyName).toBe('');
        expect(second.ComplectSections[1].ComplectSupplyName).toBe(
            'Интернет 1 ОД',
        );
    });

    it('заголовок набора берётся из запроса как есть', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                alternativeComplects: [
                    alternativeSet(
                        3,
                        [section('Юрист', lawyerGroups)],
                        'Набор для юриста',
                    ),
                ],
            }),
        );

        const [set] = data.AlternativeComplectSections ?? [];
        expect(set.AlternativeSetNumber).toBe(3);
        expect(set.AlternativeSetTitle).toBe('Набор для юриста');
    });

    it('наполнение комплекта набора посчитано по его группам: все поля, что и у комплекта общего набора', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                alternativeComplects: [
                    alternativeSet(1, [
                        section('Бухгалтерия', accountantGroups),
                        section('Юрист', lawyerGroups),
                    ]),
                ],
            }),
        );
        const [accountant, lawyer] =
            data.AlternativeComplectSections?.[0].ComplectSections ?? [];

        expect(
            accountant.infoblocksByGroups.map(item => item.groupsName),
        ).toEqual(['Нормативно-правовые акты', 'Комментарии']);
        expect(names(accountant.simpleInfoblocks)).toEqual([
            'Блок npa1',
            'Блок npa2',
            'Блок cons1',
        ]);
        expect(names(accountant.NPA)).toEqual(['Блок npa1', 'Блок npa2']);
        expect(names(accountant.Comments)).toEqual(['Блок cons1']);
        expect(accountant.CaseLaw).toEqual([]);
        expect(names(lawyer.CaseLaw)).toEqual(['Блок la1', 'Блок la2']);
        expect(names(lawyer.Consalting)).toEqual(['Блок cs1']);
        expect(lawyer.NPA).toEqual([]);
        expect(accountant.NPA[0]).toEqual({
            name: 'Блок npa1',
            infoblock: 'Блок npa1',
            smallDescription: 'Кратко npa1',
            mediumDescription: 'Средне npa1',
            bigDescription: 'Много npa1',
        });
    });

    it('порядок наборов совпадает с порядком запроса при любых номерах', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                alternativeComplects: [
                    alternativeSet(2, [section('Юрист', lawyerGroups)]),
                    alternativeSet(1, [
                        section('Бухгалтерия', accountantGroups),
                    ]),
                ],
            }),
        );

        expect(
            data.AlternativeComplectSections?.map(
                item => item.AlternativeSetNumber,
            ),
        ).toEqual([2, 1]);
    });

    it('набор без комплектов пропущен, остальные на месте', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                alternativeComplects: [
                    alternativeSet(1, []),
                    alternativeSet(2, [section('Юрист', lawyerGroups)]),
                ],
            }),
        );

        expect(data.IsAlternativeComplects).toBe(true);
        expect(
            data.AlternativeComplectSections?.map(
                item => item.AlternativeSetNumber,
            ),
        ).toEqual([2]);
    });

    it('комплект набора без групп остаётся элементом с пустым наполнением, как у общего набора', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                alternativeComplects: [
                    alternativeSet(1, [
                        section('Бухгалтерия', accountantGroups),
                        section('Пустой', []),
                    ]),
                ],
            }),
        );

        const sections =
            data.AlternativeComplectSections?.[0].ComplectSections ?? [];
        expect(sections).toHaveLength(2);
        expect(sections[1].ComplectTitle).toBe('Пустой');
        expect(sections[1].infoblocksByGroups).toEqual([]);
        expect(sections[1].simpleInfoblocks).toEqual([]);
    });

    it('верхние поля и наполнение комплектов общего набора не меняются от наборов для сравнения', async () => {
        const { service } = createService();
        const general = {
            complect: unionGroups,
            complects: [
                section('Бухгалтерия', accountantGroups, 'Интернет 3 ОД'),
                section('Юрист', lawyerGroups),
            ],
            complectsMode: OfferComplectsModeEnum.SEPARATE,
        };
        const without = await service.renderInfoblocks(input(general));
        const withAlternatives = await service.renderInfoblocks(
            input({
                ...general,
                alternativeComplects: [
                    alternativeSet(1, [section('Другой', lawyerGroups)]),
                ],
            }),
        );

        expect(withAlternatives.infoblocksByGroups).toEqual(
            without.infoblocksByGroups,
        );
        expect(withAlternatives.NPA).toEqual(without.NPA);
        expect(withAlternatives.ComplectSections).toEqual(
            without.ComplectSections,
        );
        expect(withAlternatives.IsComplectsSeparate).toBe(true);
        expect(without).not.toHaveProperty('AlternativeComplectSections');
    });

    it('наборы для сравнения считаются и без complects общего набора', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                alternativeComplects: [
                    alternativeSet(1, [section('Юрист', lawyerGroups)]),
                ],
            }),
        );

        expect(data).not.toHaveProperty('ComplectSections');
        expect(data).not.toHaveProperty('IsComplectsSeparate');
        expect(data.AlternativeComplectSections).toHaveLength(1);
    });

    it('каталог инфоблоков читается по группам каждого комплекта набора', async () => {
        const { service, infoblocks } = createService();
        await service.renderInfoblocks(
            input({
                complect: [],
                alternativeComplects: [
                    alternativeSet(1, [section('Юрист', lawyerGroups)]),
                ],
            }),
        );

        const requested = infoblocks.getInfoblocksByCodse.mock.calls.flatMap(
            ([codes]) => codes,
        );
        expect(requested.length).toBeGreaterThan(0);
        expect([...new Set(requested)].sort()).toEqual(['cs1', 'la1', 'la2']);
    });
});
