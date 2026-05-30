import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ORG_ROLES = ["owner", "admin", "manager", "member", "viewer"] as const;
type OrgRole = (typeof ORG_ROLES)[number];

const APP_ROLES = [
  "Super Admin",
  "Hospital Admin",
  "RCM Manager",
  "Billing Executive",
  "Auditor",
  "CFO View",
] as const;

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = u.user?.email?.toLowerCase();
  if (!email) return false;
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("email")
    .ilike("email", email)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Invite (or re-link) a user into an organization. Sends a magic-link / invite
 * email via Supabase Auth admin and creates rows in app_users + organization_members.
 *
 * Caller must be either a platform admin, OR an owner/admin in the target org.
 */
export const inviteUserToOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        email: z.string().email().max(255),
        name: z.string().min(1).max(120),
        appRole: z.enum(APP_ROLES).default("Billing Executive"),
        orgRole: z.enum(ORG_ROLES).default("member"),
        redirectTo: z.string().url().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Authorize caller
    const platform = await isPlatformAdmin(userId);
    if (!platform) {
      const { data: membership } = await supabaseAdmin
        .from("organization_members")
        .select("role")
        .eq("org_id", data.orgId)
        .eq("user_id", userId)
        .maybeSingle();
      const role = membership?.role as OrgRole | undefined;
      if (!role || (role !== "owner" && role !== "admin")) {
        throw new Error("Forbidden: only org owners/admins can invite users.");
      }
    }

    const email = data.email.toLowerCase();

    // 1. Create or fetch the auth.users row + send invite email.
    let authUserId: string | null = null;
    const { data: invited, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { name: data.name, invited_to_org: data.orgId },
        redirectTo: data.redirectTo,
      });

    if (invited?.user?.id) {
      authUserId = invited.user.id;
    } else if (inviteErr) {
      // Likely already exists — look up id and resend a magic link instead.
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const found = list?.users.find(
        (u) => u.email?.toLowerCase() === email,
      );
      if (!found) {
        throw new Error(`Failed to invite: ${inviteErr.message}`);
      }
      authUserId = found.id;
      // Send a fresh magic link so they have a fast way in.
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: data.redirectTo },
      });
    }

    if (!authUserId) throw new Error("Could not resolve auth user.");

    // 2. Upsert app_users row scoped to this org.
    const { data: existing } = await supabaseAdmin
      .from("app_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("app_users")
        .update({
          name: data.name,
          role: data.appRole,
          org_id: data.orgId,
          auth_user_id: authUserId,
          status: "invited",
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("app_users").insert({
        name: data.name,
        email,
        role: data.appRole,
        status: "invited",
        org_id: data.orgId,
        auth_user_id: authUserId,
      });
    }

    // 3. Link into organization_members (idempotent).
    await supabaseAdmin
      .from("organization_members")
      .upsert(
        { org_id: data.orgId, user_id: authUserId, role: data.orgRole },
        { onConflict: "org_id,user_id" },
      );

    return { ok: true, userId: authUserId };
  });

/**
 * Platform-admin only: create a brand-new hospital (organization), seed
 * defaults, and invite the owner. Returns the new org id.
 */
export const createHospitalWithOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(2).max(160),
        slug: z.string().min(2).max(80).optional(),
        plan: z.enum(["trial", "starter", "pro", "enterprise"]).default("trial"),
        billingEmail: z.string().email().max(255).optional(),
        ownerName: z.string().min(1).max(120),
        ownerEmail: z.string().email().max(255),
        redirectTo: z.string().url().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context.userId))) {
      throw new Error("Forbidden: platform administrators only.");
    }

    const slug = slugify(data.slug || data.name);
    if (!slug) throw new Error("Invalid slug.");

    // Reject duplicate slugs early for a friendlier error.
    const { data: dupe } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (dupe) throw new Error(`Hospital slug "${slug}" already exists.`);

    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: data.name.trim(),
        slug,
        plan: data.plan,
        status: "active",
        billing_email: data.billingEmail?.toLowerCase() ?? data.ownerEmail.toLowerCase(),
      })
      .select("id")
      .single();
    if (orgErr || !org) throw new Error(`Create failed: ${orgErr?.message}`);

    // Seed launch checklist if helper exists (best-effort, ignore errors).
    try { await supabaseAdmin.rpc("seed_launch_checklist", { _org_id: org.id }); } catch { /* best-effort */ }

    // Invite owner via the shared helper logic (inline, bypassing auth check since we just validated).
    const email = data.ownerEmail.toLowerCase();
    const { data: invited, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { name: data.ownerName, invited_to_org: org.id },
        redirectTo: data.redirectTo,
      });

    let authUserId = invited?.user?.id ?? null;
    if (!authUserId && inviteErr) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      authUserId =
        list?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
      if (authUserId) {
        await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: data.redirectTo },
        });
      }
    }

    if (authUserId) {
      await supabaseAdmin.from("app_users").upsert(
        {
          name: data.ownerName,
          email,
          role: "Hospital Admin",
          status: "invited",
          org_id: org.id,
          auth_user_id: authUserId,
        },
        { onConflict: "email" },
      );
      await supabaseAdmin
        .from("organization_members")
        .upsert(
          { org_id: org.id, user_id: authUserId, role: "owner" },
          { onConflict: "org_id,user_id" },
        );
    }

    return { ok: true, orgId: org.id, ownerInvited: Boolean(authUserId) };
  });
