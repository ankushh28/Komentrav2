export const SESSION_EXPIRED_MESSAGE_KEY = 'komentra.sessionExpiredMessage';

export class SessionExpiredError extends Error {
  constructor(message = 'Your session expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
    this.sessionExpired = true;
  }
}

export function handleSessionExpired(router, message = 'Your session expired. Please sign in again.') {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.setItem(SESSION_EXPIRED_MESSAGE_KEY, message);
  router.replace('/auth?mode=login');
}

export function consumeSessionExpiredMessage() {
  if (typeof window === 'undefined') return '';
  const message = sessionStorage.getItem(SESSION_EXPIRED_MESSAGE_KEY) || '';
  if (message) sessionStorage.removeItem(SESSION_EXPIRED_MESSAGE_KEY);
  return message;
}

export async function authFetch(router, input, init) {
  const response = await fetch(input, init);
  if (response.status === 401) {
    const message = 'Your session expired. Please sign in again.';
    handleSessionExpired(router, message);
    throw new SessionExpiredError(message);
  }
  return response;
}

export function isSessionExpiredError(error) {
  return !!error?.sessionExpired;
}
