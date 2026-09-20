const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const SECRET = process.env.SECRET || 'default-secret-value';
const SECRET2 = process.env.SECRET2 || 'default-secret-value-2';

app.get('/api/hello', (req, res) => {
  res.json({ message: `Hello from backend! Secret value: ${SECRET}, Secret2 value: ${SECRET2}` });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
