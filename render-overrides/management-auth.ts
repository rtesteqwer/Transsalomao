import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

export const managementLogout = createServerFn({ method: "POST" }).handler(
  async () => {
    const { logoutManagement } = await import("@/lib/management-auth.server");
    return logoutManagement();
  },
);
