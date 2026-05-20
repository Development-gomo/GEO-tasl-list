import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function initAdmin() {
  if (getApps().length) return;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || requiredEnv("VITE_FIREBASE_PROJECT_ID");
  const clientEmail = requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
  const privateKey = requiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function sendJson(response, status, body) {
  response.status(status).json(body);
}

function detailEntries(entries) {
  return entries.map((entry) => ({
    task: entry.task || "User Management",
    field: entry.field,
    from: entry.from || "",
    to: entry.to || "",
  }));
}

async function createServerAuditLog(db, caller, input) {
  const timestamp = new Date().toISOString();
  const ref = db.collection("logs").doc();
  const entries = detailEntries(input.detailsEntries || []);
  const summary = input.details || entries.map((entry) => `${entry.field}: ${entry.from || "Empty"} -> ${entry.to || "Empty"}`).join(" | ");

  await ref.set({
    id: ref.id,
    actionLabel: input.actionLabel,
    projectId: "",
    projectName: "Workspace",
    details: summary || "Activity recorded.",
    history: [
      {
        id: `${ref.id}-history`,
        changedAt: timestamp,
        summary: summary || input.actionLabel,
        detailsEntries: entries,
      },
    ],
    userId: caller.uid,
    userEmail: caller.email || "",
    userName: caller.name || caller.email || "Unknown user",
    createdAt: timestamp,
  });
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return {};
}

async function getCaller(request, auth, db) {
  const header = request.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    const error = new Error("Missing authorization token.");
    error.status = 401;
    throw error;
  }

  const token = await auth.verifyIdToken(match[1]);
  const profileSnapshot = await db.collection("users").doc(token.uid).get();
  if (!profileSnapshot.exists) {
    const error = new Error("Your app profile was not found.");
    error.status = 403;
    throw error;
  }

  const profile = profileSnapshot.data();
  if (profile.status !== "active") {
    const error = new Error("Your account is not active.");
    error.status = 403;
    throw error;
  }

  return {
    uid: token.uid,
    email: token.email || profile.email || "",
    name: profile.name || "",
    role: profile.role,
  };
}

async function getTargetProfile(db, uid) {
  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists) {
    const error = new Error("User profile was not found.");
    error.status = 404;
    throw error;
  }
  return snapshot.data();
}

function canDelete(caller, targetUid, targetProfile) {
  if (caller.uid === targetUid) return false;
  if (caller.role === "super_admin") return true;
  return caller.role === "admin" && targetProfile.role === "user";
}

export default async function handler(request, response) {
  try {
    initAdmin();

    const auth = getAuth();
    const db = getFirestore();
    const uid = request.query.uid;
    const targetUid = Array.isArray(uid) ? uid[0] : uid;

    if (!targetUid) return sendJson(response, 400, { error: "Missing user id." });

    const caller = await getCaller(request, auth, db);
    const targetProfile = await getTargetProfile(db, targetUid);

    if (request.method === "PATCH") {
      if (caller.role !== "super_admin") {
        return sendJson(response, 403, { error: "Only super admins can reset passwords." });
      }

      const body = await readBody(request);
      const password = String(body.password || "");
      if (password.length < 6) {
        return sendJson(response, 400, { error: "Password must be at least 6 characters." });
      }

      await auth.updateUser(targetUid, { password });
      await createServerAuditLog(db, caller, {
        actionLabel: "Password Reset",
        details: `Reset password for ${targetProfile.name || targetProfile.email || targetUid}`,
        detailsEntries: [
          { field: "User", from: "", to: targetProfile.name || targetProfile.email || targetUid },
          { field: "Password", from: "Previous password", to: "Updated by super admin" },
        ],
      });

      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "DELETE") {
      if (!canDelete(caller, targetUid, targetProfile)) {
        return sendJson(response, 403, { error: "You do not have permission to delete this user." });
      }

      try {
        await auth.deleteUser(targetUid);
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }

      await db.collection("users").doc(targetUid).delete();
      await createServerAuditLog(db, caller, {
        actionLabel: "User Deleted",
        details: `Deleted user ${targetProfile.name || targetProfile.email || targetUid}`,
        detailsEntries: [
          { field: "Name", from: targetProfile.name || targetProfile.email || targetUid, to: "" },
          { field: "Email", from: targetProfile.email || "", to: "" },
          { field: "Role", from: targetProfile.role || "", to: "" },
        ],
      });

      return sendJson(response, 200, { ok: true });
    }

    response.setHeader("Allow", "PATCH, DELETE");
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || "User admin request failed.";
    return sendJson(response, status, { error: message });
  }
}
