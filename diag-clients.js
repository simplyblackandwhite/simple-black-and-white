// Temporary diagnostic: test getClientsWithStats() against the live DB.
// Run in Railway console:  node diag-clients.js
const db = require('./src/db/database');

try {
  const clients = db.getClientsWithStats();
  console.log('CLIENTS RETURNED:', clients.length);
  clients.forEach(function (c) {
    console.log(JSON.stringify({
      id: c.id,
      domain: c.domain,
      totalScans: c.totalScans,
      hasLatest: !!c.latestScan,
      delta: c.delta,
    }));
  });
} catch (e) {
  console.log('ERROR:', e.message);
  console.log(e.stack);
}
