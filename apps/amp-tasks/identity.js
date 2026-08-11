// identity.js — multi-user seam for the hosted control plane.
//
// On InternalCloud/AuthService, isc-web sits in front of this backend and forwards a JWT in the
// `Authorization: Bearer <token>` header. Per the sanctioned pattern
// ("How to Build an Internal-Facing Tool at Acme", ENTSO/6818627676) the
// user's email lives in the JWT **`sub` claim** (NOT `email`), and no signature
// verification is needed on our side — the ALB+SSO+AuthService chain already
// authenticated the request before it reaches us. SecretStore handles authorization.
//
// Locally (no AuthService in front) we fall back to AMP_LOCAL_USER, defaulting to
// jordan@example.com so the single-user dev experience is unchanged.
//
// This is the tenant key for "bring my team on board one by one": every request
// carries a resolved principal, so rows and fleet actions can be scoped per user
// once we flip on multi-tenancy.

const LOCAL_USER = process.env.AMP_LOCAL_USER || 'jordan@example.com';

function decodeJwtSub(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    return payload.sub || payload.email || null;
  } catch {
    return null;
  }
}

// Express middleware — attaches req.user = { email, prefix, source }.
function identity(req, _res, next) {
  const fromJwt = decodeJwtSub(req.headers.authorization);
  const email = fromJwt || LOCAL_USER;
  req.user = {
    email,
    prefix: email.includes('@') ? email.split('@')[0] : email, // SecretStore member_id
    source: fromJwt ? 'authservice-jwt' : 'local',
  };
  next();
}

module.exports = { identity, decodeJwtSub, LOCAL_USER };
