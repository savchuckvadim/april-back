import { bootstrapApp } from '@/core';
import { KpiReportServiceModule } from './kpi-report-service.module';

bootstrapApp(KpiReportServiceModule, {
    name: 'kpi-report-service',
    defaultPort: 3003,
}).catch(console.error);
