import { UnauthorizedException } from '@nestjs/common';
import { AgentKeyGuard } from '../guards/agent-key.guard';

const makeContext = (headers: Record<string, string>) => {
    const request = { headers } as Record<string, unknown>;
    return {
        context: {
            switchToHttp: () => ({ getRequest: () => request }),
        },
        request,
    };
};

const makeGuard = (keys?: string) =>
    new AgentKeyGuard({ get: jest.fn(() => keys) } as never);

describe('AgentKeyGuard', () => {
    it('без настроенных ключей Agent API закрыт', () => {
        const guard = makeGuard(undefined);
        const { context } = makeContext({ 'x-agent-api-key': 'any' });
        expect(() => guard.canActivate(context as never)).toThrow(
            UnauthorizedException,
        );
    });

    it('валидный ключ вида имя:ключ пропускает и проставляет имя агента', () => {
        const guard = makeGuard('claw-main:secret123,claw-test:secret456');
        const { context, request } = makeContext({
            'x-agent-api-key': 'secret456',
        });
        expect(guard.canActivate(context as never)).toBe(true);
        expect(request.agentName).toBe('claw-test');
    });

    it('голый ключ без имени получает имя agent-N', () => {
        const guard = makeGuard('justakey');
        const { context, request } = makeContext({
            'x-agent-api-key': 'justakey',
        });
        expect(guard.canActivate(context as never)).toBe(true);
        expect(request.agentName).toBe('agent-1');
    });

    it('невалидный ключ отклоняется', () => {
        const guard = makeGuard('claw-main:secret123');
        const { context } = makeContext({ 'x-agent-api-key': 'wrong' });
        expect(() => guard.canActivate(context as never)).toThrow(
            UnauthorizedException,
        );
    });

    it('отсутствие заголовка отклоняется', () => {
        const guard = makeGuard('claw-main:secret123');
        const { context } = makeContext({});
        expect(() => guard.canActivate(context as never)).toThrow(
            UnauthorizedException,
        );
    });
});
