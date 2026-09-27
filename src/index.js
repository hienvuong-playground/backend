const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');
const logger = require('./logger');

const app = express();
app.use(cors());
app.use(pinoHttp({ logger }));

const SECRET = process.env.SECRET || 'default-secret-value';
const SECRET2 = process.env.SECRET2 || 'default-secret-value-2';

app.get('/api/hello', (req, res) => {
  req.log.info('hello called');
  res.json({ message: `Hello from backend! Secret value: ${SECRET}, Secret2 value: ${SECRET2}` });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'backend started');
});
