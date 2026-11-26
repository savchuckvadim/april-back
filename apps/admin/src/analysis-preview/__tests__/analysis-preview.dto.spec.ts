import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalysisPreviewStartDto } from '../dto/analysis-preview.dto';

const BASE = { domain: 'gsr.bitrix24.ru', transcriptionId: '184523' };

/** Сообщения валидации по полям запроса. */
const errorFieldsOf = async (payload: Record<string, unknown>) =>
    (await validate(plainToInstance(AnalysisPreviewStartDto, payload))).map(
        error => error.property,
    );

describe('AnalysisPreviewStartDto: флаг «разобрать по частям»', () => {
    it('без флага запрос годен (по умолчанию решает настройка)', async () => {
        expect(await errorFieldsOf(BASE)).toEqual([]);
    });

    it('longParts: true и false — годны', async () => {
        expect(await errorFieldsOf({ ...BASE, longParts: true })).toEqual([]);
        expect(await errorFieldsOf({ ...BASE, longParts: false })).toEqual([]);
    });

    it('longParts не булево — отказ по этому полю', async () => {
        expect(await errorFieldsOf({ ...BASE, longParts: 'yes' })).toEqual([
            'longParts',
        ]);
        expect(await errorFieldsOf({ ...BASE, longParts: 1 })).toEqual([
            'longParts',
        ]);
    });
});
