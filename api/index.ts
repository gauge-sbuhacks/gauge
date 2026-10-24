// vercel entry point. vercel.json rewrites every /api/* request to this one function,
// and the express app routes it from there (the original url is preserved).

import app from '../server/app.js';

export default app;
