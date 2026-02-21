import type { RouterOutputs } from '@/lib/trpc';

export type JobExecution = RouterOutputs['api']['app']['jobExecutions'][number];
