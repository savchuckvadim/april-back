import { EventFlowGuardService } from '../services/flow-guard/event-flow-guard.service';
import { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';

/**
 * Гард продажи в POST /flow. С 15.09 он ПРЕДУПРЕЖДАЮЩИЙ: отчёт о продаже
 * не отвергается никогда — ни без суммы, ни без даты первой оплаты. Раньше
 * здесь стоял 400, и он терял готовую работу менеджера при полностью
 * заполненной сделке (фрейм закрывал вопрос значением карточки, а в payload
 * ответа не возникало). Данные он не берёг: писатель полей graceful —
 * пустое значение просто не пишется.
 *
 * Собирает недостающее модалка продажи во фрейме; здесь остаётся warn —
 * след, по которому видно порталы и сделки с пробелом.
 */
const makeGuard = (
    settings: Record<string, unknown> | Error,
): EventFlowGuardService =>
    new EventFlowGuardService({
        resolve: () =>
            settings instanceof Error
                ? Promise.reject(settings)
                : Promise.resolve(settings),
    } as unknown as PortalAppSettingsService);

const dto = (over: {
    workStatusCode?: string;
    companyId?: number;
    opportunity?: number;
    firstPayDate?: string;
}): EventSalesFlowDto =>
    ({
        domain: 'x.bitrix24.ru',
        report: {
            workStatus: {
                current: { code: over.workStatusCode ?? 'success' },
            },
        },
        context: over.companyId ? { companyId: over.companyId } : {},
        sale: {
            opportunity: over.opportunity,
            firstPayDate: over.firstPayDate,
        },
    }) as unknown as EventSalesFlowDto;

describe('EventFlowGuardService: чек-лист продажи', () => {
    const enabled = { withChecklistSale: true };

    it('включён + продажа без суммы/даты → проходит, отчёт не теряем', async () => {
        await expect(
            makeGuard(enabled).assertValid(dto({ companyId: 431 })),
        ).resolves.toBeUndefined();
    });

    it('включён + сумма есть, даты нет → тоже проходит', async () => {
        await expect(
            makeGuard(enabled).assertValid(
                dto({ companyId: 431, opportunity: 150000 }),
            ),
        ).resolves.toBeUndefined();
    });

    it('включён + сумма и дата на месте → проходит', async () => {
        await expect(
            makeGuard(enabled).assertValid(
                dto({
                    companyId: 431,
                    opportunity: 150000,
                    firstPayDate: '2026-09-01',
                }),
            ),
        ).resolves.toBeUndefined();
    });

    it('выключен на портале → сумма не требуется', async () => {
        await expect(
            makeGuard({ withChecklistSale: false }).assertValid(
                dto({ companyId: 431 }),
            ),
        ).resolves.toBeUndefined();
    });

    it('lead-only (нет company/deal) → сумма не требуется', async () => {
        await expect(
            makeGuard(enabled).assertValid(dto({})),
        ).resolves.toBeUndefined();
    });

    it('не-продажа настройки даже не читает', async () => {
        await expect(
            makeGuard(new Error('redis down')).assertValid(
                dto({ workStatusCode: 'inJob', companyId: 431 }),
            ),
        ).resolves.toBeUndefined();
    });

    it('настройки недоступны → отправка НЕ блокируется', async () => {
        await expect(
            makeGuard(new Error('redis down')).assertValid(
                dto({ companyId: 431 }),
            ),
        ).resolves.toBeUndefined();
    });
});
