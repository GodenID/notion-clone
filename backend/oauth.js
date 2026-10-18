/* OAuth helpers: Google and GitHub.
   Each provider exposes an authorization URL, a token exchange, and a user info
   endpoint. The flow is identical for both; only the endpoints and field names
   differ. */

import { uid } from "./ids.js";

export const OAUTH_PROVIDERS = {
  google: {
    name: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scope: "openid email profile",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    buildAuthParams(clientId, redirectUri, state) {
      return new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: this.scope,
        state,
        access_type: "offline",
        prompt: "consent",
      });
    },
    async fetchUser(accessToken) {
      const response = await fetch(this.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Could not fetch Google profile");
      const data = await response.json();
      return {
        providerUserId: data.id,
        email: (data.email || "").toLowerCase(),
        name: data.name || data.email?.split("@")[0] || "Google User",
        avatar: data.picture || null,
      };
    },
  },
  github: {
    name: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scope: "user:email",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    buildAuthParams(clientId, redirectUri, state) {
      return new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: this.scope,
        state,
      });
    },
    async fetchUser(accessToken) {
      const headers = { Authorization: `Bearer ${accessToken}`, "User-Agent": "nookspace" };
      const userResponse = await fetch(this.userInfoUrl, { headers });
      if (!userResponse.ok) throw new Error("Could not fetch GitHub profile");
      const data = await userResponse.json();

      let email = data.email;
      if (!email) {
        const emailsResponse = await fetch("https://api.github.com/user/emails", { headers });
        if (emailsResponse.ok) {
          const emails = await emailsResponse.json();
          const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
          email = primary?.email;
        }
      }

      return {
        providerUserId: String(data.id),
        email: (email || "").toLowerCase(),
        name: data.name || data.login || "GitHub User",
        avatar: data.avatar_url || null,
      };
    },
  },
};

export function getProvider(name) {
  return OAUTH_PROVIDERS[name] || null;
}

export function listProviders() {
  return Object.keys(OAUTH_PROVIDERS);
}

export function isProviderConfigured(provider, env = process.env) {
  const p = getProvider(provider);
  if (!p) return false;
  return Boolean(env[p.clientIdEnv] && env[p.clientSecretEnv]);
}

export function buildAuthorizationUrl(provider, { clientId, redirectUri, state }) {
  const p = getProvider(provider);
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  const params = p.buildAuthParams(clientId, redirectUri, state);
  return `${p.authUrl}?${params.toString()}`;
}

export async function exchangeCode(provider, { code, clientId, clientSecret, redirectUri }) {
  const p = getProvider(provider);
  if (!p) throw new Error(`Unknown provider: ${provider}`);

  const response = await fetch(p.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

export async function fetchOAuthUser(provider, accessToken) {
  const p = getProvider(provider);
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  return p.fetchUser(accessToken);
}

export function findOrCreateOAuthUser(db, provider, oauthUser) {
  if (!oauthUser.email) throw new Error("The provider did not return an email address.");

  /* Existing link: provider + provider_user_id */
  const linked = db
    .prepare("SELECT u.* FROM oauth_accounts o JOIN users u ON u.id = o.user_id WHERE o.provider = ? AND o.provider_user_id = ?")
    .get(provider, oauthUser.providerUserId);
  if (linked) return { user: linked, isNew: false };

  /* Existing user with the same email: link the provider */
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(oauthUser.email);
  if (existing) {
    db.prepare(
      "INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(uid(), existing.id, provider, oauthUser.providerUserId, oauthUser.email, Date.now(), Date.now());
    return { user: existing, isNew: false };
  }

  /* Brand new user */
  const id = uid();
  const stamp = Date.now();
  const name = oauthUser.name || oauthUser.email.split("@")[0];
  db.prepare(
    "INSERT INTO users (id, email, name, password_hash, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, oauthUser.email, name, "", oauthUser.avatar ? "#2383e2" : "#2383e2", stamp, stamp);
  db.prepare(
    "INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(uid(), id, provider, oauthUser.providerUserId, oauthUser.email, stamp, stamp);
  return { user: db.prepare("SELECT * FROM users WHERE id = ?").get(id), isNew: true };
}

export function rowToUser(row) {
  return { id: row.id, email: row.email, name: row.name, color: row.color };
}