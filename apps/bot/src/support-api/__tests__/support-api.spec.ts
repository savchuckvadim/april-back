import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import { SupportDeskModule } from '@lib/support';
import {
    parseSupportApiKeys,
    SupportApiKeyGuard,
    SupportApiRequest,
} from '../guards/support-api-key.guard';
import { SupportApiModule } from '../support-api.module';

const contextWith = (headers: Record<string, string>) => {
    const request = { headers } as unknown as SupportApiRequest;
    const context = {
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, context };
};

const guardWith = (raw: string | undefined) =>
    new SupportApiKeyGuard({
        get: () => raw,
    } as unknown as ConfigService);

describe('parseSupportApiKeys', () => {
    it('имя:ключ, голый ключ, пробелы и пустые записи', () => {
        const keys = parseSupportApiKeys(
            ' claude-code:abc , xyz ,, vadim:k:1 ',
        );
        expect([...keys.entries()]).toEqual([
            ['abc', 'claude-code'],
            ['xyz', 'support-2'],
            ['k:1', 'vadim'],
        ]);
    });
});

describe('SupportApiKeyGuard', () => {
    it('ключи не заданы — API закрыт', () => {
        const { context } = contextWith({ 'x-support-api-key': 'abc' });
        expect(() => guardWith(undefined).canActivate(context)).toThrow(
            UnauthorizedException,
        );
    });

    it('нет заголовка или чужой ключ — 401', () => {
        const guard = guardWith('claude-code:abc');
        expect(() => guard.canActivate(contextWith({}).context)).toThrow(
            UnauthorizedException,
        );
        expect(() =>
            guard.canActivate(
                contextWith({ 'x-support-api-key': 'nope' }).context,
            ),
        ).toThrow(UnauthorizedException);
    });

    it('верный ключ — пропуск и имя клиента API в запросе', () => {
        const { request, context } = contextWith({
            'x-support-api-key': 'abc',
        });
        expect(guardWith('claude-code:abc').canActivate(context)).toBe(true);
        expect(request.supportClient).toBe('claude-code');
    });
});

describe('DI-граф Support API', () => {
    it('SupportDeskModule: сервису доступны PBX, настройки и Telegram', () => {
        expect(findMissingModuleDependencies(SupportDeskModule)).toEqual([]);
    });

    it('SupportApiModule: контроллер и guard получают зависимости', () => {
        expect(findMissingModuleDependencies(SupportApiModule)).toEqual([]);
    });
});
