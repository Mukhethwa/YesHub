import { isServer, QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, set a staleTime above 0 to avoid refetching immediately on the client
        staleTime: 5000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  // Server: always make a new query client so request caches never leak between users
  if (isServer) return makeQueryClient();

  // Browser: reuse a singleton so React suspending during render doesn't recreate it
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
