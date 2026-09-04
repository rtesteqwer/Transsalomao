import { clearSessionCookie } from '../../lib/session.js';

export default function handler(req, res) {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
