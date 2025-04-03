// Set application type environment variable
process.env.APP_TYPE = process.env.APP_TYPE || "ADMIN";

// Import and start the admin app
const adminApp = require('./lib/admin-app');

if (adminApp && typeof adminApp.start === 'function') {
  adminApp.start();
} else {
  console.error("❌ Failed to start admin app. Ensure `start()` exists in ./lib/admin-app");
  process.exit(1);
}
