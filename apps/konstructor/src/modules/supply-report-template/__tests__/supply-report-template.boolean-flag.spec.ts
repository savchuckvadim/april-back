import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
    CreateSupplyReportTemplateBodyDto,
    SupplyReportTemplateActiveDto,
    SupplyReportTemplateDefaultDto,
    SupplyReportTemplateDownloadQueryDto,
    SupplyReportTemplateQueryDto,
    UpdateSupplyReportTemplateDto,
} from '../dto';

/**
 * Опции ТОЧНО как в глобальном `ValidationPipe` (`libs/core/src/bootstrap/
 * bootstrap-app.ts`). Именно `enableImplicitConversion: true` ломал здесь
 * булевы флаги: приведение по `design:type` делает `Boolean('false')`,
 * то есть `true`, и выигрывает у пользовательского `@Transform`.
 */
const TRANSFORM_OPTIONS = { enableImplicitConversion: true };

type Ctor<T> = new () => T;

function parseBody<T extends object>(
    cls: Ctor<T>,
    raw: Record<string, unknown>,
): T {
    const instance = plainToInstance(cls, raw, TRANSFORM_OPTIONS);
    const errors = validateSync(instance, { whitelist: true });
    expect(errors).toHaveLength(0);
    return instance;
}

describe('булевы флаги при реальных опциях глобального пайпа', () => {
    describe('SupplyReportTemplateActiveDto', () => {
        it.each([
            ['false', false],
            ['0', false],
            ['no', false],
            ['off', false],
            ['true', true],
            ['1', true],
            ['yes', true],
        ])('is_active=%s → %s', (raw, expected) => {
            const dto = parseBody(SupplyReportTemplateActiveDto, {
                is_active: raw,
            });
            expect(dto.is_active).toBe(expected);
        });

        it('настоящие булевы значения проходят без изменений', () => {
            expect(
                parseBody(SupplyReportTemplateActiveDto, { is_active: false })
                    .is_active,
            ).toBe(false);
            expect(
                parseBody(SupplyReportTemplateActiveDto, { is_active: true })
                    .is_active,
            ).toBe(true);
        });

        it('поле не передано — остаётся undefined, контроллер подставит true', () => {
            expect(
                parseBody(SupplyReportTemplateActiveDto, {}).is_active,
            ).toBeUndefined();
        });

        it('нераспознанная строка отклоняется, а не превращается в true', () => {
            const instance = plainToInstance(
                SupplyReportTemplateActiveDto,
                { is_active: 'maybe' },
                TRANSFORM_OPTIONS,
            );
            expect(
                validateSync(instance, { whitelist: true }),
            ).not.toHaveLength(0);
        });
    });

    describe('SupplyReportTemplateDefaultDto', () => {
        it('is_default=false снимает флаг, а не ставит его', () => {
            expect(
                parseBody(SupplyReportTemplateDefaultDto, {
                    is_default: 'false',
                }).is_default,
            ).toBe(false);
        });
    });

    describe('SupplyReportTemplateDownloadQueryDto', () => {
        it.each([
            ['0', false],
            ['false', false],
            ['1', true],
            ['true', true],
        ])('?demo=%s → %s', (raw, expected) => {
            expect(
                parseBody(SupplyReportTemplateDownloadQueryDto, { demo: raw })
                    .demo,
            ).toBe(expected);
        });

        it('без demo — undefined, контроллер отдаёт основной шаблон', () => {
            expect(
                parseBody(SupplyReportTemplateDownloadQueryDto, {}).demo,
            ).toBeUndefined();
        });
    });

    describe('SupplyReportTemplateQueryDto', () => {
        it('is_archived=false — это «только неархивные», а не «только архивные»', () => {
            const dto = parseBody(SupplyReportTemplateQueryDto, {
                is_archived: 'false',
            });
            expect(dto.is_archived).toBe(false);
        });

        it('is_active и only_common разбираются так же', () => {
            const dto = parseBody(SupplyReportTemplateQueryDto, {
                is_active: 'false',
                only_common: '0',
            });
            expect(dto.is_active).toBe(false);
            expect(dto.only_common).toBe(false);
        });
    });

    describe('create / update', () => {
        it('create: is_active=false сохраняет выключённый шаблон', () => {
            const dto = parseBody(CreateSupplyReportTemplateBodyDto, {
                name: 'Отчёт',
                is_active: 'false',
                is_default: 'false',
            });
            expect(dto.is_active).toBe(false);
            expect(dto.is_default).toBe(false);
        });

        it('update: is_active=false действительно выключает шаблон', () => {
            const dto = parseBody(UpdateSupplyReportTemplateDto, {
                is_active: 'false',
            });
            expect(dto.is_active).toBe(false);
        });
    });
});
