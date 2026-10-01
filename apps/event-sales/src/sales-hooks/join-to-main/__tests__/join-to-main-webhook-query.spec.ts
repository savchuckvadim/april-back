import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { crmRefId } from '../../core/lib/crm-ref-id.util';
import { JoinToMainWebhookQueryDto } from '../dto/join-to-main.dto';

/**
 * БП «Отдать работу» на garant передаёт основную сделку параметром типа
 * «Привязка к CRM» — Битрикс подставляет `D_42423`. Раньше это не
 * проходило валидацию (400), и БП молча не срабатывал.
 */
describe('вебхук «Присоединить к основной»: параметры из Битрикса', () => {
    /** Как глобальный ValidationPipe приложения: implicit conversion включён. */
    const parse = (query: Record<string, string>) => {
        const dto = plainToInstance(JoinToMainWebhookQueryDto, query, {
            enableImplicitConversion: true,
        });
        return { dto, errors: validateSync(dto) };
    };

    it('«Привязка к CRM» D_42423 и CO_91429 — числа', () => {
        const { dto, errors } = parse({
            dealId: '87955',
            mainDealId: 'D_42423',
            companyId: 'CO_91429',
            closeAsDuplicate: 'Y',
        });
        expect(errors).toEqual([]);
        expect(dto.dealId).toBe(87955);
        expect(dto.mainDealId).toBe(42423);
        expect(dto.companyId).toBe(91429);
    });

    it('мусор вместо ID — честная ошибка валидации, а не тихий NaN', () => {
        expect(
            parse({ dealId: '87955', mainDealId: 'abc' }).errors,
        ).not.toEqual([]);
    });

    it('разбор ссылки: префикс, скобки, пробелы, голое число', () => {
        expect(crmRefId('D_42423')).toBe(42423);
        expect(crmRefId('[D_42423]')).toBe(42423);
        expect(crmRefId(' 42423 ')).toBe(42423);
        expect(crmRefId(42423)).toBe(42423);
        expect(crmRefId('Сделка 1')).toBe('Сделка 1');
    });
});
