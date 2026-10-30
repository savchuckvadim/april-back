import { SupplyTableService } from '../services/supply-table.service';
import { SupplyEntity } from '../../supply/supply.entity';
import { readSheet, readWorkbook } from '../lib/sheet-reader';
import { writeWorkbook } from '../lib/sheet-writer';

const supply = (overrides: Partial<SupplyEntity> = {}): SupplyEntity =>
    ({
        id: 1n,
        code: 'internet_5',
        type: 'internet',
        name: 'Интернет 5 ОД',
        fullName: 'Интернет 5 ОД',
        shortName: 'Интернет 5 ОД',
        usersQuantity: 5,
        coefficient: 1.2,
        contractName: 'на {n} ({words}) {plural:ОД|ОД|ОД}',
        contractProp1: null,
        contractProp2: null,
        contractPropSuppliesQuantity: null,
        contractPropLoginsQuantity: null,
        contractPropComment: null,
        contractPropEmail: null,
        lcontractName: null,
        lcontractProp2: null,
        lcontractPropComment: null,
        lcontractPropEmail: null,
        acontractName: null,
        acontractPropComment: null,
        quantityForKp: null,
        saleName_1: null,
        saleName_2: null,
        saleName_3: null,
        description: null,
        color: null,
        created_at: null,
        updated_at: null,
        ...overrides,
    }) as SupplyEntity;

const makeService = (existing: SupplyEntity[]) => {
    const supplyService = {
        findMany: jest.fn().mockResolvedValue(existing),
        create: jest
            .fn()
            .mockImplementation((data: Partial<SupplyEntity>) =>
                Promise.resolve({ ...supply(), ...data }),
            ),
        update: jest
            .fn()
            .mockImplementation((data: Partial<SupplyEntity>) =>
                Promise.resolve({ ...supply(), ...data }),
            ),
    };
    return {
        service: new SupplyTableService(supplyService as never),
        supplyService,
    };
};

const buildFile = async (
    rows: (string | number | null)[][],
    headers: string[],
): Promise<Buffer> =>
    await writeWorkbook([{ name: 'supplies', headers, rows }]);

describe('SupplyTableService', () => {
    it('выгружает поставки вместе с шаблонами текстов договоров', async () => {
        const { service } = makeService([supply()]);
        const sheet = readSheet(
            await readWorkbook(await service.export()),
            'supplies',
        );

        expect(sheet.headers.slice(0, 4)).toEqual([
            'code',
            'type',
            'usersQuantity',
            'coefficient',
        ]);
        expect(sheet.headers).toContain('contractName');
        expect(sheet.rows[0].string('contractName')).toContain('{words}');
    });

    it('круг export → import без правок ничего не меняет', async () => {
        const { service, supplyService } = makeService([supply()]);
        const [report] = await service.import(await service.export(), false);

        expect(report.unchanged).toBe(1);
        expect(supplyService.update).not.toHaveBeenCalled();
    });

    it('обновляет коэффициент и текст договора', async () => {
        const { service, supplyService } = makeService([supply()]);
        const [report] = await service.import(
            await buildFile(
                [['internet_5', 1.5, 'новый текст {n}']],
                ['code', 'coefficient', 'contractName'],
            ),
            false,
        );

        expect(report.updated).toBe(1);
        expect(supplyService.update).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 1n,
                coefficient: 1.5,
                contractName: 'новый текст {n}',
            }),
        );
    });

    it('создаёт новую поставку, требуя тип, имя и число ОД', async () => {
        const { service, supplyService } = makeService([]);
        const [report] = await service.import(
            await buildFile(
                [
                    ['proxima_7', 'proxima', 'Проксима 7 ОД', 7, 1.4],
                    ['broken', 'wifi', 'Мимо', 3, 1],
                    ['nameless', 'internet', null, 3, 1],
                ],
                ['code', 'type', 'name', 'usersQuantity', 'coefficient'],
            ),
            false,
        );

        expect(report.created).toBe(1);
        expect(report.skipped).toHaveLength(2);
        expect(supplyService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'proxima_7',
                type: 'proxima',
                usersQuantity: 7,
                coefficient: 1.4,
            }),
        );
    });

    it('пустая ячейка текста не стирает существующий текст', async () => {
        const { service, supplyService } = makeService([supply()]);
        const [report] = await service.import(
            await buildFile([['internet_5', null]], ['code', 'contractName']),
            false,
        );

        expect(report.unchanged).toBe(1);
        expect(supplyService.update).not.toHaveBeenCalled();
    });
});

describe('SupplyTableService: легаси-выгрузка', () => {
    /** Файл в формате старой выгрузки: лист «supply», ключ «number» */
    const buildLegacyFile = async (
        rows: (string | number | null)[][],
        headers: string[],
    ): Promise<Buffer> =>
        await writeWorkbook([{ name: 'supply', headers, rows }]);

    it('принимает лист «supply» с номерами вместо кодов', async () => {
        const { service, supplyService } = makeService([
            supply({ code: 'internet_5', contractName: null }),
        ]);

        // number 4 — это «Интернет 5 ОД», код internet_5
        const reports = await service.import(
            await buildLegacyFile(
                [[4, 'Интернет 5 ОД', 'internet', 3, 'на {n} ОД']],
                ['number', 'name', 'type', 'coefficient', 'contractName'],
            ),
            false,
        );

        expect(reports[0].section).toBe('supply');
        expect(reports[0].skipped).toHaveLength(0);
        expect(reports[0].updated).toBe(1);
        expect(supplyService.update).toHaveBeenCalledWith(
            expect.objectContaining({ contractName: 'на {n} ОД' }),
        );
    });

    it('номер вне сетки 0–18 попадает в пропуски с понятной причиной', async () => {
        const { service } = makeService([supply()]);

        const reports = await service.import(
            await buildLegacyFile(
                [[99, 'Неизвестная', 'internet', 1]],
                ['number', 'name', 'type', 'coefficient'],
            ),
            false,
        );

        expect(reports[0].skipped).toHaveLength(1);
        expect(reports[0].skipped[0].reason).toMatch(
            /не удалось определить код/,
        );
    });

    it('все 19 номеров легаси-выгрузки раскрываются в коды каталога', async () => {
        const { service } = makeService([]);
        const rows = Array.from({ length: 19 }, (_, number) => [
            number,
            'Поставка ' + number,
            number >= 9 && number !== 9 ? 'proxima' : 'internet',
            1,
        ]);

        const reports = await service.import(
            await buildLegacyFile(rows, [
                'number',
                'name',
                'type',
                'coefficient',
            ]),
            true,
        );

        // Ни одна строка не должна потеряться на сопоставлении номера с кодом
        const lostOnCode = reports[0].skipped.filter(row =>
            /не удалось определить код/.test(row.reason),
        );
        expect(lostOnCode).toHaveLength(0);
    });
});
