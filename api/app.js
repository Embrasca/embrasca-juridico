const fs = require('node:fs');
const path = require('node:path');

let cached;
module.exports = async (_req, res) => {
  try {
    if (!cached) {
      const file = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
      cached = file.replace('</body>', '<script src="/auth-client.js"></script></body>');
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(cached);
  } catch (error) {
    res.statusCode = 500;
    res.end('Falha ao carregar a aplicação.');
  }
};