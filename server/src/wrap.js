// Turns async route errors into JSON errors instead of crashing the server.
// Expected errors (with a status) show their message; anything else is logged and stays generic.
export const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (!e.status || e.status >= 500) console.error(e);
  res.status(e.status || 500).json({ error: e.status && e.status < 500 ? e.message : e.expose ? e.message : 'Something went wrong on our side. Please try again.' });
});
