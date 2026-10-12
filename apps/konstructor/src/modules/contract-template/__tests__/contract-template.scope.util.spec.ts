import { BadRequestException } from '@nestjs/common';
import { ContractTemplateScope } from '../dto/contract-template.enums';
import {
    detectContractTemplateScope,
    parseOptionalBigInt,
    resolveContractTemplateScope,
} from '../utils/contract-template.scope.util';

describe('resolveContractTemplateScope', () => {
    describe('common', () => {
        it('даёт оба NULL', () => {
            expect(
                resolveContractTemplateScope(
                    ContractTemplateScope.COMMON,
                    null,
                    null,
                ),
            ).toEqual({ portal_id: null, agent_id: null });
        });

        it('с portal_id — ошибка, а не молчаливое «сделаем общим»', () => {
            // Угадав «общий», мы отдали бы шаблон всем порталам — утечка
            // чужого договора.
            expect(() =>
                resolveContractTemplateScope(
                    ContractTemplateScope.COMMON,
                    7n,
                    null,
                ),
            ).toThrow(BadRequestException);
            expect(() =>
                resolveContractTemplateScope(
                    ContractTemplateScope.COMMON,
                    7n,
                    null,
                ),
            ).toThrow(/scope=common/);
        });

        it('с agent_id — тоже ошибка', () => {
            expect(() =>
                resolveContractTemplateScope(
                    ContractTemplateScope.COMMON,
                    null,
                    42n,
                ),
            ).toThrow(BadRequestException);
        });
    });

    describe('portal', () => {
        it('требует portal_id', () => {
            expect(() =>
                resolveContractTemplateScope(
                    ContractTemplateScope.PORTAL,
                    null,
                    null,
                ),
            ).toThrow(/scope=portal нужен portal_id/);
        });

        it('даёт портал и NULL в поставщике', () => {
            expect(
                resolveContractTemplateScope(
                    ContractTemplateScope.PORTAL,
                    7n,
                    null,
                ),
            ).toEqual({ portal_id: 7n, agent_id: null });
        });

        it('с agent_id — ошибка: для поставщика есть scope=provider', () => {
            expect(() =>
                resolveContractTemplateScope(
                    ContractTemplateScope.PORTAL,
                    7n,
                    42n,
                ),
            ).toThrow(/scope=provider/);
        });
    });

    describe('provider', () => {
        it('требует и портал, и поставщика', () => {
            expect(() =>
                resolveContractTemplateScope(
                    ContractTemplateScope.PROVIDER,
                    7n,
                    null,
                ),
            ).toThrow(/нужны и portal_id, и agent_id/);
            expect(() =>
                resolveContractTemplateScope(
                    ContractTemplateScope.PROVIDER,
                    null,
                    42n,
                ),
            ).toThrow(BadRequestException);
            expect(() =>
                resolveContractTemplateScope(
                    ContractTemplateScope.PROVIDER,
                    null,
                    null,
                ),
            ).toThrow(BadRequestException);
        });

        it('при обоих значениях переносит их как есть', () => {
            expect(
                resolveContractTemplateScope(
                    ContractTemplateScope.PROVIDER,
                    7n,
                    42n,
                ),
            ).toEqual({ portal_id: 7n, agent_id: 42n });
        });
    });
});

describe('detectContractTemplateScope', () => {
    it('нет портала — общий', () => {
        expect(detectContractTemplateScope(null, null)).toBe(
            ContractTemplateScope.COMMON,
        );
    });

    it('портал без поставщика — портальный', () => {
        expect(detectContractTemplateScope(7n, null)).toBe(
            ContractTemplateScope.PORTAL,
        );
    });

    it('портал и поставщик — провайдерский', () => {
        expect(detectContractTemplateScope(7n, 42n)).toBe(
            ContractTemplateScope.PROVIDER,
        );
    });

    it('легаси-строка «поставщик без портала» считается общей по колонкам, но это невозможное состояние', () => {
        // Инвариант записи такую пару не допускает; тест фиксирует, что
        // функция не кидает на мусорных данных.
        expect(detectContractTemplateScope(null, 42n)).toBe(
            ContractTemplateScope.COMMON,
        );
    });
});

describe('parseOptionalBigInt', () => {
    it('число-строка превращается в bigint', () => {
        expect(parseOptionalBigInt('42')).toBe(42n);
    });

    it('null, undefined, пустая строка и пробелы — «сбросить в NULL»', () => {
        expect(parseOptionalBigInt(null)).toBeNull();
        expect(parseOptionalBigInt(undefined)).toBeNull();
        expect(parseOptionalBigInt('')).toBeNull();
        expect(parseOptionalBigInt('   ')).toBeNull();
    });

    it('значение выше 2^53 не теряет точность', () => {
        expect(parseOptionalBigInt('9007199254740993')).toBe(9007199254740993n);
    });
});
