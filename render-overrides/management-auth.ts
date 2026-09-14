import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const HOME_URL = "https://transteste.onrender.com/";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Informe o login"),
  password: z.string().min(1, "Informe a senha"),
});

export const getManagementSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const { managementSession } = await import("@/lib/management-auth.server");
    const session = managementSession();
    return session
      ? { authenticated: true as const, username: session.username, role: "admin" as const }
      : { authenticated: false as const, username: null, role: null };
  },
);

export const managementLogin = createServerFn({ method: "POST" })
  .validator(loginSchema)
  .handler(async ({ data }) => {
    const { loginManagement } = await import("@/lib/management-auth.server");
    return loginManagement(data.username, data.password);
  });

const managementLogoutServer = createServerFn({ method: "POST" }).handler(
  async () => {
    const { logoutManagement } = await import("@/lib/management-auth.server");
    return logoutManagement();
  },
);

// Global logout rule: after the administrative session is cleared, always return
// the user to the initial Trans Salomão test page, regardless of the page/tab used.
export async function managementLogout() {
  const result = await managementLogoutServer();
  if (typeof window !== "undefined") {
    window.location.assign(HOME_URL);
  }
  return result;
}
