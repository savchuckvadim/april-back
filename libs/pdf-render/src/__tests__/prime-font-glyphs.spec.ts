interface FakeFont {
    characterSet: number[];
    glyphForCodePoint: jest.Mock<void, [number]>;
}

/** Встроенный шрифт PDF: карты символов у него нет */
interface StandardFont {
    type: 'STANDARD';
}

interface FakeSource {
    data: FakeFont | StandardFont | null;
    load: jest.Mock<Promise<void>, []>;
}

const registry: Record<string, { sources: FakeSource[] }> = {};

jest.mock('@react-pdf/renderer', () => ({
    Font: { getRegisteredFonts: () => registry },
}));

import { primePdfFontGlyphs } from '../prime-font-glyphs';

/** Источник шрифта: данные появляются после load, как у react-pdf */
const createSource = (characterSet: number[] | null): FakeSource => {
    const font: FakeFont | null = characterSet
        ? { characterSet, glyphForCodePoint: jest.fn<void, [number]>() }
        : null;
    const source: FakeSource = {
        data: null,
        load: jest.fn<Promise<void>, []>(() => {
            source.data = font;
            return Promise.resolve();
        }),
    };
    return source;
};

const fontOf = (source: FakeSource): FakeFont | null =>
    source.data && 'characterSet' in source.data ? source.data : null;

const visited = (source: FakeSource): number[] =>
    (fontOf(source)?.glyphForCodePoint.mock.calls ?? []).map(([code]) => code);

describe('primePdfFontGlyphs', () => {
    beforeEach(() => {
        for (const family of Object.keys(registry)) delete registry[family];
    });

    it('обходит все символы каждого начертания семейства', async () => {
        const regular = createSource([0x41e, 0x4f]);
        const bold = createSource([0x50]);
        registry['PT Sans'] = { sources: [regular, bold] };

        await primePdfFontGlyphs(['PT Sans']);

        expect(regular.load).toHaveBeenCalledTimes(1);
        expect(bold.load).toHaveBeenCalledTimes(1);
        expect(visited(regular)).toEqual([0x4f, 0x41e]);
        expect(visited(bold)).toEqual([0x50]);
    });

    it('идёт по возрастанию кода: общий глиф достаётся младшему символу', async () => {
        // дефис и мягкий перенос, пробел и неразрывный пробел
        const source = createSource([0xad, 0xa0, 0x2d, 0x20]);
        registry['Manrope'] = { sources: [source] };

        await primePdfFontGlyphs(['Manrope']);

        expect(visited(source)).toEqual([0x20, 0x2d, 0xa0, 0xad]);
    });

    it('порядок символов в самом шрифте остаётся прежним', async () => {
        const source = createSource([0x42, 0x41]);
        registry['Manrope'] = { sources: [source] };

        await primePdfFontGlyphs(['Manrope']);

        expect(fontOf(source)?.characterSet).toEqual([0x42, 0x41]);
    });

    it('встроенный шрифт без карты символов пропускает', async () => {
        const standard: FakeSource = {
            data: { type: 'STANDARD' },
            load: jest.fn<Promise<void>, []>(() => Promise.resolve()),
        };
        const loaded = createSource([0x41]);
        registry['Helvetica'] = { sources: [standard, loaded] };

        await expect(
            primePdfFontGlyphs(['Helvetica']),
        ).resolves.toBeUndefined();

        expect(standard.load).toHaveBeenCalledTimes(1);
        expect(visited(loaded)).toEqual([0x41]);
    });

    it('трогает только названные семейства', async () => {
        const asked = createSource([0x41]);
        const other = createSource([0x42]);
        registry['PT Sans'] = { sources: [asked] };
        registry['Montserrat'] = { sources: [other] };

        await primePdfFontGlyphs(['PT Sans']);

        expect(other.load).not.toHaveBeenCalled();
    });

    it('семейство без регистрации и начертание без данных пропускает', async () => {
        const empty = createSource(null);
        const loaded = createSource([0x41]);
        registry['PT Sans'] = { sources: [empty, loaded] };

        await expect(
            primePdfFontGlyphs(['Нет такого', 'PT Sans']),
        ).resolves.toBeUndefined();

        expect(visited(loaded)).toEqual([0x41]);
    });
});
