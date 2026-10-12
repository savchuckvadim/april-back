import type { SupplyReportTemplate } from 'generated/prisma';
import type { SupplyReportTemplateTxClient } from '../repositories/supply-report-template.repository';

/** Транзакционный клиент-пустышка: сверяем, что он доехал до updateMany. */
export const TX = { tx: true } as unknown as SupplyReportTemplateTxClient;

/** Произвольный payload записи — чтобы читать аргументы моков без `any`. */
export type Payload = Record<string, unknown>;

/** Минимальный валидный .docx: PK-подпись обязательна для validateDocxFile. */
export const docx = (name = 'template.docx'): Express.Multer.File =>
    ({
        originalname: name,
        mimetype:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1024,
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    }) as unknown as Express.Multer.File;

/** Строка таблицы с безопасными значениями по умолчанию. */
export const row = (
    over: Partial<SupplyReportTemplate> = {},
): SupplyReportTemplate =>
    ({
        id: 42n,
        name: 'Отчёт о поставке, интернет',
        code: 'supply-report-test',
        client_types: null,
        supply_types: null,
        required_fields: null,
        optional_fields: null,
        description: null,
        file_path: 'konstructor/supply-report-templates/a.docx',
        demo_path: null,
        is_default: false,
        is_active: true,
        is_archived: false,
        archived_at: null,
        portal_id: null,
        agent_id: null,
        creator_bitrix_user_id: null,
        created_at: new Date('2026-10-01T00:00:00.000Z'),
        updated_at: new Date('2026-10-01T00:00:00.000Z'),
        ...over,
    }) as SupplyReportTemplate;

/**
 * Типизированный `jest.fn()`.
 *
 * `jest.fn()` без реализации возвращает `Mock<any, any>`, и присваивание
 * такого мока переменной с дженериками ломает `no-unsafe-assignment`, а без
 * дженериков `mock.calls` остаётся `any` и ломает
 * `no-unsafe-member-access` — именно аргументы вызовов здесь и проверяются.
 * Фиктивная реализация с неиспользуемыми параметрами упёрлась бы в
 * `no-unused-vars`, поэтому приведение сделано один раз здесь.
 */
export function mockFn<T, Y extends unknown[]>(): jest.Mock<T, Y> {
    return jest.fn() as unknown as jest.Mock<T, Y>;
}
