import { api } from "@/lib/trpc";
export const useKeywordTrack = () => api.api.app.keywordTrack.useMutation();
