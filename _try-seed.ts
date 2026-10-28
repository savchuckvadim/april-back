import { NestFactory } from '@nestjs/core';
import { AdminModule } from './apps/admin/src/admin.module';
import { CatalogSeedService } from './libs/garant/src/catalog-install/services/catalog-seed.service';

async function main(): Promise<void> {
    const app = await NestFactory.createApplicationContext(AdminModule, {
        logger: ['error', 'warn'],
    });
    const seed = app.get(CatalogSeedService, { strict: false });
    const dryRun = process.argv[2] !== 'apply';
    console.log(dryRun ? '=== ПРОБНЫЙ ПРОГОН ===' : '=== ЗАПИСЬ ===');
    for (const report of [
        await seed.seedSupplies(dryRun),
        await seed.seedUniversalComplects(dryRun),
        await seed.seedServicePackages(dryRun),
    ]) {
        console.log(
            `${report.section}: создано ${report.created}, уже было ${report.unchanged}, пропущено ${report.skipped.length}`,
        );
        for (const row of report.skipped) console.log(`   - ${row.key}: ${row.reason}`);
    }
    await app.close();
    process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
