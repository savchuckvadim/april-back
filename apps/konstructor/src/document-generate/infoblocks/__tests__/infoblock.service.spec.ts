import type {
    ComplectDto,
    ComplectInfoblockValueDto,
    RegionDto,
    RegionsDto,
} from '../../dto';
import { DocumentInfoblockService } from '../infoblock.service';

const block = (
    title: string,
    patch: Partial<ComplectInfoblockValueDto> = {},
): ComplectInfoblockValueDto =>
    ({
        name: title,
        title,
        checked: true,
        weight: 1,
        ...patch,
    }) as ComplectInfoblockValueDto;

const npa = (...value: ComplectInfoblockValueDto[]): ComplectDto =>
    ({
        groupsName: 'Нормативно-правовые акты',
        type: 'npa',
        value,
    }) as ComplectDto;

const cons = (...value: ComplectInfoblockValueDto[]): ComplectDto =>
    ({
        groupsName: 'Консультационные материалы',
        type: 'cons',
        value,
    }) as ComplectDto;

const region = (code: string, infoblock: string): RegionDto =>
    ({ number: 0, abs: 1000, name: code, title: code, infoblock }) as RegionDto;

const regions = (patch: Partial<RegionsDto> = {}): RegionsDto => ({
    inComplect: [],
    favorite: [],
    noWidth: [],
    ...patch,
});

const STAV = 'Законодательство Ставропольского края';
const MSK = 'Законодательство Москвы';
const SPB = 'Законодательство Санкт-Петербурга';

/** Весь список договора по порядку: левая колонка, затем правая */
const listOf = (complect: ComplectDto[], baskets: RegionsDto): string[] => {
    const { infoblocksLeft, infoblocksRight } =
        new DocumentInfoblockService().getInfoblocks(complect, baskets);
    return [...infoblocksLeft, ...infoblocksRight];
};

describe('список инфоблоков договора и регионы', () => {
    it('корень reg и дополнительные регионы блоками isRegion (форма легаси и нового фронта): каждый регион один раз', () => {
        const complect = [
            npa(
                block('Законодательство России'),
                block(STAV, { code: 'reg', weight: 0.5 }),
                block(MSK, { code: 'msk', isRegion: true, weight: 0.5 }),
                block(SPB, { code: 'spb', isRegion: true, weight: 0 }),
            ),
            cons(block('Энциклопедия решений')),
        ];
        const baskets = regions({
            inComplect: [region('stav', STAV), region('msk', MSK)],
            noWidth: [region('spb', SPB)],
        });

        expect(listOf(complect, baskets)).toEqual([
            'Законодательство России',
            STAV,
            MSK,
            SPB,
            'Энциклопедия решений',
        ]);
    });

    it('один регион клиента: на месте корня его законодательство', () => {
        const complect = [
            npa(block('Законодательство России'), block(STAV, { code: 'reg' })),
        ];
        expect(
            listOf(complect, regions({ inComplect: [region('stav', STAV)] })),
        ).toEqual(['Законодательство России', STAV]);
    });

    it('без корня и без регионов первый блок не пропадает', () => {
        const complect = [
            npa(block('Законодательство России'), block('Проекты законов')),
            cons(block('Энциклопедия решений')),
        ];
        expect(listOf(complect, regions())).toEqual([
            'Законодательство России',
            'Проекты законов',
            'Энциклопедия решений',
        ]);
    });

    it('без корня, но с регионами в корзинах: регионы в начале, первый блок на месте', () => {
        const complect = [npa(block('Законодательство России'))];
        expect(
            listOf(complect, regions({ inComplect: [region('msk', MSK)] })),
        ).toEqual([MSK, 'Законодательство России']);
    });

    it('корзины пусты, а блоки isRegion пришли: они печатаются как обычные', () => {
        const complect = [
            npa(
                block('Законодательство России'),
                block(MSK, { code: 'msk', isRegion: true }),
            ),
        ];
        expect(listOf(complect, regions())).toEqual([
            'Законодательство России',
            MSK,
        ]);
    });

    it('неотмеченные блоки не печатаются', () => {
        const complect = [
            npa(
                block('Законодательство России'),
                block('Проекты законов', { checked: false }),
            ),
        ];
        expect(listOf(complect, regions())).toEqual([
            'Законодательство России',
        ]);
    });

    it('список делится на две колонки пополам, левая не короче правой', () => {
        const complect = [
            npa(block('А'), block('Б'), block('В'), block('Г'), block('Д')),
        ];
        const { infoblocksLeft, infoblocksRight } =
            new DocumentInfoblockService().getInfoblocks(complect, regions());
        expect(infoblocksLeft).toEqual(['А', 'Б', 'В']);
        expect(infoblocksRight).toEqual(['Г', 'Д']);
    });
});
