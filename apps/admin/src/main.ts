import { bootstrapApp } from '@/core';
import { AdminModule } from './admin.module';

bootstrapApp(AdminModule, { name: 'admin', defaultPort: 3004 }).catch(
    console.error,
);
