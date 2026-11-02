import { phoneAuthPlugin } from "./phoneAuthPlugin.js";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { db } from "./db.js";
import { appOrigin, ownerEmail, required } from "./config.js";
export function createAuth(bootstrap = false) {
  const secret = required("BETTER_AUTH_SECRET");
  if (secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
  return betterAuth({
    appName: "白板",
    plugins: [phoneAuthPlugin()],
    baseURL: appOrigin(),
    secret,
    database: db(),
    trustedOrigins: [appOrigin()],
    emailAndPassword: {
      enabled: true,
      disableSignUp: !bootstrap,
      minPasswordLength: 6,
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      additionalFields: {
        trustedPhoneId: { type: "string", required: false, input: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (user.email.toLowerCase() !== ownerEmail())
              throw new APIError("FORBIDDEN", {
                message: "Registration is closed.",
              });
            return { data: user };
          },
        },
      },
    },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export const auth = () => (instance ??= createAuth());
