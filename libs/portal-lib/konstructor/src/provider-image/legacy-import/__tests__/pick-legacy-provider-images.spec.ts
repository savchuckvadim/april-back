import { LegacyRqFile } from '../legacy-rq-file.entity';
import { pickLegacyProviderImages } from '../lib/pick-legacy-provider-images';

let nextId = 1000;

const file = (
    id: number,
    parentType: string | null,
    over: Partial<LegacyRqFile> = {},
): LegacyRqFile => ({
    id,
    rqId: 7,
    parentType,
    code: parentType ?? '',
    path: `clients/portal.test/rq/7/${parentType}/7_${parentType}_${id}.png`,
    ...over,
});

const verdict = (rows: LegacyRqFile[]) =>
    pickLegacyProviderImages(rows).map(pick => [pick.file.id, pick.role]);

describe('выбор текущих картинок реквизитов по правилам легаси', () => {
    describe('логотип', () => {
        it('берётся запись с наименьшим id, как logos[0], в любом порядке строк', () => {
            const result = pickLegacyProviderImages([
                file(30, 'logo'),
                file(10, 'logo'),
                file(20, 'logo'),
            ]);
            expect(result.filter(pick => pick.role === 'logo')).toHaveLength(1);
            expect(result.find(pick => pick.role === 'logo')?.file.id).toBe(10);
        });

        it('второй и далее логотипы не переносятся, пояснение называет выбранную запись', () => {
            const result = pickLegacyProviderImages([
                file(10, 'logo'),
                file(20, 'logo'),
            ]);
            const extra = result.find(pick => pick.file.id === 20);
            expect(extra?.role).toBeNull();
            expect(extra?.note).toContain('10');
            expect(result.find(pick => pick.file.id === 10)?.note).toBeNull();
        });
    });

    describe('печать', () => {
        it('берётся запись с наименьшим id', () => {
            expect(
                verdict([file(5, 'stamp'), file(2, 'stamp'), file(9, 'stamp')]),
            ).toEqual([
                [2, 'stamp'],
                [5, null],
                [9, null],
            ]);
        });
    });

    describe('подписи', () => {
        it('подпись руководителя: наибольший id среди signature с кодом, отличным от signature_accountant', () => {
            const rows = [
                file(3, 'signature', { code: 'signature_director' }),
                file(8, 'signature', { code: 'signature' }),
                file(5, 'signature', { code: '' }),
            ];
            expect(verdict(rows)).toEqual([
                [8, 'signature_director'],
                [3, null],
                [5, null],
            ]);
        });

        it('подпись главного бухгалтера: наибольший id среди signature с кодом signature_accountant', () => {
            const rows = [
                file(4, 'signature', { code: 'signature_accountant' }),
                file(11, 'signature', { code: 'signature_accountant' }),
                file(6, 'signature', { code: 'signature_accountant' }),
            ];
            expect(verdict(rows)).toEqual([
                [11, 'signature_accountant'],
                [4, null],
                [6, null],
            ]);
        });

        it('руководитель и бухгалтер выбираются независимо', () => {
            const rows = [
                file(20, 'signature', { code: 'signature_accountant' }),
                file(10, 'signature', { code: 'signature' }),
                file(30, 'signature', { code: 'signature' }),
                file(15, 'signature', { code: 'signature_accountant' }),
            ];
            expect(verdict(rows)).toEqual([
                [30, 'signature_director'],
                [20, 'signature_accountant'],
                [10, null],
                [15, null],
            ]);
        });

        it('устаревшая подпись получает пояснение с id выбранной', () => {
            const result = pickLegacyProviderImages([
                file(3, 'signature', { code: 'signature' }),
                file(8, 'signature', { code: 'signature' }),
            ]);
            const old = result.find(pick => pick.file.id === 3);
            expect(old?.role).toBeNull();
            expect(old?.note).toContain('руководителя');
            expect(old?.note).toContain('8');
        });
    });

    describe('остальное не переносится', () => {
        it('qr, запись с parent_type signature_accountant и неизвестный тип получают пояснение', () => {
            const result = pickLegacyProviderImages([
                file(1, 'qr'),
                file(2, 'signature_accountant'),
                file(3, 'scan'),
                file(4, null),
            ]);
            expect(result.every(pick => pick.role === null)).toBe(true);
            const note = (id: number) =>
                result.find(pick => pick.file.id === id)?.note;
            expect(note(1)).toContain('QR');
            expect(note(2)).toContain('signature_accountant');
            expect(note(3)).toContain('scan');
            expect(note(4)).toContain('пусто');
        });

        it('запись parent_type signature_accountant не мешает выбору подписи бухгалтера', () => {
            const rows = [
                file(50, 'signature_accountant'),
                file(5, 'signature', { code: 'signature_accountant' }),
            ];
            expect(verdict(rows)).toEqual([
                [5, 'signature_accountant'],
                [50, null],
            ]);
        });
    });

    describe('несколько реквизитов и порядок', () => {
        it('записи разных реквизитов выбираются независимо', () => {
            const rows = [
                file(30, 'stamp', { rqId: 2 }),
                file(10, 'stamp', { rqId: 2 }),
                file(40, 'stamp', { rqId: 1 }),
                file(20, 'stamp', { rqId: 3 }),
            ];
            const result = pickLegacyProviderImages(rows);
            expect(
                result.map(pick => [pick.file.rqId, pick.file.id, pick.role]),
            ).toEqual([
                [1, 40, 'stamp'],
                [2, 10, 'stamp'],
                [2, 30, null],
                [3, 20, 'stamp'],
            ]);
        });

        it('порядок: реквизиты по возрастанию, роли как в PROVIDER_IMAGE_ROLES, непереносимые в конце по id', () => {
            const rows = [
                file(90, 'qr'),
                file(1, 'logo'),
                file(2, 'signature', { code: 'signature_accountant' }),
                file(3, 'signature', { code: 'signature' }),
                file(4, 'stamp'),
                file(80, 'qr'),
            ];
            expect(verdict(rows)).toEqual([
                [4, 'stamp'],
                [3, 'signature_director'],
                [2, 'signature_accountant'],
                [1, 'logo'],
                [80, null],
                [90, null],
            ]);
        });

        it('каждая запись получает ровно один вердикт, входной массив не меняется', () => {
            const rows = [
                file(nextId++, 'stamp'),
                file(nextId++, 'stamp'),
                file(nextId++, 'logo'),
                file(nextId++, 'qr'),
            ];
            const snapshot = rows.map(row => row.id);
            const result = pickLegacyProviderImages(rows);
            expect(result).toHaveLength(rows.length);
            expect(rows.map(row => row.id)).toEqual(snapshot);
        });

        it('пустой вход даёт пустой результат', () => {
            expect(pickLegacyProviderImages([])).toEqual([]);
        });
    });
});
