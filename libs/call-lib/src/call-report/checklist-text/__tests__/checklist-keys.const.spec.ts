import {
    FIVE_K_ITEM_KEYS,
    FIVE_K_TEXT_BLOCKS,
    HVOST_STEP_KEYS,
    HVOST_TEXT_BLOCKS,
} from '../index';

describe('ключи пунктов чек-листов «Хвост» и «5К»', () => {
    it('совпадают с блоками текста разбора и идут в порядке анкеты', () => {
        expect(HVOST_TEXT_BLOCKS.map(block => block.key)).toEqual([
            ...HVOST_STEP_KEYS,
        ]);
        expect(FIVE_K_TEXT_BLOCKS.map(block => block.key)).toEqual([
            ...FIVE_K_ITEM_KEYS,
        ]);
    });
});
