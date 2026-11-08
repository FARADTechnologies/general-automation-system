// Real device biometrics through WebAuthn (Touch ID / Windows Hello / Android fingerprint).
// Works on https:// or http://localhost in Chrome/Safari/Edge. Falls back gracefully everywhere else.

const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const webauthnAvailable = async () => {
  try {
    return !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch { return false; }
};

export async function registerDevice(userName = 'leyla.h') {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: rand(32),
        rp: { name: 'Caspia Bank (demo)' },
        user: { id: rand(16), name: userName, displayName: 'Leyla Hasanova' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
      },
    });
    return cred ? b64(cred.rawId) : null;
  } catch { return null; }
}

// In a real bank the challenge would be a hash of the exact transaction and the bank verifies the signature.
export async function verifyWithDevice(credentialId) {
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        allowCredentials: credentialId ? [{ type: 'public-key', id: unb64(credentialId) }] : [],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!res;
  } catch { return false; }
}
