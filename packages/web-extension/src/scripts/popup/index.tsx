import "@/styles/index.css";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Popup from "./popup";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 1000,
    },
  },
});

const container = document.getElementById("popup-root");
const root = createRoot(container!);

root.render(
  <QueryClientProvider client={queryClient}>
    <Popup />
  </QueryClientProvider>
);
