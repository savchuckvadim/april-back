import { InfoblockEntity } from '@lib/garant/infoblock';
import {
    ComplectDto,
    OfferComplectSectionDto,
    OfferComplectsModeEnum,
} from '@app/konstructor/document-generate';
import { INFOBLOCK_GROUP_TYPE } from '@app/konstructor/document-generate/dto/complect/complect.type';
import { InfoblocksRenderDataService } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferRenderInfoblocksService } from '../services/render-data-services/offer-render-infoblocks.service';

/**
 * Данные наполнения для шаблонов: верхний уровень — объединённое наполнение
 * из `complect`, ComplectSections — по элементу на комплект из `complects`,
 * тем же сервисом по группам комплекта.
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

const accountantGroups = [
    group('Нормативно-правовые акты', INFOBLOCK_GROUP_TYPE.NPA, [
        'npa1',
        'npa2',
        'npa3',
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
            Pick<OfferWordByTemplateGenerateDto, 'complects' | 'complectsMode'>
        >,
): OfferWordByTemplateGenerateDto =>
    Object.assign(new OfferWordByTemplateGenerateDto(), over);

const names = (items: Array<{ name: string }>): string[] =>
    items.map(item => item.name);

describe('OfferRenderInfoblocksService: наполнение по комплектам', () => {
    it('запрос без complects даёт прежние данные: объединённое наполнение, без ComplectSections и флага', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({ complect: unionGroups }),
        );

        expect(data.infoblocksByGroups.map(item => item.groupsName)).toEqual([
            'Нормативно-правовые акты',
            'Комментарии',
            'Судебная практика',
            'Консалтинг',
        ]);
        expect(names(data.NPA)).toEqual([
            'Блок npa1',
            'Блок npa2',
            'Блок npa3',
        ]);
        expect(names(data.CaseLaw)).toEqual(['Блок la1', 'Блок la2']);
        expect(data.simpleInfoblocks).toHaveLength(7);
        expect(data).not.toHaveProperty('ComplectSections');
        expect(data).not.toHaveProperty('IsComplectsSeparate');
    });

    it('пустой список complects не добавляет полей, даже при режиме separate', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                complects: [],
                complectsMode: OfferComplectsModeEnum.SEPARATE,
            }),
        );

        expect(data).not.toHaveProperty('ComplectSections');
        expect(data).not.toHaveProperty('IsComplectsSeparate');
    });

    it('ComplectSections: по элементу на комплект, заголовок и поставка берутся из запроса', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                complects: [
                    section('Бухгалтерия', accountantGroups, 'Интернет 3 ОД'),
                    section('Юрист', lawyerGroups),
                ],
            }),
        );

        expect(data.ComplectSections).toHaveLength(2);
        const [accountant, lawyer] = data.ComplectSections ?? [];
        expect(accountant.ComplectTitle).toBe('Бухгалтерия');
        expect(accountant.ComplectSupplyName).toBe('Интернет 3 ОД');
        expect(lawyer.ComplectTitle).toBe('Юрист');
        // подписи нет — пустая строка: плейсхолдер Word-шаблона не падает
        expect(lawyer.ComplectSupplyName).toBe('');
    });

    it('наполнение комплекта посчитано по его группам: все поля, что и на верхнем уровне', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                complects: [
                    section('Бухгалтерия', accountantGroups, 'Интернет 3 ОД'),
                    section('Юрист', lawyerGroups, 'Интернет 1 ОД'),
                ],
            }),
        );
        const [accountant, lawyer] = data.ComplectSections ?? [];

        expect(
            accountant.infoblocksByGroups.map(item => item.groupsName),
        ).toEqual(['Нормативно-правовые акты', 'Комментарии']);
        expect(names(accountant.simpleInfoblocks)).toEqual([
            'Блок npa1',
            'Блок npa2',
            'Блок npa3',
            'Блок cons1',
        ]);
        // две колонки: первая половина и вторая
        expect(
            names(accountant.simpleInfoblocksByColumns[0].columnOne),
        ).toEqual(['Блок npa1', 'Блок npa2']);
        expect(
            names(accountant.simpleInfoblocksByColumns[0].columnTwo),
        ).toEqual(['Блок npa3', 'Блок cons1']);
        expect(names(accountant.NPA)).toEqual([
            'Блок npa1',
            'Блок npa2',
            'Блок npa3',
        ]);
        expect(names(accountant.Comments)).toEqual(['Блок cons1']);
        // чужого наполнения в комплекте нет
        expect(accountant.CaseLaw).toEqual([]);
        expect(accountant.Consalting).toEqual([]);

        expect(names(lawyer.CaseLaw)).toEqual(['Блок la1', 'Блок la2']);
        expect(names(lawyer.Consalting)).toEqual(['Блок cs1']);
        expect(lawyer.NPA).toEqual([]);
        expect(lawyer.simpleInfoblocks).toHaveLength(3);
        // остальные поля наполнения на месте, пустые
        for (const key of [
            'Free',
            'Special',
            'STAR',
            'Academy',
            'PacketsEr',
            'Ers',
            'FreeBlocks',
            'LegalTech',
        ] as const) {
            expect(accountant[key]).toEqual([]);
        }
        // описания на месте: те же, что строит сервис для верхнего уровня
        expect(accountant.NPA[0]).toEqual({
            name: 'Блок npa1',
            infoblock: 'Блок npa1',
            smallDescription: 'Кратко npa1',
            mediumDescription: 'Средне npa1',
            bigDescription: 'Много npa1',
        });
    });

    it('верхние поля остаются объединённым наполнением из complect', async () => {
        const { service } = createService();
        const request = input({
            complect: unionGroups,
            complects: [
                section('Бухгалтерия', accountantGroups),
                section('Юрист', lawyerGroups),
            ],
            complectsMode: OfferComplectsModeEnum.SEPARATE,
        });
        const withSections = await service.renderInfoblocks(request);
        const without = await service.renderInfoblocks(
            input({ complect: unionGroups }),
        );

        expect(withSections.infoblocksByGroups).toEqual(
            without.infoblocksByGroups,
        );
        expect(withSections.simpleInfoblocks).toEqual(without.simpleInfoblocks);
        expect(withSections.NPA).toEqual(without.NPA);
        expect(withSections.CaseLaw).toEqual(without.CaseLaw);
        expect(withSections.LegalTech).toEqual(without.LegalTech);
    });

    it('ComplectSections заполняется всегда, когда complects прислан: и без режима, и в merged', async () => {
        const { service } = createService();
        const complects = [
            section('Бухгалтерия', accountantGroups),
            section('Юрист', lawyerGroups),
        ];

        const withoutMode = await service.renderInfoblocks(
            input({ complect: unionGroups, complects }),
        );
        const merged = await service.renderInfoblocks(
            input({
                complect: unionGroups,
                complects,
                complectsMode: OfferComplectsModeEnum.MERGED,
            }),
        );

        expect(withoutMode.ComplectSections).toHaveLength(2);
        expect(merged.ComplectSections).toHaveLength(2);
        expect(withoutMode.IsComplectsSeparate).toBe(false);
        expect(merged.IsComplectsSeparate).toBe(false);
    });

    const flagCases: Array<
        [string, OfferComplectsModeEnum | undefined, number, boolean]
    > = [
        ['separate и два комплекта', OfferComplectsModeEnum.SEPARATE, 2, true],
        ['separate и три комплекта', OfferComplectsModeEnum.SEPARATE, 3, true],
        ['separate и один комплект', OfferComplectsModeEnum.SEPARATE, 1, false],
        ['merged и два комплекта', OfferComplectsModeEnum.MERGED, 2, false],
        ['режим не задан и два комплекта', undefined, 2, false],
    ];

    it.each(flagCases)(
        'IsComplectsSeparate: %s',
        async (_name, complectsMode, count, expected) => {
            const { service } = createService();
            const data = await service.renderInfoblocks(
                input({
                    complect: unionGroups,
                    complects: Array.from({ length: count }, (_item, index) =>
                        section(`Комплект ${index + 1}`, accountantGroups),
                    ),
                    complectsMode,
                }),
            );

            expect(data.ComplectSections).toHaveLength(count);
            expect(data.IsComplectsSeparate).toBe(expected);
        },
    );

    it('комплект без групп даёт пустое наполнение, а элемент массива остаётся', async () => {
        const { service } = createService();
        const data = await service.renderInfoblocks(
            input({
                complect: accountantGroups,
                complects: [
                    section('Бухгалтерия', accountantGroups),
                    section('Пустой', []),
                ],
                complectsMode: OfferComplectsModeEnum.SEPARATE,
            }),
        );

        expect(data.ComplectSections).toHaveLength(2);
        const [, empty] = data.ComplectSections ?? [];
        expect(empty.ComplectTitle).toBe('Пустой');
        expect(empty.infoblocksByGroups).toEqual([]);
        expect(empty.simpleInfoblocks).toEqual([]);
        expect(empty.NPA).toEqual([]);
    });
});
