import {
    DISK_NAME_MAX_LENGTH,
    DiskNameRow,
    diskNameToLinkText,
    getInvoiceDiskName,
    getOfferDiskName,
    resolveDiskFileName,
    sanitizeDiskName,
} from '../lib/document-disk-name.util';

const garant = (
    name: string,
    supplyName: string,
    extra: Partial<DiskNameRow> = {},
): DiskNameRow => ({ name, supply: { name: supplyName }, ...extra });

const setOf = (...rows: DiskNameRow[]) => ({ rows: { garant: rows } });

describe('sanitizeDiskName', () => {
    it('пробелы — подчёркивания, повторные схлопываются', () => {
        expect(sanitizeDiskName('КП  Гарант-Юрист   Интернет 1 ОД')).toBe(
            'КП_Гарант-Юрист_Интернет_1_ОД',
        );
    });

    it('любые пробельные знаки (табуляция, перенос, неразрывный пробел) — тоже пробелы', () => {
        expect(sanitizeDiskName('КП\tЮрист\nИнтернет\u00a01')).toBe(
            'КП_Юрист_Интернет_1',
        );
    });

    it('запрещённые знаки вырезаются', () => {
        expect(sanitizeDiskName('a\\b/c:d*e?f"g<h>i|j%k#l&m+n')).toBe(
            'abcdefghijklmn',
        );
    });

    it('управляющие знаки и знаки нулевой ширины вырезаются', () => {
        expect(sanitizeDiskName('КП\u0000\u0007Юрист\u200b')).toBe('КПЮрист');
    });

    it('вырезанный знак между пробелами не оставляет двойного подчёркивания', () => {
        expect(sanitizeDiskName('Юрист & Бухгалтер')).toBe('Юрист_Бухгалтер');
    });

    it('без ведущих и хвостовых точек и подчёркиваний', () => {
        expect(sanitizeDiskName('..._.Счёт 5_..')).toBe('Счёт_5');
    });

    it('длина ограничена, хвост после обрезки чистится', () => {
        const long = `${'а'.repeat(DISK_NAME_MAX_LENGTH - 1)} ${'б'.repeat(50)}`;
        const result = sanitizeDiskName(long);
        expect(Array.from(result)).toHaveLength(DISK_NAME_MAX_LENGTH - 1);
        expect(result).toBe('а'.repeat(DISK_NAME_MAX_LENGTH - 1));
    });

    it('обрезка не режет суррогатную пару пополам', () => {
        const result = sanitizeDiskName('😀😀😀', 2);
        expect(result).toBe('😀😀');
    });

    it('пусто, null и одни запрещённые знаки — пустая строка', () => {
        expect(sanitizeDiskName('')).toBe('');
        expect(sanitizeDiskName(undefined)).toBe('');
        expect(sanitizeDiskName(null)).toBe('');
        expect(sanitizeDiskName(' / * ? ')).toBe('');
    });

    it('повторная очистка ничего не меняет', () => {
        const once = sanitizeDiskName('КП Гарант-Юрист / Интернет 1 ОД');
        expect(sanitizeDiskName(once)).toBe(once);
    });
});

describe('diskNameToLinkText', () => {
    it('подчёркивания — пробелы', () => {
        expect(diskNameToLinkText('КП_Гарант-Юрист_Интернет_1_ОД')).toBe(
            'КП Гарант-Юрист Интернет 1 ОД',
        );
        expect(diskNameToLinkText('Счёт_311-5527')).toBe('Счёт 311-5527');
    });

    it('расширение в тексте ссылки не нужно', () => {
        expect(diskNameToLinkText('Счёт_311-5527.docx')).toBe('Счёт 311-5527');
    });
});

describe('resolveDiskFileName', () => {
    it('имя + расширение самого файла: DOCX остаётся DOCX, PDF остаётся PDF', () => {
        expect(
            resolveDiskFileName(
                '/srv/public/konstructor/offer-word/2026/offer-1b2c.docx',
                'КП_Юрист',
            ),
        ).toBe('КП_Юрист.docx');
        expect(
            resolveDiskFileName('C:\\storage\\offer-1b2c.pdf', 'КП_Юрист'),
        ).toBe('КП_Юрист.pdf');
    });

    it('расширение в имени не удваивается', () => {
        expect(resolveDiskFileName('/s/offer-1.docx', 'КП_Юрист.docx')).toBe(
            'КП_Юрист.docx',
        );
        expect(resolveDiskFileName('/s/offer-1.pdf', 'КП_Юрист.DOCX')).toBe(
            'КП_Юрист.pdf',
        );
    });

    it('имя из небезопасных знаков очищается и тут', () => {
        expect(resolveDiskFileName('/s/offer-1.docx', 'КП Юрист/1+2')).toBe(
            'КП_Юрист12.docx',
        );
    });

    it('имени нет или оно пустое — прежнее имя файла (договор, uuid)', () => {
        expect(resolveDiskFileName('/s/offer-uuid.pdf')).toBe('offer-uuid.pdf');
        expect(resolveDiskFileName('/s/offer-uuid.pdf', '')).toBe(
            'offer-uuid.pdf',
        );
        expect(resolveDiskFileName('/s/offer-uuid.pdf', ' / ? ')).toBe(
            'offer-uuid.pdf',
        );
        expect(
            resolveDiskFileName('/s/Договор_Юрист-11-2.docx', undefined),
        ).toBe('Договор_Юрист-11-2.docx');
    });
});

