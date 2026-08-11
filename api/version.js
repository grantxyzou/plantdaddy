// Deploy identity, so an installed app can tell it is running stale code.
//
// The app's code lives in js/*.js, which changes without index.html or sw.js
// changing — so watching those two files misses most deploys entirely. An
// iOS home-screen app resumes from a snapshot rather than navigating, so
// nothing else prompts it to reload, and it sits on old code indefinitely.
// This endpoint gives it something that changes on every deploy.
//
// Vercel injects these at runtime. Nothing here is secret: the commit SHA of
// a deployed build tells an attacker nothing they can't read from the app.

export function createHandler({ env = process.env } = {}) {
  return function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: { code: 'method_not_allowed', message: 'GET only.' } });
    }
    // Same commit redeployed = same code, so the SHA is the right identity:
    // it stays put when only environment variables change.
    const sha = env.VERCEL_GIT_COMMIT_SHA;
    const version = (typeof sha === 'string' && sha) ? sha.slice(0, 12)
      : (env.VERCEL_DEPLOYMENT_ID || 'dev');
    return res.status(200).json({ version });
  };
}

export default createHandler();
