import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import localizedFormat from 'dayjs/plugin/localizedFormat';

import { bootstrapApp } from '@lib/core';
import { KpiReportSalesModule } from './kpi-report-sales.module';

dayjs.extend(localizedFormat);
dayjs.locale('ru');

bootstrapApp(KpiReportSalesModule, {
    name: 'kpi-report-sales',
    defaultPort: 3001,
}).catch(console.error);
