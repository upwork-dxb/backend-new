/* global use, db */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

const database = '';

// The current database to use.
use(database);

async function deleteRecordsInBatches(collection) {
  try {

    // Define the filter for the records to delete
    const filter = { createdAt: { $lt: new Date("2024-09-01") } };

    let totalDeleted = 0;

    // Define the batch size
    const batchSize = 10000; // Adjust batch size as needed

    // Find the total number of records matching the query
    let totalRecords = await collection.countDocuments(filter);
    console.log(`Total records to delete: ${totalRecords} in ${collection.getName()} collection.`);

    while (true) {
      // Fetch a batch of documents that match the filter
      const docs = await collection.find(filter).limit(batchSize).toArray();

      if (docs.length === 0) {
        // Break if no more documents match the filter
        break;
      }

      // Extract _id values from the fetched documents
      const idsToDelete = docs.map(doc => doc._id);

      // Delete the documents in the current batch
      const result = await collection.deleteMany({ _id: { $in: idsToDelete } });

      // Increment total deleted count
      totalDeleted += result.deletedCount;

      console.log(`Deleted ${result.deletedCount} records in this batch for ${collection.getName()} collection.`);
    }

    console.log(`Total records deleted: ${totalDeleted} in ${collection.getName()} collection.`);
  } catch (error) {
    console.error("Error during deletion:", error);
  }
}

const dbs = [
  db.lotus,
  db.lotus_round_status,
  db.qtech,
  db.qtech_crdr_winloss,
  db.qtech_rounds_status,
  db.universal_casino_rounds_status,
  db.universal_casino_logs,
]

const promises = dbs.map(data => deleteRecordsInBatches(data));

Promise.all(promises)
  .then(() => console.log('All records deleted successfully'))
  .catch((error) => console.error('Error:', error));
