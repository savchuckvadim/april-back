import { ComplectTableService } from '../services/complect-table.service';
import { ComplectEntity } from '../../complect/complect.entity';
import {
    ComplectProductTypeEnum,
    ComplectTypeEnum,
} from '../../complect/types/complect.type';
import { readSheet, readWorkbook } from '../lib/sheet-reader';
import { writeWorkbook } from '../lib/sheet-writer';

const complect = (overrides: Partial<ComplectEntity> = {}): ComplectEntity =>
    ({
        id: '1',
        code: 'classic',
        name: 'Классик',
        fullName: 'Классик',
        shortName: 'Классик',
        type: ComplectTypeEnum.UNIVERSAL,
        productType: ComplectProductTypeEnum.GARANT,
        number: 9,
        weight: 0,
        abs: '200',
        color: '',
        withABS: true,
        withConsalting: false,
        withServices: false,
        withLt: false,
        isChanging: false,
        withDefault: false,
        infoblocks: [{ id: '11' }, { id: '12' }],
        ...overrides,
    }) as ComplectEntity;

const pkg = () => ({
    id: '5',
    code: 'pkpremium',
    name: 'Правовой консалтинг',
    fullName: 'Правовой консалтинг. Премиум',
    shortName: 'Правовой консалтинг',
    type: 'prof',
    productType: 'consalting',
    number: 2,
    weight: 0,
    abs: 3,
    withABS: true,
    isChanging: false,
    withDefault: false,
});

const makeService = (
    complects: ComplectEntity[],
    packages: ReturnType<typeof pkg>[] = [],
) => {
    const complectService = {
        findAll: jest.fn().mockResolvedValue(complects),
        create: jest.fn().mockResolvedValue({ id: '9' }),
        update: jest.fn().mockResolvedValue({ id: '1' }),
    };
    const packageService = {
        findAll: jest.fn().mockResolvedValue(packages),
        create: jest.fn().mockResolvedValue({ id: '7' }),
        update: jest.fn().mockResolvedValue({ id: '5' }),
    };
    return {
        service: new ComplectTableService(
            complectService as never,
            packageService as never,
        ),
        complectService,
        packageService,
    };
};

const buildFile = async (
    complectRows: (string | number | boolean | null)[][],
    headers: string[],
): Promise<Buffer> =>
    await writeWorkbook([{ name: 'complects', headers, rows: complectRows }]);

describe('ComplectTableService', () => {
    it('выгружает карточки комплектов и пакетов двумя листами', async () => {
        const { service } = makeService([complect()], [pkg()]);
        const workbook = await readWorkbook(await service.export());

        const complects = readSheet(workbook, 'complects');
        const packages = readSheet(workbook, 'packages');

        expect(complects.rows[0].string('code')).toBe('classic');
        expect(complects.rows[0].string('abs')).toBe('200');
        expect(packages.rows[0].string('code')).toBe('pkpremium');
        // у консалтинга рабс вместо цены
        expect(packages.rows[0].number('abs')).toBe(3);
    });

    it('круг export → import без правок ничего не меняет', async () => {
        const { service, complectService, packageService } = makeService(
            [complect()],
            [pkg()],
        );
        const reports = await service.import(await service.export(), false);

        expect(reports.every(report => report.unchanged === 1)).toBe(true);
        expect(complectService.update).not.toHaveBeenCalled();
        expect(packageService.update).not.toHaveBeenCalled();
    });

    it('обновление рабса не теряет остальные поля и состав инфоблоков', async () => {
        const { service, complectService } = makeService([complect()]);
        const [report] = await service.import(
            await buildFile([['classic', 250]], ['code', 'abs']),
            false,
        );

        expect(report.updated).toBe(1);
        expect(complectService.update).toHaveBeenCalledWith(
            '1',
            expect.objectContaining({
                code: 'classic',
                abs: '250',
                name: 'Классик',
                type: 'universal',
                productType: 'garant',
                withABS: true,
                infoblockIds: ['11', '12'],
            }),
        );
    });

    it('неизвестный тип или productType отклоняется с причиной', async () => {
        const { service, complectService } = makeService([complect()]);
        const [report] = await service.import(
            await buildFile(
                [['classic', 'megaprof', 'garant']],
                ['code', 'type', 'productType'],
            ),
            false,
        );

        expect(report.skipped).toHaveLength(1);
        expect(report.skipped[0].reason).toContain('prof|universal');
        expect(complectService.update).not.toHaveBeenCalled();
    });

    it('создаёт новый комплект при наличии name/type/productType', async () => {
        const { service, complectService } = makeService([]);
        const [report] = await service.import(
            await buildFile(
                [
                    ['newone', 'prof', 'garant', 'Новый', 7, 1.5],
                    ['nameless', 'prof', 'garant', null, 8, 1],
                ],
                ['code', 'type', 'productType', 'name', 'number', 'weight'],
            ),
            false,
        );

        expect(report.created).toBe(1);
        expect(report.skipped).toHaveLength(1);
        expect(complectService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'newone',
                type: 'prof',
                name: 'Новый',
                weight: 1.5,
            }),
        );
    });

    it('лист пакетов опционален', async () => {
        const { service } = makeService([complect()]);
        const reports = await service.import(
            await buildFile([['classic', 200]], ['code', 'abs']),
            false,
        );

        expect(reports).toHaveLength(1);
        expect(reports[0].section).toBe('complects');
    });
});
