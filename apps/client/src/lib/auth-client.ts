import { createAuthClient } from "better-auth/react";

// Same-origin: dev goes through the Vite proxy, prod is served by Express itself.
export const authClient = createAuthClient();
