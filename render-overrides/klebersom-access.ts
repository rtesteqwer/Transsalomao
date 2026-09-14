import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const HOME_URL = "https://transteste.onrender.com/";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Informe o login"),
  password: z.string().min(1, "Informe a senha"),
});

export const getKlebersomSession = createServerFn({ method: "GET" }).handler(async () => {
  const { klebersomAuthorizedSession } = await import("@/lib/klebersom-access.server");
  const session = klebersomAuthorizedSession();
  return session
    ? { authenticated: true as const, username: session.username }
    : { authenticated: false as const, username: null };
});

export const klebersomLogin = createServerFn({ method: "POST" })
  .validator(loginSchema)
  .handler(async ({ data }) => {
    const { loginKlebersom } = await import("@/lib/klebersom-access.server");
    return loginKlebersom(data.username, data.password);
  });

const klebersomLogoutServer = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutKlebersom } = await import("@/lib/klebersom-access.server");
  return logoutKlebersom();
});

// Driver logout follows the same global rule as admin logout: clear the driver
// session and immediately return to the public initial page.
export async function klebersomLogout() {
  const result = await klebersomLogoutServer();
  if (typeof window !== "undefined") {
    window.location.assign(HOME_URL);
  }
  return result;
}

export const getKlebersomDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { getKlebersomDashboardData } = await import("@/lib/klebersom-access.server");
  return getKlebersomDashboardData();
});
