const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const { readSecret } = require('./secrets');

const app = express();
app.use(cors());
app.use(pinoHttp({ logger }));

const SECRET = readSecret('SECRET');
const SECRET_2 = readSecret('SECRET_2');

app.get('/api/hello', (req, res) => {
  req.log.info('hello called');
  res.json({ message: `Hello from backend! Secret value: ${SECRET}, secret 2 value: ${SECRET_2}` });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'backend started');
});
