import express from 'express';

const app = express();

// NEW: Add JSON body parsing middleware
app.use(express.json());

// ...existing code...

app.listen(3000, () => {
  console.log('Server running on port 3000');
});

// ...existing code...