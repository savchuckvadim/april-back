import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { CabinetCorsProbe } from '../cabinet-cors.probe';

const SITE = 'https://bitrix.april-app.ru';

function setup(response: () => ReturnType<HttpService['request']>) {
    const request = jest.fn(response);
    const probe = new CabinetCorsProbe(
        { request } as unknown as HttpService,
        {
            get: (key: string) =>
                key === 'MARKETPLACE_API_PUBLIC_URL'
                    ? 'https://api.pbx.example.ru/'
                    : undefined,
        } as unknown as ConfigService,
    );
    return { probe, request };
}

const reply = (headers: Record<string, string>) => () =>
    of({ headers, status: 204 }) as unknown as ReturnType<
        HttpService['request']
    >;

describe('CabinetCorsProbe', () => {
    it('preflight как у браузера: OPTIONS на ручку входа pbx с Origin сайта', async () => {
        const { probe, request } = setup(
            reply({
                'access-control-allow-origin': SITE,
                'access-control-allow-credentials': 'true',
            }),
        );
        await expect(probe.check(`${SITE}/`)).resolves.toBe('ok');
        expect(request).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'OPTIONS',
                url: 'https://api.pbx.example.ru/api/cabinet/auth/refresh',
                headers: expect.objectContaining({ Origin: SITE }) as unknown,
            }),
        );
    });

    it('чужой origin или без credentials — не пускает', async () => {
        await expect(
            setup(
                reply({
                    'access-control-allow-origin': '*',
                    'access-control-allow-credentials': 'true',
                }),
            ).probe.check(SITE),
        ).resolves.toBe('blocked');
        await expect(
            setup(reply({ 'access-control-allow-origin': SITE })).probe.check(
                SITE,
            ),
        ).resolves.toBe('blocked');
    });

    it('api.pbx не ответил — unreachable', async () => {
        const { probe } = setup(
            () =>
                throwError(
                    () => new Error('ECONNREFUSED'),
                ) as unknown as ReturnType<HttpService['request']>,
        );
        await expect(probe.check(SITE)).resolves.toBe('unreachable');
    });
});
