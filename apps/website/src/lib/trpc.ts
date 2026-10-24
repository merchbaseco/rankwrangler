import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/src/api/router";

export const api = createTRPCReact<AppRouter>();

export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type RouterInputs = inferRouterInputs<AppRouter>;
