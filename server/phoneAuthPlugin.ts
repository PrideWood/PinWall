import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { ApprovalError, claimApprovedRequest, trustedPhone } from "./phone.js";
export function phoneAuthPlugin() {
  return {
    id: "phone-approval",
    endpoints: {
      trustedEdit: createAuthEndpoint(
        "/owner/trusted-edit",
        { method: "POST", requireHeaders: true },
        async (ctx) => {
          const phone = await trustedPhone(ctx.headers);
          if (!phone)
            throw new APIError("UNAUTHORIZED", {
              message: "此浏览器尚未绑定或授权已过期，请先绑定。",
            });
          const user = await ctx.context.internalAdapter.findUserById(
            phone.owner_id,
          );
          if (!user) throw new APIError("FORBIDDEN");
          const expiresAt = new Date(phone.expires_at);
          const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
          if (maxAge <= 0) throw new APIError("UNAUTHORIZED");
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            false,
            { expiresAt, trustedPhoneId: phone.id },
            true,
          );
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR");
          await setSessionCookie(ctx, { session, user }, false, { maxAge });
          return ctx.json({ ok: true });
        },
      ),
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
