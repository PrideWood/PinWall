import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { ApprovalError, claimApprovedRequest } from "./phone.js";
export function phoneAuthPlugin() {
  return {
    id: "phone-approval",
    endpoints: {
      claimEdit: createAuthEndpoint(
        "/owner/claim-edit",
        {
          method: "POST",
          requireHeaders: true,
          body: z.object({
            id: z.string().uuid(),
            secret: z.string().regex(/^[a-f0-9]{64}$/),
          }),
        },
        async (ctx) => {
          let owner: string;
          try {
            owner = await claimApprovedRequest(ctx.body, ctx.headers);
          } catch (error) {
            if (error instanceof ApprovalError)
              throw new APIError("FORBIDDEN", { message: error.message });
            throw error;
          }
          const user = await ctx.context.internalAdapter.findUserById(owner);
          if (!user) throw new APIError("FORBIDDEN");
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR");
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
  };
}