describe('getOfferDiskName', () => {
    it('КП_<комплект>_<доступ> по первой строке Гаранта главного набора', () => {
        const dto = {
            sets: {
                general: [
                    setOf(garant('Гарант-Юрист', 'Интернет 1 ОД')),
                    setOf(garant('Гарант-Бухгалтер', 'Интернет 3 ОД')),
                ],
            },
        };
        expect(getOfferDiskName(dto)).toBe('КП_Гарант-Юрист_Интернет_1_ОД');
    });

    it('альтернативное название комплекта главнее обычного', () => {
        const dto = {
            sets: {
                general: [
                    setOf(
                        garant('Гарант-Строитель', 'Проксима 2 ОД', {
                            alternativeName: 'Строитель PRO',
                        }),
                    ),
                ],
            },
        };
        expect(getOfferDiskName(dto)).toBe('КП_Строитель_PRO_Проксима_2_ОД');
    });

    it('нет полного названия — короткое', () => {
        const dto = {
            sets: {
                general: [
                    setOf({
                        name: '',
                        shortName: 'Юрист',
                        supply: { name: 'Интернет 1 ОД' },
                    }),
                ],
            },
        };
        expect(getOfferDiskName(dto)).toBe('КП_Юрист_Интернет_1_ОД');
    });

    it('нет подписи поставки — только комплект', () => {
        const dto = {
            sets: { general: [setOf({ name: 'Гарант-Юрист' })] },
        };
        expect(getOfferDiskName(dto)).toBe('КП_Гарант-Юрист');
    });

    it('«Классик+» теряет плюс: он запрещён в имени', () => {
        const dto = {
            sets: { general: [setOf(garant('Гарант-Классик+', 'Интернет'))] },
        };
        expect(getOfferDiskName(dto)).toBe('КП_Гарант-Классик_Интернет');
    });

    it('строки Гаранта нет — просто «КП»', () => {
        expect(getOfferDiskName({ sets: { general: [] } })).toBe('КП');
        expect(getOfferDiskName({ sets: { general: [{ rows: {} }] } })).toBe(
            'КП',
        );
        expect(getOfferDiskName({})).toBe('КП');
    });
});

describe('getInvoiceDiskName', () => {
    const sets = {
        general: [
            setOf(garant('Гарант-Юрист', 'Интернет 5 ОД')),
            setOf(garant('Гарант-Бухгалтер', 'Проксима 3 ОД')),
        ],
        alternative: [setOf(garant('Гарант-Эксперт', 'Интернет 1 ОД'))],
    };

    it('Счёт_<номер счёта>, если номер есть', () => {
        expect(getInvoiceDiskName({ sets }, 'general', 0, '311-5527', 0)).toBe(
            'Счёт_311-5527',
        );
    });

    it('в номере пробелы и слэши очищаются', () => {
        expect(
            getInvoiceDiskName({ sets }, 'general', 0, ' 311/5527 А', 0),
        ).toBe('Счёт_3115527_А');
    });

    it('номера нет — по комплекту и доступу набора, из которого собран счёт', () => {
        expect(getInvoiceDiskName({ sets }, 'general', 1, '', 1)).toBe(
            'Счёт_Гарант-Бухгалтер_Проксима_3_ОД',
        );
        expect(
            getInvoiceDiskName({ sets }, 'alternative', 0, undefined, 0),
        ).toBe('Счёт_Гарант-Эксперт_Интернет_1_ОД');
    });

    it('номер из одних запрещённых знаков — как будто номера нет', () => {
        expect(getInvoiceDiskName({ sets }, 'general', 0, '# / *', 0)).toBe(
            'Счёт_Гарант-Юрист_Интернет_5_ОД',
        );
    });

    it('нет ни номера, ни строки Гаранта — «Счёт», у следующих «Счёт_N»', () => {
        expect(getInvoiceDiskName({ sets: {} }, 'general', 0, '', 0)).toBe(
            'Счёт',
        );
        expect(getInvoiceDiskName({}, 'general', 0, null, 1)).toBe('Счёт_2');
        expect(getInvoiceDiskName({}, 'general', 5, '', 2)).toBe('Счёт_3');
    });
});
