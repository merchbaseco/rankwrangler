import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ExplorePage } from '@/features/explore/explore-page';
import { KeywordsPage } from '@/features/keywords/keywords-page';
import { LogsPage } from '@/features/logs/logs-page';
import { ProductPage } from '@/features/product/product-page';
import { AppShell } from '@/features/shell/app-shell';
import { StatusPage } from '@/features/status/status-page';

/**
 * Client routes. The static host (apps/server/Caddyfile) falls back to
 * index.html for every non-API path, so deep links load the app.
 */
export const createAppRouter = () =>
    createBrowserRouter([
        {
            element: <AppShell />,
            children: [
                { index: true, element: <Navigate replace to="/explore" /> },
                { path: 'explore', element: <ExplorePage /> },
                { path: 'keywords', element: <KeywordsPage /> },
                { path: 'products/:asin', element: <ProductPage /> },
                { path: 'logs', element: <LogsPage /> },
                { path: 'status', element: <StatusPage /> },
                { path: '*', element: <Navigate replace to="/explore" /> },
            ],
        },
    ]);
