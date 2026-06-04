import { bootstrapApp } from '@/core';
import { KonstructorModule } from './konstructor.module';

bootstrapApp(KonstructorModule, {
    name: 'konstructor',
    defaultPort: 3007,
}).catch(console.error);
