const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 3000;

// Build the Mongo connection string from either a single MONGO_URI
// or individual MONGO_* pieces (handy for docker-compose service names).
const MONGO_URI =
  process.env.MONGO_URI ||
  `mongodb://${encodeURIComponent(process.env.MONGO_USERNAME || '')}:${encodeURIComponent(
    process.env.MONGO_PASSWORD || ''
  )}@${process.env.MONGO_HOSTNAME || 'localhost'}:${process.env.MONGO_PORT || 27017}/${
    process.env.MONGO_DB || 'my-db'
  }?authSource=admin`;

// MongoDB can take a little while to accept connections (the first `docker compose up`
// creates the database). Retry instead of exiting straight away.
const CONNECT_ATTEMPTS = Number(process.env.MONGO_CONNECT_ATTEMPTS || 30);
const CONNECT_DELAY_MS = Number(process.env.MONGO_CONNECT_DELAY_MS || 2000);

async function connectWithRetry() {
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      return;
    } catch (err) {
      if (attempt >= CONNECT_ATTEMPTS) throw err;
      console.log(
        `MongoDB not ready (attempt ${attempt} of ${CONNECT_ATTEMPTS}): ${err.message}. Retrying...`
      );
      await new Promise((resolve) => setTimeout(resolve, CONNECT_DELAY_MS));
    }
  }
}

// --- Connect to MongoDB, then start the server ---
connectWithRetry()
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
