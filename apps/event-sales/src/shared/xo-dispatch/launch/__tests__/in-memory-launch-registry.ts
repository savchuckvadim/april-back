import {
    XoLaunch,
    XoLaunchDone,
    XoLaunchRef,
    XoLaunchRegistry,
} from '../xo-launch.rule';

/**
 * Реестр запусков в памяти — для тестов обработчика и крона: та же
 * семантика, что у Redis-реализации, без сроков жизни.
 */
export class InMemoryLaunchRegistry implements XoLaunchRegistry {
    readonly pendingByEntity = new Map<string, Map<string, number>>();
    readonly doneByClient = new Map<string, XoLaunchDone>();

    markPending(domain: string, entityKey: string, launch: XoLaunch) {
        const key = `${domain}|${entityKey}`;
        const launches =
            this.pendingByEntity.get(key) ?? new Map<string, number>();
        launches.set(launch.id, launch.acceptedAt);
        this.pendingByEntity.set(key, launches);
        return Promise.resolve();
    }

    clearPending(domain: string, refs: readonly XoLaunchRef[]) {
        for (const ref of refs) {
            this.pendingByEntity
                .get(`${domain}|${ref.entityKey}`)
                ?.delete(ref.launchId);
        }
        return Promise.resolve();
    }

    pending(
        domain: string,
        entityKeys: readonly string[],
    ): Promise<ReadonlySet<string> | null> {
        return Promise.resolve(
            new Set(
                entityKeys.filter(
                    key =>
                        (this.pendingByEntity.get(`${domain}|${key}`)?.size ??
                            0) > 0,
                ),
            ),
        );
    }

    lastDone(domain: string, clientKeys: readonly string[]) {
        const found = new Map<string, XoLaunchDone>();
        for (const key of clientKeys) {
            const done = this.doneByClient.get(`${domain}|${key}`);
            if (done) found.set(key, done);
        }
        return Promise.resolve(found);
    }

    markDone(
        domain: string,
        items: readonly { clientKey: string; launch: XoLaunch }[],
        finishedAt: number,
    ) {
        for (const { clientKey, launch } of items) {
            this.doneByClient.set(`${domain}|${clientKey}`, {
                launchId: launch.id,
                acceptedAt: launch.acceptedAt,
                finishedAt,
            });
        }
        return Promise.resolve();
    }
}
