import { createServer, Server } from 'node:net';
import { SmtpNetworkProbe } from '../smtp-network.probe';

/** Локальный TCP-сервер на свободном порту — «открытый SMTP-порт». */
function listen(): Promise<{ server: Server; port: number }> {
    return new Promise(resolve => {
        const server = createServer(socket => socket.end());
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                port: typeof address === 'object' && address ? address.port : 0,
            });
        });
    });
}

describe('SmtpNetworkProbe', () => {
    const probe = new SmtpNetworkProbe();

    it('порт слушают — open; сервер закрыт — refused', async () => {
        const { server, port } = await listen();
        await expect(
            probe.probePort('127.0.0.1', port, 2_000),
        ).resolves.toEqual({
            port,
            state: 'open',
            detail: null,
        });
        await new Promise(resolve => server.close(resolve));
        await expect(
            probe.probePort('127.0.0.1', port, 2_000),
        ).resolves.toEqual({
            port,
            state: 'refused',
            detail: null,
        });
    });

    it('localhost резолвится, несуществующий хост — пусто', async () => {
        await expect(probe.resolve('localhost')).resolves.not.toEqual([]);
        await expect(probe.resolve('no-such-host.invalid')).resolves.toEqual(
            [],
        );
    });
});
