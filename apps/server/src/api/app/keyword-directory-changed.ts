import { observable } from '@trpc/server/observable';
import { appProcedure } from '@/api/trpc';
import {
    type KeywordDirectoryChangedEvent,
    subscribeToKeywordDirectoryChanged,
} from '@/services/keyword-directory-events';

export const keywordDirectoryChanged = appProcedure.subscription(() =>
    observable<KeywordDirectoryChangedEvent>(emit => subscribeToKeywordDirectoryChanged(event => emit.next(event)))
);
