import { getAppSession } from '@fantasy-basketball/auth';
import { type AuthFn, localDev, vercelOidc } from 'eve/channels/auth';
import { eveChannel } from 'eve/channels/eve';

const appSession = (): AuthFn<Request> => async (request) => {
  const session = await getAppSession(request.headers);
  if (session === null) return null;

  return {
    attributes: { email: session.user.email },
    authenticator: 'better-auth',
    principalId: session.user.id,
    principalType: 'user',
    subject: session.user.id,
  };
};

export default eveChannel({
  auth: [
    // Browser requests use the same Better Auth session as the Next.js app.
    appSession(),
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
  ],
});
