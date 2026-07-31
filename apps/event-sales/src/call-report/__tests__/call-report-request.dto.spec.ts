import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalyzeCallDto, ScanCallsDto } from '../dto/call-report-request.dto';

/**
 * Границы объёма ручного прогона. Прежний потолок limit=10 блокировал
 * разбор звонков за целый день (прод-случай 31.07.2026: «limit must not be
 * greater than 10»), поэтому проверяем именно верхнюю границу.
 */
describe('AnalyzeCallDto', () => {
    const validateDto = async (plain: Record<string, unknown>) =>
        validate(plainToInstance(AnalyzeCallDto, plain));

    const validPlain = { domain: 'example.bitrix24.ru' };

    it('limit больше прежнего потолка 10 проходит валидацию', async () => {
        const errors = await validateDto({ ...validPlain, limit: 30 });

        expect(errors).toHaveLength(0);
    });

    it('limit на верхней границе 500 проходит валидацию', async () => {
        const errors = await validateDto({ ...validPlain, limit: 500 });

        expect(errors).toHaveLength(0);
    });

    it('limit выше 500 отклоняется', async () => {
        const errors = await validateDto({ ...validPlain, limit: 501 });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('нулевой limit отклоняется', async () => {
        const errors = await validateDto({ ...validPlain, limit: 0 });

        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('ScanCallsDto', () => {
    const validateDto = async (plain: Record<string, unknown>) =>
        validate(plainToInstance(ScanCallsDto, plain));

    const validPlain = { domain: 'example.bitrix24.ru' };

    it('maxPerRun больше прежнего потолка 100 проходит валидацию', async () => {
        const errors = await validateDto({ ...validPlain, maxPerRun: 300 });

        expect(errors).toHaveLength(0);
    });

    it('maxPerRun выше 500 отклоняется', async () => {
        const errors = await validateDto({ ...validPlain, maxPerRun: 501 });

        expect(errors.length).toBeGreaterThan(0);
    });
});
